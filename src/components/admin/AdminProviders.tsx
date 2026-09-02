"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type RevisionCatalog } from "@/revision/engine/catalogService";
import { adminFetch } from "@/lib/admin/client";
import { toast as glassToast } from "@/components/ui/glass-toast";

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
/* Revision catalog (shared by AI Configuration + Curriculum Builder)  */
/* ------------------------------------------------------------------ */
// The two admin pages read the same Firestore-backed revision
// catalog. Loading it once in a provider saves a round-trip when
// the admin navigates between them, and keeps both pages in sync
// when either one publishes an update.

type CatalogContextValue = {
  catalog: RevisionCatalog | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replace the in-memory catalog after a successful publish. */
  setCatalog: (next: RevisionCatalog) => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useRevisionCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useRevisionCatalog must be used within AdminProviders");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Provider                                                             */
/* ------------------------------------------------------------------ */

export function AdminProviders({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [online, setOnline] = useState(true);
  const [catalog, setCatalogState] = useState<RevisionCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);

  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: { confirmed: boolean; reason?: string }) => void }) | null
  >(null);
  const [reasonInput, setReasonInput] = useState("");

  const notify = useCallback((kind: Toast["kind"], message: string) => {
    // All admin feedback rides the app-wide AI Canvas glass toast stack
    // (GlassToaster mounted once in src/main.tsx) — one look everywhere.
    glassToast({ title: message, variant: kind });
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

  // Load the revision catalog once when the admin shell mounts.
  // Both pages (AI Configuration + Curriculum Builder) consume it
  // via `useRevisionCatalog`. The initial fetch mirrors what
  // `RevisionPage` used to do on its own.
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await adminFetch<{ catalog: RevisionCatalog; isDefault: boolean }>("/api/admin/revision");
      setCatalogState(res.catalog);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to load revision catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const setCatalog = useCallback((next: RevisionCatalog) => {
    setCatalogState(next);
  }, []);

  const catalogValue = useMemo<CatalogContextValue>(
    () => ({
      catalog,
      error: catalogError,
      loading: catalogLoading,
      reload: loadCatalog,
      setCatalog,
    }),
    [catalog, catalogError, catalogLoading, loadCatalog, setCatalog],
  );

  const unsavedValue = useMemo(() => ({ isDirty: dirty, setDirty }), [dirty]);
  const connectionValue = useMemo(() => ({ online }), [online]);
  const toastValue = useMemo(() => ({ notify }), [notify]);
  const confirmValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirmValue}>
        <UnsavedContext.Provider value={unsavedValue}>
          <ConnectionContext.Provider value={connectionValue}>
            <CatalogContext.Provider value={catalogValue}>
              {children}

            {/* Toast stack now renders through the global GlassToaster
                (AI Canvas glass-toast) mounted in src/main.tsx. */}
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
            </CatalogContext.Provider>
          </ConnectionContext.Provider>
        </UnsavedContext.Provider>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
