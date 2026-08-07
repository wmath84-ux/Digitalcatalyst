import React, { useEffect } from 'react';
import { SubscriptionPlanConfig } from '../utils/subscriptionAccess';

export interface SubscriptionActivatedInfo {
  mode: 'purchase';
  plan: SubscriptionPlanConfig;
  billingCycle?: string;
  expiresAt?: string;
  message?: string;
}

interface SubscriptionActivatedModalProps {
  info: SubscriptionActivatedInfo | null;
  onClose: () => void;
  onGoToPurchases: () => void;
  onExploreProducts: () => void;
}

const SubscriptionActivatedModal: React.FC<SubscriptionActivatedModalProps> = ({ info, onClose, onGoToPurchases, onExploreProducts }) => {
  useEffect(() => {
    if (!info) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [info]);

  if (!info) return null;

  const badgeText = info.billingCycle || 'Active plan';
  const headline = 'Eduvora Plus+ is active!';
  const subhead = info.message || 'Aapka subscription activate ho gaya. Sab premium features ab unlocked hain — padhte raho, aage badho.';

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label={headline}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.45)] animate-scale-in-up">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(23,105,255,0.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(123,97,255,0.18),transparent_30%)]" />

        <button onClick={onClose} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-lg font-black text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900" aria-label="Close">
          ×
        </button>

        <div className="relative px-5 pb-6 pt-9 text-center sm:px-8 sm:pb-8 sm:pt-12">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-300/40" style={{ animationDuration: '1.8s' }} />
            <div className="relative flex h-full w-full items-center justify-center rounded-full border-4 border-emerald-100 bg-gradient-to-br from-emerald-400 to-teal-500 shadow-[0_18px_44px_rgba(16,185,129,0.4)]">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-white sm:h-12 sm:w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-1.5 text-lg" aria-hidden="true">
            <span className="animate-bounce">🎉</span>
            <span className="animate-pulse">✨</span>
            <span className="animate-bounce [animation-delay:120ms]">🎊</span>
            <span className="animate-pulse [animation-delay:240ms]">✨</span>
          </div>

          <span className="mt-4 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">
            {badgeText}
          </span>

          <h2 className="mt-3 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 bg-clip-text text-3xl font-black tracking-[-0.02em] text-transparent sm:text-4xl">
            {headline}
          </h2>

          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-700 sm:text-[15px] sm:leading-7">
            {subhead}
          </p>

          {info.plan.benefits?.length > 0 && (
            <div className="mt-5 rounded-[18px] border border-indigo-100 bg-indigo-50/50 p-4 text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Ab unlocked hai</p>
              <ul className="mt-2.5 space-y-2">
                {info.plan.benefits.slice(0, 5).map(benefit => (
                  <li key={benefit} className="flex items-start gap-2 text-[12px] font-bold leading-5 text-slate-700">
                    <span className="mt-0.5 shrink-0 text-emerald-600">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <button onClick={onGoToPurchases} className="subscription-primary-action eduvora-primary-action rounded-[16px] bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 text-sm font-black uppercase tracking-[0.06em] text-white shadow-[0_16px_38px_rgba(79,70,229,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(79,70,229,0.4)]">
              Go to My Purchases
            </button>
            <button onClick={onExploreProducts} className="rounded-[16px] border border-indigo-200 bg-white px-5 py-3.5 text-sm font-black uppercase tracking-[0.06em] text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50">
              Explore Products
            </button>
          </div>

          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">✓ Verified success</p>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionActivatedModal;
