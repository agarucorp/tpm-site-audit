"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FullAudit } from "@/lib/queries";
import { CHECK_COUNT, PROCESS_STEPS, getCheck } from "@/lib/checks";
import {
  allChecksComplete,
  comingSoonVerified,
  completedCount,
  coverageComplete,
  STAGE_LABEL,
  STATUS_LABEL,
} from "@/lib/workflow";
import { deleteAudit, updateAuditDetails } from "@/lib/actions";
import { formatDate, formatDateTime, hostOf, hrefOf, toDateInput } from "@/lib/format";
import { useRole } from "./role-provider";
import { useAction } from "./use-action";
import { CheckRow } from "./check-row";
import { CoverageSection } from "./coverage-section";
import { ComingSoonSection } from "./coming-soon-section";
import { SignoffPanel } from "./signoff-panel";
import { Activity } from "./activity";
import { AuditPromptButton } from "./audit-prompt";

export function AuditDetail({ audit }: { audit: FullAudit }) {
  const { isPm } = useRole();
  const router = useRouter();
  const approved = audit.stage === "APPROVED";
  const editable = isPm && !approved;
  const [editing, setEditing] = useState(false);

  const done = completedCount(audit.checks);
  const allComplete = allChecksComplete(audit.checks);
  const coverageOk = coverageComplete(audit.coverage);
  const comingSoonOk = comingSoonVerified(audit.comingSoon);
  const failures = audit.checks.filter((c) => c.status === "FAIL" || c.status === "RETEST" || c.retestResult || c.owner);
  const lastChangeRequest = audit.events.find((e) => e.type === "CHANGES_REQUESTED") ?? null;

  const stepState = [
    coverageOk ? "done" : audit.coverage.length ? "active" : "todo",
    allComplete ? "done" : done > 0 || audit.stage === "FIX_RETEST" ? "active" : "todo",
    approved ? "done" : audit.stage === "READY_FOR_BREE" ? "active" : "todo",
  ];

  return (
    <div className="detail" data-testid="audit-detail" data-stage={audit.stage}>
      <div className="crumbs muted">
        <Link href={approved ? "/history" : "/"}>{approved ? "History" : "Board"}</Link>
        <span>/</span>
        <span>{audit.siteName}</span>
      </div>

      <div className="detail-head">
        <div className="detail-title">
          <h1>{audit.siteName}</h1>
          <span className={`stage-pill stage-${audit.stage.toLowerCase()}`} data-testid="stage-pill">
            {STAGE_LABEL[audit.stage]}
          </span>
        </div>
        <div className="btn-row">
          <AuditPromptButton siteName={audit.siteName} url={audit.url} />
          {editable && !editing && (
            <button className="btn" onClick={() => setEditing(true)}>
              Edit details
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <DetailsForm audit={audit} onDone={() => setEditing(false)} onDeleted={() => router.push("/")} />
      ) : (
        <div className="meta">
          <div>
            <span className="muted">URL</span>
            <a href={hrefOf(audit.url)} target="_blank" rel="noreferrer" className="mono">
              {hostOf(audit.url)} ↗
            </a>
          </div>
          <div>
            <span className="muted">Client</span>
            <span>{audit.clientName}</span>
          </div>
          <div>
            <span className="muted">Audit date</span>
            <span>{formatDate(audit.auditDate)}</span>
          </div>
          <div>
            <span className="muted">Assigned PM</span>
            <span>{audit.assignedPm}</span>
          </div>
          <div>
            <span className="muted">Checks complete</span>
            <span className="mono" data-testid="complete-count">
              {done}/{CHECK_COUNT}
            </span>
          </div>
          {audit.submittedAt && (
            <div>
              <span className="muted">Submitted to Bree</span>
              <span>{formatDateTime(audit.submittedAt)}</span>
            </div>
          )}
        </div>
      )}

      <ol className="stepper">
        {PROCESS_STEPS.map((s, i) => (
          <li key={s.code} className={`step ${stepState[i]}`}>
            <span className="step-code mono">{s.code}</span>
            <div>
              <div className="step-title">{s.title}</div>
              <div className="muted small">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="detail-grid">
        <div className="detail-main">
          <section>
            <h2>
              <span className="mono muted">01</span> Document coverage
            </h2>
            <CoverageSection auditId={audit.id} items={audit.coverage} editable={editable} />
          </section>

          <section>
            <h2>
              <span className="mono muted">02</span> Fix + retest
            </h2>
            <div className="panel">
              {failures.length === 0 ? (
                <div className="muted small">No failed checks recorded.</div>
              ) : (
                <table className="table" data-testid="fix-log">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Screenshots</th>
                      <th>Retest result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="mono muted">{getCheck(c.checkNumber).code}</span>{" "}
                          {getCheck(c.checkNumber).shortTitle}
                        </td>
                        <td>
                          <span className={`status-tag s-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span>
                        </td>
                        <td>{c.owner || <span className="muted">Unassigned</span>}</td>
                        <td className="mono">{c.screenshotLinks.length}</td>
                        <td className="muted">{c.retestResult || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="checks-head">
              <span>Required audit checks</span>
              <span className="muted small">Mark complete only after both device reviews pass.</span>
            </div>
            <div className="checks">
              {audit.checks.map((c) => (
                <CheckRow key={c.id} auditId={audit.id} check={c} editable={editable} />
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-side">
          <section>
            <h2>
              <span className="mono muted">03</span> Bree sign-off
            </h2>
            <SignoffPanel
              auditId={audit.id}
              stage={audit.stage}
              changesRequested={audit.changesRequested}
              allComplete={allComplete}
              coverageOk={coverageOk}
              comingSoonOk={comingSoonOk}
              approvedBy={audit.approvedBy}
              approvedAt={audit.approvedAt}
              approvalComment={audit.approvalComment}
              lastChangeRequest={lastChangeRequest}
            />
          </section>
          <section>
            <h2>Coming soon</h2>
            <ComingSoonSection auditId={audit.id} items={audit.comingSoon} editable={editable} />
          </section>
          <section>
            <h2>Activity</h2>
            <div className="panel">
              <Activity events={audit.events} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DetailsForm({ audit, onDone, onDeleted }: { audit: FullAudit; onDone: () => void; onDeleted: () => void }) {
  const { pending, error, run } = useAction();
  const [form, setForm] = useState({
    siteName: audit.siteName,
    clientName: audit.clientName,
    url: audit.url,
    auditDate: toDateInput(audit.auditDate),
    assignedPm: audit.assignedPm,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="panel form-grid details-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateAuditDetails(audit.id, form), onDone);
      }}
    >
      <label>
        <span>Site name</span>
        <input className="input" value={form.siteName} onChange={set("siteName")} />
      </label>
      <label>
        <span>Client</span>
        <input className="input" value={form.clientName} onChange={set("clientName")} />
      </label>
      <label className="span-2">
        <span>URL</span>
        <input className="input" value={form.url} onChange={set("url")} />
      </label>
      <label>
        <span>Audit date</span>
        <input className="input" type="date" value={form.auditDate} onChange={set("auditDate")} />
      </label>
      <label>
        <span>Assigned PM</span>
        <input className="input" value={form.assignedPm} onChange={set("assignedPm")} />
      </label>
      {error && <div className="error span-2">{error}</div>}
      <div className="btn-row span-2 spread">
        <button
          type="button"
          className="btn btn-ghost-danger"
          onClick={() => {
            if (confirm(`Delete the audit for ${audit.siteName}? This cannot be undone.`)) {
              run(() => deleteAudit(audit.id), onDeleted);
            }
          }}
        >
          Delete audit
        </button>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={pending}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
