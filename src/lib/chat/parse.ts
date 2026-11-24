import type { AuditStage, CheckStatus } from "@prisma/client";

export type DeviceResult = "PASS" | "FAIL";

export type ParsedCheck = {
  number: number;
  desktop?: DeviceResult;
  mobile?: DeviceResult;
  notes: string;
  items: string[];
};

export type ParsedReport = {
  site?: string;
  url?: string;
  checks: ParsedCheck[];
};

export type Command =
  | { kind: "help" }
  | { kind: "create"; siteName: string; url: string; clientName?: string; assignedPm?: string }
  | {
      kind: "mark";
      checks: number[];
      status: CheckStatus;
      device?: "desktop" | "mobile";
      note?: string;
      rest: string;
    }
  | { kind: "move"; target: AuditStage; rest: string }
  | { kind: "approve"; rest: string; comment?: string };

const KEYWORDS: Record<number, RegExp> = {
  1: /button|cta/i,
  2: /homepage|continuity/i,
  3: /packag/i,
  4: /dosing|dosage/i,
  5: /duration|checkout/i,
  6: /confirmation/i,
  7: /hrt|intake/i,
  8: /\blabs?\b|biomarker|panel/i,
  9: /legit\s*script/i,
  10: /business|legal/i,
  11: /imagery|images?\b/i,
  12: /coming\s*soon|unavailable/i,
};

