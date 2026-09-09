// src/ai/components.tsx
//
// Shared presentational pieces for the Personal Module AI Study Engine.
//
// Everything here is deliberately small and dependency-light: the workspace is
// one overlay with several views, and each view composes these parts so the
// loading / no-content / partial-content / permission / limit / failure states
// look and read the same everywhere (and no view can ever show an infinite
// spinner without a retry or an explanation).

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, FileWarning, Info,
  LoaderCircle, Lock, RefreshCw, ShieldAlert, Sparkles, X,
} from "lucide-react";
import { cn } from "../utils/cn";
import { GlassButton } from "../components/ui/glass-button";
import { lockBodyScroll, unlockBodyScroll, useVisualViewportBox } from "../components/ui/overlayBounds";
import type { PersonalAiCoverage, PersonalAiSource, PersonalAiState } from "./types";

/* ------------------------------------------------------------------ */
/* Overlay shell — reuses the app's VisualViewport keyboard handling   */
/* ------------------------------------------------------------------ */

/**
 * Full-height overlay for the AI workspace.
 *
 * Positioning comes from `useVisualViewportBox` (the same hook Modal /
 * ConfirmDialog use), so when a phone keyboard opens the panel is laid out
 * inside the *visible* viewport: the composer stays above the keyboard, the
 * message list keeps its own scroll, and nothing is ever pushed off-screen.
 * No keyboard height is guessed anywhere.
 */
export function AiOverlay({ open, onClose, label, children }: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const box = useVisualViewportBox(open);
  useEffect(() => {
    if (!open) return undefined;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="animate-fadeIn fixed z-50 flex items-stretch justify-center sm:items-center sm:p-4"
      style={box ? { top: box.top, left: box.left, width: box.width, height: box.height } : undefined}
      data-module-ai-overlay=""
    >
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm sm:rounded-[1.75rem]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "dc-scene-plate glass-dialog-in relative flex w-full min-w-0 flex-col overflow-hidden border border-white/10 bg-[#0b0b16]/95 text-white",
          box ? "max-h-full sm:max-h-[calc(100%-2rem)] sm:rounded-[1.75rem]" : "h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem]",
          "sm:max-w-[min(1100px,calc(100%-2rem))]",
        )}
        data-module-ai-panel=""
      >
        {children}
      </div>
    </div>
  );
}

/** Overlay header: provenance, coverage and the close control. */
export function AiOverlayHeader({ title, provenance, coverage, onClose, right }: {
  title: string;
  provenance: string;
  coverage?: PersonalAiCoverage | null;
  onClose: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-3 py-2.5 sm:px-5 sm:py-3.5" data-module-ai-header="">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20">
        <Sparkles size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-black leading-5 sm:text-base">{title}</h2>
        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-violet-300/80">{provenance}</p>
        {coverage ? <AiCoverageLine coverage={coverage} className="mt-1" /> : null}
      </div>
      {right ? <div className="hidden shrink-0 sm:block">{right}</div> : null}
      <GlassButton type="button" onClick={onClose} aria-label="Close AI study workspace" className="shrink-0 [&_.size-12]:size-10" data-module-ai-close="">
        <X className="size-5" />
      </GlassButton>
    </header>
  );
}

