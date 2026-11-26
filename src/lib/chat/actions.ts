"use server";

import type { Audit, AuditStage, CheckResult, CheckStatus } from "@prisma/client";
import { prisma } from "../db";
import { getCheck } from "../checks";
import { allChecksComplete, passBlocker, STAGE_LABEL, STATUS_LABEL } from "../workflow";
import { actorName, refresh, syncStage, type Actor } from "../stage";
import { approveAudit, createAudit } from "../actions";
import { hostOf } from "../format";
import { fold, HELP_TEXT, looksLikeAuditPaste, parseCommands, siteHints, type Command } from "./parse";
import { validateInterpretation, type Interpretation } from "./interpret";
import { interpretWithModel, MODEL_KEY_ENV, modelConfigured } from "./model";

export type ChatReply = { tone: "ok" | "error" | "info"; text: string; href?: string; linkLabel?: string };
export type ChatResult = { replies: ChatReply[]; auditId?: string };

const ok = (text: string, extra: Partial<ChatReply> = {}): ChatReply => ({ tone: "ok", text, ...extra });
const err = (text: string): ChatReply => ({ tone: "error", text });
const info = (text: string): ChatReply => ({ tone: "info", text });

const MAX_INPUT = 40_000;

type AuditRef = Pick<Audit, "id" | "siteName" | "url" | "stage">;

function norm(s: string) {
  return fold(s).replace(/^www\./, "");
}

async function resolveAudit(
  text: string,
  hints: { site?: string; url?: string },
  currentId?: string,
): Promise<{ audit: AuditRef } | { error: string }> {
  const audits = await prisma.audit.findMany({
    select: { id: true, siteName: true, url: true, stage: true },
    orderBy: { updatedAt: "desc" },
  });
  if (hints.url) {
    const host = norm(hostOf(hints.url));
    const byUrl = audits.find((a) => norm(hostOf(a.url)) === host);
    if (byUrl) return { audit: byUrl };
  }
  if (hints.site) {
    const site = norm(hints.site);
    const bySite =
      audits.find((a) => norm(a.siteName) === site) ??
      audits.find((a) => norm(a.siteName).includes(site) || site.includes(norm(a.siteName)));
    if (bySite) return { audit: bySite };
  }
  const t = norm(text);
  const mentioned = audits
    .map((a) => {
      const names = [a.siteName, hostOf(a.url)].map(norm).filter((n) => n.length >= 3);
      const hit = names.filter((n) => t.includes(n)).sort((x, y) => y.length - x.length)[0];
      return hit ? { a, len: hit.length } : null;
    })
    .filter((x) => x !== null)
    .sort((x, y) => y.len - x.len);
  if (mentioned.length) return { audit: mentioned[0].a };
  if (currentId) {
    const cur = audits.find((a) => a.id === currentId);
    if (cur) return { audit: cur };
  }
  if (hints.site || hints.url) {
    return { error: `No audit matches ${[hints.site, hints.url].filter(Boolean).join(" ")}. Create it first: create audit Name https://…` };
  }
  return { error: "Which site? Open the audit card first, or include the client name." };
}

function checkLabel(n: number) {
  const c = getCheck(n);
  return `${c.code} ${c.shortTitle}`;
}

function devices(c: Pick<CheckResult, "desktopPass" | "mobilePass">) {
  return `Desktop ${c.desktopPass ? "✓" : "✗"} · Mobile ${c.mobilePass ? "✓" : "✗"}`;
}

/** Writes one check, keeping the guide's Pass prerequisites. Returns a confirmation line. */
async function writeCheck(
  auditId: string,
  n: number,
  next: { desktopPass: boolean; mobilePass: boolean; status: CheckStatus; notes?: string },
  replies: ChatReply[],
) {
  let status = next.status;
  if (status === "PASS") {
    const [coverage, comingSoon] = await Promise.all([
      prisma.coverageItem.findMany({ where: { auditId } }),
      prisma.comingSoonItem.findMany({ where: { auditId } }),
    ]);
    const blocker = passBlocker(n, next, coverage, comingSoon);
    if (blocker) {
      status = "RETEST";
      replies.push(info(`${checkLabel(n)} kept at Retest: ${blocker}`));
    }
  }
  const updated = await prisma.checkResult.update({
    where: { auditId_checkNumber: { auditId, checkNumber: n } },
    data: {
      desktopPass: next.desktopPass,
      mobilePass: next.mobilePass,
      status,
      ...(next.notes !== undefined && next.notes.trim() ? { notes: next.notes.trim() } : {}),
    },
  });
  return `${checkLabel(n)} → ${STATUS_LABEL[updated.status]} (${devices(updated)})`;
}