const HEADER = /^[\s>#*_|\-\u2022]*(?:check\s*)?#?\s*(0[1-9]|1[0-2]|[1-9])(?![\d/])\s*(?:[.):\-\u2013\u2014|*_]|\s|$)/i;

function headerNumber(line: string): number | null {
  const m = line.match(HEADER);
  if (!m) return null;
  const n = Number(m[1]);
  const rest = line.slice(m[0].length);
  const padded = m[1].length === 2;
  if (padded && (KEYWORDS[n].test(rest) || /\b(pass|fail)/i.test(rest) || /^\s*\|/.test(line))) return n;
  if (KEYWORDS[n].test(rest.slice(0, 60))) return n;
  return null;
}

function clean(s: string): string {
  return s
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .replace(/\s*\|\s*/g, " — ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const RESULT = /\b(pass(?:ed|es)?|fail(?:ed|s|ing)?)\b/gi;
const toResult = (w: string): DeviceResult => (w.toLowerCase().startsWith("p") ? "PASS" : "FAIL");

function deviceResult(text: string, device: "desktop" | "mobile"): DeviceResult | undefined {
  const before = new RegExp(`${device}\\s*(?:\\([^)]*\\))?\\s*[:=\\-\u2013\u2014]?\\s*\\**\\s*(pass(?:ed)?|fail(?:ed)?)\\b`, "i");
  const after = new RegExp(`\\b(pass(?:ed)?|fail(?:ed)?)\\b[^\\n.]{0,12}?\\b(?:on|for|in)?\\s*${device}`, "i");
  const m = text.match(before) ?? text.match(after);
  return m ? toResult(m[1]) : undefined;
}

function overallResult(text: string): DeviceResult | undefined {
  const upper = text.match(/\b(PASS(?:ED)?|FAIL(?:ED)?)\b/);
  if (upper) return toResult(upper[1]);
  const any = [...text.matchAll(RESULT)];
  return any.length ? toResult(any[0][1]) : undefined;
}

const ITEM = /^\s*(?:[-*\u2022]|\d+[.)])\s+(.+)$/;

/** Parses an audit result in the "01 … PASS/FAIL … page/element … what's wrong" format. */
export function parseReport(text: string): ParsedReport {
  const lines = text.replace(/\r/g, "").split("\n");
  const report: ParsedReport = { checks: [] };

  for (const line of lines.slice(0, 12)) {
    const site = line.match(/^\s*\**\s*site(?:\s*name)?\s*\**\s*[:\-]\s*(.+)$/i);
    if (site && !report.site) report.site = clean(site[1]);
    const url = line.match(/^\s*\**\s*url\s*\**\s*[:\-]\s*(\S+)/i);
    if (url && !report.url) report.url = clean(url[1]);
  }

  type Block = { number: number; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of lines) {
    const n = headerNumber(line);
    const isRepeat = n !== null && (current as Block | null)?.number === n;
    if (n !== null && !isRepeat && !blocks.some((b) => b.number === n)) {
      current = { number: n, lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  for (const b of blocks) {
    const body = b.lines.join("\n");
    const overall = overallResult(body);
    const dSpec = deviceResult(body, "desktop");
    const mSpec = deviceResult(body, "mobile");
    if (!dSpec && !mSpec && !overall) {
      report.checks.push({ number: b.number, notes: clean(body), items: [] });
      continue;
    }
    // "FAIL (mobile only)" means the other device passed.
    const only = body.match(/\b(desktop|mobile)[\s-]+only\b|\bonly\s+(?:on\s+)?(desktop|mobile)\b/i);
    const onlyDevice = only ? (only[1] ?? only[2]).toLowerCase() : null;
    const failOnly = overall === "FAIL" && onlyDevice;
    const desktop = dSpec ?? (failOnly ? (onlyDevice === "desktop" ? "FAIL" : "PASS") : (overall ?? mSpec));
    const mobile = mSpec ?? (failOnly ? (onlyDevice === "mobile" ? "FAIL" : "PASS") : (overall ?? dSpec));

    const header = b.lines[0]
      .replace(HEADER, "")
      .replace(/^[^:\-\u2013\u2014|]{0,60}?(?:[:\u2013\u2014|]|\s-\s)\s*/, "")
      .replace(/^\s*\**\s*(pass(?:ed)?|fail(?:ed)?)\s*\**\s*[.:\-\u2013\u2014|]?\s*/i, "");
    const noteLines = [header, ...b.lines.slice(1)]
      .map((l) => clean(l).replace(/(?:\s*\u2014\s*)+$/, "").replace(/^\s*\u2014\s*/, ""))
      .filter((l) => l && !/^[-\u2014|:\s]+$/.test(l));
    const items =
      b.number === 12
        ? b.lines
            .slice(1)
            .map((l) => l.match(ITEM)?.[1] ?? (/^\s*\|/.test(l) && !/^[\s|:-]+$/.test(l) ? l : null))
            .filter((l): l is string => !!l)
            .map(clean)
            .filter((l) => l && !/^(none|n\/a|product\b)/i.test(l) && !/^(pass|fail)/i.test(l))
        : [];
    report.checks.push({ number: b.number, desktop, mobile, notes: noteLines.join("\n").slice(0, 4000), items });
  }
  report.checks.sort((a, z) => a.number - z.number);
  return report;
}

export function looksLikeReport(text: string): boolean {
  const lines = text.split("\n");
  return lines.filter((l) => headerNumber(l) !== null).length >= 2;
}

/** "Tirzepatide — /products/glp1" -> product + page */
export function splitComingSoonItem(item: string): { product: string; page: string } {
  const m = item.match(/^(.+?)\s*(?:\s[\u2013\u2014-]\s|:\s|\s\(|\s+on\s+|\s+at\s+|\s+—\s*)(.+?)\)?$/i);
  if (!m) return { product: item.replace(/[.;]$/, ""), page: "" };
  return { product: m[1].replace(/^["“]|["”]$/g, "").trim(), page: m[2].replace(/^(?:on|at)\s+/i, "").trim() };
}

const STAGE_ALIASES: [RegExp, AuditStage][] = [
  [/^(in\s*)?audit/i, "IN_AUDIT"],
  [/^(fix|retest)/i, "FIX_RETEST"],
  [/^(ready|bree)/i, "READY_FOR_BREE"],
  [/^(approved?|done|archive)/i, "APPROVED"],
];

function parseStage(s: string): AuditStage | null {
  const t = s.trim().replace(/^["“']|["”']$/g, "");
  for (const [re, stage] of STAGE_ALIASES) if (re.test(t)) return stage;
  return null;
}

function parseCheckList(s: string): number[] | null {
  if (/^all\b/i.test(s)) return Array.from({ length: 12 }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of s.split(/\s*(?:,|and|&|\s)\s*/i).filter(Boolean)) {
    const range = part.match(/^(\d{1,2})\s*[-\u2013]\s*(\d{1,2})$/);
    if (range) {
      for (let i = Number(range[1]); i <= Number(range[2]); i++) out.add(i);
    } else if (/^\d{1,2}$/.test(part)) out.add(Number(part));
    else return null;
  }
  const nums = [...out].filter((n) => n >= 1 && n <= 12);
  return nums.length ? nums.sort((a, b) => a - b) : null;
}

const STATUS_WORD: Record<string, CheckStatus> = {
  pass: "PASS",
  passed: "PASS",
  ok: "PASS",
  fail: "FAIL",
  failed: "FAIL",
  retest: "RETEST",
  pending: "PENDING",
};

export function parseCommand(input: string): Command | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (/^(help|\?|commands)$/i.test(text)) return { kind: "help" };

  const create = text.match(/^(?:create|new|add)\s+(?:a\s+)?(?:new\s+)?(?:client|audit|site)\s*:?\s+(.+)$/i);
  if (create) {
    let rest = create[1];
    const pick = (re: RegExp) => {
      const m = rest.match(re);
      if (!m) return undefined;
      rest = rest.replace(m[0], " ");
      return m[1].trim();
    };
    const url = pick(/(?:url\s*[:=]?\s*)?((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)/i);
    const assignedPm = pick(/\b(?:pm|assigned(?:\s+to)?)\s*[:=]?\s*([^,;]+?)(?=\s+client\b|$|,)/i);
    const clientName = pick(/\bclient\s*[:=]?\s*([^,;]+?)(?=\s+pm\b|$|,)/i);
    const siteName = rest.replace(/\b(?:site|name|url)\s*[:=]/gi, " ").replace(/[,;"“”]/g, " ").replace(/\s+/g, " ").trim();
    return { kind: "create", siteName, url: url ?? "", clientName, assignedPm };
  }

  const move = text.match(/^move\s+(?:card\s+)?(.*?)\s*(?:\bto\b|->|→)\s+(.+)$/i);
  if (move) {
    const target = parseStage(move[2]);
    if (target) return { kind: "move", target, rest: move[1] };
  }

  const approve =
    text.match(/^approve\b\s*(.*?)(?:\s*[:\u2014-]\s+(.+))?$/i) ??
    text.match(/^(?:mark\s+)?(.+?)\s+(?:as\s+)?(?:done|approved)(?:\s*[:\u2014-]\s+(.+))?$/i);
  if (approve && !/\b(pass|fail|check)\b/i.test(approve[1] ?? "")) {
    return { kind: "approve", rest: approve[1] ?? "", comment: approve[2] };
  }

  const mark =
    text.match(
      /^(?:mark\s+|set\s+)?(?:checks?\s*)?#?((?:all|\d{1,2})(?:\s*(?:,|-|\u2013|and|&|\s)\s*\d{1,2})*)\s+(?:as\s+|to\s+)?(pass(?:ed)?|fail(?:ed)?|ok|retest|pending)\b(.*)$/i,
    ) ??
    text.match(/^(pass|fail|retest|pending)\s+(?:checks?\s*)?#?((?:all|\d{1,2})(?:\s*(?:,|-|\u2013|and|&|\s)\s*\d{1,2})*)\b(.*)$/i);
  if (mark) {
    const swapped = /^(pass|fail|retest|pending)$/i.test(mark[1]);
    const list = parseCheckList(swapped ? mark[2] : mark[1]);
    const status = STATUS_WORD[(swapped ? mark[1] : mark[2]).toLowerCase()];
    let tail = mark[3] ?? "";
    let device: "desktop" | "mobile" | undefined;
    const dev = tail.match(/^\s*(?:on\s+|for\s+)?(desktop|mobile|both)\b/i);
    if (dev) {
      if (dev[1].toLowerCase() !== "both") device = dev[1].toLowerCase() as "desktop" | "mobile";
      tail = tail.slice(dev[0].length);
    }
    const noteMatch = tail.match(/\s*[:\u2014]\s*(.+)$|\s+-\s+(.+)$/);
    const note = noteMatch ? (noteMatch[1] ?? noteMatch[2]).trim() : undefined;
    const rest = noteMatch ? tail.slice(0, noteMatch.index) : tail;
    if (list && status) return { kind: "mark", checks: list, status, device, note, rest };
  }

  return null;
}

export const HELP_TEXT = `Paste an audit result (01 … 12 with PASS/FAIL) to fill the open audit, or name the site with "Site: …" / "URL: …".

Commands:
• create audit Acme Health https://acme.com client Acme pm Alex
• mark 04 fail mobile: dosing table in FAQ image
• mark 01-12 pass   ·   pass 07 desktop   ·   05 retest
• move Acme Health to fix & retest   (in audit · fix · ready · approved)
• approve Acme Health: looks good   ·   mark Acme Health done
Add "on <site>" to target another audit; otherwise the open audit is used.`;
