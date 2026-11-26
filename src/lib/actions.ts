"use server";

import type { AuditStage, CheckStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CHECKS } from "./checks";
import { passBlocker } from "./workflow";
import { actorName, assertEditable, refresh, syncStage, type Actor } from "./stage";

export type { Actor };
export type ActionResult = { ok: true; notice?: string } | { ok: false; error: string };

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export async function createAudit(
  input: { siteName: string; url: string; auditDate: string },
  actor: Actor,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const siteName = input.siteName.trim();
  const url = input.url.trim();
  if (!siteName) return fail("Client is required.") as { ok: false; error: string };
  if (!url) return fail("URL is required.") as { ok: false; error: string };
  const audit = await prisma.audit.create({
    data: {
      siteName,
      url,
      auditDate: input.auditDate ? new Date(input.auditDate) : new Date(),
      checks: { create: CHECKS.map((c) => ({ checkNumber: c.number })) },
      events: {
        create: { type: "CREATED", actorName: actorName(actor), actorRole: actor.role, toStage: "IN_AUDIT" },
      },
    },
  });
  refresh();
  return { ok: true, id: audit.id };
}

export async function updateAuditDetails(
  auditId: string,
  input: { siteName: string; url: string; auditDate: string },
): Promise<ActionResult> {
  const err = await assertEditable(auditId);
  if (err) return fail(err);
  if (!input.siteName.trim() || !input.url.trim()) return fail("Client and URL are required.");
  await prisma.audit.update({
    where: { id: auditId },
    data: {
      siteName: input.siteName.trim(),
      url: input.url.trim(),
      auditDate: new Date(input.auditDate),
    },
  });
  refresh();
  return ok;
}

export async function deleteAudit(auditId: string): Promise<ActionResult> {
  const err = await assertEditable(auditId);
  if (err) return fail(err);
  await prisma.audit.delete({ where: { id: auditId } });
  refresh();
  return ok;
}

export type CheckPatch = Partial<{
  desktopPass: boolean;
  mobilePass: boolean;
  status: CheckStatus;
  notes: string;
  owner: string;
  screenshotLinks: string[];
  retestResult: string;
}>;

export async function updateCheck(
  auditId: string,
  checkNumber: number,
  patch: CheckPatch,
  actor: Actor,
): Promise<ActionResult> {
  if (actor.role !== "PM") return fail("Only the Technical PM can edit checks.");
  const err = await assertEditable(auditId);
  if (err) return fail(err);

  const [check, coverage, comingSoon] = await Promise.all([
    prisma.checkResult.findUniqueOrThrow({ where: { auditId_checkNumber: { auditId, checkNumber } } }),
    prisma.coverageItem.findMany({ where: { auditId } }),
    prisma.comingSoonItem.findMany({ where: { auditId } }),
  ]);

  const next = { ...check, ...patch };
  if (patch.screenshotLinks) {
    next.screenshotLinks = patch.screenshotLinks.map((l) => l.trim()).filter(Boolean);
  }
  // Ticking a device box drives the status: both done -> Pass, any box unticked -> off Pass.
  let notice: string | undefined;
  const devicesTouched = patch.desktopPass !== undefined || patch.mobilePass !== undefined;
  if (devicesTouched && patch.status === undefined) {
    if (next.desktopPass && next.mobilePass) {
      const blocker = passBlocker(checkNumber, next, coverage, comingSoon);
      if (blocker) {
        if (next.status === "PASS") next.status = "RETEST";
        notice = `Both devices are done, but the check can't pass yet. ${blocker}`;
      } else next.status = "PASS";
    } else if (next.status === "PASS") next.status = "RETEST";
  }

  if (next.status === "PASS") {
    const blocker = passBlocker(checkNumber, next, coverage, comingSoon);
    if (blocker) return fail(blocker);
  }

  const data: Prisma.CheckResultUpdateInput = {
    desktopPass: next.desktopPass,
    mobilePass: next.mobilePass,
    status: next.status,
    notes: next.notes,
    owner: next.owner,
    screenshotLinks: next.screenshotLinks,
    retestResult: next.retestResult,
  };
  await prisma.checkResult.update({ where: { id: check.id }, data });
  await syncStage(auditId, actor);
  refresh();
  return notice ? { ok: true, notice } : ok;
}

export async function addCoverage(
  auditId: string,
  input: { page: string; element: string },
  actor: Actor,
): Promise<ActionResult> {
  const err = await assertEditable(auditId);
  if (err) return fail(err);
  if (!input.page.trim()) return fail("Page is required.");
  await prisma.coverageItem.create({
    data: { auditId, page: input.page.trim(), element: input.element.trim() },
  });
  await syncStage(auditId, actor);
  refresh();
  return ok;
}

export async function updateCoverage(
  id: string,
  patch: Partial<{ desktopTested: boolean; mobileTested: boolean }>,
  actor: Actor,
): Promise<ActionResult> {
  const item = await prisma.coverageItem.findUnique({ where: { id } });
  if (!item) return fail("Coverage row not found.");
  const err = await assertEditable(item.auditId);
  if (err) return fail(err);
  await prisma.coverageItem.update({ where: { id }, data: patch });
  await syncStage(item.auditId, actor);
  refresh();
  return ok;
}

