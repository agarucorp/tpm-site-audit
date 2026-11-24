"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";

export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void, before?: () => void) => {
    start(async () => {
      before?.();
      const res = await fn();
      if (res.ok) {
        setError(null);
        onOk?.();
      } else {
        setError(res.error);
      }
    });
  };

  return { pending, error, setError, run };
}

/** Optimistic copy of a server record; reverts automatically if the action fails. */
export function useOptimisticRecord<T extends object>(value: T) {
  return useOptimistic(value, (state: T, patch: Partial<T>) => ({ ...state, ...patch }));
}
