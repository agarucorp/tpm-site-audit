"use client";

import { useEffect, useState } from "react";
import type { CheckResult, CheckStatus } from "@prisma/client";
import { getCheck } from "@/lib/checks";
import { updateCheck, type CheckPatch } from "@/lib/actions";
import { isCheckComplete, STATUS_LABEL } from "@/lib/workflow";
import { useActor } from "./role-provider";
import { useAction, useOptimisticRecord } from "./use-action";
import { hrefOf } from "@/lib/format";

const STATUSES: CheckStatus[] = ["PENDING", "FAIL", "RETEST", "PASS"];

export function CheckRow({
  auditId,
  check: serverCheck,
  editable,
}: {
  auditId: string;
  check: CheckResult;
  editable: boolean;
}) {
  const def = getCheck(serverCheck.checkNumber);
  const actor = useActor();
  const { pending, error, run, setError } = useAction();
  const [check, applyOptimistic] = useOptimisticRecord(serverCheck);
  const complete = isCheckComplete(check);
  const [open, setOpen] = useState(check.status === "FAIL" || check.status === "RETEST");
  const [owner, setOwner] = useState(check.owner);
  const [notes, setNotes] = useState(check.notes);
  const [retest, setRetest] = useState(check.retestResult);
  const [link, setLink] = useState("");

  useEffect(() => {
    if (check.status === "FAIL" || check.status === "RETEST") setOpen(true);
  }, [check.status]);
  useEffect(() => setOwner(check.owner), [check.owner]);
  useEffect(() => setNotes(check.notes), [check.notes]);
  useEffect(() => setRetest(check.retestResult), [check.retestResult]);

  const save = (patch: CheckPatch) =>
    run(
      () => updateCheck(auditId, check.checkNumber, patch, actor),
      undefined,
      () => applyOptimistic(patch),
    );

  const addLink = () => {
    const v = link.trim();
    if (!v) return;
    save({ screenshotLinks: [...check.screenshotLinks, v] });
    setLink("");
  };

  return (
    <div
      className={`check ${complete ? "is-complete" : ""} status-${check.status.toLowerCase()}`}
      data-testid={`check-${def.code}`}
    >
      <div className="check-main">
        <div className="check-code mono">{def.code}</div>
        <div className="check-body">
          <div className="check-title">
            {def.title}
            {complete && <span className="complete-tag">Complete</span>}
          </div>
          <ul className="check-rules">
            {def.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="check-controls">
          <label className={`device ${check.desktopPass ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={check.desktopPass}
              disabled={!editable || pending}
              onChange={(e) => save({ desktopPass: e.target.checked })}
              data-testid={`check-${def.code}-desktop`}
            />
            <span>Desktop</span>
          </label>
          <label className={`device ${check.mobilePass ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={check.mobilePass}
              disabled={!editable || pending}
              onChange={(e) => save({ mobilePass: e.target.checked })}
              data-testid={`check-${def.code}-mobile`}
            />
            <span>Mobile</span>
          </label>
          <select
            className={`select status-select s-${check.status.toLowerCase()}`}
            value={check.status}
            disabled={!editable || pending}
            onChange={(e) => save({ status: e.target.value as CheckStatus })}
            aria-label={`Status for check ${def.code}`}
            data-testid={`check-${def.code}-status`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="check-error" role="alert">
          {error}
          <button className="link-btn" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <button className="check-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`caret ${open ? "open" : ""}`}>›</span>
        Owner, notes, screenshots, retest
        <span className="muted">
          {check.owner ? ` · ${check.owner}` : ""}
          {check.screenshotLinks.length ? ` · ${check.screenshotLinks.length} screenshot${check.screenshotLinks.length > 1 ? "s" : ""}` : ""}
          {check.notes ? " · notes" : ""}
        </span>
      </button>

      {open && (
        <div className="check-details">
          <label>
            <span>Owner</span>
            <input
              className="input"
              value={owner}
              disabled={!editable}
              placeholder="Who fixes this"
              onChange={(e) => setOwner(e.target.value)}
              onBlur={() => owner !== check.owner && save({ owner })}
              data-testid={`check-${def.code}-owner`}
            />
          </label>
          <label>
            <span>Retest result</span>
            <input
              className="input"
              value={retest}
              disabled={!editable}
              placeholder="Outcome after the fix was retested"
              onChange={(e) => setRetest(e.target.value)}
              onBlur={() => retest !== check.retestResult && save({ retestResult: retest })}
              data-testid={`check-${def.code}-retest`}
            />
          </label>
          <label className="span-2">
            <span>Notes</span>
            <textarea
              className="input"
              rows={2}
              value={notes}
              disabled={!editable}
              placeholder="What was tested, what failed, what was fixed"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== check.notes && save({ notes })}
              data-testid={`check-${def.code}-notes`}
            />
          </label>
          <div className="span-2">
            <span className="field-label">Screenshot links</span>
            {check.screenshotLinks.length > 0 && (
              <ul className="links">
                {check.screenshotLinks.map((l, i) => (
                  <li key={`${l}-${i}`}>
                    <a href={hrefOf(l)} target="_blank" rel="noreferrer" className="mono">
                      {l}
                    </a>
                    {editable && (
                      <button
                        className="link-btn"
                        onClick={() => save({ screenshotLinks: check.screenshotLinks.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <div className="inline-add">
                <input
                  className="input"
                  value={link}
                  placeholder="https://… (Drive, Loom, CleanShot)"
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  data-testid={`check-${def.code}-link`}
                />
                <button className="btn" onClick={addLink} disabled={!link.trim()}>
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
