// src/components/subscription/SubscriberActiveBadge.tsx
//
// Top-of-page "You're already a subscriber" badge. Rendered at the top
// of the subscription page for existing members so they immediately
// understand their status and the page does not look like a cold
// sales page.

import { memo } from "react";
import { GlassSurface } from "../ui/glass";

type Props = {
  planLabel?: string | null;
  expiresAtLabel?: string | null;
  className?: string;
};

function SubscriberActiveBadgeImpl({ planLabel, expiresAtLabel, className }: Props) {
  return (
    <GlassSurface
      radius={24}
      data-subscriber-active-badge="true"
      role="status"
      className={"w-full text-white ring-1 ring-emerald-400/30 " + (className || "")}
      contentClassName="px-6 py-5"
    >
      <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"
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
    </GlassSurface>
  );
}

export const SubscriberActiveBadge = memo(SubscriberActiveBadgeImpl);
export default SubscriberActiveBadge;
