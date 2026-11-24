import { notFound } from "next/navigation";
import { getAudit } from "@/lib/queries";
import { AuditDetail } from "@/components/audit-detail";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();
  return <AuditDetail audit={audit} />;
}
