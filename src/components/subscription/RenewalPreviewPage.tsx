// src/components/subscription/RenewalPreviewPage.tsx
//
// Developer sandbox for the subscription expiry / renewal experience.
//
// Route: #/dev/subscription-preview
//
// Nothing here touches Firestore. A slider synthesises a subscription
// document at an arbitrary distance from its expiry date, runs it
// through the SAME pure pipeline the live app uses
// (`getRenewalReminder` → `buildRenewalView`), and renders every
// surface side by side:
//
//   - the sticky in-app banner
//   - the notification-list row
//   - the full renewal status card
//   - the raw reminder payload the push scheduler would send
//
// Because it shares the real helpers, whatever appears here is exactly
// what a buyer sees on that day — this is a preview, not a mock-up.

import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "../ui/glass-select";
import { GlassSlider } from "../ui/glass-slider";
import { GlassCheckbox } from "../ui/glass-checkbox";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Bell,
  CalendarClock,
  Clock,
  Lock,
  RefreshCw,
} from "lucide-react";
import { getRenewalNotification, getRenewalReminder } from "../../../utils/subscriptionRenewal";
import { buildRenewalView, shouldShowRenewalBanner } from "../../../utils/renewalPresentation";
import RenewalBanner from "./RenewalBanner";
import RenewalStatusCard from "./RenewalStatusCard";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One-tap jumps to each meaningful stage boundary. */
const PRESETS = [
  { label: "30 days", days: 30 },
  { label: "7 days", days: 7 },
  { label: "3 days", days: 3 },
  { label: "Tomorrow", days: 1 },
  { label: "Due today", days: 0 },
  { label: "Expired · day 1", days: -0.5 },
  { label: "Expired · day 5", days: -5 },
  { label: "Expired · day 10", days: -10 },
  { label: "Expired · day 11", days: -11 },
];

const ICONS = {
  "calendar-clock": CalendarClock,
  clock: Clock,
  "alert-triangle": AlertTriangle,
  lock: Lock,
} as const;

