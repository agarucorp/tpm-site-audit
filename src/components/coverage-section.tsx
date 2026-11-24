"use client";

import { useState } from "react";
import type { CoverageItem } from "@prisma/client";
import { addCoverage, deleteCoverage, updateCoverage } from "@/lib/actions";
import { coverageComplete } from "@/lib/workflow";
import { useActor } from "./role-provider";
import { useAction, useOptimisticRecord } from "./use-action";

export function CoverageSection({
  auditId,
  items,
  editable,
}: {
  auditId: string;
  items: CoverageItem[];
  editable: boolean;
}) {
  const actor = useActor();
  const { pending, error, run } = useAction();
  const [page, setPage] = useState("");
  const [element, setElement] = useState("");

  const desktop = items.filter((i) => i.desktopTested).length;
  const mobile = items.filter((i) => i.mobileTested).length;
  const complete = coverageComplete(items);
  const pct = (n: number) => (items.length ? Math.round((n / items.length) * 100) : 0);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () => addCoverage(auditId, { page, element }, actor),
      () => {
        setPage("");
        setElement("");
      },
    );
  };

  return (
    <div className="panel" data-testid="coverage">
      <div className="coverage-stats">
        <div className={`stat ${items.length && desktop === items.length ? "ok" : ""}`}>
          <span className="mono">{pct(desktop)}%</span>
          <span className="muted">Desktop coverage</span>
        </div>
        <div className={`stat ${items.length && mobile === items.length ? "ok" : ""}`}>
          <span className="mono">{pct(mobile)}%</span>
          <span className="muted">Mobile coverage</span>
        </div>
        <div className="stat">
          <span className="mono">{items.length}</span>
          <span className="muted">Pages / buttons logged</span>
        </div>
        <div className={`stat-flag ${complete ? "ok" : ""}`}>{complete ? "100% coverage confirmed" : "Coverage incomplete"}</div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Button / link / form tested</th>
            <th className="c">Desktop</th>
            <th className="c">Mobile</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={editable ? 5 : 4} className="muted empty-row">
                Log every page and button you click — menus, header/footer links, forms and checkout.
              </td>
            </tr>
          )}
          {items.map((i) => (
            <CoverageRow key={i.id} item={i} editable={editable} />
          ))}
        </tbody>
      </table>

      {editable && (
        <form className="inline-add" onSubmit={add}>
          <input
            className="input"
            placeholder="Page (e.g. /products/semaglutide)"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            data-testid="coverage-page"
          />
          <input
            className="input"
            placeholder="Buttons tested (e.g. Get started, footer links)"
            value={element}
            onChange={(e) => setElement(e.target.value)}
            data-testid="coverage-element"
          />
          <button className="btn" disabled={!page.trim() || pending} data-testid="coverage-add">
            Add row
          </button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function CoverageRow({ item, editable }: { item: CoverageItem; editable: boolean }) {
  const actor = useActor();
  const { pending, error, run } = useAction();
  const [i, applyOptimistic] = useOptimisticRecord(item);
  const toggle = (patch: Partial<Pick<CoverageItem, "desktopTested" | "mobileTested">>) =>
    run(() => updateCoverage(i.id, patch, actor), undefined, () => applyOptimistic(patch));

  return (
    <tr>
      <td>
        {i.page}
        {error && <div className="error">{error}</div>}
      </td>
      <td className="muted">{i.element || "—"}</td>
      <td className="c">
        <input
          type="checkbox"
          checked={i.desktopTested}
          disabled={!editable || pending}
          onChange={(e) => toggle({ desktopTested: e.target.checked })}
          aria-label={`${i.page} tested on desktop`}
        />
      </td>
      <td className="c">
        <input
          type="checkbox"
          checked={i.mobileTested}
          disabled={!editable || pending}
          onChange={(e) => toggle({ mobileTested: e.target.checked })}
          aria-label={`${i.page} tested on mobile`}
        />
      </td>
      {editable && (
        <td className="r">
          <button className="link-btn" onClick={() => run(() => deleteCoverage(i.id, actor))}>
            Remove
          </button>
        </td>
      )}
    </tr>
  );
}
