import type { AuditStage, CheckStatus } from "@prisma/client";
import { CHECK_COUNT } from "./checks";

export const STAGES: { id: AuditStage; label: string; hint: string }[] = [
  { id: "IN_AUDIT", label: "In audit", hint: "Technical PM is testing desktop + mobile" },
  { id: "FIX_RETEST", label: "Fix & retest", hint: "Failed checks being fixed and retested" },
  { id: "READY_FOR_BREE", label: "Ready for Bree", hint: "All 12 checks complete, awaiting sign-off" },
  { id: "APPROVED", label: "Approved", hint: "Signed off by Bree" },
];

export const STAGE_LABEL: Record<AuditStage, string> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.label]),
) as Record<AuditStage, string>;

export const STATUS_LABEL: Record<CheckStatus, string> = {
  PENDING: "Pending",
  FAIL: "Fail",
  RETEST: "Retest",
  PASS: "Pass",
};

type CheckLike = { status: CheckStatus; desktopPass: boolean; mobilePass: boolean };
type CoverageLike = { desktopTested: boolean; mobileTested: boolean };
type ComingSoonLike = { reason: string; verified: boolean };

/** A check is complete only when it passed on both desktop and mobile. */
export function isCheckComplete(c: CheckLike): boolean {
  return c.status === "PASS" && c.desktopPass && c.mobilePass;
}

export function completedCount(checks: CheckLike[]): number {
  return checks.filter(isCheckComplete).length;
}

export function allChecksComplete(checks: CheckLike[]): boolean {
  return checks.length === CHECK_COUNT && checks.every(isCheckComplete);
}

export function coverageComplete(items: CoverageLike[]): boolean {
  return items.length > 0 && items.every((i) => i.desktopTested && i.mobileTested);
}

export function comingSoonVerified(items: ComingSoonLike[]): boolean {
  return items.every((i) => i.verified && i.reason.trim().length > 0);
}

/**
 * Returns a reason why a check cannot be marked Pass, or null if it can.
 * Check 01 requires 100% documented coverage; check 12 requires every
 * "coming soon" item to have a verified reason.
 */
export function passBlocker(
  checkNumber: number,
  check: { desktopPass: boolean; mobilePass: boolean },
  coverage: CoverageLike[],
  comingSoon: ComingSoonLike[],
): string | null {
  if (!check.desktopPass || !check.mobilePass) {
    return "Mark complete only after both device reviews pass (Desktop + Mobile).";
  }
  if (checkNumber === 1 && !coverageComplete(coverage)) {
    return "100% of buttons must be clicked: log every tested page/button and confirm it on desktop and mobile first.";
  }
  if (checkNumber === 12 && !comingSoonVerified(comingSoon)) {
    return "Every \u201ccoming soon\u201d item needs a verified reason before this check can pass.";
  }
  return null;
}

/** Stage the board should show, derived from the current checks. */
export function deriveStage(audit: {
  stage: AuditStage;
  changesRequested: boolean;
  checks: CheckLike[];
}): AuditStage {
  if (audit.stage === "APPROVED") return "APPROVED";
  const complete = allChecksComplete(audit.checks);
  if (complete && !audit.changesRequested) return "READY_FOR_BREE";
  if (audit.stage === "READY_FOR_BREE") return "FIX_RETEST";
  if (audit.changesRequested) return "FIX_RETEST";
  const hasFailures = audit.checks.some((c) => c.status === "FAIL" || c.status === "RETEST");
  if (audit.stage === "IN_AUDIT" && hasFailures) return "FIX_RETEST";
  return audit.stage;
}
