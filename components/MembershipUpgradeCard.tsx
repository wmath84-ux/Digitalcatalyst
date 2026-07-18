import React from 'react';
import { MembershipMessage } from '../utils/subscriptionAccess';

interface MembershipUpgradeCardProps {
  message: MembershipMessage;
  onUpgrade: () => void;
  onBack?: () => void;
  compact?: boolean;
  className?: string;
}

const MembershipUpgradeCard: React.FC<MembershipUpgradeCardProps> = ({
  message,
  onUpgrade,
  onBack,
  compact = false,
  className = '',
}) => {
  const paragraphs = String(message.description || '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);

  return (
    <section data-clean-neutral-component="membership-upgrade" className={`${compact ? 'rounded-[1.5rem] p-5 sm:p-6' : 'mx-auto w-full max-w-3xl rounded-[2rem] p-6 sm:p-10'} border border-[#D9E7F8] bg-white/95 text-[#081A45] shadow-[0_28px_80px_rgba(23,105,255,0.16)] backdrop-blur-2xl ${className}`}>
      <div className="flex items-start gap-4">
        <span data-clean-neutral-icon="membership-upgrade" className={`${compact ? 'h-12 w-12 text-xl' : 'h-16 w-16 text-3xl'} flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1769FF] to-[#7B61FF] text-white shadow-[0_16px_35px_rgba(23,105,255,0.26)]`} aria-hidden="true">✦</span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1769FF]">{message.eyebrow}</p>
          <h1 className={`${compact ? 'mt-2 text-xl sm:text-2xl' : 'mt-3 text-2xl sm:text-4xl'} font-black leading-tight tracking-[-0.03em]`}>{message.title}</h1>
        </div>
      </div>

      <div className={`${compact ? 'mt-5 space-y-3 text-sm' : 'mt-7 space-y-4 text-sm sm:text-base'} font-semibold leading-7 text-[#536178]`}>
        {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)}
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onUpgrade} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-5 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(23,105,255,0.24)] transition hover:-translate-y-0.5 active:translate-y-0">
          {message.ctaLabel}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white px-5 py-3 text-sm font-black text-[#081A45] transition hover:bg-[#EEF6FF]">
            Go Back
          </button>
        )}
      </div>
    </section>
  );
};

export default MembershipUpgradeCard;
