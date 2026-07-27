import React from 'react';
import { ActiveCoinDiscount, Coupon, ProductWithRating, WebsiteSettings, User } from '../App';
import { EconomySettings, resolveCoinPrice } from '../utils/economy';
import {
  getSubscriptionBillingLabel,
  getSubscriptionBillingPrice,
  getSubscriptionTierRank,
  getUserSubscriptionTier,
  normalizeSubscriptionPageContent,
  normalizeSubscriptionPlans,
  SubscriptionBillingCycle,
  SubscriptionPlanConfig,
} from '../utils/subscriptionAccess';

const SubscriptionPage: React.FC<{
  economySettings: EconomySettings;
  activeCoinDiscount?: ActiveCoinDiscount | null;
  onConsumeCoinDiscount?: () => void;
  settings: WebsiteSettings;
  products: ProductWithRating[];
  purchasedProductIds: number[];
  onBack: () => void;
  onActivatePlan: (plan: SubscriptionPlanConfig, billingCycle: SubscriptionBillingCycle, appliedCouponCode?: string | null) => void;
  currentUser?: User | null;
  onActivatePlanWithCoins?: (plan: SubscriptionPlanConfig, billingCycle: SubscriptionBillingCycle) => void;
  coupons: Coupon[];
}> = ({
  economySettings,
  activeCoinDiscount = null,
  settings,
  products,
  purchasedProductIds,
  onBack,
  onActivatePlan,
  currentUser,
  onActivatePlanWithCoins,
  coupons,
}) => {
  const plans = normalizeSubscriptionPlans(settings.content.subscriptionPlans);
  const pageContent = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const currentTier = getUserSubscriptionTier(currentUser);
  const [billingPreview, setBillingPreview] = React.useState<'monthly' | 'yearly'>('monthly');
  const [couponInputs, setCouponInputs] = React.useState<Record<string, string>>({});
  const [appliedCouponCodes, setAppliedCouponCodes] = React.useState<Record<string, string>>({});
  const [couponErrors, setCouponErrors] = React.useState<Record<string, string>>({});

  const calculateCouponDiscount = React.useCallback((coupon: Coupon, price: number) => {
    const safePrice = Math.max(0, Number(price) || 0);
    const safeValue = Math.max(0, Number(coupon.value) || 0);
    if (coupon.type === 'fixed') return Math.min(safeValue, safePrice);
    return Math.min(safePrice, (safePrice * safeValue) / 100);
  }, []);

  const getCouponError = React.useCallback((coupon: Coupon | undefined) => {
    if (!coupon) return 'Invalid coupon code.';
    if (!coupon.isActive) return 'This coupon is not active.';

    if (coupon.expiryDate) {
      const [year, month, day] = coupon.expiryDate.split('-').map(Number);
      const expiry = new Date(year, month - 1, day);
      if (Number.isNaN(expiry.getTime())) return 'Invalid coupon date format.';
      expiry.setHours(23, 59, 59, 999);
      if (expiry < new Date()) return 'This coupon has expired.';
    }

    if (Number(coupon.usageLimit) > 0 && Number(coupon.timesUsed || 0) >= Number(coupon.usageLimit)) return 'Coupon usage limit reached.';
    return '';
  }, []);

  const handleApplyCoupon = React.useCallback((planId: string, rawCode: string) => {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCouponErrors(prev => ({ ...prev, [planId]: 'Please enter a coupon code.' }));
      return;
    }

    const coupon = coupons.find(item => item.code.trim().toUpperCase() === normalizedCode);
    const error = getCouponError(coupon);
    if (error) {
      setCouponErrors(prev => ({ ...prev, [planId]: error }));
      setAppliedCouponCodes(prev => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
      return;
    }

    setCouponInputs(prev => ({ ...prev, [planId]: normalizedCode }));
    setAppliedCouponCodes(prev => ({ ...prev, [planId]: normalizedCode }));
    setCouponErrors(prev => ({ ...prev, [planId]: '' }));
  }, [coupons, getCouponError]);

  const handleCouponInputChange = React.useCallback((planId: string, value: string) => {
    const normalizedValue = value.toUpperCase();
    setCouponInputs(prev => ({ ...prev, [planId]: normalizedValue }));
    setCouponErrors(prev => ({ ...prev, [planId]: '' }));
    setAppliedCouponCodes(prev => {
      const appliedCode = prev[planId];
      if (!appliedCode || appliedCode === normalizedValue.trim()) return prev;
      const next = { ...prev };
      delete next[planId];
      return next;
    });
  }, []);

  const handleRemoveCoupon = React.useCallback((planId: string) => {
    setAppliedCouponCodes(prev => {
      const next = { ...prev };
      delete next[planId];
      return next;
    });
    setCouponErrors(prev => ({ ...prev, [planId]: '' }));
  }, []);

  const availableCoupon = React.useMemo(() => coupons.find(coupon => !getCouponError(coupon)), [coupons, getCouponError]);

  return (
    <div
      className="subscription-page-theme-adaptive subscription-page-default-theme relative min-h-screen overflow-x-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-blue-50/60 to-cyan-50/40 pb-24 text-slate-900"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(37,99,235,0.10) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    >
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
        <button type="button" onClick={onBack} className="w-fit rounded-[18px] border border-blue-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-blue-800 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/40">
          ← Back
        </button>

        <section className="flex flex-1 flex-col items-center py-9 sm:py-12 lg:py-14">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#676767]">{pageContent.eyebrow}</p>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em] text-[#111111] sm:text-5xl">{pageContent.title}</h1>
            <p className="mx-auto mt-4 max-w-xl text-[12px] leading-5 text-[#676767]">{pageContent.subtitle}</p>
            {currentTier !== 'normal' && (
              <p className="mx-auto mt-4 w-fit border border-[#181818] bg-[#F4F35B] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                Current membership: {currentTier}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center overflow-hidden rounded-[18px] border border-blue-200 bg-white p-1 text-[11px] font-black leading-none text-slate-800 shadow-sm sm:mt-7" aria-label="Billing preview toggle">
            <button type="button" aria-pressed={billingPreview === 'monthly'} onClick={() => setBillingPreview('monthly')} className={`h-9 min-w-24 rounded-[14px] px-5 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/40 ${billingPreview === 'monthly' ? 'bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]' : 'bg-white text-slate-800 hover:bg-blue-50 hover:text-blue-700'}`}>
              {pageContent.monthlyLabel}
            </button>
            <button type="button" aria-pressed={billingPreview === 'yearly'} onClick={() => setBillingPreview('yearly')} className={`flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-[14px] px-5 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/40 ${billingPreview === 'yearly' ? 'bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]' : 'bg-white text-slate-800 hover:bg-blue-50 hover:text-blue-700'}`}>
              <span>{pageContent.yearlyLabel}</span>
              <span className="border border-slate-300 bg-white px-1 py-0.5 text-[8px] leading-none text-slate-800">{pageContent.yearlyBadge}</span>
            </button>
          </div>

          <div className="mt-8 grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 md:items-stretch">
            {plans.map(plan => {
              const isHighlighted = plan.featured === true;
              const currentPlanOrHigher = getSubscriptionTierRank(currentTier) >= getSubscriptionTierRank(plan.accessTier);
              const unlockedProducts = plan.unlockProductIds.map(id => products.find(product => product.id === id)?.title || `Product #${id}`);
              const allProductsUnlocked = plan.unlockProductIds.length > 0 && plan.unlockProductIds.every(id => purchasedProductIds.includes(id));
              const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
              const coinBalance = Number(currentUser?.coinBalance ?? currentUser?.eduCoins ?? 0);
              const canUseEduCoins = currentTier !== 'normal';
              const canPayWithCoins = canUseEduCoins && coinPrice > 0 && coinBalance >= coinPrice;
              const missingCoins = Math.max(0, coinPrice - coinBalance);
              const planId = String(plan.id);
              const billingCycle = billingPreview;
              const planPrice = getSubscriptionBillingPrice(plan, billingCycle);
              const billingLabel = getSubscriptionBillingLabel(billingCycle);
              const alternateBillingCycle: SubscriptionBillingCycle = billingCycle === 'monthly' ? 'yearly' : 'monthly';
              const alternatePrice = getSubscriptionBillingPrice(plan, alternateBillingCycle);
              const alternateLabel = getSubscriptionBillingLabel(alternateBillingCycle);
              const activeDiscount = activeCoinDiscount?.subscriptionId === planId ? activeCoinDiscount : null;
              const appliedCouponCode = appliedCouponCodes[planId];
              const appliedCoupon = appliedCouponCode ? coupons.find(coupon => coupon.code.trim().toUpperCase() === appliedCouponCode.toUpperCase()) : undefined;
              const validAppliedCoupon = appliedCoupon && !getCouponError(appliedCoupon) ? appliedCoupon : null;
              const couponDiscount = validAppliedCoupon ? calculateCouponDiscount(validAppliedCoupon, planPrice) : 0;
              const eduCoinDiscount = activeDiscount ? Math.min(Math.max(0, planPrice - couponDiscount), activeDiscount.amount) : 0;
              const finalPlanPrice = Math.max(0, planPrice - couponDiscount - eduCoinDiscount);
              const disabled = currentPlanOrHigher;

              return (
                <article key={plan.id} className={`subscription-plan-card group relative flex min-h-[660px] flex-col overflow-visible rounded-[22px] border bg-white/95 px-5 pb-5 pt-7 text-left shadow-[0_22px_64px_rgba(37,99,235,0.10)] ring-1 ring-white/80 transition hover:-translate-y-1 hover:shadow-[0_28px_72px_rgba(37,99,235,0.14)] sm:px-6 ${isHighlighted ? 'border-blue-300 ring-4 ring-blue-500/10 md:-translate-y-2 md:hover:-translate-y-3' : 'border-blue-100'}`}>
                  {isHighlighted && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-blue-300 bg-blue-600 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]">{plan.badge || 'Most Popular'}</span>}
                  {disabled && (
                    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] sm:h-28 sm:w-28" aria-label="Subscription purchased and active">
                      <div className="absolute inset-2 rounded-full border-[3px] border-double border-red-900 bg-white/95 shadow-[0_12px_30px_rgba(185,28,28,0.22)]" />
                      <div className="absolute inset-4 rounded-full border-2 border-dashed border-red-700" />
                      <div className="absolute inset-x-0 top-[43%] -translate-y-1/2 bg-gradient-to-r from-red-950 via-red-700 to-red-950 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-md sm:text-xs">Owned</div>
                      <span className="absolute inset-x-0 top-4 text-center text-[8px] font-black uppercase tracking-[0.18em] text-red-900 sm:top-5 sm:text-[9px]">Purchased</span>
                      <span className="absolute inset-x-0 bottom-4 text-center text-[7px] font-black uppercase tracking-[0.14em] text-red-900 sm:bottom-5 sm:text-[8px]">Active plan</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-start gap-2">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em]">{plan.accessTier}</span>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.04em]">{plan.earningMultiplier}× earning</span>
                    {availableCoupon && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.04em]">Coupon available</span>}
                  </div>

                  <div className="mt-7 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#676767]">{plan.audienceLabel}</p>
                    <h2 className="mt-2 text-xl font-black tracking-[-0.02em]">{plan.name}</h2>
                    <div className="mt-4 flex items-end justify-center gap-2">
                      {(couponDiscount + eduCoinDiscount) > 0 && <span className="mb-1 text-sm font-bold text-[#676767] line-through">₹{planPrice.toFixed(0)}</span>}
                      <span className="text-4xl font-black leading-none tracking-[-0.05em] sm:text-5xl">₹{finalPlanPrice.toFixed(0)}</span>
                    </div>
                    <p className="mt-2 text-[11px] font-bold lowercase tracking-[0.03em] text-[#676767]">per {billingLabel} secure access</p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.10em] text-[#676767]">Switch to {alternateBillingCycle}: ₹{alternatePrice.toFixed(0)} / {alternateLabel}</p>
                  </div>

                  <p className="mx-auto mt-5 max-w-sm text-center text-[12px] font-bold leading-5 text-[#676767]">{plan.description}</p>

                  <div className="mt-6 border-t border-[#181818] pt-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#676767]">Includes</p>
                    <ul className="mt-3 space-y-2.5">
                      {plan.benefits.map(benefit => <li key={benefit} className="flex items-start gap-2 text-[12px] font-bold leading-5"><span className="mt-0.5 text-[#1769FF]">✓</span><span>{benefit}</span></li>)}
                    </ul>
                  </div>

                  {unlockedProducts.length > 0 && (
                    <div className="mt-5 rounded-[18px] border border-blue-100 bg-blue-50/60 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#676767]">Selected content access</p>
                      <p className="mt-2 text-[11px] font-bold leading-5">{unlockedProducts.join(' • ')}</p>
                    </div>
                  )}

                  {(activeDiscount || validAppliedCoupon) && (
                    <div className="mt-5 rounded-[18px] border border-blue-100 bg-blue-50/60 p-4 text-[11px] font-bold">
                      <div className="flex justify-between gap-3"><span>Subtotal</span><span>₹{planPrice}</span></div>
                      {validAppliedCoupon && <div className="mt-1 flex justify-between gap-3"><span>Coupon ({validAppliedCoupon.code})</span><span>-₹{couponDiscount.toFixed(2)}</span></div>}
                      {activeDiscount && <div className="mt-1 flex justify-between gap-3"><span>EduCoin Discount</span><span>-₹{eduCoinDiscount}</span></div>}
                      <div className="mt-2 flex justify-between gap-3 border-t border-[#181818] pt-2 font-black"><span>Final Price</span><span>₹{finalPlanPrice.toFixed(2)}</span></div>
                    </div>
                  )}

                  <div className="mt-auto space-y-2.5 pt-6">
                    <button type="button" disabled={disabled} onClick={() => onActivatePlan(plan, billingCycle, validAppliedCoupon?.code || null)} className={`subscription-primary-action block min-h-12 w-full rounded-[18px] border px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.08em] outline-none transition active:scale-[0.99] ${disabled ? 'cursor-not-allowed border-slate-300 bg-gradient-to-r from-slate-100 to-white text-slate-500 shadow-sm' : 'eduvora-primary-action border-blue-500 text-white shadow-[0_18px_42px_rgba(23,105,255,0.28)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,105,255,0.34)]'}`}>
                      {disabled ? `${currentTier === 'elite' ? 'Elite' : 'Pro'} subscription active` : `${plan.ctaLabel} · ₹${finalPlanPrice.toFixed(0)} / ${billingLabel}`}
                    </button>

                    {coinPrice > 0 && (
                      <button type="button" disabled={disabled || !canPayWithCoins} onClick={() => onActivatePlanWithCoins?.(plan, billingCycle)} className="subscription-educoin-action block min-h-11 w-full rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.06em] text-amber-800 outline-none transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500">
                        {disabled ? 'Membership active' : !canUseEduCoins ? 'EduCoin use unlocks with Pro' : canPayWithCoins ? `Pay ${coinPrice} EduCoins` : `Need ${missingCoins} more coins`}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 rounded-[18px] border border-blue-100 bg-slate-50/90 p-4">
                    <label htmlFor={`coupon-${planId}`} className="text-[10px] font-black uppercase tracking-[0.12em] text-[#676767]">Coupon code</label>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input id={`coupon-${planId}`} type="text" value={couponInputs[planId] || ''} onChange={event => handleCouponInputChange(planId, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !validAppliedCoupon) handleApplyCoupon(planId, couponInputs[planId] || ''); }} placeholder="Code" disabled={disabled} className="h-10 w-full min-w-0 border border-[#181818] bg-white px-3 text-[12px] font-black uppercase tracking-[0.08em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[#676767] focus:bg-[#FFFBC4] disabled:bg-[#F2F2EE]" />
                      <button type="button" disabled={disabled} onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')} className="h-10 border border-[#181818] bg-white px-3 text-[10px] font-black uppercase tracking-[0.08em] hover:bg-[#F4F35B] disabled:bg-[#F2F2EE]">
                        {validAppliedCoupon ? 'Remove' : 'Apply'}
                      </button>
                    </div>
                    {couponErrors[planId] && <p className="mt-2 text-[10px] font-bold text-red-700">{couponErrors[planId]}</p>}
                    {validAppliedCoupon && <p className="mt-2 text-[10px] font-bold text-emerald-700">{validAppliedCoupon.code} applied successfully.</p>}
                  </div>

                  {allProductsUnlocked && !currentPlanOrHigher && <p className="mt-3 text-center text-[10px] font-bold text-[#676767]">Your selected products are already owned; membership benefits will still be activated.</p>}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default SubscriptionPage;