/** "Based on 3 of 5 readable resources…" — never implies full coverage. */
export function AiCoverageLine({ coverage, className }: { coverage: PersonalAiCoverage; className?: string }) {
  const tone = coverage.none ? "text-amber-200" : coverage.full ? "text-emerald-200" : "text-white/60";
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-[10px] font-bold leading-4", tone, className)} data-module-ai-coverage="">
      <Info size={11} className="shrink-0" />
      <span>{coverage.sentence}</span>
      {coverage.processing > 0 ? <span className="text-white/40">· {coverage.processing} still being read</span> : null}
      {coverage.permissionRequired > 0 ? <span className="text-white/40">· {coverage.permissionRequired} need permission</span> : null}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function AiBusyRow({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5", className)} data-module-ai-busy="" role="status" aria-live="polite">
      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-violet-300" />
      <p className="min-w-0 flex-1 text-xs font-bold text-white/70">{label}…</p>
    </div>
  );
}

export function AiFailureBanner({ failure, onRetry, onUpgrade, onConfigure }: {
  failure: { code: string; message: string; retryable: boolean; upgrade: boolean; kind: string } | null;
  onRetry?: () => void;
  onUpgrade?: () => void;
  onConfigure?: () => void;
}) {
  if (!failure) return null;
  const Icon = failure.kind === "limit" || failure.kind === "entitlement" ? ShieldAlert
    : failure.kind === "network" || failure.kind === "server" || failure.kind === "busy" ? AlertTriangle
      : failure.kind === "content" ? FileWarning
        : failure.kind === "config" ? Lock : AlertTriangle;
  const tone = failure.kind === "limit" || failure.kind === "entitlement"
    ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
    : "border-rose-400/25 bg-rose-500/10 text-rose-100";
  return (
    <div className={cn("rounded-2xl border px-4 py-3", tone)} role="alert" data-module-ai-error="" data-code={failure.code}>
      <div className="flex items-start gap-2.5">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <p className="min-w-0 flex-1 text-xs font-bold leading-5">{failure.message}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 pl-[26px]">
        {failure.retryable && onRetry ? (
          <button type="button" onClick={onRetry} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[11px] font-black text-white ring-1 ring-white/15">
            <RefreshCw size={12} /> Try again
          </button>
        ) : null}
        {failure.upgrade && onUpgrade ? (
          <button type="button" onClick={onUpgrade} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-400/20 px-3.5 text-[11px] font-black text-amber-50 ring-1 ring-amber-300/30" data-module-ai-upgrade="">
            <ArrowUpRight size={12} /> View plans
          </button>
        ) : null}
        {failure.kind === "config" && onConfigure ? (
          <button type="button" onClick={onConfigure} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-violet-500/20 px-3.5 text-[11px] font-black text-violet-100 ring-1 ring-violet-300/30" data-module-ai-configure="">
            <Sparkles size={12} /> Configure AI
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** No AI provider connected / no entitlement — the honest gate before asking. */
export function AiGate({ title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary, tone = "amber" }: {
  title: string;
  message: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "amber" | "violet";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-5 text-center",
        tone === "amber" ? "border-amber-400/25 bg-amber-500/[0.08]" : "border-violet-400/25 bg-violet-500/[0.08]",
      )}
      data-module-ai-gate=""
    >
      <span className={cn("mx-auto grid h-12 w-12 place-items-center rounded-2xl", tone === "amber" ? "bg-amber-500/15 text-amber-200" : "bg-violet-500/15 text-violet-200")}>
        {tone === "amber" ? <Lock size={20} /> : <Sparkles size={20} />}
      </span>
      <h3 className="mt-3 text-sm font-black">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs font-medium leading-5 text-white/60">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {primaryLabel && onPrimary ? (
          <button type="button" onClick={onPrimary} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-600 px-5 text-xs font-black text-white">{primaryLabel}</button>
        ) : null}
        {secondaryLabel && onSecondary ? (
          <button type="button" onClick={onSecondary} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-5 text-xs font-black text-white/75">{secondaryLabel}</button>
        ) : null}
      </div>
    </div>
  );
}

export function AiEmptyState({ icon: Icon, title, message, action, className }: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center rounded-3xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center", className)} data-module-ai-empty="">
      <Icon size={26} className="text-white/30" />
      <p className="mt-3 text-sm font-black text-white/80">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs font-medium leading-5 text-white/45">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/** "My Module → Physics Revision → Chapter 2 PDF" chips under every answer. */
export function AiSourceChips({ sources, title = "Sources", className }: { sources: PersonalAiSource[]; title?: string; className?: string }) {
  if (!sources.length) return null;
  return (
    <div className={cn("min-w-0", className)} data-module-ai-sources="">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <li key={source.unitId}>
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
                source.originKind === "official-copy" ? "bg-blue-500/15 text-blue-200 ring-1 ring-blue-400/20" : "bg-white/[0.06] text-white/65 ring-1 ring-white/10",
              )}
              title={source.provenance}
            >
              <span className="truncate">{source.provenance}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Honest list of what the AI could and could not read. */
export function AiAvailabilityList({ resources, busy, onRefresh }: {
  resources: { id: string; name: string; type: string; state: PersonalAiState; reason: string; readable: boolean; provenance: string; chars: number }[];
  busy?: boolean;
  onRefresh?: () => void;
}) {
  if (!resources.length) {
    return <AiEmptyState icon={FileWarning} title="Nothing to read yet" message="Add a resource to this module and the AI will tell you honestly what it can read." />;
  }
  return (
    <div className="space-y-2" data-module-ai-availability="">
      {resources.map((resource) => <AiAvailabilityRow key={resource.id} resource={resource} />)}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-black text-white/75 disabled:opacity-45"
          data-module-ai-reread=""
        >
          <RefreshCw size={13} className={busy ? "animate-spin" : undefined} /> {busy ? "Reading your files…" : "Try reading again"}
        </button>
      ) : null}
    </div>
  );
}

