"use client";

import { useState } from "react";
import type { AuditEvent, AuditStage } from "@prisma/client";
import { approveAudit, requestChanges, resubmitToBree } from "@/lib/actions";
import { CHECKS } from "@/lib/checks";
import { formatDateTime } from "@/lib/format";
import { useActor, useRole } from "./role-provider";
import { useAction } from "./use-action";

export function SignoffPanel({
  auditId,
  stage,
  changesRequested,
  allComplete,
  coverageOk,
  comingSoonOk,
  approvedBy,
  approvedAt,
  approvalComment,
  lastChangeRequest,
}: {
  auditId: string;
  stage: AuditStage;
  changesRequested: boolean;
  allComplete: boolean;
  coverageOk: boolean;
  comingSoonOk: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvalComment: string | null;
  lastChangeRequest: AuditEvent | null;
}) {
  const { isApprover, isPm } = useRole();
  const actor = useActor();
  const { pending, error, run } = useAction();
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<"approve" | "changes" | null>(null);
  const [reopen, setReopen] = useState<number[]>([]);

  if (stage === "APPROVED") {
    return (
      <div className="panel signoff approved" data-testid="signoff">
        <div className="signoff-state ok">Approved</div>
        <div className="kv">
          <span className="muted">Approver</span>
          <span>{approvedBy}</span>
          <span className="muted">Approved</span>
          <span>{formatDateTime(approvedAt)}</span>
        </div>
        {approvalComment && <blockquote className="quote">{approvalComment}</blockquote>}
      </div>
    );
  }

  return (
    <div className="panel signoff" data-testid="signoff">
      <ul className="gate">
        <li className={allComplete ? "ok" : ""}>All 12 required checks complete (desktop + mobile)</li>
        <li className={coverageOk ? "ok" : ""}>100% coverage documented on desktop and mobile</li>
        <li className={comingSoonOk ? "ok" : ""}>“Coming soon” reasons verified</li>
      </ul>

      {changesRequested && lastChangeRequest && (
        <div className="callout warn" data-testid="changes-requested">
          <div className="callout-head">
            Changes requested by {lastChangeRequest.actorName}
            <span className="muted"> · {formatDateTime(lastChangeRequest.createdAt)}</span>
          </div>
          <div className="pre">{lastChangeRequest.comment}</div>
        </div>
      )}

      {stage === "READY_FOR_BREE" && isApprover && (
        <>
          <div className="callout info">This audit is complete and awaiting your final approval.</div>
          {mode === null && (
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => setMode("approve")} data-testid="approve-open">
                Approve
              </button>
              <button className="btn btn-danger" onClick={() => setMode("changes")} data-testid="changes-open">
                Request changes
              </button>
            </div>
          )}
          {mode && (
            <div className="signoff-form">
              <textarea
                className="input"
                rows={3}
                placeholder={mode === "approve" ? "Comment (optional)" : "What needs to change? (required)"}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                data-testid="signoff-comment"
              />
              {mode === "changes" && (
                <div className="reopen">
                  <span className="field-label">Reopen checks for retest (optional)</span>
                  <div className="reopen-grid">
                    {CHECKS.map((c) => (
                      <label key={c.number} className={reopen.includes(c.number) ? "on" : ""}>
                        <input
                          type="checkbox"
                          checked={reopen.includes(c.number)}
                          onChange={(e) =>
                            setReopen((r) => (e.target.checked ? [...r, c.number] : r.filter((n) => n !== c.number)))
                          }
                          data-testid={`reopen-${c.code}`}
                        />
                        <span className="mono">{c.code}</span> {c.shortTitle}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="btn-row">
                <button className="btn" onClick={() => setMode(null)} disabled={pending}>
                  Cancel
                </button>
                {mode === "approve" ? (
                  <button
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => run(() => approveAudit(auditId, actor, comment))}
                    data-testid="approve-confirm"
                  >
                    {pending ? "Approving…" : "Confirm approval"}
                  </button>
                ) : (
                  <button
                    className="btn btn-danger"
                    disabled={pending || !comment.trim()}
                    onClick={() =>
                      run(
                        () => requestChanges(auditId, actor, comment, reopen),
                        () => {
                          setMode(null);
                          setComment("");
                          setReopen([]);
                        },
                      )
                    }
                    data-testid="changes-confirm"
                  >
                    {pending ? "Sending…" : "Send back to Fix & retest"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {stage === "READY_FOR_BREE" && isPm && (
        <div className="callout info">Submitted. Waiting for Bree’s sign-off.</div>
      )}

      {stage !== "READY_FOR_BREE" && isApprover && (
        <div className="muted small">Sign-off opens when the Technical PM completes all 12 checks.</div>
      )}

      {changesRequested && isPm && (
        <div className="signoff-form">
          <textarea
            className="input"
            rows={2}
            placeholder="What was fixed (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            data-testid="resubmit-comment"
          />
          <button
            className="btn btn-primary"
            disabled={pending || !allComplete}
            onClick={() => run(() => resubmitToBree(auditId, actor, comment), () => setComment(""))}
            data-testid="resubmit"
            title={allComplete ? "" : "Complete all 12 checks first"}
          >
            Resubmit to Bree
          </button>
          {!allComplete && <div className="muted small">Complete all 12 checks to resubmit.</div>}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
