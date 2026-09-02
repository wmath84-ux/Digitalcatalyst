// src/components/subscription/SubscriberActiveBadge.tsx
//
// Top-of-page "You're already a subscriber" badge. Rendered at the top
// of the subscription page for existing members so they immediately
// understand their status and the page does not look like a cold
// sales page.

import { memo } from "react";

type Props = {
  planLabel?: string | null;
  expiresAtLabel?: string | null;
  className?: string;
};

function SubscriberActiveBadgeImpl({ planLabel, expiresAtLabel, className }: Props) {
  return (
    <div
      data-subscriber-active-badge
      data-subscriber-active-badge="true"
      role="status"
      className={
        "relative w-full overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-6 py-5  " +
        (className || "")
      }
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" aria-hidden />
      <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
              Member exclusive
            </span>
            <span className="text-base font-semibold text-white">
              {planLabel
                ? `You are a member — ${planLabel}`
                : "You are a member"}
            </span>
          </div>
        </div>
        {expiresAtLabel ? (
          <div className="flex flex-col items-end text-right">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Renews
            </span>
            <span className="text-sm font-semibold text-white">{expiresAtLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const SubscriberActiveBadge = memo(SubscriberActiveBadgeImpl);
export default SubscriberActiveBadge;
