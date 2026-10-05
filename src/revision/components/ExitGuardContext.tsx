/**
 * ExitGuard — the business safeguard for an in-progress test or session.
 *
 * Migration brief §22 keeps this provider as the ONE place that knows how to
 * interrupt navigation (an in-progress Daily Test must not be abandoned by a
 * stray tap), but its dialog now renders in the ported Recall design language
 * instead of the retired glass plate: the buttons, surface and typography come
 * from `recall/components/ui` + `recall/lib/surface`, and the dialog is scoped
 * to the Revision root so no global style is involved.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "../recall/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../recall/components/ui/alert-dialog";
import { typeClass } from "../recall/lib/surface";
import { useTranslation } from "../recall/shims/i18n";

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
  const { t } = useTranslation();
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
    function handler(event: BeforeUnloadEvent) {
      if (guardRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <ExitGuardContext.Provider value={{ setGuard, navigate }}>
      {children}
      <AlertDialog open={Boolean(pendingHref && guard)} onOpenChange={(open) => { if (!open) setPendingHref(null); }}>
        <AlertDialogContent aria-label={t("exitGuard.title", "Leave this screen?")}>
          <AlertDialogHeader>
            <AlertDialogTitle className={typeClass["title-md"]}>
              {t("exitGuard.title", "Leave this screen?")}
            </AlertDialogTitle>
            <AlertDialogDescription className={typeClass["body-md"]}>
              {guard?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex gap-3">
            <AlertDialogCancel asChild>
              <Button variant="outline" className="flex-1" onClick={() => setPendingHref(null)}>
                {t("exitGuard.stay", "Stay")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  const href = pendingHref;
                  setGuard(null);
                  setPendingHref(null);
                  if (href) onNavigateRef.current(href);
                }}
              >
                {guard?.confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ExitGuardContext.Provider>
  );
}

export function useExitGuard() {
  const ctx = useContext(ExitGuardContext);
  if (!ctx) throw new Error("useExitGuard must be used within ExitGuardProvider");
  return ctx;
}
