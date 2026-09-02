// src/components/subscription/HiddenFeatureHint.tsx
//
// "Unlock" card shown in place of the legacy PremiumGate when the
// admin has set a feature to "Hide until purchased" mode. Renders
// inline (so the page chrome stays useful) and points the user at
// the subscription page.

import { memo, useCallback } from "react";

type Props = {
  featureName: string;
  onViewSubscription: () => void;
  className?: string;
};

function HiddenFeatureHintImpl({ featureName, onViewSubscription, className }: Props) {
  const handleClick = useCallback(() => {
    onViewSubscription();
  }, [onViewSubscription]);
  return (
    <div
      data-hidden-feature-hint
      data-hidden-feature-hint="true"
      role="status"
      className={
        "mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border border-indigo-400/30 bg-white/[0.08] px-6 py-6 text-center  " +
        (className || "")
      }
    >
      <span
        aria-hidden
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 118 0m-9 4l1.5 6A2 2 0 0010.5 20h7a2 2 0 002-1.7L21 12H5z" />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200">
          Premium feature
        </span>
        <span className="text-base font-semibold text-white">
          {featureName} is part of our subscription
        </span>
        <span className="text-sm text-white/75">
          Subscribe to unlock {featureName} and the rest of the premium features.
        </span>
      </div>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        View subscription plans
      </button>
    </div>
  );
}

export const HiddenFeatureHint = memo(HiddenFeatureHintImpl);
export default HiddenFeatureHint;
