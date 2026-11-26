import Link from "next/link";
import { getHistory } from "@/lib/queries";
import { getCheck } from "@/lib/checks";
import { STATUS_LABEL, isCheckComplete } from "@/lib/workflow";
import { formatDate, formatDateTime, hostOf, hrefOf } from "@/lib/format";

type Search = { q?: string; client?: string; from?: string; to?: string };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const filters = {
    q: sp.q?.trim() || undefined,
    client: sp.client || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };
  const { audits, clients } = await getHistory(filters);
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="history-page">
      <div className="page-head">
        <div>
          <div className="eyebrow mono">Archive</div>
          <h1>History</h1>
          <p className="muted">Approved audits with their full checklist, sign-off and comments.</p>
        </div>
      </div>

      <form className="filters" method="get">
        <input className="input grow" name="q" defaultValue={filters.q} placeholder="Search client, URL, approver, comments…" data-testid="history-search" />
        <select className="select" name="client" defaultValue={filters.client ?? ""} data-testid="history-client">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="date-field">
          <span className="muted small">Approved from</span>
          <input className="input" type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="date-field">
          <span className="muted small">to</span>
          <input className="input" type="date" name="to" defaultValue={filters.to} />
        </label>
        <button className="btn btn-primary" type="submit">
          Apply
        </button>
        {active && (
          <Link href="/history" className="btn">
            Clear
          </Link>
        )}
      </form>

      <div className="muted small result-count" data-testid="history-count">
        {audits.length} approved audit{audits.length === 1 ? "" : "s"}
      </div>

      <div className="history-list">
        {audits.length === 0 && <div className="panel muted">No approved audits match these filters.</div>}
        {audits.map((a) => {
          const comments = a.events.filter((e) => e.comment && e.type !== "STAGE_CHANGED");
          return (
            <details key={a.id} className="hist" data-testid="history-row">
              <summary>
                <div className="hist-main">
                  <span className="hist-site">{a.siteName}</span>
                  <a href={hrefOf(a.url)} target="_blank" rel="noreferrer" className="mono muted small">
                    {hostOf(a.url)}
                  </a>
                </div>
                <div className="hist-cols">
                  <span>
                    <span className="muted small">Audit date</span>
                    {formatDate(a.auditDate)}
                  </span>
                  <span>
                    <span className="muted small">Approved</span>
                    {formatDate(a.approvedAt)}
                  </span>
                  <span>
                    <span className="muted small">Approver</span>
                    {a.approvedBy}
                  </span>
                </div>
              </summary>
              <div className="hist-body">
                <div className="hist-meta">
                  <div>
                    <span className="muted">Submitted to Bree</span> {formatDateTime(a.submittedAt)}
                  </div>
                  <div>
                    <span className="muted">Approved</span> {formatDateTime(a.approvedAt)}
                  </div>
                  <Link href={`/audits/${a.id}`} className="link">
                    Open full record →
                  </Link>
                </div>

                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th className="c">Desktop</th>
                      <th className="c">Mobile</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Notes</th>
                      <th>Screenshots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.checks
                      .sort((x, y) => x.checkNumber - y.checkNumber)
                      .map((c) => {
                        const def = getCheck(c.checkNumber);
                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="mono muted">{def.code}</span> {def.title}
                            </td>
                            <td className="c">{c.desktopPass ? "✓" : "—"}</td>
                            <td className="c">{c.mobilePass ? "✓" : "—"}</td>
                            <td>
                              <span className={`status-tag s-${c.status.toLowerCase()}`}>
                                {isCheckComplete(c) ? "Complete" : STATUS_LABEL[c.status]}
                              </span>
                            </td>
                            <td>{c.owner || "—"}</td>
                            <td className="muted">{c.notes || "—"}</td>
                            <td>
                              {c.screenshotLinks.length === 0
                                ? "—"
                                : c.screenshotLinks.map((l, i) => (
                                    <a key={i} href={hrefOf(l)} target="_blank" rel="noreferrer" className="link small">
                                      [{i + 1}]{" "}
                                    </a>
                                  ))}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>

                <div className="hist-two">
                  <div>
                    <div className="field-label">Coming soon (verified reasons)</div>
                    {a.comingSoon.length === 0 ? (
                      <div className="muted small">None</div>
                    ) : (
                      <ul className="plain">
                        {a.comingSoon.map((i) => (
                          <li key={i.id}>
                            <strong>{i.product}</strong> <span className="muted">— {i.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="field-label">Comments</div>
                    {comments.length === 0 ? (
                      <div className="muted small">None</div>
                    ) : (
                      <ul className="plain">
                        {comments.map((e) => (
                          <li key={e.id}>
                            <span className="small muted">
                              {e.actorName} · {formatDate(e.createdAt)} ·{" "}
                              {e.type === "APPROVED" ? "Approval" : e.type === "CHANGES_REQUESTED" ? "Changes requested" : "Resubmitted"}
                            </span>
                            <div className="pre">{e.comment}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
