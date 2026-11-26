import Link from "next/link";
import type { BoardAudit } from "@/lib/queries";
import { completedCount } from "@/lib/workflow";
import { CHECK_COUNT } from "@/lib/checks";
import { formatDate, hostOf } from "@/lib/format";

const STICKY_COLORS = ["yellow", "pink", "green", "blue", "orange", "violet"] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function AuditCard({ audit }: { audit: BoardAudit }) {
  const h = hash(audit.siteName);
  const color = STICKY_COLORS[h % STICKY_COLORS.length];
  const rotation = ((hash(audit.id) % 7) - 3) * 0.45;
  const done = completedCount(audit.checks);
  const failing = audit.checks.filter((c) => c.status === "FAIL").length;
  const retest = audit.checks.filter((c) => c.status === "RETEST").length;
  const pct = Math.round((done / CHECK_COUNT) * 100);

  return (
    <Link
      href={`/audits/${audit.id}`}
      className={`card sticky-${color}`}
      style={{ "--rot": `${rotation}deg` } as React.CSSProperties}
      data-testid="audit-card"
      data-site={audit.siteName}
    >
      <div className="card-top">
        <span className="card-title">{audit.siteName}</span>
        <span className="mono muted small">
          {done}/{CHECK_COUNT}
        </span>
      </div>
      <div className="card-sub muted">
        <span>{hostOf(audit.url)}</span>
      </div>
      <div className="progress" aria-label={`${done} of ${CHECK_COUNT} checks complete`}>
        <span style={{ width: `${pct}%` }} className={done === CHECK_COUNT ? "full" : ""} />
      </div>
      <div className="card-meta">
        <span className="muted small">{audit.stage === "APPROVED" ? "Approved" : "Audit date"}</span>
        <span className="muted small">{formatDate(audit.stage === "APPROVED" ? audit.approvedAt : audit.auditDate)}</span>
      </div>
      {(failing > 0 || retest > 0 || audit.changesRequested) && (
        <div className="chips">
          {audit.changesRequested && <span className="chip chip-warn">Changes requested</span>}
          {failing > 0 && <span className="chip chip-fail">{failing} fail</span>}
          {retest > 0 && <span className="chip chip-retest">{retest} retest</span>}
        </div>
      )}
      <div className="card-soon">
        <div className="card-soon-head">
          <span>Coming soon</span>
          <span className="mono muted">{audit.comingSoon.length}</span>
        </div>
        {audit.comingSoon.length === 0 ? (
          <div className="muted small">No “coming soon” items</div>
        ) : (
          <ul>
            {audit.comingSoon.map((i) => (
              <li key={i.id}>
                <span className={`dot ${i.verified ? "dot-ok" : "dot-pending"}`} title={i.verified ? "Verified" : "Not verified"} />
                <span className="soon-product">{i.product}</span>
                <span className="soon-reason muted">{i.reason || "Reason missing"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
