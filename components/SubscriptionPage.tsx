import React from 'react';
import { ActiveCoinDiscount, Coupon, ProductWithRating, WebsiteSettings, User } from '../App';
import { EconomySettings, resolveCoinPrice } from '../utils/economy';
import {
  canStartFreeTrial,
  getSubscriptionBillingCycleName,
  getSubscriptionBillingLabel,
  getSubscriptionBillingPrice,
  getSubscriptionTierRank,
  getTrialDaysLeft,
  getUserSubscriptionTier,
  isTrialActive,
  normalizeSubscriptionPageContent,
  normalizeSubscriptionPlans,
  SubscriptionBillingCycle,
  SUBSCRIPTION_BILLING_CYCLES,
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
  onStartFreeTrial?: () => void;
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
  onStartFreeTrial,
  coupons,
}) => {
  const plans = normalizeSubscriptionPlans(settings.content.subscriptionPlans);
  const pageContent = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const currentTier = getUserSubscriptionTier(currentUser);
  const [billingCycle, setBillingCycle] = React.useState<SubscriptionBillingCycle>('monthly');
  const [couponInputs, setCouponInputs] = React.useState<Record<string, string>>({});
  const [appliedCouponCodes, setAppliedCouponCodes] = React.useState<Record<string, string>>({});
  const [couponErrors, setCouponErrors] = React.useState<Record<string, string>>({});

  const freeTrialDays = pageContent.freeTrialDays;
  const trialEnabled = pageContent.freeTrialEnabled !== false;
  const trialAllowed = trialEnabled && canStartFreeTrial(currentUser);
  const trialActive = isTrialActive(currentUser);
  const trialDaysLeft = getTrialDaysLeft(currentUser);
  const membershipActive = currentTier !== 'normal';
  const [checkoutMode, setCheckoutMode] = React.useState<'trial' | 'buy'>(trialAllowed && !membershipActive ? 'trial' : 'buy');
  const inTrialMode = checkoutMode === 'trial' && trialAllowed && !membershipActive;

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

  const plan = plans[0];
  const planId = String(plan.id);
  const isOwned = getSubscriptionTierRank(currentTier) >= getSubscriptionTierRank(plan.accessTier);
  const unlockedProducts = plan.unlockProductIds.map(id => products.find(product => product.id === id)?.title || `Product #${id}`);
  const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
  const coinBalance = Number(currentUser?.coinBalance ?? currentUser?.eduCoins ?? 0);
  const canUseEduCoins = currentTier !== 'normal';
  const canPayWithCoins = canUseEduCoins && coinPrice > 0 && coinBalance >= coinPrice;
  const missingCoins = Math.max(0, coinPrice - coinBalance);

  const planPrice = getSubscriptionBillingPrice(plan, billingCycle);
  const billingLabel = getSubscriptionBillingLabel(billingCycle);
  const monthlyPrice = getSubscriptionBillingPrice(plan, 'monthly');
  const savingsPercent = monthlyPrice > 0 ? Math.round((1 - planPrice / (monthlyPrice * (billingCycle === 'once' ? 12 : getPeriodCount(billingCycle)))) * 100) : 0;
  const activeDiscount = activeCoinDiscount?.subscriptionId === planId ? activeCoinDiscount : null;
  const appliedCouponCode = appliedCouponCodes[planId];
  const appliedCoupon = appliedCouponCode ? coupons.find(coupon => coupon.code.trim().toUpperCase() === appliedCouponCode.toUpperCase()) : undefined;
  const validAppliedCoupon = appliedCoupon && !getCouponError(appliedCoupon) ? appliedCoupon : null;
  const couponDiscount = validAppliedCoupon ? calculateCouponDiscount(validAppliedCoupon, planPrice) : 0;
  const eduCoinDiscount = activeDiscount ? Math.min(Math.max(0, planPrice - couponDiscount), activeDiscount.amount) : 0;
  const finalPlanPrice = Math.max(0, planPrice - couponDiscount - eduCoinDiscount);

  const cycleOptions: { value: SubscriptionBillingCycle; label: string; sub?: string }[] = [
    { value: 'once', label: 'One-time', sub: 'Lifetime' },
    { value: 'weekly', label: 'Weekly', sub: '₹' + getSubscriptionBillingPrice(plan, 'weekly') },
    { value: 'monthly', label: 'Monthly', sub: '₹' + getSubscriptionBillingPrice(plan, 'monthly') },
    { value: 'quarterly', label: 'Quarterly', sub: '₹' + getSubscriptionBillingPrice(plan, 'quarterly') },
    { value: 'yearly', label: 'Yearly', sub: 'Save ' + savingsPercentFor(plan) + '%' },
  ];

  const featureHighlights = [
    { icon: '🧠', title: 'Real-time AI Mentor', desc: 'Har doubt ka instant jawab, course player ke andar hi.' },
    { icon: '💬', title: 'AI Mentor in Community', desc: 'Better discussions, better answers — community mein bhi AI saathi.' },
    { icon: '🪙', title: 'EduCoins', desc: 'Padho, study karo aur har serious action par EduCoins kamao.' },
    { icon: '🔥', title: 'Streaks & Rewards', desc: 'Roz padho, streak banao aur rewards jeeto.' },
    { icon: '🏷️', title: 'EduCoin Discounts', desc: 'EduCoins use karke paid modules par discount pao.' },
    { icon: '🚨', title: 'MayDay Feature', desc: 'Emergency mein instant study support, jab sabse zyada zaroorat ho.' },
    { icon: '🌍', title: 'Community Access', desc: 'Serious learners ka apna ghar — share, discuss, grow.' },
  ];

  const primaryCta = isOwned
    ? `${currentTier === 'elite' ? 'Eduvora Plus+' : 'Pro'} active`
    : inTrialMode
      ? pageContent.trialCta
      : `${plan.ctaLabel} · ₹${finalPlanPrice.toFixed(0)} / ${billingLabel}`;

  return (
    <div
      className="subscription-page-theme-adaptive subscription-page-default-theme relative min-h-screen overflow-x-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-blue-50/60 to-cyan-50/40 pb-24 text-slate-900"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(23,105,255,0.10) 1px, transparent 0), radial-gradient(60rem 28rem at 85% -10%, rgba(123,97,255,0.18), transparent 60%), radial-gradient(50rem 26rem at 8% 0%, rgba(23,105,255,0.14), transparent 60%)',
        backgroundSize: '24px 24px, 100% 100%, 100% 100%',
      }}
    >
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
        <button
          type="button"
          onClick={onBack}
          className="w-fit rounded-full border border-indigo-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-indigo-800 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          ← Back
        </button>

        <section className="flex flex-1 flex-col items-center py-8 sm:py-12 lg:py-14">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {pageContent.eyebrow}
            </span>
            <h1 className="mt-5 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 bg-clip-text text-3xl font-black leading-tight tracking-[-0.04em] text-transparent sm:text-5xl lg:text-6xl">
              {pageContent.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[13px] font-semibold leading-6 text-slate-600 sm:text-[15px] sm:leading-7">
              {pageContent.subtitle}
            </p>

            {membershipActive && (
              <p className="mx-auto mt-5 w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                <span className="inline-flex items-center gap-1">
                  <span>⭐</span>
                  <span>{trialActive ? `Trial active · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : `Eduvora Plus+ · subscription active`}</span>
                </span>
              </p>
            )}
          </div>

          {trialAllowed && !isOwned && (
            <div className="mt-8 w-full max-w-3xl">
              <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-slate-600">Kaise join karna hai?</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-[20px] border border-indigo-200 bg-white/90 p-1.5 shadow-[0_14px_40px_rgba(79,70,229,0.1)]" role="tablist" aria-label="Choose free trial or buy now">
                <button
                  type="button"
                  role="tab"
                  aria-selected={checkoutMode === 'trial'}
                  onClick={() => setCheckoutMode('trial')}
                  className={`flex flex-col items-center gap-0.5 rounded-[16px] px-3 py-3 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                    checkoutMode === 'trial'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_14px_30px_rgba(16,185,129,0.3)]'
                      : 'text-slate-600 hover:bg-emerald-50'
                  }`}
                >
                  <span className="text-[12px] font-black uppercase tracking-[0.08em]">🎁 Free Trial</span>
                  <span className={`text-[11px] font-bold ${checkoutMode === 'trial' ? 'text-emerald-50' : 'text-emerald-700'}`}>{freeTrialDays} din · ₹0 · No payment</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={checkoutMode === 'buy'}
                  onClick={() => setCheckoutMode('buy')}
                  className={`flex flex-col items-center gap-0.5 rounded-[16px] px-3 py-3 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                    checkoutMode === 'buy'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_14px_30px_rgba(79,70,229,0.3)]'
                      : 'text-slate-600 hover:bg-indigo-50'
                  }`}
                >
                  <span className="text-[12px] font-black uppercase tracking-[0.08em]">💳 Buy Now</span>
                  <span className={`text-[11px] font-bold ${checkoutMode === 'buy' ? 'text-indigo-100' : 'text-indigo-700'}`}>Full plan · ₹{finalPlanPrice.toFixed(0)} / {billingLabel}</span>
                </button>
              </div>
              {checkoutMode === 'trial' && (
                <p className="mt-3 text-center text-[12px] font-bold leading-5 text-emerald-700">
                  Pehle {freeTrialDays} din bilkul FREE — bina payment ke. Trial ke baad, jo cycle chaho choose karke purchase karo.
                </p>
              )}
            </div>
          )}

          {trialAllowed && !isOwned && checkoutMode === 'trial' && (
            <div className="mt-6 w-full max-w-3xl overflow-hidden rounded-[24px] border border-emerald-200 bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 p-[1px] shadow-[0_24px_60px_rgba(16,185,129,0.22)]">
              <div className="flex flex-col gap-4 rounded-[23px] bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 sm:flex-row sm:items-center sm:p-7">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl shadow-[0_14px_30px_rgba(16,185,129,0.3)]">🎁</div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Free for new students · {freeTrialDays} din</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.02em] text-slate-900 sm:text-2xl">{pageContent.trialTitle}</h2>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-700 sm:text-[14px]">{pageContent.trialSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onStartFreeTrial}
                  className="shrink-0 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-[12px] font-black uppercase tracking-[0.08em] text-white shadow-[0_16px_34px_rgba(16,185,129,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(16,185,129,0.4)] active:translate-y-0"
                >
                  {pageContent.trialCta}
                </button>
              </div>
            </div>
          )}

          {trialAllowed && !isOwned && checkoutMode !== 'trial' && (
            <div className="mt-6 hidden w-full max-w-3xl rounded-[20px] border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center text-[13px] font-bold text-emerald-800">
              🎁 New student ho? Pehle <button type="button" onClick={() => setCheckoutMode('trial')} className="font-black text-emerald-700 underline underline-offset-2">{freeTrialDays}-day Free Trial</button> try karo — ₹0, no payment.
            </div>
          )}

          {trialActive && (
            <div className="mt-8 w-full max-w-3xl rounded-[22px] border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 text-left shadow-[0_18px_44px_rgba(217,119,6,0.14)] sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Trial in progress</p>
              <p className="mt-1.5 text-[15px] font-black text-amber-900">
                {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} free bacha hai. Uske baad subscription purchase karni hogi — abhi plan lock karo aur streaks na todo.
              </p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${Math.max(10, Math.min(100, (trialDaysLeft / Math.max(1, freeTrialDays)) * 100))}%` }} />
              </div>
            </div>
          )}

          <div className="mt-8 w-full max-w-3xl" aria-label="Billing cycle toggle">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-slate-600">Choose your billing cycle</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
              {cycleOptions.map(option => {
                const selected = billingCycle === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setBillingCycle(option.value)}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-2.5 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      selected
                        ? 'border-indigo-600 bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                        : 'border-indigo-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.06em]">{option.label}</span>
                    <span className={`text-[9px] font-bold ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>{option.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <article className={`subscription-plan-card group relative mt-8 w-full max-w-3xl overflow-visible rounded-[22px] border bg-white/95 px-5 pb-5 pt-8 text-left shadow-[0_28px_80px_rgba(79,70,229,0.14)] ring-1 ring-white/80 transition hover:-translate-y-1 hover:shadow-[0_34px_88px_rgba(79,70,229,0.18)] sm:px-8 ${plan.featured ? 'border-indigo-300 ring-4 ring-indigo-500/10' : 'border-indigo-100'}`}>
            {plan.featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_26px_rgba(109,40,217,0.3)]">{plan.badge || 'Sabse Popular'}</span>}
            {isOwned && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] sm:h-28 sm:w-28" aria-label="Subscription purchased and active">
                <div className="absolute inset-2 rounded-full border-[3px] border-double border-red-900 bg-white/95 shadow-[0_12px_30px_rgba(185,28,28,0.22)]" />
                <div className="absolute inset-4 rounded-full border-2 border-dashed border-red-700" />
                <div className="absolute inset-x-0 top-[43%] -translate-y-1/2 bg-gradient-to-r from-red-950 via-red-700 to-red-950 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-md sm:text-xs">Owned</div>
                <span className="absolute inset-x-0 top-4 text-center text-[8px] font-black uppercase tracking-[0.18em] text-red-900 sm:top-5 sm:text-[9px]">Purchased</span>
                <span className="absolute inset-x-0 bottom-4 text-center text-[7px] font-black uppercase tracking-[0.14em] text-red-900 sm:bottom-5 sm:text-[8px]">Active plan</span>
              </div>
            )}

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-indigo-700">
                    <span className="inline-flex items-center gap-1">
                      <span>🔑</span>
                      <span>Full access</span>
                    </span>
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.04em] text-amber-800">
                    <span className="inline-flex items-center gap-1">
                      <span>💰</span>
                      <span>{plan.earningMultiplier}× EduCoin earning</span>
                    </span>
                  </span>
                  {availableCoupon && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.04em] text-emerald-700">
                      <span className="inline-flex items-center gap-1">
                        <span>🎫</span>
                        <span>Coupon available</span>
                      </span>
                    </span>
                  )}
                </div>

                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">{plan.audienceLabel}</p>
                <h2 className="mt-1.5 text-2xl font-black tracking-[-0.02em] text-slate-900 sm:text-3xl">{plan.name}</h2>
                <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-700">{plan.description}</p>
              </div>

              <div className="shrink-0 text-left lg:max-w-[220px] lg:text-right">
                <div className="flex items-end justify-start gap-2 lg:justify-end">
                  {(couponDiscount + eduCoinDiscount) > 0 && <span className="mb-1 text-sm font-bold text-slate-400 line-through">₹{planPrice.toFixed(0)}</span>}
                  <span className="text-5xl font-black leading-none tracking-[-0.05em] text-indigo-700">₹{finalPlanPrice.toFixed(0)}</span>
                </div>
                <p className="mt-2 text-[12px] font-bold text-slate-600">
                  {billingCycle === 'once' ? 'one-time · lifetime access' : `per ${billingLabel} · ${getSubscriptionBillingCycleName(billingCycle)} billing`}
                </p>
                {billingCycle !== 'monthly' && billingCycle !== 'once' && savingsPercent > 0 && (
                  <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">Save {savingsPercent}% vs monthly</p>
                )}
              </div>
            </div>

            <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_240px]">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span>✨</span>
                    <span>Everything included</span>
                  </span>
                </p>
                <ul className="mt-3 space-y-2.5">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-[13px] font-bold leading-6 text-slate-800">
                      <span className="mt-0.5 text-indigo-600">✓</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0">
                <div className="rounded-[18px] border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <span>🎁</span>
                      <span>Selected content access</span>
                    </span>
                  </p>
                  <p className="mt-2 text-[12px] font-bold leading-5 text-slate-800">{unlockedProducts.join(' • ')}</p>
                </div>

                {(activeDiscount || validAppliedCoupon) && (
                  <div className="mt-4 rounded-[18px] border border-indigo-100 bg-indigo-50/60 p-4 text-[12px] font-bold text-slate-800">
                    <div className="flex justify-between gap-3">
                      <span>Subtotal</span>
                      <span>₹{planPrice}</span>
                    </div>
                    {validAppliedCoupon && (
                      <div className="mt-1 flex justify-between gap-3">
                        <span className="inline-flex items-center gap-1">
                          <span>🎫</span>
                          <span>Coupon ({validAppliedCoupon.code})</span>
                        </span>
                        <span className="text-emerald-700">-₹{couponDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {activeDiscount && (
                      <div className="mt-1 flex justify-between gap-3">
                        <span className="inline-flex items-center gap-1">
                          <span>💰</span>
                          <span>EduCoin Discount</span>
                        </span>
                        <span className="text-emerald-700">-₹{eduCoinDiscount}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between gap-3 border-t border-indigo-200 pt-2 font-black">
                      <span>Final Price</span>
                      <span className="text-indigo-700">₹{finalPlanPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                disabled={isOwned}
                onClick={() => (inTrialMode ? onStartFreeTrial?.() : onActivatePlan(plan, billingCycle, validAppliedCoupon?.code || null))}
                className={`subscription-primary-action block min-h-12 w-full rounded-[18px] border px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.08em] outline-none transition active:scale-[0.99] ${
                  isOwned
                    ? 'cursor-not-allowed border-slate-300 bg-gradient-to-r from-slate-100 to-white text-slate-500 shadow-sm'
                    : inTrialMode
                      ? 'eduvora-primary-action border-emerald-600 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_18px_42px_rgba(16,185,129,0.32)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(16,185,129,0.38)]'
                      : 'eduvora-primary-action border-indigo-600 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_18px_42px_rgba(79,70,229,0.32)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(79,70,229,0.38)]'
                }`}
              >
                {primaryCta}
              </button>

              {coinPrice > 0 && (
                <button
                  type="button"
                  disabled={isOwned || !canPayWithCoins}
                  onClick={() => onActivatePlanWithCoins?.(plan, billingCycle)}
                  className="subscription-educoin-action block min-h-11 w-full rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.06em] text-amber-800 outline-none transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {isOwned ? 'Membership active' : !canUseEduCoins ? 'EduCoin use unlocks with Pro' : canPayWithCoins ? `Redeem ${coinPrice} EduCoins for free` : `Need ${missingCoins} more coins`}
                </button>
              )}
            </div>

            <div className="mt-4 rounded-[18px] border border-indigo-100 bg-slate-50/90 p-4">
              <label htmlFor={`coupon-${planId}`} className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span>🎫</span>
                  <span>Redeem coupon code</span>
                </span>
              </label>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  id={`coupon-${planId}`}
                  type="text"
                  value={couponInputs[planId] || ''}
                  onChange={(event) => handleCouponInputChange(planId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !validAppliedCoupon) handleApplyCoupon(planId, couponInputs[planId] || '');
                  }}
                  placeholder="Enter coupon code"
                  disabled={isOwned}
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-black uppercase tracking-[0.08em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:border-indigo-400 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  disabled={isOwned}
                  onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] hover:bg-indigo-50 disabled:bg-slate-100"
                >
                  {validAppliedCoupon ? '✓ Remove' : 'Apply'}
                </button>
              </div>
              {couponErrors[planId] && <p className="mt-2 text-[11px] font-bold text-red-700">{couponErrors[planId]}</p>}
              {validAppliedCoupon && <p className="mt-2 text-[11px] font-bold text-emerald-700">✓ {validAppliedCoupon.code} applied successfully.</p>}
            </div>
          </article>

          <div className="mt-14 w-full max-w-4xl">
            <div className="text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600">Benefits</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-slate-900 sm:text-4xl">{pageContent.valueTitle}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-[13px] font-semibold leading-6 text-slate-700 sm:text-sm sm:leading-7">{pageContent.valueDescription}</p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureHighlights.map(feature => (
                <div key={feature.title} className="rounded-[20px] border border-indigo-100 bg-white/90 p-5 text-left shadow-[0_14px_40px_rgba(79,70,229,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(79,70,229,0.14)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-xl shadow-[0_10px_24px_rgba(109,40,217,0.24)]">{feature.icon}</div>
                  <h3 className="mt-4 text-[15px] font-black text-slate-900">{feature.title}</h3>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-700">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 w-full max-w-4xl overflow-hidden rounded-[26px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 text-left shadow-[0_22px_60px_rgba(79,70,229,0.12)] sm:p-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-2xl shadow-[0_14px_30px_rgba(109,40,217,0.3)]">💎</div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">Sach jo aapko jaanna chahiye</p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.02em] text-slate-900 sm:text-2xl">Subscription kyu zaroori hai?</h2>
                <p className="mt-3 text-[14px] font-semibold leading-7 text-slate-700 sm:text-[15px]">
                  Eduvora Plus+ koi adhoora feature nahi hai. AI Mentor, Community, EduCoins system aur MayDay — yeh sab real Google AI services, secure servers, aur premium tools par chalta hai jo humein paid lagte hain (Google Console, AI APIs, hosting sab ke paise). Aapka subscription in costs ko cover karta hai taaki aapko milta rahe — best quality, bina ads, bina kisi tension ke. Yeh humara tarika hai aapke sapne ko seriously lene ka.
                </p>
                <p className="mt-3 text-[13px] font-bold leading-6 text-indigo-800">{pageContent.renewalNote}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: '🔄', title: 'Auto-renew control', desc: 'Renew on/off, kabhi bhi aapke control mein.' },
              { icon: '🛡️', title: 'Secure payments', desc: 'Razorpay verified checkout, har payment safe.' },
              { icon: '💝', title: 'Student-first', desc: '7-day trial, no ads, full heart se support.' },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3 rounded-[18px] border border-indigo-100 bg-white/90 p-4 text-left shadow-sm">
                <span className="text-xl">{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-[12px] font-semibold leading-5 text-slate-700">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

function getPeriodCount(billingCycle: SubscriptionBillingCycle): number {
  switch (billingCycle) {
    case 'weekly': return 4.33;
    case 'quarterly': return 3;
    case 'yearly': return 12;
    default: return 1;
  }
}

function savingsPercentFor(plan: SubscriptionPlanConfig): number {
  const monthly = getSubscriptionBillingPrice(plan, 'monthly');
  const yearly = getSubscriptionBillingPrice(plan, 'yearly');
  if (monthly <= 0 || yearly <= 0) return 0;
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

export default SubscriptionPage;
