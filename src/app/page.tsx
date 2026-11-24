import Link from "next/link";
import { getBoardAudits } from "@/lib/queries";
import { STAGES } from "@/lib/workflow";
import { AuditCard } from "@/components/audit-card";
import { NewAuditButton } from "@/components/new-audit";
import { GUIDE } from "@/lib/checks";

const APPROVED_ON_BOARD = 6;

export default async function BoardPage() {
  const audits = await getBoardAudits();

  return (
    <div className="board-page">
      <div className="page-head">
        <div>
          <div className="eyebrow mono">{GUIDE.subtitle}</div>
          <h1>Site audits</h1>
          <p className="muted">
            {GUIDE.intro} Cards move to <strong>Ready for Bree</strong> automatically once all 12 checks pass on
            desktop and mobile.
          </p>
        </div>
        <NewAuditButton />
      </div>

      <div className="board">
        {STAGES.map((stage) => {
          let items = audits.filter((a) => a.stage === stage.id);
          const total = items.length;
          if (stage.id === "APPROVED") {
            items = items
              .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0))
              .slice(0, APPROVED_ON_BOARD);
          }
          return (
            <section key={stage.id} className={`column col-${stage.id.toLowerCase()}`} data-testid={`column-${stage.id}`}>
              <div className="column-head">
                <span className={`stage-dot stage-${stage.id.toLowerCase()}`} />
                <span className="column-title">{stage.label}</span>
                <span className="mono muted">{total}</span>
              </div>
              <div className="column-hint muted">{stage.hint}</div>
              <div className="column-body">
                {items.length === 0 && <div className="column-empty muted">No cards</div>}
                {items.map((a) => (
                  <AuditCard key={a.id} audit={a} />
                ))}
                {stage.id === "APPROVED" && total > APPROVED_ON_BOARD && (
                  <Link href="/history" className="column-more">
                    View all {total} in History →
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
