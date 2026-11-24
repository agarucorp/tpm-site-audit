"use server";

import type { Audit, AuditStage, CheckResult, CheckStatus } from "@prisma/client";
import { prisma } from "../db";
import { getCheck } from "../checks";
import { allChecksComplete, comingSoonVerified, coverageComplete, STAGE_LABEL, STATUS_LABEL } from "../workflow";
import { actorName, refresh, syncStage, type Actor } from "../stage";
import { approveAudit, createAudit } from "../actions";
import { hostOf } from "../format";
import { HELP_TEXT, looksLikeReport, parseCommand, parseReport, splitComingSoonItem, type ParsedCheck } from "./parse";

export type ChatReply = { tone: "ok" | "error" | "info"; text: string; href?: string; linkLabel?: string };
export type ChatResult = { replies: ChatReply[]; auditId?: string };

const ok = (text: string, extra: Partial<ChatReply> = {}): ChatReply => ({ tone: "ok", text, ...extra });
const err = (text: string): ChatReply => ({ tone: "error", text });
const info = (text: string): ChatReply => ({ tone: "info", text });

type AuditRef = Pick<Audit, "id" | "siteName" | "clientName" | "url" | "stage">;

function norm(s: string) {
  return s.toLowerCase().replace(/^www\./, "").trim();
}

