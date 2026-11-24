-- CreateEnum
CREATE TYPE "AuditStage" AS ENUM ('IN_AUDIT', 'FIX_RETEST', 'READY_FOR_BREE', 'APPROVED');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PENDING', 'FAIL', 'RETEST', 'PASS');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('PM', 'APPROVER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'STAGE_CHANGED', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED');

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "auditDate" TIMESTAMP(3) NOT NULL,
    "assignedPm" TEXT NOT NULL,
    "stage" "AuditStage" NOT NULL DEFAULT 'IN_AUDIT',
    "changesRequested" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvalComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "checkNumber" INTEGER NOT NULL,
    "desktopPass" BOOLEAN NOT NULL DEFAULT false,
    "mobilePass" BOOLEAN NOT NULL DEFAULT false,
    "status" "CheckStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "screenshotLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retestResult" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageItem" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "desktopTested" BOOLEAN NOT NULL DEFAULT false,
    "mobileTested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComingSoonItem" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComingSoonItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" "ActorRole" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "fromStage" "AuditStage",
    "toStage" "AuditStage",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audit_stage_idx" ON "Audit"("stage");

-- CreateIndex
CREATE INDEX "Audit_clientName_idx" ON "Audit"("clientName");

-- CreateIndex
CREATE UNIQUE INDEX "CheckResult_auditId_checkNumber_key" ON "CheckResult"("auditId", "checkNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_auditId_createdAt_idx" ON "AuditEvent"("auditId", "createdAt");

-- AddForeignKey
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageItem" ADD CONSTRAINT "CoverageItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComingSoonItem" ADD CONSTRAINT "ComingSoonItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
