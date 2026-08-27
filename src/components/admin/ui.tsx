"use client";

import { type ReactNode, useEffect } from "react";

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "warn" | "danger" | "ok" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold md:text-2xl ${
          tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function SectionCard({ title, action, children, description }: { title?: string; action?: ReactNode; children: ReactNode; description?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900 md:text-base">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500 md:text-sm">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white active:bg-red-700">
          Try again
        </button>
      )}
    </div>
  );
}

export function Pill({ tone = "default", children }: { tone?: "default" | "success" | "warn" | "danger" | "info"; children: ReactNode }) {
  const toneMap: Record<string, string> = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${toneMap[tone]}`}>{children}</span>;
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500";
export const textareaClass =
  "w-full min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500";
export const selectClass = inputClass + " bg-white";

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  loading,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40 active:bg-slate-800 ${className}`}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-40 active:bg-slate-100 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 active:bg-red-100 ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom sheet (used for filters, editors on small screens)          */
/* ------------------------------------------------------------------ */

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-slate-100 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                 */
/* ------------------------------------------------------------------ */

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`h-11 flex-shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
            active === tab.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile-first record card (replaces desktop tables)                  */
/* ------------------------------------------------------------------ */

export function RecordCard({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`block w-full rounded-xl border border-slate-200 bg-white p-3 text-left ${onClick ? "active:bg-slate-50" : ""}`}
    >
      {children}
    </Comp>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
