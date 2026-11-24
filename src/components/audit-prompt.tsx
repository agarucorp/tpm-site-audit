"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildAuditPrompt } from "@/lib/audit-prompt";

export function AuditPromptButton({
  siteName = "",
  url = "",
  variant = "default",
}: {
  siteName?: string;
  url?: string;
  variant?: "default" | "topbar";
}) {
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState(siteName);
  const [siteUrl, setSiteUrl] = useState(url);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSite(siteName);
      setSiteUrl(url);
      setCopied(false);
    }
  }, [open, siteName, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const prompt = useMemo(() => buildAuditPrompt({ siteName: site, url: siteUrl }), [site, siteUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      textRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        className={variant === "topbar" ? "inbox-btn" : "btn"}
        onClick={() => setOpen(true)}
        data-testid={variant === "topbar" ? "audit-prompt-global" : "audit-prompt-detail"}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <path d="M3 4.5 6 8l-3 3.5M8 12h5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Audit prompt</span>
      </button>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-label="Audit prompt for Lovable"
            onMouseDown={(e) => e.stopPropagation()}
            data-testid="audit-prompt-modal"
          >
            <div className="modal-head">
              <span>Audit prompt for Lovable</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-body prompt-body">
              <p className="muted small prompt-help">
                Paste this into the Lovable project of the site being audited. Lovable only inspects and reports — it
                is told not to change code. Its Markdown tables map 1:1 to this app’s coverage log, checks and
                “coming soon” fields.
              </p>
              <div className="form-grid">
                <label>
                  <span>Site name</span>
                  <input className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="[SITE NAME]" data-testid="prompt-site" />
                </label>
                <label>
                  <span>URL</span>
                  <input className="input" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="[SITE URL]" data-testid="prompt-url" />
                </label>
              </div>
              <textarea
                ref={textRef}
                className="input prompt-text mono"
                readOnly
                value={prompt}
                spellCheck={false}
                data-testid="prompt-text"
              />
            </div>
            <div className="modal-foot spread">
              <span className="muted small mono">
                {prompt.length.toLocaleString("en-US")} chars · 12 checks
              </span>
              <div className="btn-row">
                <button className="btn" onClick={() => setOpen(false)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={copy} data-testid="prompt-copy">
                  {copied ? "Copied ✓" : "Copy prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
