"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";

export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void, before?: () => void) => {
    start(async () => {
      before?.();
      let res: ActionResult;
      try {
        res = await fn();
      } catch (e) {
        res = { ok: false, error: `Couldn't save: ${(e as Error).message || "network error"}. Try again.` };
      }
      if (res.ok) {
        setError(null);
        setNotice(res.notice ?? null);
        onOk?.();
      } else {
        setNotice(null);
        setError(res.error);
      }
    });
  };

  return { pending, error, setError, notice, setNotice, run };
}

/** Optimistic copy of a server record; reverts automatically if the action fails. */
export function useOptimisticRecord<T extends object>(value: T) {
  return useOptimistic(value, (state: T, patch: Partial<T>) => ({ ...state, ...patch }));
}
