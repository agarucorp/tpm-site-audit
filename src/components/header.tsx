"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Inbox } from "@/lib/queries";
import { useRole } from "./role-provider";
import { formatDate, hostOf } from "@/lib/format";
import { AuditPromptButton } from "./audit-prompt";

export function Header({ inbox }: { inbox: Inbox }) {
  const pathname = usePathname();
  const { role, name, setRole, setName, isApprover, ready } = useRole();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = isApprover ? inbox.awaiting : inbox.changes;
  const count = items.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 8.2 14 5M8 8.2 2 5M8 8.2v6.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
          <span className="brand-name">TPM Site Audit</span>
        </Link>
        <nav className="tabs">
          <Link href="/" className={`tab ${pathname === "/" || pathname.startsWith("/audits") ? "active" : ""}`}>
            Board
          </Link>
          <Link href="/history" className={`tab ${pathname.startsWith("/history") ? "active" : ""}`}>
            History
          </Link>
          <Link href="/guide" className={`tab ${pathname.startsWith("/guide") ? "active" : ""}`}>
            Guide
          </Link>
        </nav>
      </div>

      <div className="topbar-right">
        <AuditPromptButton variant="topbar" />
        <div className="inbox" ref={panelRef}>
          <button
            className={`inbox-btn ${count > 0 ? "has-items" : ""}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={isApprover ? "Awaiting your review" : "Changes requested"}
            data-testid="inbox-button"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path
                d="M2 9.5 3.6 3.2A1 1 0 0 1 4.6 2.5h6.8a1 1 0 0 1 1 .7L14 9.5V13a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 2 13z M2 9.5h3.5l1 1.5h3l1-1.5H14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span>{isApprover ? "Awaiting review" : "Changes requested"}</span>
            {ready && count > 0 && (
              <span className="badge-count" data-testid="inbox-count">
                {count}
              </span>
            )}
          </button>
          {open && (
            <div className="inbox-panel">
              <div className="inbox-head">
                {isApprover ? "Cards ready for Bree" : "Bree requested changes"}
                <span className="muted mono">{count}</span>
              </div>
              {count === 0 ? (
                <div className="inbox-empty">
                  {isApprover ? "Nothing awaiting sign-off." : "No change requests."}
                </div>
              ) : (
                <ul>
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link href={`/audits/${a.id}`} onClick={() => setOpen(false)}>
                        <span className="inbox-site">{a.siteName}</span>
                        <span className="muted">
                          {hostOf(a.url)}
                          {"submittedAt" in a && a.submittedAt ? ` · submitted ${formatDate(a.submittedAt)}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="role-switch" role="radiogroup" aria-label="Role">
          <button
            role="radio"
            aria-checked={role === "PM"}
            className={role === "PM" ? "on" : ""}
            onClick={() => setRole("PM")}
            data-testid="role-pm"
          >
            Technical PM
          </button>
          <button
            role="radio"
            aria-checked={role === "APPROVER"}
            className={role === "APPROVER" ? "on" : ""}
            onClick={() => setRole("APPROVER")}
            data-testid="role-approver"
          >
            Approver
          </button>
        </div>
        <input
          className="input name-input"
          placeholder={isApprover ? "Your name (e.g. Bree)" : "Your name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Your name"
          data-testid="name-input"
        />
      </div>
    </header>
  );
}
