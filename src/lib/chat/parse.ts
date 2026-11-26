import type { AuditStage, CheckStatus } from "@prisma/client";

export type Device = "desktop" | "mobile";

export type Command =
  | { kind: "help" }
  | { kind: "create"; siteName: string; url: string }
  | {
      kind: "mark";
      checks: number[];
      status: CheckStatus;
      device?: Device;
      note?: string;
      rest: string;
    }
  | { kind: "move"; target: AuditStage; rest: string }
  | { kind: "approve"; rest: string; comment?: string };

/** Lowercase, strip accents and collapse whitespace so Spanish and English input compare the same way. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STAGE_ALIASES: [RegExp, AuditStage][] = [
  [/^(in\s*|en\s*)?(audit|auditoria)/, "IN_AUDIT"],
  [/^(fix|retest|re-test|arreglar|corregir|correccion)/, "FIX_RETEST"],
  [/^(ready|listo|lista|bree)/, "READY_FOR_BREE"],
  [/^(approved?|aprobad[oa]|done|hecho|archive|archivo)/, "APPROVED"],
];

function parseStage(s: string): AuditStage | null {
  const t = s.trim().replace(/^["“'«]|["”'»]$/g, "");
  for (const [re, stage] of STAGE_ALIASES) if (re.test(t)) return stage;
  return null;
}

function parseCheckList(s: string): number[] | null {
  if (/^(all|todos|todas)\b/.test(s)) return Array.from({ length: 12 }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of s.split(/\s*(?:,|\by\b|\band\b|&|\s)\s*/).filter(Boolean)) {
    const range = part.match(/^(\d{1,2})\s*[-\u2013]\s*(\d{1,2})$/);
    if (range) {
      for (let i = Number(range[1]); i <= Number(range[2]); i++) out.add(i);
    } else if (/^\d{1,2}$/.test(part)) out.add(Number(part));
    else return null;
  }
  const nums = [...out].filter((n) => n >= 1 && n <= 12);
  return nums.length ? nums.sort((a, b) => a - b) : null;
}

// Verdicts accepted in an explicit command, e.g. "mark 04 fail" / "marcar 04 no pasa".
const VERDICT =
  "no pasa|no paso|pass(?:ed)?|ok|aprobad[oa]|pasa|paso|fail(?:ed)?|falla|fallo|fallad[oa]|fallid[oa]|reprobad[oa]|desaprobad[oa]|retest|re-test|pending|pendiente";

function verdictStatus(word: string): CheckStatus | null {
  const w = word.replace(/\s+/g, " ");
  if (/^(no pasa|no paso|fail|falla|fallo|fallad|fallid|reprobad|desaprobad)/.test(w)) return "FAIL";
  if (/^(pass|ok|aprobad|pasa|paso)/.test(w)) return "PASS";
  if (/^(retest|re-test)/.test(w)) return "RETEST";
  if (/^(pending|pendiente)/.test(w)) return "PENDING";
  return null;
}

const LIST = "(?:all|todos|todas|\\d{1,2})(?:\\s*(?:,|-|\\u2013|\\band\\b|\\by\\b|&|\\s)\\s*\\d{1,2})*";

/**
 * Parses one explicit command line. Only whole-line matches count, so text that merely
 * contains "pass" or "fail" is never treated as a command.
 */
