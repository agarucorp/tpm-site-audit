import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAuditPaste, parseCommand, parseCommands } from "../src/lib/chat/parse";
import { validateInterpretation, type RawInterpretation } from "../src/lib/chat/interpret";
import { AUDIT_PROMPT } from "../src/lib/audit-prompt";

const SPANISH_PASTE = `Sitio: Lumina Wellness
URL: https://luminawellness.example.com

Instrucciones que me diste: "Para cada check, reportá PASS o FAIL. No pases un check si queda información de dosis."
${AUDIT_PROMPT}

Resultados:
01 Botones + CTAs — revisé todo el menú, no encontré nada raro todavía, sigo probando.
04 Sin dosis — FALLA en móvil: /faq, acordeón "¿Cuánto tomo?" muestra 0,25 mg.
09 LegitScript — el sello no pasa: lleva a otro dominio (/footer, badge LegitScript).
Nota: si el checkout falla, avisame.`;

test("commands: Spanish and English verdicts parse; prose and instructions do not", () => {
  assert.deepEqual(parseCommand("marcar 04 falla móvil: dosis en FAQ"), {
    kind: "mark",
    checks: [4],
    status: "FAIL",
    device: "mobile",
    note: "dosis en FAQ",
    rest: "",
  });
  assert.equal(parseCommand("04 no pasa")?.kind, "mark");
  assert.equal((parseCommand("04 no pasa") as { status: string }).status, "FAIL");
  assert.equal((parseCommand("marcar 04 aprobado") as { status: string }).status, "PASS");
  assert.equal((parseCommand("mark 01-12 pass") as { checks: number[] }).checks.length, 12);
  assert.equal(parseCommand("aprobar Lumina Wellness")?.kind, "approve");
  assert.equal(parseCommand("mover Lumina a listo")?.kind, "move");
  assert.equal(parseCommand("ayuda")?.kind, "help");

  for (const line of [
    "hola",
    "do not pass 04",
    "No pases un check si queda información de dosis.",
    "For each check, report PASS or FAIL",
    "Do not pass a page while dosing information remains.",
    "si el checkout falla, avisame",
  ]) {
    assert.equal(parseCommand(line), null, line);
  }
  assert.equal(parseCommands(SPANISH_PASTE), null);
  assert.equal(looksLikeAuditPaste(SPANISH_PASTE), true);
  assert.equal(looksLikeAuditPaste("hola"), false);
});

const result = (r: Partial<RawInterpretation["results"][number]>): RawInterpretation["results"][number] => ({
  check: 4,
  desktop: "not_stated",
  mobile: "not_stated",
  page: "",
  element: "",
  finding: "",
  evidence: "",
  confidence: "high",
  ...r,
});

test("validator: instruction text, negations, invented quotes and vague verdicts never change a check", () => {
  const raw: RawInterpretation = {
    site: "Lumina Wellness",
    url: null,
    unclear: [{ check: 1, quote: "sigo probando", why: "Still testing, no verdict." }],
    comingSoon: [],
    results: [
      // The prompt's own instruction quoted as if it were a result.
      result({ check: 4, desktop: "pass", mobile: "pass", page: "all", evidence: "No pases un check si queda información de dosis." }),
      result({ check: 1, desktop: "pass", mobile: "pass", page: "all", evidence: "For each check, report PASS or FAIL, the exact page and element" }),
      // Conditional, not a result.
      result({ check: 5, desktop: "fail", mobile: "fail", page: "/checkout", evidence: "si el checkout falla, avisame" }),
      // Quote that isn't in the paste.
      result({ check: 2, desktop: "pass", mobile: "pass", page: "/", evidence: "02 Homepage continuity: PASS on /" }),
      // Model unsure.
      result({ check: 3, desktop: "pass", mobile: "pass", page: "/", evidence: "revisé todo el menú", confidence: "low" }),
      // Verdict with no page or element.
      result({ check: 6, desktop: "pass", mobile: "pass", evidence: "Resultados:" }),
    ],
  };
  const out = validateInterpretation(SPANISH_PASTE, raw);
  assert.deepEqual(out.apply, []);
  const skippedChecks = out.skipped.map((s) => s.check).sort();
  assert.deepEqual(skippedChecks, [1, 1, 2, 3, 4, 5, 6]);
});

test("validator: a clear per-check result is applied to that check only", () => {
  const raw: RawInterpretation = {
    site: null,
    url: null,
    unclear: [],
    comingSoon: [],
    results: [
      result({
        check: 4,
        desktop: "not_stated",
        mobile: "fail",
        page: "/faq",
        element: "acordeón “¿Cuánto tomo?”",
        finding: "Muestra 0,25 mg.",
        evidence: "04 Sin dosis — FALLA en móvil: /faq, acordeón \"¿Cuánto tomo?\" muestra 0,25 mg.",
      }),
      result({
        check: 9,
        desktop: "fail",
        mobile: "fail",
        page: "/footer",
        element: "badge LegitScript",
        finding: "Lleva a otro dominio.",
        evidence: "09 LegitScript — el sello no pasa: lleva a otro dominio",
      }),
    ],
  };
  const out = validateInterpretation(SPANISH_PASTE, raw);
  assert.equal(out.apply.length, 2);
  assert.deepEqual(
    out.apply.map((a) => [a.check, a.desktop, a.mobile, a.failed]),
    [
      [4, undefined, false, true],
      [9, false, false, true],
    ],
  );
  assert.match(out.apply[0].note, /\/faq/);
});

test("validator: conflicting results for one check are reported, not applied", () => {
  const paste = "07 HRT intake first: PASS on /hrt\n07 HRT intake first: FAIL on /hrt/women — skips intake";
  const out = validateInterpretation(paste, {
    site: null,
    url: null,
    unclear: [],
    comingSoon: [],
    results: [
      result({ check: 7, desktop: "pass", mobile: "pass", page: "/hrt", evidence: "07 HRT intake first: PASS on /hrt" }),
      result({ check: 7, desktop: "fail", mobile: "fail", page: "/hrt/women", evidence: "07 HRT intake first: FAIL on /hrt/women" }),
    ],
  });
  assert.equal(out.apply.length, 0);
  assert.equal(out.skipped[0].check, 7);
});

test("validator: coming-soon items are verified only when the paste gives a reason", () => {
  const paste = `12 Coming soon:
- Tirzepatide — /weight-loss (pharmacy partner not live yet)
- NAD+ injections — /wellness`;
  const out = validateInterpretation(paste, {
    site: null,
    url: null,
    unclear: [],
    results: [],
    comingSoon: [
      { product: "Tirzepatide", page: "/weight-loss", reason: "pharmacy partner not live yet", evidence: "Tirzepatide — /weight-loss" },
      { product: "NAD+ injections", page: "/wellness", reason: "", evidence: "NAD+ injections — /wellness" },
      { product: "Sermorelin", page: "/shop", reason: "backorder", evidence: "Sermorelin — /shop" },
    ],
  });
  assert.deepEqual(
    out.comingSoon.map((c) => [c.product, c.verified]),
    [
      ["Tirzepatide", true],
      ["NAD+ injections", false],
    ],
  );
});
