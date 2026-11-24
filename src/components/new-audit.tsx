"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createAudit } from "@/lib/actions";
import { useActor, useRole } from "./role-provider";

export function NewAuditButton() {
  const { isPm, name } = useRole();
  const actor = useActor();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ siteName: "", clientName: "", url: "", auditDate: "", assignedPm: "" });

  useEffect(() => {
    if (open) {
      setForm({ siteName: "", clientName: "", url: "", auditDate: new Date().toISOString().slice(0, 10), assignedPm: name });
      setError(null);
    }
  }, [open, name]);

  if (!isPm) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createAudit(form, actor);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.push(`/audits/${res.id}`);
    });
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} data-testid="new-audit">
        <span aria-hidden>+</span> New audit
      </button>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="modal-head">
              <span>New site audit</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-body form-grid">
              <label>
                <span>Site name</span>
                <input className="input" value={form.siteName} onChange={set("siteName")} required autoFocus name="siteName" />
              </label>
              <label>
                <span>Client</span>
                <input className="input" value={form.clientName} onChange={set("clientName")} placeholder="Defaults to site name" name="clientName" />
              </label>
              <label className="span-2">
                <span>URL</span>
                <input className="input" value={form.url} onChange={set("url")} placeholder="https://" required name="url" />
              </label>
              <label>
                <span>Audit date</span>
                <input className="input" type="date" value={form.auditDate} onChange={set("auditDate")} required name="auditDate" />
              </label>
              <label>
                <span>Assigned PM</span>
                <input className="input" value={form.assignedPm} onChange={set("assignedPm")} required name="assignedPm" />
              </label>
              {error && <div className="error span-2">{error}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={pending} type="submit">
                {pending ? "Creating…" : "Create audit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
