import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ScreenEntry =
  | { name: "notifications" }
  | { name: "followers"; userId: string }
  | { name: "following"; userId: string }
  | { name: "profile"; userId: string }
  | { name: "chats" }
  | { name: "chat"; chatId: string };

interface NavContextValue {
  stack: ScreenEntry[];
  push: (entry: ScreenEntry) => void;
  pop: () => void;
  popAll: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<ScreenEntry[]>([]);

  const push = useCallback((entry: ScreenEntry) => {
    setStack((s) => [...s, entry]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => s.slice(0, -1));
  }, []);

  const popAll = useCallback(() => setStack([]), []);

  const value = useMemo(() => ({ stack, push, pop, popAll }), [stack, push, pop, popAll]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