export default function RenewalPreviewPage({ onBack }: { onBack?: () => void }) {
  const [offsetDays, setOffsetDays] = useState<number>(3);
  const [planName, setPlanName] = useState<string>("Premium");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [optOut, setOptOut] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  // A synthetic subscription document, shaped exactly like
  // `users/{uid}/subscription/current`.
  const now = Date.now();
  const subscription = useMemo(
    () => ({
      status: offsetDays < 0 ? "expired" : "active",
      planId: planName.toLowerCase(),
      planName,
      cycle,
      expiresAt: now + offsetDays * DAY_MS,
      renewalReminderOptOut: optOut,
    }),
    [offsetDays, planName, cycle, optOut, now],
  );

  const reminder = useMemo(() => getRenewalReminder(subscription, now), [subscription, now]);
  const view = useMemo(
    () => buildRenewalView(reminder, { now, planName }),
    [reminder, now, planName],
  );
  const bannerVisible = shouldShowRenewalBanner(view, dismissed);
  const NotifIcon = view ? ICONS[view.icon as keyof typeof ICONS] || Bell : Bell;

  return (
    <div className="min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:rounded-[2rem] md:max-w-none md:rounded-none">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/75 active:scale-90"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-base font-black text-white">Renewal preview</h1>
            <p className="text-[11px] font-medium text-white/55">Sandbox · no data is written</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-10">
          {/* ---------------- Controls ---------------- */}
          <section className="border-b border-white/10 px-4 py-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-white/55">
                Days to expiry
              </label>
              <span
                data-preview-offset
                className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white"
              >
                {offsetDays > 0 ? `+${offsetDays}d` : offsetDays === 0 ? "today" : `${offsetDays}d`}
              </span>
            </div>

            <GlassSlider
              min={-12}
              max={40}
              step={1}
              value={offsetDays}
              onValueChange={setOffsetDays}
              ariaLabel="Days to expiry"
              data-preview-slider
              className="mt-3 w-full"
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setOffsetDays(preset.days)}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                    offsetDays === preset.days
                      ? "bg-violet-600 text-white"
                      : "bg-white/[0.06] text-white/75 ring-1 ring-white/10"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-white/55">Plan</span>
                <GlassSelect value={planName} onValueChange={setPlanName}>
                  <GlassSelectTrigger aria-label="Plan" className="dc-glass-select h-9 w-full text-xs font-bold" />
                  <GlassSelectContent tint={0.9} className="dc-glass-select-pop" aria-label="Plan options">
                    {["Basic", "Premium", "Pro"].map((name) => (
                      <GlassSelectItem key={name} value={name}>{name}</GlassSelectItem>
                    ))}
                  </GlassSelectContent>
                </GlassSelect>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-white/55">Cycle</span>
                <GlassSelect value={cycle} onValueChange={(v) => setCycle(v as "monthly" | "yearly")}>
                  <GlassSelectTrigger aria-label="Cycle" className="dc-glass-select h-9 w-full text-xs font-bold" />
                  <GlassSelectContent tint={0.9} className="dc-glass-select-pop" aria-label="Cycle options">
                    <GlassSelectItem value="monthly">Monthly</GlassSelectItem>
                    <GlassSelectItem value="yearly">Yearly</GlassSelectItem>
                  </GlassSelectContent>
                </GlassSelect>
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] font-bold text-white/75">
                <GlassCheckbox checked={optOut} onCheckedChange={setOptOut} ariaLabel="Reminder opt-out" />
                Reminder opt-out
              </label>
              {dismissed.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setDismissed([])}
                  className="flex items-center gap-1 text-[11px] font-bold text-violet-300"
                >
                  <RefreshCw className="h-3 w-3" /> Reset dismissals
                </button>
              ) : null}
            </div>
          </section>

          {/* ---------------- No-reminder state ---------------- */}
          {!view ? (
            <div
              data-preview-empty
              className="mx-4 mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center"
            >
              <p className="text-sm font-black text-white/85">No reminder at this point</p>
              <p className="mt-1 text-xs leading-5 text-white/55">
                {optOut
                  ? "Reminders are switched off for this subscriber."
                  : "Renewal notices begin 7 days before expiry, then continue every morning for 10 days after it ends."}
              </p>
            </div>
          ) : (
            <>
              {/* ---------------- Surface 1: banner ---------------- */}
              <PreviewSection
                title="In-app banner"
                caption="Shown at the top of the app shell while the notice is active."
              >
                {bannerVisible ? (
                  <RenewalBanner
                    view={view}
                    onRenew={() => undefined}
                    onDismiss={(stage) => setDismissed((prev) => [...prev, stage])}
                    className="mx-0"
                  />
                ) : (
                  <p className="rounded-2xl bg-white/[0.06] px-3 py-4 text-center text-xs font-semibold text-white/55">
                    Dismissed for this stage. The next stage will show again.
                  </p>
                )}
              </PreviewSection>

              {/* ---------------- Surface 2: notification row ---------------- */}
              <PreviewSection
                title="Notification list row"
                caption="How it appears inside #/notifications and as a push."
              >
                <div
                  data-preview-notification
                  className="flex w-full items-start gap-3 rounded-2xl bg-indigo-500/15 px-3 py-3 text-left"
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                    <NotifIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">{reminder?.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-white/55">{view.body}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-white/55">just now</span>
                  </span>
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                </div>
              </PreviewSection>

              {/* ---------------- Surface 3: status card ---------------- */}
              <PreviewSection
                title="Renewal status card"
                caption="Shown on the profile page and the subscription page."
              >
                <RenewalStatusCard
                  view={view}
                  cycle={cycle}
                  reminderOptOut={optOut}
                  onRenew={() => undefined}
                  onToggleReminders={(next) => setOptOut(next)}
                />
              </PreviewSection>

              {/* ---------------- Surface 4: raw payload ---------------- */}
              <PreviewSection
                title="Scheduler payload"
                caption="Exactly what the daily cron writes and pushes."
              >
                <pre
                  data-preview-payload
                  className="overflow-x-auto rounded-2xl bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300"
                >
{JSON.stringify(
  {
    stage: view.stage,
    urgency: view.urgency,
    tone: view.tone,
    title: reminder?.title,
    body: view.body,
    expired: view.expired,
    canRenew: view.canRenew,
    day: view.day,
    daysRemaining: view.daysRemaining,
    // True while the 10-morning notification window is still open. The renew
    // button itself stays active for as long as the subscription is expired.
    sendsNotificationToday: Boolean(getRenewalNotification(subscription, now)),
    target: view.target,
  },
  null,
  2,
)}
                </pre>
              </PreviewSection>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PreviewSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 pt-5">
      <div className="mb-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-white/55">{title}</h2>
        <p className="mt-0.5 text-[11px] text-white/55">{caption}</p>
      </div>
      {children}
    </section>
  );
}
