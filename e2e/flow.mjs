// End-to-end walkthrough: create audit -> fail/fix -> Ready for Bree -> regression ->
// request changes -> resubmit -> approve -> History. Run against a running app:
//   BASE_URL=http://localhost:3000 node e2e/flow.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "e2e/output";
mkdirSync(OUT, { recursive: true });

const site = `Test Clinic ${Date.now().toString().slice(-5)}`;
const client = site;

const log = (m) => console.log(`✓ ${m}`);
async function until(fn, msg, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out: ${msg}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 2 });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR", e));

const stage = () => page.getByTestId("audit-detail").getAttribute("data-stage");
const waitStage = (s) => until(async () => (await stage()) === s, `stage ${s}`);

async function setRole(role, name) {
  await page.getByTestId(role === "PM" ? "role-pm" : "role-approver").click();
  await page.getByTestId("name-input").fill(name);
}

async function passCheck(code) {
  const desktop = page.getByTestId(`check-${code}-desktop`);
  const mobile = page.getByTestId(`check-${code}-mobile`);
  const status = page.getByTestId(`check-${code}-status`);
  if (!(await desktop.isChecked())) {
    await desktop.check();
    await until(() => desktop.isChecked().then((v) => v && desktop.isEnabled()), `${code} desktop`);
  }
  if (!(await mobile.isChecked())) {
    await mobile.check();
    await until(() => mobile.isChecked().then((v) => v && mobile.isEnabled()), `${code} mobile`);
  }
  await until(() => status.isEnabled(), `${code} saved`);
  if ((await status.inputValue()) !== "PASS") {
    // Both boxes were already ticked before a prerequisite (coverage) was met.
    await status.selectOption("PASS");
  }
  await until(async () => (await status.inputValue()) === "PASS" && (await status.isEnabled()), `${code} pass`);
}

