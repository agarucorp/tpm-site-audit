// Paste interpretation through the real server path, with a stand-in model.
// Start the app pointing at the mock first:
//   OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:4011/v1 npm run dev
//   node e2e/chat-model.mjs
// The mock deliberately returns bad answers too (instruction text quoted as a result,
// an invented quote, a low-confidence guess) to prove the server-side guard drops them.
import { createServer } from "node:http";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "e2e/output";
mkdirSync(OUT, { recursive: true });

const PASTE = [
  "Sitio: Lumina Wellness",
  "Instrucciones: para cada check reportá PASS o FAIL. No pases un check si queda información de dosis.",
  "",
  "01 Botones + CTAs: todavía revisando el menú, sin veredicto.",
  "04 Sin dosis: pass? no lo revisé.",
  "05 Duraciones + checkout — FALLA en móvil: /checkout, el selector de 3 meses vuelve a 1 mes en el carrito.",
  "12 Próximamente: Sermorelin — /wellness",
].join("\n");

let calls = 0;
const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls++;
    const auth = req.headers.authorization;
    const content = JSON.stringify({
      site: "Lumina Wellness",
      url: null,
      results: [
        { check: 5, desktop: "not_stated", mobile: "fail", page: "/checkout", element: "selector de 3 meses",
          finding: "Vuelve a 1 mes en el carrito.", confidence: "high",
          evidence: "05 Duraciones + checkout — FALLA en móvil: /checkout, el selector de 3 meses vuelve a 1 mes en el carrito." },
        { check: 4, desktop: "pass", mobile: "pass", page: "all", element: "", finding: "", confidence: "high",
          evidence: "No pases un check si queda información de dosis." },
        { check: 2, desktop: "fail", mobile: "fail", page: "/", element: "hero", finding: "", confidence: "high",
          evidence: "02 Continuidad: FALLA en /" },
        { check: 1, desktop: "pass", mobile: "pass", page: "/", element: "menú", finding: "", confidence: "low",
          evidence: "01 Botones + CTAs: todavía revisando el menú" },
      ],
      unclear: [{ check: 4, quote: "04 Sin dosis: pass? no lo revisé.", why: "Question, not a verdict." }],
      comingSoon: [{ product: "Sermorelin", page: "/wellness", reason: "", evidence: "Sermorelin — /wellness" }],
    });
    res.writeHead(auth === "Bearer test" ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => mock.listen(4011, "127.0.0.1", r));

const log = (m) => console.log(`✓ ${m}`);
async function until(fn, msg, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out: ${msg}`);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 2 })).newPage();
try {
  await page.goto(BASE);
  await page.getByTestId("role-pm").click();
  await page.getByTestId("name-input").fill("Alex Rivera");
  await page.getByTestId("audit-card").filter({ hasText: "Lumina Wellness" }).click();
  await page.getByTestId("audit-detail").waitFor();
  const read = async (code) => [
    await page.getByTestId(`check-${code}-desktop`).isChecked(),
    await page.getByTestId(`check-${code}-mobile`).isChecked(),
    await page.getByTestId(`check-${code}-status`).inputValue(),
  ];
  const before = { "01": await read("01"), "02": await read("02"), "04": await read("04"), "05": await read("05") };
  if (JSON.stringify(before["05"]) !== JSON.stringify([true, true, "PASS"])) throw new Error("Seed: 05 should start as Pass");

  if (!(await page.getByTestId("chat-panel").count())) await page.getByTestId("chat-open").click();
  await page.getByTestId("chat-input").fill(PASTE);
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-list").getByText("changed 1 check(s) from the paste").waitFor();
  await until(async () => JSON.stringify(await read("05")) === JSON.stringify([true, false, "FAIL"]), "05 mobile fail");
  for (const code of ["01", "02", "04"]) {
    if (JSON.stringify(await read(code)) !== JSON.stringify(before[code])) throw new Error(`${code} must not change`);
  }
  const list = page.getByTestId("chat-list");
  await list.getByText("That's the audit instructions, not a result.").or(list.getByText("Reads as an instruction")).first().waitFor();
  await list.getByText("The quoted result isn't in the paste.").waitFor();
  await list.getByText("NOT verified").waitFor();
  if (calls !== 1) throw new Error(`expected 1 model call, got ${calls}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/chat-model.png` });
  log("paste read by the model: only 05 Mobile changed; instruction, invented quote and guess were reported, not applied");
  console.log("\nCHAT MODEL E2E PASSED");
} catch (e) {
  await page.screenshot({ path: `${OUT}/chat-model-failure.png`, fullPage: true }).catch(() => {});
  console.error("\nCHAT MODEL E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  mock.close();
}
