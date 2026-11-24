import { revalidatePath } from "next/cache";
import type { ActorRole } from "@prisma/client";
import { prisma } from "./db";
import { comingSoonVerified, coverageComplete, deriveStage } from "./workflow";

export type Actor = { name: string; role: ActorRole };

export function actorName(actor: Actor) {
  return actor.name.trim() || (actor.role === "APPROVER" ? "Bree" : "Technical PM");
}

export function refresh() {
  revalidatePath("/", "layout");
}

export async function assertEditable(auditId: string): Promise<string | null> {
  const audit = await prisma.audit.findUnique({ where: { id: auditId }, select: { stage: true } });
  if (!audit) return "Audit not found.";
  if (audit.stage === "APPROVED") return "This audit is approved and archived. It can no longer be edited.";
  return null;
}

/**
 * Re-applies the guide's invariants and moves the card to the stage derived
 * from its checks (e.g. all 12 complete -> Ready for Bree, regression -> Fix & retest).
 */
export async function syncStage(auditId: string, actor: Actor) {
  const audit = await prisma.audit.findUniqueOrThrow({
    where: { id: auditId },
    include: { checks: true, coverage: true, comingSoon: true },
  });
  if (audit.stage === "APPROVED") return;

  const downgrade: number[] = [];
  for (const c of audit.checks) {
    if (c.status !== "PASS") continue;
    const brokenDevice = !c.desktopPass || !c.mobilePass;
    const brokenCoverage = c.checkNumber === 1 && !coverageComplete(audit.coverage);
    const brokenComingSoon = c.checkNumber === 12 && !comingSoonVerified(audit.comingSoon);
    if (brokenDevice || brokenCoverage || brokenComingSoon) downgrade.push(c.checkNumber);
  }
  if (downgrade.length) {
    await prisma.checkResult.updateMany({
      where: { auditId, checkNumber: { in: downgrade } },
      data: { status: "RETEST" },
    });
    for (const c of audit.checks) if (downgrade.includes(c.checkNumber)) c.status = "RETEST";
  }

  const next = deriveStage(audit);
  if (next === audit.stage) return;

  await prisma.$transaction([
    prisma.audit.update({
      where: { id: auditId },
      data: { stage: next, ...(next === "READY_FOR_BREE" ? { submittedAt: new Date() } : {}) },
    }),
    prisma.auditEvent.create({
      data: {
        auditId,
        type: "STAGE_CHANGED",
        actorName: actorName(actor),
        actorRole: actor.role,
        fromStage: audit.stage,
        toStage: next,
        comment:
          next === "READY_FOR_BREE"
            ? "All 12 checks passed on desktop and mobile. Submitted to Bree for final approval."
            : audit.stage === "READY_FOR_BREE"
              ? "A check regressed. Moved back to Fix & retest."
              : "",
      },
    }),
  ]);
}