try {
  await page.goto(BASE);
  await setRole("PM", "Alex Rivera");
  await page.screenshot({ path: `${OUT}/board.png` });
  log("board loaded");

  // Global audit prompt
  await page.getByTestId("audit-prompt-global").click();
  const globalPrompt = await page.getByTestId("prompt-text").inputValue();
  if (!globalPrompt.startsWith("Perform a full site audit following these 12 checks"))
    throw new Error("Global prompt must start with the audit instruction");
  if ((globalPrompt.match(/^(0[1-9]|1[0-2]) /gm) ?? []).length !== 12) throw new Error("Prompt must list 12 checks");
  if (!globalPrompt.includes("Do not change anything.")) throw new Error("Prompt must say audit only");
  await page.getByTestId("prompt-copy").click();
  await page.getByText("Copied ✓").waitFor();
  if ((await page.evaluate(() => navigator.clipboard.readText())) !== globalPrompt) throw new Error("Clipboard mismatch");
  await page.keyboard.press("Escape");
  log("global audit prompt: 12 checks, audit-only, copied to clipboard");

  // Create
  await page.getByTestId("new-audit").click();
  const modal = page.locator(".modal");
  if ((await modal.locator("input").count()) !== 3) throw new Error("Create form should only ask Client, URL and date");
  if (await modal.getByText(/Assigned PM|Site name/).count()) throw new Error("Create form still asks for PM or a second name");
  await modal.getByText("Client", { exact: true }).waitFor();
  await page.locator('input[name="siteName"]').fill(site);
  await page.locator('input[name="url"]').fill("https://testclinic.example.com");
  await page.getByRole("button", { name: "Create audit" }).click();
  await page.waitForURL(/\/audits\//);
  await waitStage("IN_AUDIT");
  if (await page.getByTestId("audit-detail").getByText("Assigned PM").count()) throw new Error("Detail still shows Assigned PM");
  log("audit created in In audit (one Client field, no PM)");

  await page.getByTestId("audit-prompt-detail").click();
  const detailPrompt = await page.getByTestId("prompt-text").inputValue();
  if (!detailPrompt.startsWith(`Site: ${site}\nURL: https://testclinic.example.com\n\nPerform a full site audit`))
    throw new Error("Detail prompt should be prefilled with site name and URL");
  await page.keyboard.press("Escape");
  log("detail audit prompt prefilled with site name + URL");

  // Checkboxes drive the status: both devices done -> Pass, unticking -> off Pass
  await page.getByTestId("check-02-desktop").check();
  await until(() => page.getByTestId("check-02-desktop").isChecked(), "02 desktop");
  if ((await page.getByTestId("check-02-status").inputValue()) === "PASS") throw new Error("One device must not pass the check");
  await page.getByTestId("check-02-mobile").check();
  await until(async () => (await page.getByTestId("check-02-status").inputValue()) === "PASS", "02 auto pass");
  await page.getByText("Homepage continuity").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.screenshot({ path: `${OUT}/card-checkboxes.png` });
  await page.getByTestId("check-02-mobile").uncheck();
  await until(async () => (await page.getByTestId("check-02-status").inputValue()) === "RETEST", "02 off pass");
  await page.getByTestId("check-02-desktop").uncheck();
  await until(() => page.getByTestId("check-02-desktop").isChecked().then((v) => !v), "02 desktop off");
  log("checkboxes: Desktop + Mobile done -> Pass; unticking -> Retest");

  // Guard: Pass without both devices is rejected
  await page.getByTestId("check-02-status").selectOption("PASS");
  await page.getByText("Mark complete only after both device reviews pass").first().waitFor();
  log("PASS blocked without desktop + mobile");

  // Guard: check 01 needs documented coverage
  await page.getByTestId("check-01-desktop").check();
  await until(() => page.getByTestId("check-01-desktop").isChecked(), "01 desktop");
  await page.getByTestId("check-01-mobile").check();
  await until(() => page.getByTestId("check-01-mobile").isChecked(), "01 mobile");
  await page.getByText("100% of buttons must be clicked").first().waitFor();
  if ((await page.getByTestId("check-01-status").inputValue()) === "PASS") throw new Error("01 must not pass without coverage");
  log("check 01 blocked until coverage is documented");

  // Step 01 coverage
  for (const [p, el] of [["/", "Header menu, hero CTA, footer"], ["/checkout", "Place order, confirmation"]]) {
    await page.getByTestId("coverage-page").fill(p);
    await page.getByTestId("coverage-element").fill(el);
    await page.getByTestId("coverage-add").click();
    await page.getByRole("cell", { name: p, exact: true }).waitFor();
  }
  for (const box of await page.locator('[data-testid="coverage"] tbody input[type="checkbox"]').all()) {
    await box.check();
    await until(() => box.isChecked().then((v) => v), "coverage box");
  }
  await page.getByText("100% coverage confirmed").waitFor();
  log("coverage 100% confirmed");

  // Failure -> Fix & retest
  await page.getByTestId("check-04-status").selectOption("FAIL");
  await waitStage("FIX_RETEST");
  await page.getByTestId("check-04-owner").fill("Dana (content)");
  await page.getByTestId("check-04-notes").fill("Dosing in FAQ image.");
  await page.getByTestId("check-04-link").fill("https://drive.example.com/shot-04.png");
  await page.getByTestId("check-04-link").press("Enter");
  await page.getByText("https://drive.example.com/shot-04.png").first().waitFor();
  await page.getByTestId("check-04-retest").fill("Image replaced, retested OK on both devices.");
  await page.getByTestId("check-04-retest").blur();
  await page.getByTestId("fix-log").getByText("Dana (content)").waitFor();
  log("failure moved card to Fix & retest; owner/notes/screenshot/retest recorded");

  // Coming soon with verified reason
  await page.getByTestId("soon-product").fill("Tirzepatide");
  await page.getByTestId("soon-reason").fill("Pharmacy partner not live yet");
  await page.getByTestId("soon-add").click();
  await page.getByTestId("soon-verify-Tirzepatide").check();
  await until(() => page.getByTestId("soon-verify-Tirzepatide").isChecked(), "soon verified");
  log("coming soon item verified");

  for (let n = 1; n <= 12; n++) {
    const code = String(n).padStart(2, "0");
    await passCheck(code);
    if (n < 12) {
      const s = await stage();
      if (s === "READY_FOR_BREE") throw new Error(`Moved to Ready too early at check ${code}`);
    }
  }
  await waitStage("READY_FOR_BREE");
  log("all 12 complete -> Ready for Bree automatically");

  // Regression
  await page.getByTestId("check-05-mobile").uncheck();
  await waitStage("FIX_RETEST");
  await until(async () => (await page.getByTestId("check-05-status").inputValue()) === "RETEST", "05 -> retest");
  log("regression (mobile unchecked) -> back to Fix & retest, check set to Retest");
  await passCheck("05");
  await waitStage("READY_FOR_BREE");
  log("re-passed -> Ready for Bree");

  // Bree: inbox + request changes
  await setRole("APPROVER", "Bree");
  await until(async () => Number(await page.getByTestId("inbox-count").textContent()) >= 1, "inbox badge");
  await page.getByTestId("inbox-button").click();
  await page.locator(".inbox-panel").getByText(site).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/bree-inbox.png` });
  await page.getByTestId("inbox-button").click();
  log("Bree sees card in Awaiting review inbox");

  await page.getByTestId("changes-open").click();
  await page.getByTestId("signoff-comment").fill("Hero image still looks AI-generated. Please replace and retest.");
  await page.getByTestId("reopen-11").check();
  await page.getByTestId("changes-confirm").click();
  await waitStage("FIX_RETEST");
  await page.getByTestId("changes-requested").waitFor();
  await until(async () => (await page.getByTestId("check-11-status").inputValue()) === "RETEST", "11 reopened");
  log("request changes -> Fix & retest with comment, check 11 reopened");

  // PM fixes and resubmits
  await setRole("PM", "Alex Rivera");
  await page.getByTestId("check-11-status").selectOption("PASS");
  await until(async () => (await page.getByTestId("check-11-status").inputValue()) === "PASS", "11 pass");
  if ((await stage()) !== "FIX_RETEST") throw new Error("Should wait for explicit resubmit after changes requested");
  await page.getByTestId("resubmit-comment").fill("Replaced hero image with real photography.");
  await page.getByTestId("resubmit").click();
  await waitStage("READY_FOR_BREE");
  log("PM resubmitted -> Ready for Bree");

  // Bree approves
  await setRole("APPROVER", "Bree");
  await page.getByTestId("approve-open").click();
  await page.getByTestId("signoff-comment").fill("Approved. Tirzepatide coming-soon reason confirmed.");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/detail-signoff.png` });
  await page.getByTestId("approve-confirm").click();
  await waitStage("APPROVED");
  if (await page.getByTestId("check-01-status").isEnabled()) throw new Error("Approved audit should be read-only");
  log("approved; checklist read-only");

  // History
  await page.goto(`${BASE}/history`);
  await page.getByTestId("history-search").fill(site);
  await page.getByRole("button", { name: "Apply" }).click();
  await until(async () => (await page.getByTestId("history-row").count()) === 1, "history search");
  await page.goto(`${BASE}/history?client=${encodeURIComponent(client)}`);
  await until(async () => (await page.getByTestId("history-row").count()) >= 1, "client filter");
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(`${BASE}/history?from=2000-01-01&to=2000-01-02`);
  await until(async () => (await page.getByTestId("history-row").count()) === 0, "date filter excludes");
  await page.goto(`${BASE}/history?from=${today}&to=${today}`);
  await until(async () => (await page.getByTestId("history-row").count()) >= 1, "date filter includes");
  await page.goto(`${BASE}/history`);
  const row = page.getByTestId("history-row").filter({ hasText: site });
  await row.locator("summary").click();
  await row.getByText("Hero image still looks AI-generated").waitFor();
  await row.getByText("Approved. Tirzepatide").waitFor();
  await page.screenshot({ path: `${OUT}/history.png` });
  if (await page.locator("main").getByText("Assigned PM").count()) throw new Error("History still shows Assigned PM");
  log("history: search, client and date filters, full checklist + comments (no PM)");

  await page.goto(BASE);
  await page.getByTestId("column-APPROVED").getByText(site).waitFor();
  if (await page.getByTestId("audit-card").filter({ hasText: /\bPM\b/ }).count()) throw new Error("Cards still show the PM");
  log("card shows in Approved column; cards show no PM");

  // Detail screenshot of the seeded in-progress audit
  await setRole("PM", "Alex Rivera");
  await page.getByTestId("audit-card").filter({ hasText: "Lumina Wellness" }).click();
  await page.getByTestId("audit-detail").waitFor();
  await page.screenshot({ path: `${OUT}/audit-detail.png` });
  await page.getByTestId("audit-prompt-detail").click();
  await page.getByTestId("audit-prompt-modal").waitFor();
  await page.screenshot({ path: `${OUT}/audit-prompt-modal.png` });
  await page.keyboard.press("Escape");

  // Chat: a corrupted saved history must not crash the app
  await page.evaluate(() => localStorage.setItem("tpm-site-audit:chat", '{"open":true,"messages":[{"bad":1},null,"x"]'));
  await page.reload();
  await page.getByTestId("audit-detail").waitFor();
  if (!(await page.getByTestId("chat-panel").count())) await page.getByTestId("chat-open").click();
  await page.getByTestId("chat-input").fill("hola");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("I didn't understand").waitFor();
  await page.getByTestId("chat-input").fill("x".repeat(41000));
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("That message is too long").waitFor();
  if (await page.getByTestId("error-page").count()) throw new Error("App showed the error screen");
  log("chat: bad saved history, unknown text and oversized input are answered, no crash");

  // Chat: a Spanish paste full of "pass"/"fail" words must not flip any checkbox
  const snapshot = async () => {
    const out = [];
    for (let n = 1; n <= 12; n++) {
      const code = String(n).padStart(2, "0");
      out.push([
        await page.getByTestId(`check-${code}-desktop`).isChecked(),
        await page.getByTestId(`check-${code}-mobile`).isChecked(),
        await page.getByTestId(`check-${code}-status`).inputValue(),
      ]);
    }
    return JSON.stringify(out);
  };
  const before = await snapshot();
  const spanishPaste = [
    "Instrucciones: para cada check reportá PASS o FAIL. No pases un check si queda información de dosis.",
    "01 Botones + CTAs: pass? todavía no terminé de revisar el menú.",
    "02 Continuidad: no sé si pasa o falla, lo veo mañana.",
    "04 Sin dosis — do not pass hasta revisar el FAQ.",
    "09 LegitScript: fail / pass (pendiente)",
    "12 Próximamente: Tirzepatide — /weight-loss",
  ].join("\n");
  await page.getByTestId("chat-input").fill(spanishPaste);
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("OPENAI_API_KEY is not set").waitFor();
  await page.waitForTimeout(800);
  if ((await snapshot()) !== before) throw new Error("Spanish paste changed checkboxes from keywords");
  log("chat: Spanish paste with pass/fail words changed nothing and named the missing OPENAI_API_KEY");

  // Chat: a clear per-check command updates exactly that checkbox
  const desktop04 = await page.getByTestId("check-04-desktop").isChecked();
  await page.getByTestId("check-04-mobile").check();
  await until(() => page.getByTestId("check-04-mobile").isChecked(), "04 mobile on");
  await page.getByTestId("chat-input").fill("marcar 04 falla móvil: tabla de dosis en /faq");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("04 No dosing info → Fail").waitFor();
  await until(
    async () =>
      !(await page.getByTestId("check-04-mobile").isChecked()) &&
      (await page.getByTestId("check-04-desktop").isChecked()) === desktop04 &&
      (await page.getByTestId("check-04-status").inputValue()) === "FAIL",
    "04 mobile unticked, desktop unchanged, Fail",
  );
  log("chat: 'marcar 04 falla móvil' unticked 04 Mobile only and set Fail");

  await page.getByTestId("chat-input").fill("mark 04 pass");
  await page.getByTestId("chat-send").click();
  await until(
    async () =>
      (await page.getByTestId("check-04-mobile").isChecked()) &&
      (await page.getByTestId("check-04-desktop").isChecked()) &&
      (await page.getByTestId("check-04-status").inputValue()) === "PASS",
    "04 pass via chat",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/chat.png` });
  log("chat: 'mark 04 pass' ticked both devices and set Pass");

  await page.getByTestId("chat-input").fill("crear auditoría Chat Clinic https://chatclinic.example.com");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("Created audit Chat Clinic").waitFor();
  await page.getByTestId("chat-input").fill("mark 03 fail desktop: vial shown for a cream on Chat Clinic");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("Card moved: Chat Clinic — In audit → Fix & retest").waitFor();
  await page.getByTestId("chat-input").fill("mover Chat Clinic a en auditoría");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("Chat Clinic: Fix & retest → In audit").waitFor();
  log("chat: create audit (Spanish), mark check on named site, move card (Spanish)");

  await setRole("APPROVER", "Bree");
  await page.getByTestId("chat-input").fill("aprobar Harbor Hormone Health: verificado por chat");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("Harbor Hormone Health approved by Bree").waitFor();
  log("chat: approver 'aprobar <site>' -> Approved");
  await setRole("PM", "Alex Rivera");
  await page.getByTestId("chat-input").fill("mark 04 fail mobile: dosing table still in FAQ image on Harbor Hormone Health");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("approved and read-only").waitFor();
  await page.goto(BASE);
  await page.getByTestId("chat-input").fill("help");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("Commands (English or Spanish)").waitFor();
  await page.locator(".chat .icon-btn").click();
  await page.screenshot({ path: `${OUT}/board.png` });

  console.log("\nE2E PASSED");
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
  console.error("\nE2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