async function resolveAudit(
  text: string,
  hints: { site?: string; url?: string },
  currentId?: string,
): Promise<{ audit: AuditRef } | { error: string }> {
  const audits = await prisma.audit.findMany({
    select: { id: true, siteName: true, clientName: true, url: true, stage: true },
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
  if (hints.site || hints.url) {
    return { error: `No audit matches ${hints.site ?? ""} ${hints.url ?? ""}. Create it first: create audit ${hints.site ?? "Name"} ${hints.url ?? "https://…"}` };
  }
  const t = norm(text);
  const mentioned = audits
    .map((a) => {
      const names = [a.siteName, a.clientName, hostOf(a.url)].map(norm).filter((n) => n.length >= 3);
      const hit = names.filter((n) => t.includes(n)).sort((x, y) => y.length - x.length)[0];
      return hit ? { a, len: hit.length } : null;
    })
    .filter((x): x is { a: AuditRef; len: number } => !!x)
    .sort((x, y) => y.len - x.len);
  if (mentioned.length) return { audit: mentioned[0].a };
  if (currentId) {
    const cur = audits.find((a) => a.id === currentId);
    if (cur) return { audit: cur };
  }
  return { error: "Which site? Open an audit or add “on <site name>”." };
}

function checkLabel(n: number) {
  const c = getCheck(n);
  return `${c.code} ${c.shortTitle}`;
}

function devices(c: Pick<CheckResult, "desktopPass" | "mobilePass">) {
  return `Desktop ${c.desktopPass ? "✓" : "✗"} · Mobile ${c.mobilePass ? "✓" : "✗"}`;
}

/** Check 01 claims 100% coverage: reflect it in the step-01 log. */
async function ensureCoverage(auditId: string, desktop: boolean, mobile: boolean, summary: string) {
  const rows = await prisma.coverageItem.findMany({ where: { auditId } });
  if (rows.length === 0) {
    await prisma.coverageItem.create({
      data: {
        auditId,
        page: "All pages (from audit report)",
        element: summary.split("\n")[0].slice(0, 200) || "Every button, link, menu, form and checkout step",
        desktopTested: desktop,
        mobileTested: mobile,
      },
    });
    return 1;
  }
  await prisma.coverageItem.updateMany({
    where: { auditId },
    data: { ...(desktop ? { desktopTested: true } : {}), ...(mobile ? { mobileTested: true } : {}) },
  });
  return 0;
}

/** Writes one check and enforces the guide's Pass prerequisites. Returns a confirmation line. */
async function writeCheck(
  auditId: string,
  n: number,
  next: { desktopPass: boolean; mobilePass: boolean; status: CheckStatus; notes?: string },
  replies: ChatReply[],
) {
  let status = next.status;
  if (status === "PASS" && n === 1) {
    const created = await ensureCoverage(auditId, next.desktopPass, next.mobilePass, next.notes ?? "");
    if (created) replies.push(info("Step 01: added a coverage row (all pages, desktop + mobile) from check 01."));
  }
  if (status === "PASS" && n === 12) {
    await prisma.comingSoonItem.updateMany({ where: { auditId, NOT: { reason: "" } }, data: { verified: true } });
    const items = await prisma.comingSoonItem.findMany({ where: { auditId } });
    if (!comingSoonVerified(items)) {
      status = "RETEST";
      const missing = items.filter((i) => !i.reason.trim()).map((i) => i.product);
      replies.push(err(`12 kept at Retest: add a reason for ${missing.join(", ")} in the Coming soon panel.`));
    }
  }
  if (status === "PASS" && n === 1) {
    const rows = await prisma.coverageItem.findMany({ where: { auditId } });
    if (!coverageComplete(rows)) status = "RETEST";
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
  return `${checkLabel(n)} → ${STATUS_LABEL[updated.status]} (${devices(updated)})${next.notes?.trim() ? " · notes set" : ""}`;
}

async function applyReport(audit: AuditRef, checks: ParsedCheck[], actor: Actor, replies: ChatReply[]) {
  const lines: string[] = [];
  const skipped: number[] = [];
  for (const c of checks) {
    if (!c.desktop || !c.mobile) {
      skipped.push(c.number);
      continue;
    }
    if (c.number === 12 && c.items.length) {
      const existing = await prisma.comingSoonItem.findMany({ where: { auditId: audit.id } });
      let added = 0;
      for (const raw of c.items) {
        const { product, page } = splitComingSoonItem(raw);
        if (!product) continue;
        const reason = page ? `Marked coming soon on ${page}` : "Listed as coming soon in the audit report";
        const match = existing.find((e) => norm(e.product) === norm(product));
        if (match) {
          await prisma.comingSoonItem.update({ where: { id: match.id }, data: { reason: match.reason || reason, verified: true } });
        } else {
          await prisma.comingSoonItem.create({ data: { auditId: audit.id, product, reason, verified: true } });
          added++;
        }
      }
      replies.push(ok(`Coming soon: ${c.items.length} item(s) from check 12 (${added} new), marked verified with their page.`));
    }
    const both = c.desktop === "PASS" && c.mobile === "PASS";
    lines.push(
      await writeCheck(
        audit.id,
        c.number,
        {
          desktopPass: c.desktop === "PASS",
          mobilePass: c.mobile === "PASS",
          status: both ? "PASS" : "FAIL",
          notes: c.notes,
        },
        replies,
      ),
    );
  }
  if (lines.length) replies.unshift(ok(`${audit.siteName}: applied ${lines.length} check(s)\n${lines.join("\n")}`));
  if (skipped.length) replies.push(err(`No PASS/FAIL found for ${skipped.map(checkLabel).join(", ")} — left unchanged.`));
  if (!lines.length && !skipped.length) replies.push(err("I couldn't find any checks (01–12) in that paste."));
}

async function moveTo(audit: AuditRef, target: AuditStage, actor: Actor, replies: ChatReply[], comment?: string) {
  if (audit.stage === "APPROVED") return replies.push(err(`${audit.siteName} is already approved and archived.`));
  if (target === audit.stage) return replies.push(info(`${audit.siteName} is already in ${STAGE_LABEL[target]}.`));

  if (target === "APPROVED") {
    if (actor.role !== "APPROVER") return replies.push(err("Bree approves: switch the role to Approver to approve."));
    if (audit.stage !== "READY_FOR_BREE")
      return replies.push(err(`${audit.siteName} must be in Ready for Bree before approval (now: ${STAGE_LABEL[audit.stage]}).`));
    const res = await approveAudit(audit.id, actor, comment ?? "");
    return replies.push(res.ok ? ok(`${audit.siteName} approved by ${actorName(actor)} and moved to History.`, { href: "/history", linkLabel: "Open History" }) : err(res.error));
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

async function runLine(line: string, ctxId: string | undefined, actor: Actor, replies: ChatReply[]): Promise<string | undefined> {
  const cmd = parseCommand(line);
  if (!cmd) {
    replies.push(err(`I didn't understand “${line}”. Type help for commands.`));
    return;
  }
  if (cmd.kind === "help") {
    replies.push(info(HELP_TEXT));
    return;
  }
  if (cmd.kind === "create") {
    if (actor.role !== "PM") return void replies.push(err("Switch to Technical PM to create audits."));
    if (!cmd.siteName || !cmd.url) return void replies.push(err("Give a site name and URL, e.g. create audit Acme Health https://acme.com"));
    const res = await createAudit(
      { siteName: cmd.siteName, url: cmd.url, clientName: cmd.clientName ?? "", assignedPm: cmd.assignedPm ?? "", auditDate: new Date().toISOString().slice(0, 10) },
      actor,
    );
    if (!res.ok) return void replies.push(err(res.error));
    replies.push(ok(`Created audit ${cmd.siteName} (${cmd.url}) in In audit.`, { href: `/audits/${res.id}`, linkLabel: "Open audit" }));
    return res.id;
  }

  const found = await resolveAudit(cmd.rest + " " + line, {}, ctxId);
  if ("error" in found) return void replies.push(err(found.error));
  const audit = found.audit;

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

export async function runChat(input: string, ctx: { auditId?: string }, actor: Actor): Promise<ChatResult> {
  const text = input.trim();
  const replies: ChatReply[] = [];
  if (!text) return { replies };

  const touched = new Map<string, AuditStage>();
  const remember = async (id?: string) => {
    if (!id || touched.has(id)) return;
    const a = await prisma.audit.findUnique({ where: { id }, select: { stage: true } });
    if (a) touched.set(id, a.stage);
  };
  let focus: string | undefined;

  if (looksLikeReport(text)) {
    const report = parseReport(text);
    const found = await resolveAudit(text, { site: report.site, url: report.url }, ctx.auditId);
    if ("error" in found) return { replies: [err(found.error)] };
    if (actor.role !== "PM") return { replies: [err("Switch to Technical PM to apply an audit result.")] };
    if (found.audit.stage === "APPROVED") return { replies: [err(`${found.audit.siteName} is approved and read-only.`)] };
    await remember(found.audit.id);
    await applyReport(found.audit, report.checks, actor, replies);
    focus = found.audit.id;
  } else {
    for (const line of text.split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
      if (!/^(create|new|add)\b/i.test(line)) {
        const peek = parseCommand(line);
        if (peek?.kind === "mark") {
          const r = await resolveAudit(peek.rest + " " + line, {}, ctx.auditId);
          if ("audit" in r) await remember(r.audit.id);
        }
      }
      const id = await runLine(line, ctx.auditId, actor, replies);
      focus = id ?? focus;
    }
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