export async function deleteCoverage(id: string, actor: Actor): Promise<ActionResult> {
  const item = await prisma.coverageItem.findUnique({ where: { id } });
  if (!item) return fail("Coverage row not found.");
  const err = await assertEditable(item.auditId);
  if (err) return fail(err);
  await prisma.coverageItem.delete({ where: { id } });
  await syncStage(item.auditId, actor);
  refresh();
  return ok;
}

export async function addComingSoon(
  auditId: string,
  input: { product: string; reason: string },
  actor: Actor,
): Promise<ActionResult> {
  const err = await assertEditable(auditId);
  if (err) return fail(err);
  if (!input.product.trim()) return fail("Product is required.");
  await prisma.comingSoonItem.create({
    data: { auditId, product: input.product.trim(), reason: input.reason.trim() },
  });
  await syncStage(auditId, actor);
  refresh();
  return ok;
}

export async function updateComingSoon(
  id: string,
  patch: Partial<{ product: string; reason: string; verified: boolean }>,
  actor: Actor,
): Promise<ActionResult> {
  const item = await prisma.comingSoonItem.findUnique({ where: { id } });
  if (!item) return fail("Item not found.");
  const err = await assertEditable(item.auditId);
  if (err) return fail(err);
  const reason = patch.reason ?? item.reason;
  if (patch.verified && !reason.trim()) return fail("Add the reason for the label before verifying it.");
  await prisma.comingSoonItem.update({
    where: { id },
    data: { ...patch, ...(patch.reason !== undefined && !patch.reason.trim() ? { verified: false } : {}) },
  });
  await syncStage(item.auditId, actor);
  refresh();
  return ok;
}

export async function deleteComingSoon(id: string, actor: Actor): Promise<ActionResult> {
  const item = await prisma.comingSoonItem.findUnique({ where: { id } });
  if (!item) return fail("Item not found.");
  const err = await assertEditable(item.auditId);
  if (err) return fail(err);
  await prisma.comingSoonItem.delete({ where: { id } });
  await syncStage(item.auditId, actor);
  refresh();
  return ok;
}

export async function resubmitToBree(auditId: string, actor: Actor, comment: string): Promise<ActionResult> {
  if (actor.role !== "PM") return fail("Only the Technical PM can resubmit.");
  const err = await assertEditable(auditId);
  if (err) return fail(err);
  await prisma.$transaction([
    prisma.audit.update({ where: { id: auditId }, data: { changesRequested: false } }),
    prisma.auditEvent.create({
      data: {
        auditId,
        type: "RESUBMITTED",
        actorName: actorName(actor),
        actorRole: actor.role,
        comment: comment.trim(),
      },
    }),
  ]);
  await syncStage(auditId, actor);
  refresh();
  return ok;
}

export async function approveAudit(auditId: string, actor: Actor, comment: string): Promise<ActionResult> {
  if (actor.role !== "APPROVER") return fail("Only the approver can approve an audit.");
  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit) return fail("Audit not found.");
  if (audit.stage !== "READY_FOR_BREE") return fail("Only audits in Ready for Bree can be approved.");
  const name = actorName(actor);
  await prisma.$transaction([
    prisma.audit.update({
      where: { id: auditId },
      data: { stage: "APPROVED", approvedAt: new Date(), approvedBy: name, approvalComment: comment.trim() },
    }),
    prisma.auditEvent.create({
      data: {
        auditId,
        type: "APPROVED",
        actorName: name,
        actorRole: actor.role,
        comment: comment.trim(),
        fromStage: "READY_FOR_BREE",
        toStage: "APPROVED",
      },
    }),
  ]);
  refresh();
  return ok;
}

export async function requestChanges(
  auditId: string,
  actor: Actor,
  comment: string,
  reopenChecks: number[],
): Promise<ActionResult> {
  if (actor.role !== "APPROVER") return fail("Only the approver can request changes.");
  if (!comment.trim()) return fail("Add a comment explaining the requested changes.");
  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit) return fail("Audit not found.");
  if (audit.stage !== "READY_FOR_BREE") return fail("Only audits in Ready for Bree can be sent back.");
  const from: AuditStage = audit.stage;
  await prisma.$transaction([
    ...(reopenChecks.length
      ? [
          prisma.checkResult.updateMany({
            where: { auditId, checkNumber: { in: reopenChecks } },
            data: { status: "RETEST" },
          }),
        ]
      : []),
    prisma.audit.update({ where: { id: auditId }, data: { stage: "FIX_RETEST", changesRequested: true } }),
    prisma.auditEvent.create({
      data: {
        auditId,
        type: "CHANGES_REQUESTED",
        actorName: actorName(actor),
        actorRole: actor.role,
        comment:
          comment.trim() +
          (reopenChecks.length
            ? `\n\nReopened checks: ${reopenChecks.map((n) => String(n).padStart(2, "0")).join(", ")}`
            : ""),
        fromStage: from,
        toStage: "FIX_RETEST",
      },
    }),
  ]);
  refresh();
  return ok;
}