const STATE_META: Record<PersonalAiState, { label: string; tone: string }> = {
  ready: { label: "Read", tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25" },
  partial: { label: "Partly readable", tone: "bg-amber-500/15 text-amber-200 ring-amber-400/25" },
  processing: { label: "Reading…", tone: "bg-sky-500/15 text-sky-200 ring-sky-400/25" },
  unavailable: { label: "Couldn't read", tone: "bg-rose-500/15 text-rose-200 ring-rose-400/25" },
  permission_required: { label: "Needs permission", tone: "bg-amber-500/15 text-amber-200 ring-amber-400/25" },
  unsupported: { label: "Not readable", tone: "bg-white/[0.07] text-white/50 ring-white/10" },
};

export function AiAvailabilityRow({ resource }: { resource: { name: string; type: string; state: PersonalAiState; reason: string; readable: boolean; provenance: string; chars: number } }) {
  const meta = STATE_META[resource.state] || STATE_META.unsupported;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5" data-availability-state={resource.state}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 shrink-0", resource.readable ? "text-emerald-300" : "text-white/30")}>
          {resource.state === "processing" ? <LoaderCircle size={14} className="animate-spin" /> : resource.readable ? <CheckCircle2 size={14} /> : <FileWarning size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-xs font-black">{resource.name}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1", meta.tone)}>{meta.label}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] font-bold text-white/35">{resource.provenance}</p>
          <p className="mt-1.5 text-[11px] font-medium leading-4 text-white/55">{resource.reason}</p>
          {resource.chars > 0 ? <p className="mt-1 text-[10px] font-bold text-white/30">{resource.chars.toLocaleString()} characters read</p> : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content rendering                                                   */
/* ------------------------------------------------------------------ */

/**
 * Render model prose safely: no HTML is ever injected. Lines starting with
 * "- " / "• " / "1. " become list items, blank lines become paragraphs.
 */
export function AiProse({ text, className }: { text: string; className?: string }) {
  const blocks = String(text || "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className={cn("space-y-2 text-[13px] font-medium leading-[1.65] text-white/85", className)} data-module-ai-prose="">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const isList = lines.length > 1 && lines.every((line) => /^([-•*]|\d+[.)])\s+/.test(line));
        if (isList) {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/70" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{line.replace(/^([-•*]|\d+[.)])\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={index} className="whitespace-pre-wrap break-words">{block}</p>;
      })}
    </div>
  );
}

export function AiSectionCard({ title, hint, children, action, className }: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-white/10 bg-white/[0.03] p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">{title}</h3>
          {hint ? <p className="mt-1 text-[11px] font-medium leading-4 text-white/45">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AiPill({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "violet" | "emerald" | "amber" | "cyan"; className?: string }) {
  const tones = {
    default: "bg-white/[0.06] text-white/60 ring-white/10",
    violet: "bg-violet-500/15 text-violet-200 ring-violet-400/20",
    emerald: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20",
    amber: "bg-amber-500/15 text-amber-200 ring-amber-400/20",
    cyan: "bg-cyan-500/15 text-cyan-200 ring-cyan-400/20",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1", tones[tone], className)}>{children}</span>;
}

export function AiActionButton({ label, icon: Icon, onClick, active, disabled, busy, tone = "default", className, dataAttrs }: {
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  tone?: "default" | "primary" | "ghost";
  className?: string;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-3.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
        tone === "primary"
          ? "bg-violet-600 text-white hover:bg-violet-500"
          : active
            ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/30"
            : tone === "ghost"
              ? "text-white/60 hover:bg-white/[0.06]"
              : "bg-white/[0.05] text-white/75 ring-1 ring-white/10 hover:bg-white/[0.09]",
        className,
      )}
      {...(dataAttrs || {})}
    >
      {busy ? <LoaderCircle size={13} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Keeps a scrolling list pinned to the bottom as new content arrives. */
export function useStickToBottom<T extends HTMLElement>(dependency: unknown, enabled = true) {
  const ref = useRef<T | null>(null);
  const [pinned, setPinned] = useState(true);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    if (pinned) node.scrollTop = node.scrollHeight;
  }, [dependency, enabled, pinned]);
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return undefined;
    const onScroll = () => setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 80);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [enabled]);
  return { ref, pinned, scrollToBottom: () => { const node = ref.current; if (node) node.scrollTop = node.scrollHeight; } };
}

export function AiFooterNote({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[10px] font-medium leading-4 text-white/35">{children}</p>;
}

export { ChevronRight };
