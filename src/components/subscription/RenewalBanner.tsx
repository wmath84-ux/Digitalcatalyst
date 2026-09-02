// src/components/subscription/RenewalBanner.tsx
//
// Sticky in-app banner announcing an upcoming / overdue subscription
// renewal. Rendered near the top of the app shell so a buyer sees the
// notice without opening the notifications list.
//
// All copy and tone come from `utils/renewalPresentation.js`, so this
// component never invents its own wording — the banner, the
// notification row and the profile card stay perfectly in sync.

import { AlertTriangle, CalendarClock, Clock, Lock, X } from "lucide-react";
import type { RenewalView } from "../../../utils/renewalPresentation";

const ICONS = {
  "calendar-clock": CalendarClock,
  clock: Clock,
  "alert-triangle": AlertTriangle,
  lock: Lock,
} as const;

const TONE_STYLES = {
  info: {
    shell: "border-sky-400/30 bg-sky-500/15",
    badge: "bg-sky-500/20 text-sky-200",
    icon: "bg-sky-500/20 text-sky-300",
    title: "text-sky-950",
    body: "text-sky-200",
    cta: "bg-sky-600 text-white",
    dismiss: "text-sky-500 hover:bg-sky-500/20",
  },
  warning: {
    shell: "border-amber-400/30 bg-amber-500/15",
    badge: "bg-amber-500/20 text-amber-200",
    icon: "bg-amber-500/20 text-amber-300",
    title: "text-amber-950",
    body: "text-amber-200",
    cta: "bg-amber-600 text-white",
    dismiss: "text-amber-300 hover:bg-amber-500/20",
  },
  critical: {
    shell: "border-rose-400/30 bg-rose-500/15",
    badge: "bg-rose-500/20 text-rose-200",
    icon: "bg-rose-500/20 text-rose-300",
    title: "text-rose-950",
    body: "text-rose-200",
    cta: "bg-rose-600 text-white",
    dismiss: "text-rose-500 hover:bg-rose-500/20",
  },
} as const;

interface Props {
  view: RenewalView | null;
  onRenew: () => void;
  onDismiss?: (stage: string) => void;
  className?: string;
}

export default function RenewalBanner({ view, onRenew, onDismiss, className = "" }: Props) {
  if (!view) return null;
  const tone = TONE_STYLES[view.tone] || TONE_STYLES.info;
  const Icon = ICONS[view.icon as keyof typeof ICONS] || CalendarClock;

  return (
    <div
      data-renewal-banner
      data-stage={view.stage}
      data-tone={view.tone}
      role={view.urgency >= 3 ? "alert" : "status"}
      className={`mx-4 mt-3 rounded-2xl border p-3.5  ${tone.shell} ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone.badge}`}>
              {view.label}
            </span>
            <span data-renewal-remaining className="text-[11px] font-bold text-white/55">
              {view.remainingLabel}
            </span>
          </div>

          <p data-renewal-headline className={`mt-1.5 text-sm font-black leading-5 ${tone.title}`}>
            {view.headline}
          </p>
          <p data-renewal-body className={`mt-1 text-xs leading-5 ${tone.body}`}>
            {view.body}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {view.canRenew ? (
              <button
                type="button"
                onClick={onRenew}
                data-renewal-cta
                className={`rounded-xl px-3.5 py-2 text-xs font-black  transition active:scale-[0.98] ${tone.cta}`}
              >
                {view.cta}
              </button>
            ) : null}
            {view.dismissible && onDismiss ? (
              <button
                type="button"
                onClick={() => onDismiss(view.stage)}
                className="rounded-xl px-3 py-2 text-xs font-bold text-white/55 transition hover:bg-white/[0.08]"
              >
                Later
              </button>
            ) : null}
          </div>
        </div>

        {view.dismissible && onDismiss ? (
          <button
            type="button"
            onClick={() => onDismiss(view.stage)}
            aria-label="Dismiss renewal notice"
            data-renewal-dismiss
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${tone.dismiss}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
