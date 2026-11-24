"use client";

import { useEffect, useRef, useState } from "react";
import { buildAuditPrompt } from "@/lib/audit-prompt";

export function AuditPromptButton({
  siteName,
  url,
  variant = "default",
}: {
  siteName?: string;
  url?: string;
  variant?: "default" | "topbar";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const prompt = buildAuditPrompt({ siteName, url });

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
        className={variant === "topbar" ? "tool-btn" : "btn"}
        onClick={() => setOpen(true)}
        data-testid={variant === "topbar" ? "audit-prompt-global" : "audit-prompt-detail"}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <path d="M3 4.5 6 8l-3 3.5M8 12h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Audit prompt</span>
      </button>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-label="Audit prompt"
            onMouseDown={(e) => e.stopPropagation()}
            data-testid="audit-prompt-modal"
          >
            <div className="modal-head">
              <span>Audit prompt</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-body prompt-body">
              <p className="muted small prompt-help">
                Paste into the site’s Lovable project. Paste the result back into the chat to fill this audit.
              </p>
              <textarea ref={textRef} className="input prompt-text" readOnly value={prompt} spellCheck={false} data-testid="prompt-text" />
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={copy} data-testid="prompt-copy">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
