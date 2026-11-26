import { AUDIT_PROMPT } from "../audit-prompt";
import { CHECKS } from "../checks";

export type DeviceVerdict = "pass" | "fail" | "not_stated";

/** Shape the model must return. Every field is required so the JSON schema can be strict. */
export type RawInterpretation = {
  site: string | null;
  url: string | null;
  results: {
    check: number;
    desktop: DeviceVerdict;
    mobile: DeviceVerdict;
    page: string;
    element: string;
    finding: string;
    evidence: string;
    confidence: "high" | "low";
  }[];
  unclear: { check: number | null; quote: string; why: string }[];
  comingSoon: { product: string; page: string; reason: string; evidence: string }[];
};

export type CheckDecision = {
  check: number;
  desktop?: boolean;
  mobile?: boolean;
  failed: boolean;
  note: string;
  evidence: string;
};

export type Skipped = { check: number | null; why: string; quote?: string };

export type ComingSoonDecision = { product: string; page: string; reason: string; verified: boolean };

export type Interpretation = {
  site?: string;
  url?: string;
  apply: CheckDecision[];
  skipped: Skipped[];
  comingSoon: ComingSoonDecision[];
};

export const INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["site", "url", "results", "unclear", "comingSoon"],
  properties: {
    site: { type: ["string", "null"] },
    url: { type: ["string", "null"] },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["check", "desktop", "mobile", "page", "element", "finding", "evidence", "confidence"],
        properties: {
          check: { type: "integer" },
          desktop: { type: "string", enum: ["pass", "fail", "not_stated"] },
          mobile: { type: "string", enum: ["pass", "fail", "not_stated"] },
          page: { type: "string" },
          element: { type: "string" },
          finding: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "low"] },
        },
      },
    },
    unclear: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["check", "quote", "why"],
        properties: { check: { type: ["integer", "null"] }, quote: { type: "string" }, why: { type: "string" } },
      },
    },
    comingSoon: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product", "page", "reason", "evidence"],
        properties: {
          product: { type: "string" },
          page: { type: "string" },
          reason: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
} as const;

