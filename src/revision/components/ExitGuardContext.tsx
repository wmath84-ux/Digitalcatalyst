import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type GuardState = {
  message: string;
  confirmLabel: string;
} | null;

type ExitGuardContextValue = {
  setGuard: (state: GuardState) => void;
  navigate: (href: string) => void;
};

const ExitGuardContext = createContext<ExitGuardContextValue | null>(null);

export function ExitGuardProvider({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate: (href: string) => void;
}) {
  const [guard, setGuardState] = useState<GuardState>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const guardRef = useRef<GuardState>(null);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const setGuard = useCallback((state: GuardState) => {
    guardRef.current = state;
    setGuardState(state);
  }, []);

  const navigate = useCallback((href: string) => {
    if (guardRef.current) {
      setPendingHref(href);
    } else {
      onNavigateRef.current(href);
    }
  }, []);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (guardRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <ExitGuardContext.Provider value={{ setGuard, navigate }}>
      {children}
      {pendingHref && guard && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center">
          <div className="mx-auto w-full max-w-[480px] rounded-t-3xl bg-white p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl sm:rounded-3xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <h3 className="text-lg font-semibold text-white">Leave this screen?</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{guard.message}</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingHref(null)}
                className="min-h-[48px] flex-1 rounded-2xl border border-slate-300 bg-white text-sm font-bold text-slate-800 shadow-sm active:bg-slate-100"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = pendingHref;
                  setGuard(null);
                  setPendingHref(null);
                  if (href) onNavigateRef.current(href);
                }}
                className="min-h-[48px] flex-1 rounded-2xl bg-rose-600 text-sm font-bold text-white shadow-md shadow-rose-200 active:bg-rose-700"
              >
                {guard.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ExitGuardContext.Provider>
  );
}

export function useExitGuard() {
  const ctx = useContext(ExitGuardContext);
  if (!ctx) throw new Error("useExitGuard must be used within ExitGuardProvider");
  return ctx;
}
