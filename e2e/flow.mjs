// End-to-end walkthrough: create audit -> fail/fix -> Ready for Bree -> regression ->
// request changes -> resubmit -> approve -> History. Run against a running app:
//   BASE_URL=http://localhost:3000 node e2e/flow.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "e2e/output";
mkdirSync(OUT, { recursive: true });

const site = `Test Clinic ${Date.now().toString().slice(-5)}`;
const client = "E2E Health Co";

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
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 2 });
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
  if ((await status.inputValue()) !== "PASS") {
    await status.selectOption("PASS");
    await until(async () => (await status.inputValue()) === "PASS" && (await status.isEnabled()), `${code} pass`);
  }
}

try {
  await page.goto(BASE);
  await setRole("PM", "Alex Rivera");
  await page.screenshot({ path: `${OUT}/board.png` });
  log("board loaded");

  // Create
  await page.getByTestId("new-audit").click();
  await page.locator('input[name="siteName"]').fill(site);
  await page.locator('input[name="clientName"]').fill(client);
  await page.locator('input[name="url"]').fill("https://testclinic.example.com");
  await page.getByRole("button", { name: "Create audit" }).click();
  await page.waitForURL(/\/audits\//);
  await waitStage("IN_AUDIT");
  log("audit created in In audit");

  // Guard: Pass without both devices is rejected
  await page.getByTestId("check-02-status").selectOption("PASS");
  await page.getByText("Mark complete only after both device reviews pass").first().waitFor();
  log("PASS blocked without desktop + mobile");

  // Guard: check 01 needs documented coverage
  await page.getByTestId("check-01-desktop").check();
  await until(() => page.getByTestId("check-01-desktop").isChecked(), "01 desktop");
  await page.getByTestId("check-01-mobile").check();
  await until(() => page.getByTestId("check-01-mobile").isChecked(), "01 mobile");
  await page.getByTestId("check-01-status").selectOption("PASS");
  await page.getByText("100% of buttons must be clicked").first().waitFor();
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
  log("history: search, client and date filters, full checklist + comments");

  await page.goto(BASE);
  await page.getByTestId("column-APPROVED").getByText(site).waitFor();
  log("card shows in Approved column");

  // Detail screenshot of the seeded in-progress audit
  await setRole("PM", "Alex Rivera");
  await page.getByTestId("audit-card").filter({ hasText: "Lumina Wellness" }).click();
  await page.getByTestId("audit-detail").waitFor();
  await page.screenshot({ path: `${OUT}/audit-detail.png` });
  await page.goto(BASE);
  await page.screenshot({ path: `${OUT}/board.png` });

  console.log("\nE2E PASSED");
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
  console.error("\nE2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
