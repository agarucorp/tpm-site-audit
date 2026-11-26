-- The client and the site are the same thing: keep one field ("siteName", labeled Client) and drop the assigned PM.
DROP INDEX IF EXISTS "Audit_clientName_idx";
ALTER TABLE "Audit" DROP COLUMN "clientName";
ALTER TABLE "Audit" DROP COLUMN "assignedPm";
CREATE INDEX "Audit_siteName_idx" ON "Audit"("siteName");