async function applyInterpretation(audit: AuditRef, result: Interpretation, replies: ChatReply[]) {
  const current = new Map(
    (await prisma.checkResult.findMany({ where: { auditId: audit.id } })).map((c) => [c.checkNumber, c]),
  );
  const changed: string[] = [];
  for (const d of result.apply) {
    const c = current.get(d.check);
    if (!c) continue;
    const desktopPass = d.desktop ?? c.desktopPass;
    const mobilePass = d.mobile ?? c.mobilePass;
    const status: CheckStatus = d.failed
      ? "FAIL"
      : desktopPass && mobilePass
        ? "PASS"
        : c.status === "PASS"
          ? "RETEST"
          : c.status;
    const notes = d.note && !c.notes.includes(d.note) ? [c.notes, d.note].filter(Boolean).join("\n") : undefined;
    const line = await writeCheck(audit.id, d.check, { desktopPass, mobilePass, status, notes }, replies);
    changed.push(`• ${line}\n   Why: “${d.evidence}”`);
  }

  if (changed.length) {
    replies.unshift(ok(`${audit.siteName}: changed ${changed.length} check(s) from the paste\n${changed.join("\n")}`));
  } else {
    replies.unshift(
      info(`${audit.siteName}: no checks changed. I didn't find a clear result (a verdict plus the page or element) for any check.`),
    );
  }

  const seen = new Set<string>();
  const left = result.skipped
    .filter((s) => {
      const k = `${s.check}|${s.why}|${s.quote}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 15)
    .map((s) => `• ${s.check ? checkLabel(s.check) : "Line"}: ${s.why}${s.quote ? ` (“${s.quote}”)` : ""}`);
  if (left.length) replies.push(info(`Left unchanged — not clear enough:\n${left.join("\n")}`));

  if (result.comingSoon.length) {
    const existing = await prisma.comingSoonItem.findMany({ where: { auditId: audit.id } });
    const lines: string[] = [];
    for (const item of result.comingSoon) {
      const match = existing.find((e) => norm(e.product) === norm(item.product));
      const where = item.page ? ` (${item.page})` : "";
      if (match) {
        if (item.verified && !match.reason.trim()) {
          await prisma.comingSoonItem.update({ where: { id: match.id }, data: { reason: item.reason, verified: true } });
          lines.push(`• ${match.product}${where}: reason added and verified — “${item.reason}”`);
        } else {
          lines.push(`• ${match.product}${where}: already listed, unchanged`);
        }
        continue;
      }
      await prisma.comingSoonItem.create({
        data: { auditId: audit.id, product: item.product, reason: item.reason, verified: item.verified },
      });
      lines.push(
        item.verified
          ? `• ${item.product}${where}: added, verified — reason “${item.reason}”`
          : `• ${item.product}${where}: added, NOT verified — the paste gives no reason for the label`,
      );
    }
    replies.push(info(`Coming soon\n${lines.join("\n")}`));
  }
}

async function moveTo(audit: AuditRef, target: AuditStage, actor: Actor, replies: ChatReply[], comment?: string) {
  if (audit.stage === "APPROVED") return replies.push(err(`${audit.siteName} is already approved and archived.`));
  if (target === audit.stage) return replies.push(info(`${audit.siteName} is already in ${STAGE_LABEL[target]}.`));

  if (target === "APPROVED") {
    if (actor.role !== "APPROVER") return replies.push(err("Bree approves: switch the role to Approver to approve."));
    if (audit.stage !== "READY_FOR_BREE")
      return replies.push(err(`${audit.siteName} must be in Ready for Bree before approval (now: ${STAGE_LABEL[audit.stage]}).`));
    const res = await approveAudit(audit.id, actor, comment ?? "");
    return replies.push(
      res.ok ? ok(`${audit.siteName} approved by ${actorName(actor)} and moved to History.`, { href: "/history", linkLabel: "Open History" }) : err(res.error),
    );
  }

  if (target === "READY_FOR_BREE") {
    const checks = await prisma.checkResult.findMany({ where: { auditId: audit.id } });
    if (!allChecksComplete(checks)) {
      const open = checks
        .filter((c) => !(c.status === "PASS" && c.desktopPass && c.mobilePass))
        .map((c) => c.checkNumber)
        .sort((a, b) => a - b)
        .map((n) => getCheck(n).code);
      return replies.push(err(`Can't move to Ready for Bree: checks ${open.join(", ")} aren't complete on desktop + mobile.`));
    }
    await prisma.audit.update({ where: { id: audit.id }, data: { changesRequested: false } });
    await syncStage(audit.id, actor);
    return replies.push(ok(`${audit.siteName} → Ready for Bree.`));
  }

  await prisma.$transaction([
    prisma.audit.update({ where: { id: audit.id }, data: { stage: target } }),
    prisma.auditEvent.create({
      data: {
        auditId: audit.id,
        type: "STAGE_CHANGED",
        actorName: actorName(actor),
        actorRole: actor.role,
        fromStage: audit.stage,
        toStage: target,
        comment: "Moved from chat.",
      },
    }),
  ]);
  replies.push(ok(`${audit.siteName}: ${STAGE_LABEL[audit.stage]} → ${STAGE_LABEL[target]}.`));
}

async function runCommand(
  cmd: Command,
  line: string,
  ctxId: string | undefined,
  actor: Actor,
  replies: ChatReply[],
  remember: (id: string) => Promise<void>,
): Promise<string | undefined> {
  if (cmd.kind === "help") {
    replies.push(info(HELP_TEXT));
    return;
  }
  if (cmd.kind === "create") {
    if (actor.role !== "PM") return void replies.push(err("Switch to Technical PM to create audits."));
    if (!cmd.siteName || !cmd.url) return void replies.push(err("Give a client name and URL, e.g. create audit Acme Health https://acme.com"));
    const res = await createAudit({ siteName: cmd.siteName, url: cmd.url, auditDate: new Date().toISOString().slice(0, 10) }, actor);
    if (!res.ok) return void replies.push(err(res.error));
    replies.push(ok(`Created audit ${cmd.siteName} (${cmd.url}) in In audit.`, { href: `/audits/${res.id}`, linkLabel: "Open audit" }));
    return res.id;
  }

  const found = await resolveAudit(cmd.rest + " " + line, {}, ctxId);
  if ("error" in found) return void replies.push(err(found.error));
  const audit = found.audit;
  await remember(audit.id);

  if (cmd.kind === "approve") return void (await moveTo(audit, "APPROVED", actor, replies, cmd.comment));
  if (cmd.kind === "move") return void (await moveTo(audit, cmd.target, actor, replies));

  if (actor.role !== "PM") return void replies.push(err("Switch to Technical PM to edit checks."));
  if (audit.stage === "APPROVED") return void replies.push(err(`${audit.siteName} is approved and read-only.`));
  const current = await prisma.checkResult.findMany({ where: { auditId: audit.id, checkNumber: { in: cmd.checks } } });
  const lines: string[] = [];
  for (const c of current.sort((a, b) => a.checkNumber - b.checkNumber)) {
    let { desktopPass, mobilePass } = c;
    let status: CheckStatus = cmd.status;
    if (cmd.status === "PASS") {
      if (cmd.device === "desktop") desktopPass = true;
      else if (cmd.device === "mobile") mobilePass = true;
      else desktopPass = mobilePass = true;
      if (!(desktopPass && mobilePass)) status = c.status === "PASS" || c.status === "FAIL" ? "RETEST" : c.status;
    } else if (cmd.status === "FAIL") {
      if (cmd.device === "desktop") desktopPass = false;
      else if (cmd.device === "mobile") mobilePass = false;
      else desktopPass = mobilePass = false;
    }
    lines.push(await writeCheck(audit.id, c.checkNumber, { desktopPass, mobilePass, status, notes: cmd.note }, replies));
  }
  replies.push(ok(`${audit.siteName}\n${lines.join("\n")}`));
  return audit.id;
}

async function handle(text: string, ctx: { auditId?: string }, actor: Actor): Promise<ChatResult> {
  const replies: ChatReply[] = [];
  const touched = new Map<string, AuditStage>();
  const remember = async (id: string) => {
    if (touched.has(id)) return;
    const a = await prisma.audit.findUnique({ where: { id }, select: { stage: true } });
    if (a) touched.set(id, a.stage);
  };
  let focus: string | undefined;

  const commands = parseCommands(text);
  if (commands) {
    const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < commands.length; i++) {
      const id = await runCommand(commands[i], lines[i], ctx.auditId, actor, replies, remember);
      focus = id ?? focus;
    }
  } else if (!looksLikeAuditPaste(text)) {
    return {
      replies: [err(`I didn't understand “${text.slice(0, 120)}”. Paste the full audit result, or type help (ayuda) for commands.`)],
    };
  } else {
    if (actor.role !== "PM") return { replies: [err("Switch to Technical PM to apply an audit result.")] };
    const found = await resolveAudit(text, siteHints(text), ctx.auditId);
    if ("error" in found) return { replies: [err(found.error)] };
    const audit = found.audit;
    if (audit.stage === "APPROVED") return { replies: [err(`${audit.siteName} is approved and read-only.`)] };
    if (!modelConfigured()) {
      return {
        replies: [
          err(
            `I can't read pasted audits yet: ${MODEL_KEY_ENV} is not set on the server, and I won't guess results from keywords. Nothing was changed.\n\nAdd ${MODEL_KEY_ENV} in Vercel → Project → Settings → Environment Variables and redeploy. Until then, tick Desktop / Mobile on the card, or use a command such as “mark 04 fail mobile: dosing in FAQ” / “marcar 04 falla móvil: dosis en FAQ”.`,
          ),
        ],
      };
    }
    let raw;
    try {
      raw = await interpretWithModel(text);
    } catch (e) {
      return { replies: [err(`I couldn't read that paste (${(e as Error).message}). Nothing was changed. Try again in a moment.`)] };
    }
    await remember(audit.id);
    await applyInterpretation(audit, validateInterpretation(text, raw), replies);
    focus = audit.id;
  }

  for (const [id, before] of touched) {
    await syncStage(id, actor);
    const after = await prisma.audit.findUnique({ where: { id }, select: { stage: true, siteName: true, changesRequested: true } });
    if (!after) continue;
    if (after.stage !== before) replies.push(ok(`Card moved: ${after.siteName} — ${STAGE_LABEL[before]} → ${STAGE_LABEL[after.stage]}.`));
    else if (after.changesRequested && after.stage === "FIX_RETEST")
      replies.push(info(`${after.siteName} stays in Fix & retest until you resubmit to Bree (changes were requested).`));
  }

  refresh();
  return { replies, auditId: focus };
}

/** Never throws: the chat panel always gets replies it can render. */
export async function runChat(input: unknown, ctx: { auditId?: string }, actor: Actor): Promise<ChatResult> {
  const text = typeof input === "string" ? input.replace(/\r/g, "").trim() : "";
  if (!text) return { replies: [] };
  if (text.length > MAX_INPUT) {
    return { replies: [err(`That message is too long (${text.length.toLocaleString("en-US")} characters, max ${MAX_INPUT.toLocaleString("en-US")}). Paste the results section only.`)] };
  }
  const safeActor: Actor = {
    name: typeof actor?.name === "string" ? actor.name : "",
    role: actor?.role === "APPROVER" ? "APPROVER" : "PM",
  };
  try {
    return await handle(text, { auditId: typeof ctx?.auditId === "string" ? ctx.auditId : undefined }, safeActor);
  } catch (e) {
    console.error("chat failed", e);
    return {
      replies: [err(`Something went wrong while handling that message (${(e as Error).message?.slice(0, 160) || "server error"}). Check the card before retrying.`)],
    };
  }
}
