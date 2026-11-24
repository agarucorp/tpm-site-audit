"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Actor } from "@/lib/actions";

const STORAGE_KEY = "tpm-site-audit:actor";

type RoleContextValue = Actor & {
  ready: boolean;
  setRole: (role: Actor["role"]) => void;
  setName: (name: string) => void;
  isPm: boolean;
  isApprover: boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [actor, setActor] = useState<Actor>({ role: "PM", name: "" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Actor>;
        setActor({
          role: parsed.role === "APPROVER" ? "APPROVER" : "PM",
          name: typeof parsed.name === "string" ? parsed.name : "",
        });
      }
    } catch {}
    setReady(true);
  }, []);

  const persist = useCallback((next: Actor) => {
    setActor(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const value: RoleContextValue = {
    ...actor,
    ready,
    isPm: actor.role === "PM",
    isApprover: actor.role === "APPROVER",
    setRole: (role) => persist({ ...actor, role }),
    setName: (name) => persist({ ...actor, name }),
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}

export function useActor(): Actor {
  const { role, name } = useRole();
  return { role, name };
}
