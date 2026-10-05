/**
 * Recall toast shim — Digitalcatalyst port.
 *
 * Recall toasts through `sonner`. Digitalcatalyst already owns its global
 * notification surfaces (the bell page, Android alarms) and the Revision chunk
 * must not add a second toast runtime to the app, so this shim renders Recall's
 * toast affordances with the ported Recall design tokens and mounts them inside
 * the Revision shell — never on `document.body` — which keeps the feature's CSS
 * contained (§22).
 *
 * Implemented API (everything the ported tree calls):
 *   toast.success(message, options?)   toast.error(...)
 *   toast.info(...)                    toast.warning(...)
 *   toast.loading(...)                 toast.dismiss(id?)
 *   toast.custom(node)                 toast.promise(promise, {...})
 *
 * `<Toaster />` renders the viewport and is mounted once by the feature shell.
 */

import { useSyncExternalStore, type ReactNode } from "react";

import { cn } from "../lib/utils";

type ToastKind = "success" | "error" | "info" | "warning" | "loading" | "custom";

export interface ToastRecord {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  description?: ReactNode;
  createdAt: number;
  duration: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastOptions {
  description?: ReactNode;
  duration?: number;
  id?: number | string;
  action?: { label: string; onClick: () => void };
}

type Listener = () => void;

let nextId = 1;
let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastRecord[] {
  return toasts;
}

function dismiss(id?: number): void {
  if (id === undefined) {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    toasts = [];
    emit();
    return;
  }
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((entry) => entry.id !== id);
  emit();
}

function push(kind: ToastKind, message: ReactNode, options: ToastOptions = {}): number {
  const id = typeof options.id === "number" ? options.id : nextId++;
  const duration = options.duration ?? (kind === "loading" ? 8000 : 3200);
  const record: ToastRecord = {
    id,
    kind,
    message,
    description: options.description,
    createdAt: Date.now(),
    duration,
    action: options.action,
  };
  toasts = [...toasts.filter((entry) => entry.id !== id), record].slice(-4);
  emit();

  const timer = setTimeout(() => dismiss(id), duration);
  timers.set(id, timer);
  return id;
}

export const toast = {
  success: (message: ReactNode, options?: ToastOptions) => push("success", message, options),
  error: (message: ReactNode, options?: ToastOptions) => push("error", message, options),
  info: (message: ReactNode, options?: ToastOptions) => push("info", message, options),
  warning: (message: ReactNode, options?: ToastOptions) => push("warning", message, options),
  loading: (message: ReactNode, options?: ToastOptions) => push("loading", message, options),
  message: (message: ReactNode, options?: ToastOptions) => push("info", message, options),
  custom: (message: ReactNode, options?: ToastOptions) => push("custom", message, options),
  dismiss,
  /**
   * `toast.promise(promise, { loading, success, error })` — sonner's shape.
   * Resolves with the original value so callers can still await it.
   */
  promise: async <T,>(
    promise: Promise<T>,
    messages: { loading?: ReactNode; success?: ReactNode | ((value: T) => ReactNode); error?: ReactNode | ((error: unknown) => ReactNode) },
  ): Promise<T> => {
    const id = push("loading", messages.loading ?? "Working…", { duration: 60_000 });
    try {
      const value = await promise;
      dismiss(id);
      const text = typeof messages.success === "function" ? messages.success(value) : messages.success;
      if (text !== undefined) push("success", text);
      return value;
    } catch (error) {
      dismiss(id);
      const text = typeof messages.error === "function" ? messages.error(error) : messages.error;
      if (text !== undefined) push("error", text);
      throw error;
    }
  },
};

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-tertiary/40 bg-tertiary-container text-on-tertiary-container",
  error: "border-error/40 bg-error-container text-on-error-container",
  warning: "border-secondary/40 bg-secondary-container text-on-secondary-container",
  info: "border-outline-variant bg-surface-container-high text-on-surface",
  loading: "border-outline-variant bg-surface-container-high text-on-surface",
  custom: "border-outline-variant bg-surface-container-high text-on-surface",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
  loading: "…",
  custom: "",
};

export interface ToasterProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
  richColors?: boolean;
  closeButton?: boolean;
  className?: string;
}

/** The toast viewport. Mounted once, inside the Revision root. */
export function Toaster({ position = "top-right", closeButton = true, className }: ToasterProps): JSX.Element | null {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (items.length === 0) return null;

  const placement =
    position.startsWith("top") ? "top-4" : "bottom-4";
  const horizontal = position.endsWith("left")
    ? "left-4 items-start"
    : position.endsWith("center")
      ? "left-1/2 -translate-x-1/2 items-center"
      : "right-4 items-end";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("pointer-events-none fixed z-[60] flex w-[min(100vw-2rem,22rem)] flex-col gap-2", placement, horizontal, className)}
    >
      {items.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg",
            KIND_STYLES[entry.kind],
          )}
        >
          <span aria-hidden className="mt-0.5 text-sm font-bold">
            {KIND_ICON[entry.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{entry.message}</p>
            {entry.description ? (
              <p className="mt-0.5 text-xs leading-5 opacity-80">{entry.description}</p>
            ) : null}
            {entry.action ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold underline"
                onClick={() => {
                  entry.action?.onClick();
                  dismiss(entry.id);
                }}
              >
                {entry.action.label}
              </button>
            ) : null}
          </div>
          {closeButton ? (
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 rounded-full px-1 text-sm opacity-60 hover:opacity-100"
              onClick={() => dismiss(entry.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default toast;
