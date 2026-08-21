"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* Toast feedback                                                      */
/* ------------------------------------------------------------------ */

type Toast = { id: number; kind: "success" | "error" | "info" | "warning"; message: string };

type ToastContextValue = {
  notify: (kind: Toast["kind"], message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within AdminProviders");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog                                                 */
/* ------------------------------------------------------------------ */

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<{ confirmed: boolean; reason?: string }>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within AdminProviders");
  return ctx.confirm;
}

/* ------------------------------------------------------------------ */
/* Unsaved changes guard                                               */
/* ------------------------------------------------------------------ */

type UnsavedContextValue = {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const UnsavedContext = createContext<UnsavedContextValue | null>(null);

export function useUnsavedGuard() {
  const ctx = useContext(UnsavedContext);
  if (!ctx) throw new Error("useUnsavedGuard must be used within AdminProviders");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Connection status                                                   */
/* ------------------------------------------------------------------ */

type ConnectionContextValue = { online: boolean };
const ConnectionContext = createContext<ConnectionContextValue>({ online: true });
export function useConnectionStatus() {
  return useContext(ConnectionContext);
}

/* ------------------------------------------------------------------ */
/* Provider                                                             */
/* ------------------------------------------------------------------ */

export function AdminProviders({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [online, setOnline] = useState(true);

  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: { confirmed: boolean; reason?: string }) => void }) | null
  >(null);
  const [reasonInput, setReasonInput] = useState("");

  const notify = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setReasonInput("");
    return new Promise<{ confirmed: boolean; reason?: string }>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const unsavedValue = useMemo(() => ({ isDirty: dirty, setDirty }), [dirty]);
  const connectionValue = useMemo(() => ({ online }), [online]);
  const toastValue = useMemo(() => ({ notify }), [notify]);
  const confirmValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirmValue}>
        <UnsavedContext.Provider value={unsavedValue}>
          <ConnectionContext.Provider value={connectionValue}>
            {children}

            {/* Toast stack */}
            <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[70] flex flex-col items-center gap-2 px-3">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`pointer-events-auto w-full max-w-[420px] rounded-xl border px-4 py-3 text-sm shadow-lg ${
                    t.kind === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : t.kind === "error"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : t.kind === "warning"
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-white text-slate-800"
                  }`}
                  role="status"
                >
                  {t.message}
                </div>
              ))}
            </div>

            {/* Global confirmation sheet */}
            {confirmState && (
              <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
                <div className="w-full max-w-[420px] rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-xl sm:rounded-2xl sm:pb-5">
                  <h3 className="text-base font-semibold text-slate-900">{confirmState.title}</h3>
                  {confirmState.description && (
                    <p className="mt-1.5 text-sm text-slate-600">{confirmState.description}</p>
                  )}
                  {confirmState.requireReason && (
                    <textarea
                      className="mt-3 w-full min-h-[70px] rounded-lg border border-slate-300 p-2.5 text-sm outline-none focus:border-slate-500"
                      placeholder="Reason (required)"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                    />
                  )}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="h-11 flex-1 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 active:bg-slate-100"
                      onClick={() => {
                        confirmState.resolve({ confirmed: false });
                        setConfirmState(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={confirmState.requireReason && reasonInput.trim().length === 0}
                      className={`h-11 flex-1 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${
                        confirmState.destructive ? "bg-red-600 active:bg-red-700" : "bg-slate-900 active:bg-slate-800"
                      }`}
                      onClick={() => {
                        confirmState.resolve({ confirmed: true, reason: reasonInput.trim() || undefined });
                        setConfirmState(null);
                      }}
                    >
                      {confirmState.confirmLabel ?? "Confirm"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </ConnectionContext.Provider>
        </UnsavedContext.Provider>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
