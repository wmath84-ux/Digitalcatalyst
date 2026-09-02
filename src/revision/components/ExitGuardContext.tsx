import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/glass-dialog";
import { SecondaryButton } from "./ui";
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
      <Dialog open={Boolean(pendingHref && guard)} onOpenChange={(v) => { if (!v) setPendingHref(null); }}>
        {guard && (
          <DialogContent aria-label="Leave this screen?">
            <DialogTitle>Leave this screen?</DialogTitle>
            <DialogDescription>{guard.message}</DialogDescription>
            <DialogFooter className="mt-5 flex gap-3">
              <SecondaryButton className="flex-1" onClick={() => setPendingHref(null)}>
                Stay
              </SecondaryButton>
              <button
                type="button"
                onClick={() => {
                  const href = pendingHref;
                  setGuard(null);
                  setPendingHref(null);
                  if (href) onNavigateRef.current(href);
                }}
                className="min-h-[48px] flex-1 rounded-full bg-rose-600 text-sm font-bold text-white hover:bg-rose-500 active:bg-rose-700"
              >
                {guard.confirmLabel}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ExitGuardContext.Provider>
  );
}

export function useExitGuard() {
  const ctx = useContext(ExitGuardContext);
  if (!ctx) throw new Error("useExitGuard must be used within ExitGuardProvider");
  return ctx;
}