export function systemPrompt(): string {
  const checks = CHECKS.map((c) => `${c.code} ${c.title}: ${c.rules.join(" ")}`).join("\n");
  return `You read website audit reports pasted by a Technical PM and extract per-check results. The report may be in English or Spanish, in any layout (prose, lists, Markdown tables).

The 12 checks:
${checks}

Read the WHOLE paste before answering. Then, for each check, decide whether the paste contains a clear RESULT for it.

A result counts only when the text states a verdict for that specific check about the audited site AND names the page or element it refers to. Verdicts can be written as PASS/FAIL, ✅/❌, "aprobado", "pasa", "ok", "falla", "no pasa", "falló", "reprobado", "works", "broken", etc. Judge the meaning, not the words.

Do NOT report a result when the text is:
- instructions, the audit prompt itself, a checklist of what to test, or a template (e.g. "For each check, report PASS or FAIL", "Do not pass a check unless…", "No marques como aprobado si…");
- negated, hypothetical or conditional ("would fail if…", "should not pass", "no debería pasar", "if it fails…");
- a verdict with no page or element, or a line where the check it belongs to is ambiguous;
- contradicted elsewhere in the paste.
Put those in "unclear" (with the check number if known, a short verbatim quote and why) instead of "results". When in doubt, use "unclear".

For each result:
- desktop / mobile: "pass" or "fail" only when the text supports it for that device. A verdict stated for the whole check without a device applies to both. "Fails on mobile only" means mobile fail and desktop pass. If a device isn't covered, use "not_stated".
- page and element: as written in the paste (empty string if not given).
- finding: one short sentence of what's wrong (or what was verified), in the paste's language.
- evidence: a VERBATIM quote (copy exact characters, max ~200 chars) of the line(s) stating the verdict.
- confidence: "high" only if you are sure; otherwise "low".

comingSoon: every product the paste lists as "coming soon"/"próximamente"/unavailable, with its page. "reason" must be the reason the paste gives for the label (empty string if none is given; do not invent one). evidence: verbatim quote.

site / url: the audited site's name and URL if the paste states them, else null.`;
}

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_`#>|“”"'’‘]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const INSTRUCTION_TEXT = normalizeText(
  [AUDIT_PROMPT, ...CHECKS.flatMap((c) => [c.title, ...c.rules])].join("\n"),
);

const INSTRUCTION_START =
  /^(?:for each|para cada|do not|don't|dont|never|no (?:marques|marcar|pases|apruebes|aprobar|cambies|cambiar)|nunca|report|reporta|return|devolve|devuelve|indica|marca (?:pass|fail)|mark (?:pass|fail))\b/;
const CONDITIONAL =
  /\b(?:unless|a menos que|salvo que|would (?:pass|fail)|should (?:not )?(?:pass|fail)|deberia (?:pasar|fallar)|no deberia)\b|(?:^|[\s,.;])(?:if|si|when|cuando)\s[^.;]{0,60}?\b(?:pass(?:es)?|fail(?:s)?|falla|pasa)\b/;

function quote(s: string, max = 140): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Deterministic guard over the model's answer. A check is applied only when the model
 * is confident, quotes the paste verbatim, the quote isn't the audit instructions or a
 * conditional, and a page or element is named. Everything else is reported, not applied.
 */
export function validateInterpretation(paste: string, raw: RawInterpretation): Interpretation {
  const body = normalizeText(paste);
  const skipped: Skipped[] = [];
  const candidates: CheckDecision[] = [];

  for (const u of raw.unclear ?? []) {
    const n = Number.isInteger(u.check) && u.check! >= 1 && u.check! <= 12 ? u.check : null;
    skipped.push({ check: n, why: u.why || "Not clearly a result.", quote: u.quote ? quote(u.quote) : undefined });
  }

  for (const r of raw.results ?? []) {
    const check = Number(r.check);
    if (!Number.isInteger(check) || check < 1 || check > 12) continue;
    const ev = normalizeText(r.evidence ?? "");
    const q = quote(r.evidence ?? "");
    const skip = (why: string) => skipped.push({ check, why, quote: q || undefined });

    if (r.confidence !== "high") {
      skip("Not clearly a result for this check.");
      continue;
    }
    if (r.desktop === "not_stated" && r.mobile === "not_stated") {
      skip("No desktop or mobile verdict stated.");
      continue;
    }
    if (ev.length < 6 || !body.includes(ev)) {
      skip("The quoted result isn't in the paste.");
      continue;
    }
    if (INSTRUCTION_TEXT.includes(ev)) {
      skip("That's the audit instructions, not a result.");
      continue;
    }
    if (INSTRUCTION_START.test(ev) || CONDITIONAL.test(ev)) {
      skip("Reads as an instruction or a condition, not a result.");
      continue;
    }
    if (!(r.page ?? "").trim() && !(r.element ?? "").trim()) {
      skip("No page or element given for the verdict.");
      continue;
    }
    const failed = r.desktop === "fail" || r.mobile === "fail";
    const where = [r.page, r.element].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ");
    candidates.push({
      check,
      desktop: r.desktop === "not_stated" ? undefined : r.desktop === "pass",
      mobile: r.mobile === "not_stated" ? undefined : r.mobile === "pass",
      failed,
      note: [where, (r.finding ?? "").trim()].filter(Boolean).join(": "),
      evidence: q,
    });
  }

  const apply: CheckDecision[] = [];
  for (const c of candidates) {
    const same = candidates.filter((x) => x.check === c.check);
    if (same.length === 1) {
      apply.push(c);
      continue;
    }
    if (same[0] !== c) continue;
    const devicesAgree = same.every((x) => x.desktop === same[0].desktop && x.mobile === same[0].mobile);
    if (devicesAgree) {
      apply.push({ ...c, note: same.map((x) => x.note).filter(Boolean).join("\n") });
    } else {
      skipped.push({ check: c.check, why: "The paste gives conflicting results for this check.", quote: c.evidence });
    }
  }

  const comingSoon: ComingSoonDecision[] = [];
  for (const item of raw.comingSoon ?? []) {
    const product = (item.product ?? "").trim();
    if (!product) continue;
    const ev = normalizeText(item.evidence ?? "");
    if (ev.length < 3 || !body.includes(ev) || INSTRUCTION_TEXT.includes(ev)) continue;
    const reason = (item.reason ?? "").trim();
    const reasonInPaste = reason && body.includes(normalizeText(reason));
    const genericReason = /^(coming soon|proximamente|unavailable|no disponible)\.?$/i.test(normalizeText(reason));
    const verified = !!reasonInPaste && !genericReason;
    comingSoon.push({ product, page: (item.page ?? "").trim(), reason: verified ? reason : "", verified });
  }

  apply.sort((a, b) => a.check - b.check);
  return {
    site: raw.site?.trim() || undefined,
    url: raw.url?.trim() || undefined,
    apply,
    skipped,
    comingSoon,
  };
}
