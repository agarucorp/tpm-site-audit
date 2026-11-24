"use client";

import { useState } from "react";
import type { ComingSoonItem } from "@prisma/client";
import { addComingSoon, deleteComingSoon, updateComingSoon } from "@/lib/actions";
import { useActor } from "./role-provider";
import { useAction, useOptimisticRecord } from "./use-action";

function Row({ item: serverItem, editable }: { item: ComingSoonItem; editable: boolean }) {
  const actor = useActor();
  const { pending, error, run } = useAction();
  const [item, applyOptimistic] = useOptimisticRecord(serverItem);
  const [reason, setReason] = useState(item.reason);

  return (
    <li className="soon-row">
      <div className="soon-row-top">
        <span className="soon-product">{item.product}</span>
        <label className={`verify ${item.verified ? "on" : ""}`}>
          <input
            type="checkbox"
            checked={item.verified}
            disabled={!editable || pending}
            onChange={(e) => {
              const verified = e.target.checked;
              run(
                () => updateComingSoon(item.id, { verified, reason }, actor),
                undefined,
                () => applyOptimistic({ verified }),
              );
            }}
            data-testid={`soon-verify-${item.product}`}
          />
          {item.verified ? "Verified" : "Verify"}
        </label>
      </div>
      {editable ? (
        <input
          className="input"
          value={reason}
          placeholder="Reason for the label (verified against current availability)"
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => reason !== item.reason && run(() => updateComingSoon(item.id, { reason }, actor))}
        />
      ) : (
        <div className="muted soon-reason-text">{item.reason || "No reason recorded"}</div>
      )}
      {editable && (
        <button className="link-btn" onClick={() => run(() => deleteComingSoon(item.id, actor))}>
          Remove — label updated, product available
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </li>
  );
}

export function ComingSoonSection({
  auditId,
  items,
  editable,
}: {
  auditId: string;
  items: ComingSoonItem[];
  editable: boolean;
}) {
  const actor = useActor();
  const { pending, error, run } = useAction();
  const [product, setProduct] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="panel" data-testid="coming-soon">
      <p className="muted small panel-note">
        Bring any remaining “coming soon” item and its reason to Bree. Remove items whose label was updated because the
        product is available.
      </p>
      {items.length === 0 ? (
        <div className="muted small">No “coming soon” items on this site.</div>
      ) : (
        <ul className="soon-list">
          {items.map((i) => (
            <Row key={`${i.id}-${i.reason}`} item={i} editable={editable} />
          ))}
        </ul>
      )}
      {editable && (
        <form
          className="stack-add"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addComingSoon(auditId, { product, reason }, actor),
              () => {
                setProduct("");
                setReason("");
              },
            );
          }}
        >
          <input
            className="input"
            placeholder="Product labeled “coming soon”"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            data-testid="soon-product"
          />
          <input
            className="input"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="soon-reason"
          />
          <button className="btn" disabled={!product.trim() || pending} data-testid="soon-add">
            Add item
          </button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
