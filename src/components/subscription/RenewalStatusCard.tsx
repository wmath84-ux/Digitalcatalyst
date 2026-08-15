// src/components/subscription/RenewalStatusCard.tsx
//
// Full renewal status card — a richer surface than the banner, used on
// the profile page and in the sandbox preview. Shows the plan, the
// exact expiry date, a progress bar for the remaining window, and the
// renewal action plus the reminder opt-out toggle.

import { AlertTriangle, BellOff, BellRing, CalendarClock, Clock, Lock, ShieldCheck } from "lucide-react";
import type { RenewalView } from "../../../utils/renewalPresentation";

const ICONS = {
  "calendar-clock": CalendarClock,
  clock: Clock,
  "alert-triangle": AlertTriangle,
  lock: Lock,
} as const;

const TONE_STYLES = {
  info: { shell: "border-sky-200 bg-white", accent: "text-sky-700", bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700", cta: "bg-sky-600" },
  warning: { shell: "border-amber-200 bg-amber-50/40", accent: "text-amber-700", bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800", cta: "bg-amber-600" },
  critical: { shell: "border-rose-200 bg-rose-50/50", accent: "text-rose-700", bar: "bg-rose-500", chip: "bg-rose-100 text-rose-700", cta: "bg-rose-600" },
} as const;

/** Full billing window used to scale the progress bar. */
const WINDOW_DAYS = { monthly: 30, yearly: 365 } as const;

interface Props {
  view: RenewalView | null;
  cycle?: "monthly" | "yearly";
  reminderOptOut?: boolean;
  onRenew: () => void;
  onToggleReminders?: (next: boolean) => void;
}

export default function RenewalStatusCard({
  view,
  cycle = "monthly",
  reminderOptOut = false,
  onRenew,
  onToggleReminders,
}: Props) {
  if (!view) return null;
  const tone = TONE_STYLES[view.tone] || TONE_STYLES.info;
  const Icon = ICONS[view.icon as keyof typeof ICONS] || CalendarClock;

  const windowDays = WINDOW_DAYS[cycle] || 30;
  const remaining = Math.max(0, view.daysRemaining);
  const percentLeft = Math.max(0, Math.min(100, Math.round((remaining / windowDays) * 100)));

  return (
    <section
      data-renewal-card
      data-stage={view.stage}
      data-tone={view.tone}
      className={`rounded-3xl border p-4 shadow-sm ${tone.shell}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.chip}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subscription status</p>
            <h3 data-renewal-card-headline className="mt-0.5 text-base font-black leading-5 text-slate-900">
              {view.headline}
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-500">{view.planName}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${tone.chip}`}>
          {view.remainingLabel}
        </span>
      </header>

      {/* Remaining-window bar. Hidden once expired — nothing left to show. */}
      {!view.expired ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
            <div
              data-renewal-progress
              className={`h-full rounded-full transition-all ${tone.bar}`}
              style={{ width: `${percentLeft}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>{cycle === "yearly" ? "Yearly" : "Monthly"} cycle</span>
            <span data-renewal-expiry>Ends {view.expiryLabel}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold text-rose-800 ring-1 ring-rose-100">
          Access ended {view.expiryLabel}. Your saved data is retained — renewing restores everything instantly.
        </p>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-600">{view.body}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onRenew}
          data-renewal-card-cta
          className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] ${tone.cta}`}
        >
          {view.cta}
        </button>
        {onToggleReminders ? (
          <button
            type="button"
            onClick={() => onToggleReminders(!reminderOptOut)}
            data-renewal-reminder-toggle
            className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition active:scale-[0.98]"
          >
            {reminderOptOut ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
            {reminderOptOut ? "Reminders off" : "Reminders on"}
          </button>
        ) : null}
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Manual renewal only — no automatic charge without your confirmation.
      </p>
    </section>
  );
}
