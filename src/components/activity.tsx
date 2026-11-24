import type { AuditEvent } from "@prisma/client";
import { STAGE_LABEL } from "@/lib/workflow";
import { formatDateTime } from "@/lib/format";

const TITLE: Record<AuditEvent["type"], string> = {
  CREATED: "Audit created",
  STAGE_CHANGED: "Moved",
  CHANGES_REQUESTED: "Changes requested",
  RESUBMITTED: "Resubmitted to Bree",
  APPROVED: "Approved",
};

export function Activity({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <div className="muted small">No activity yet.</div>;
  return (
    <ol className="activity" data-testid="activity">
      {events.map((e) => (
        <li key={e.id} className={`ev ev-${e.type.toLowerCase()}`}>
          <div className="ev-head">
            <span className="ev-title">
              {TITLE[e.type]}
              {e.type === "STAGE_CHANGED" && e.toStage && (
                <>
                  {" "}
                  → <strong>{STAGE_LABEL[e.toStage]}</strong>
                </>
              )}
            </span>
            <span className="muted small">{formatDateTime(e.createdAt)}</span>
          </div>
          <div className="muted small">
            {e.actorName} · {e.actorRole === "APPROVER" ? "Approver" : "Technical PM"}
          </div>
          {e.comment && <div className="ev-comment pre">{e.comment}</div>}
        </li>
      ))}
    </ol>
  );
}