export function parseCommand(input: string): Command | null {
  const raw = input.trim().replace(/\s+/g, " ");
  const text = fold(raw);
  if (/^(help|ayuda|\?|commands|comandos)$/.test(text)) return { kind: "help" };

  const create = raw.match(
    /^(?:create|new|add|crear|crea|nueva|nuevo|agregar|agrega|añadir)\s+(?:an?\s+|una?\s+)?(?:new\s+|nueva\s+)?(?:client|audit|site|cliente|auditor[ií]a|sitio)\s*:?\s+(.+)$/i,
  );
  if (create) {
    let rest = create[1];
    const url = rest.match(/(?:url\s*[:=]?\s*)?((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)/i);
    if (url) rest = rest.replace(url[0], " ");
    const siteName = rest
      .replace(/\b(?:client|cliente|site|sitio|name|nombre|url)\s*[:=]/gi, " ")
      .replace(/[,;"“”]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { kind: "create", siteName, url: url?.[1] ?? "" };
  }

  const move = raw.match(/^(?:move|mover|mueve|pasar|pasa)\s+(?:(?:the\s+)?card\s+|(?:la\s+)?tarjeta\s+)?(.*?)\s*(?:\bto\b|\ba\b|->|→)\s+(.+)$/i);
  if (move && !/^\d/.test(move[1])) {
    const target = parseStage(fold(move[2]));
    if (target) return { kind: "move", target, rest: move[1] };
  }

  const mark =
    text.match(
      new RegExp(
        `^(?:mark|set|marcar|marca|marque|poner|pon)?\\s*(?:checks?|chequeos?|controles|control)?\\s*#?(${LIST})\\s+(?:as\\s+|to\\s+|como\\s+|en\\s+)?(${VERDICT})\\b(.*)$`,
      ),
    ) ?? text.match(new RegExp(`^(pass|fail|retest|pending)\\s+(?:checks?\\s*)?#?(${LIST})\\b(.*)$`));
  if (mark) {
    const swapped = /^(pass|fail|retest|pending)$/.test(mark[1]);
    const list = parseCheckList(swapped ? mark[2] : mark[1]);
    const status = verdictStatus(swapped ? mark[1] : mark[2]);
    const tailStart = raw.length - (mark[3] ?? "").length;
    let tail = raw.slice(tailStart).trimStart();
    let device: Device | undefined;
    const dev = fold(tail).match(/^\s*(?:on\s+|for\s+|en\s+(?:el\s+)?|in\s+)?(desktop|escritorio|mobile|movil|celular|both|ambos)\b/);
    if (dev) {
      const d = dev[1];
      if (d === "desktop" || d === "escritorio") device = "desktop";
      else if (d === "mobile" || d === "movil" || d === "celular") device = "mobile";
      tail = tail.slice(dev[0].length);
    }
    const noteMatch = tail.match(/\s*[:\u2014]\s*(.+)$|\s+-\s+(.+)$/);
    const note = noteMatch ? (noteMatch[1] ?? noteMatch[2]).trim() : undefined;
    const rest = noteMatch ? tail.slice(0, noteMatch.index) : tail;
    if (list && status) return { kind: "mark", checks: list, status, device, note, rest };
  }

  const approve =
    raw.match(/^(?:approve|aprobar|aprueba|aprobá)\b\s*(.*?)(?:\s*[:\u2014-]\s+(.+))?$/i) ??
    raw.match(/^(?:mark|marcar|marca)\s+(.+?)\s+(?:as\s+|como\s+)?(?:done|approved|hecho|aprobad[oa])(?:\s*[:\u2014-]\s+(.+))?$/i);
  if (approve && !/^\s*\d/.test(approve[1] ?? "")) {
    return { kind: "approve", rest: approve[1] ?? "", comment: approve[2] };
  }

  return null;
}

/** Splits a message into command lines; returns null unless every line is a command. */
export function parseCommands(text: string): Command[] | null {
  const lines = text
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 12) return null;
  const cmds = lines.map(parseCommand);
  return cmds.every((c): c is Command => c !== null) ? cmds : null;
}

/**
 * True when a message should go to the paste interpreter rather than be rejected as
 * an unknown command. This only routes the message; it never changes a check.
 */
export function looksLikeAuditPaste(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length >= 2) return true;
  if (text.length > 160) return true;
  return /(?:^|\D)(0[1-9]|1[0-2])(?:\D|$)/.test(text);
}

export function siteHints(text: string): { site?: string; url?: string } {
  const out: { site?: string; url?: string } = {};
  for (const line of text.replace(/\r/g, "").split("\n").slice(0, 15)) {
    const site = line.match(/^\s*[*_#>\s]*(?:site(?:\s*name)?|sitio|client|cliente)\s*[*_]*\s*[:\-]\s*(.+)$/i);
    if (site && !out.site) out.site = site[1].replace(/[*_`]/g, "").trim();
    const url = line.match(/^\s*[*_#>\s]*url\s*[*_]*\s*[:\-]\s*(\S+)/i);
    if (url && !out.url) out.url = url[1].replace(/[*_`]/g, "").trim();
  }
  return out;
}

export const HELP_TEXT = `Paste the full audit result and I'll read it, apply only the checks it clearly reports (verdict + page or element), and list anything I left alone. Spanish or English.

Commands (English or Spanish):
• create audit Acme Health https://acme.com   ·   crear auditoría Acme https://acme.com
• mark 04 fail mobile: dosing table in FAQ   ·   marcar 04 falla móvil: dosis en FAQ
• mark 01-12 pass   ·   marcar 07 aprobado escritorio   ·   05 retest
• move Acme Health to fix & retest   ·   mover Acme a listo
• approve Acme Health: looks good   ·   aprobar Acme
Add the site name to target another audit; otherwise the open audit is used.`;
