import React from 'react';
import { ActiveCoinDiscount, Coupon, ProductWithRating, WebsiteSettings, User } from '../App';
import { EconomySettings, resolveCoinPrice } from '../utils/economy';
import {
  ALL_SUBSCRIPTION_FEATURE_KEYS,
  canStartFreeTrial,
  getFeatureBundleCycleTotal,
  getFeatureBundleMonthlyTotal,
  getSubscriptionBillingCycleName,
  getSubscriptionBillingLabel,
  getSubscriptionBillingPrice,
  getSubscriptionCyclePrice,
  getSubscriptionCycleSavingsPercent,
  getSubscriptionFeature,
  getSubscriptionFeatureKeys,
  getSubscriptionFeaturePrice,
  getSubscriptionTierRank,
  getTrialDaysLeft,
  getUserSubscriptionTier,
  hasSubscriptionFeature,
  isSubscriptionExpired,
  isTrialActive,
  normalizeSubscriptionPageContent,
  normalizeSubscriptionPlans,
  SUBSCRIPTION_FEATURES,
  SubscriptionBillingCycle,
  SUBSCRIPTION_BILLING_CYCLES,
  SubscriptionFeatureKey,
  SubscriptionPlanConfig,
} from '../utils/subscriptionAccess';

const CYCLE_HINTS: Record<SubscriptionBillingCycle, string> = {
  once: 'One-time',
  weekly: 'per week',
  monthly: 'per month',
  quarterly: 'Quarterly',
  yearly: 'per year',
};

const CYCLE_ORDER: SubscriptionBillingCycle[] = ['weekly', 'monthly', 'yearly', 'once'];

const SubscriptionPage: React.FC<{
  economySettings: EconomySettings;
  activeCoinDiscount?: ActiveCoinDiscount | null;
  onConsumeCoinDiscount?: () => void;
  settings: WebsiteSettings;
  products: ProductWithRating[];
  purchasedProductIds: number[];
  onBack: () => void;
  onActivatePlan: (plan: SubscriptionPlanConfig, billingCycle: SubscriptionBillingCycle, appliedCouponCode?: string | null, selectedFeatures?: SubscriptionFeatureKey[]) => void;
  currentUser?: User | null;
  onActivatePlanWithCoins?: (plan: SubscriptionPlanConfig, billingCycle: SubscriptionBillingCycle, selectedFeatures?: SubscriptionFeatureKey[]) => void;
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
  const plan = plans[0];
  const pageContent = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const currentTier = getUserSubscriptionTier(currentUser);
  const membershipActive = currentTier !== 'normal';
  const subscriptionExpired = !membershipActive && Boolean(currentUser?.subscriptionActivatedAt) && isSubscriptionExpired(currentUser);
  const ownedFeatureKeys = membershipActive ? getSubscriptionFeatureKeys(currentUser) : [];
  const bundleMonthly = Math.max(0, getSubscriptionBillingPrice(plan, 'monthly')) || 499;

  const [billingCycle, setBillingCycle] = React.useState<SubscriptionBillingCycle>('monthly');
  const [selectedFeatures, setSelectedFeatures] = React.useState<SubscriptionFeatureKey[]>(membershipActive ? [...ownedFeatureKeys] : [...ALL_SUBSCRIPTION_FEATURE_KEYS]);
  const [couponInputs, setCouponInputs] = React.useState<Record<string, string>>({});
  const [appliedCouponCodes, setAppliedCouponCodes] = React.useState<Record<string, string>>({});
  const [couponErrors, setCouponErrors] = React.useState<Record<string, string>>({});

  const freeTrialDays = pageContent.freeTrialDays;
  const trialEnabled = pageContent.freeTrialEnabled !== false;
  const trialAllowed = trialEnabled && canStartFreeTrial(currentUser);
  const trialActive = isTrialActive(currentUser);
  const trialDaysLeft = getTrialDaysLeft(currentUser);
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

  const planId = String(plan.id);
  const isOwned = getSubscriptionTierRank(currentTier) >= getSubscriptionTierRank(plan.accessTier);
  const unlockedProducts = plan.unlockProductIds.map(id => products.find(product => product.id === id)?.title || `Product #${id}`);
  const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
  const coinBalance = Number(currentUser?.coinBalance ?? currentUser?.eduCoins ?? 0);
  const canUseEduCoins = currentTier !== 'normal';
  const canPayWithCoins = canUseEduCoins && coinPrice > 0 && coinBalance >= coinPrice;
  const missingCoins = Math.max(0, coinPrice - coinBalance);

  const billingLabel = getSubscriptionBillingLabel(billingCycle);
  const planPrice = getSubscriptionBillingPrice(plan, billingCycle);
  const addableFeatures = selectedFeatures.filter(key => !ownedFeatureKeys.includes(key));
  const addableMonthlyTotal = getFeatureBundleMonthlyTotal(addableFeatures, bundleMonthly);
  const addableCycleTotal = getSubscriptionCyclePrice(addableMonthlyTotal, billingCycle);
  const allSelected = ALL_SUBSCRIPTION_FEATURE_KEYS.every(key => selectedFeatures.includes(key));
  const selectedMonthlyTotal = getFeatureBundleMonthlyTotal(selectedFeatures, bundleMonthly);
  const selectedCycleTotal = getSubscriptionCyclePrice(selectedMonthlyTotal, billingCycle);
  const selectedSumOfCyclePrices = SUBSCRIPTION_FEATURES
    .filter(feature => selectedFeatures.includes(feature.key))
    .reduce((sum, feature) => sum + getSubscriptionFeaturePrice(feature, billingCycle), 0);
  const bundleSavings = allSelected ? Math.max(0, selectedSumOfCyclePrices - selectedCycleTotal) : 0;
  const payableTotal = membershipActive ? addableCycleTotal : selectedCycleTotal;

  const activeDiscount = activeCoinDiscount?.subscriptionId === planId ? activeCoinDiscount : null;
  const appliedCouponCode = appliedCouponCodes[planId];
  const appliedCoupon = appliedCouponCode ? coupons.find(coupon => coupon.code.trim().toUpperCase() === appliedCouponCode.toUpperCase()) : undefined;
  const validAppliedCoupon = appliedCoupon && !getCouponError(appliedCoupon) ? appliedCoupon : null;
  const couponDiscount = validAppliedCoupon ? calculateCouponDiscount(validAppliedCoupon, payableTotal) : 0;
  const eduCoinDiscount = activeDiscount ? Math.min(Math.max(0, payableTotal - couponDiscount), activeDiscount.amount) : 0;
  const finalPrice = Math.max(0, payableTotal - couponDiscount - eduCoinDiscount);

  const savingsPercent = getSubscriptionCycleSavingsPercent(billingCycle);

  const toggleFeature = (key: SubscriptionFeatureKey) => {
    if (ownedFeatureKeys.includes(key)) return;
    setSelectedFeatures(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);
  };

  const selectAllFeatures = () => setSelectedFeatures(prev => {
    const merged = [...new Set([...prev, ...ALL_SUBSCRIPTION_FEATURE_KEYS])];
    return ALL_SUBSCRIPTION_FEATURE_KEYS.every(key => prev.includes(key)) ? [] : merged;
  });

  const purchasedFeatureKeys = [...ownedFeatureKeys, ...addableFeatures];
  const primaryCta = membershipActive
    ? (addableFeatures.length > 0
      ? `Add features · ₹${finalPrice.toFixed(0)} / ${billingLabel}`
      : `${currentTier === 'elite' ? 'Eduvora Plus+' : 'Pro'} plan active`)
    : inTrialMode
      ? pageContent.trialCta
      : `Get your plan · ₹${finalPrice.toFixed(0)} / ${billingLabel}`;

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

            {subscriptionExpired && (
              <div className="mx-auto mt-6 w-full max-w-3xl rounded-[20px] border border-red-200 bg-red-50 px-4 py-3.5 text-left shadow-[0_16px_40px_rgba(220,38,38,0.12)]">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-red-700">⌛ Your subscription has expired</p>
                <p className="mt-1 text-[13px] font-bold leading-5 text-red-900">
                  Your features are now locked. Renew below to start using them again — pick the features you need and your price updates instantly.
                </p>
              </div>
            )}

            {membershipActive && (
              <p className="mx-auto mt-6 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">
                <span className="inline-flex items-center gap-1">
                  <span>⭐</span>
                  <span>
                    {trialActive
                      ? `Trial active · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left`
                      : `${purchasedFeatureKeys.length} feature${purchasedFeatureKeys.length === 1 ? '' : 's'} unlocked · Eduvora Plus+ subscription active · renews ${currentUser?.subscriptionExpiresAt ? new Date(currentUser.subscriptionExpiresAt).toLocaleDateString() : 'manually'}`}
                  </span>
                </span>
              </p>
            )}
          </div>

          {trialAllowed && !membershipActive && (
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
                  <span className={`text-[11px] font-bold ${checkoutMode === 'buy' ? 'text-indigo-100' : 'text-indigo-700'}`}>Build your own plan · ₹{finalPrice.toFixed(0)} / {billingLabel}</span>
                </button>
              </div>
            </div>
          )}

          {trialActive && (
            <div className="mt-8 w-full max-w-3xl rounded-[22px] border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 text-left shadow-[0_18px_44px_rgba(217,119,6,0.14)] sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Trial in progress</p>
              <p className="mt-1.5 text-[15px] font-black text-amber-900">
                {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} free bacha hai. Uske baad apna bundle choose karo — sab features select karke streak na todo.
              </p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${Math.max(10, Math.min(100, (trialDaysLeft / Math.max(1, freeTrialDays)) * 100))}%` }} />
              </div>
            </div>
          )}

          <div className="mt-8 w-full max-w-4xl" aria-label="Billing cycle toggle">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-slate-600">Choose your billing cycle</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {CYCLE_ORDER.map(cycle => {
                const selected = billingCycle === cycle;
                const cycleTotal = membershipActive
                  ? getSubscriptionCyclePrice(getFeatureBundleMonthlyTotal(addableFeatures, bundleMonthly), cycle)
                  : getSubscriptionCyclePrice(getFeatureBundleMonthlyTotal(selectedFeatures, bundleMonthly), cycle);
                const hint = cycle === 'yearly'
                  ? `Save ${getSubscriptionCycleSavingsPercent('yearly')}%`
                  : cycle === 'once'
                    ? 'Lifetime'
                    : `₹${cycleTotal.toFixed(0)}`;
                return (
                  <button
                    key={cycle}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setBillingCycle(cycle)}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-2.5 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      selected
                        ? 'border-indigo-600 bg-gradient-to-b from-indigo-600 to-violet-600 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                        : 'border-indigo-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.06em]">{cycle === 'once' ? 'One-time' : cycle}</span>
                    <span className={`text-[9px] font-bold ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>{hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[12px] font-bold leading-5 text-slate-500">
              Your selected features stay saved while you switch cycles — the checklist only resets when you leave this page.
            </p>
          </div>

          <div className="mt-10 grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">Step 1 · Pick what you need</p>
                  <h2 className="mt-1.5 text-2xl font-black tracking-[-0.02em] text-slate-900 sm:text-3xl">Build your bundle</h2>
                  <p className="mt-1.5 max-w-md text-[13px] font-semibold leading-5 text-slate-600">
                    Toggle the features you want. Your price updates instantly. Nahi chahiye? Bina kisi pressure ke hatado — sirf apna value ka bundle lo.
                  </p>
                </div>
                {!membershipActive && (
                  <button
                    type="button"
                    onClick={selectAllFeatures}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      allSelected
                        ? 'border-slate-200 bg-slate-100 text-slate-500'
                        : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                    }`}
                  >
                    {allSelected ? '✓ All selected' : 'Select all'}
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {SUBSCRIPTION_FEATURES.map(feature => {
                  const checked = selectedFeatures.includes(feature.key);
                  const owned = ownedFeatureKeys.includes(feature.key);
                  const featurePrice = getSubscriptionFeaturePrice(feature, billingCycle);
                  return (
                    <button
                      key={feature.key}
                      type="button"
                      onClick={() => toggleFeature(feature.key)}
                      aria-pressed={checked}
                      className={`subscription-feature-row group flex w-full items-center gap-3 rounded-[22px] border bg-white/95 p-4 text-left shadow-[0_10px_30px_rgba(79,70,229,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(79,70,229,0.14)] ${
                        checked ? 'border-indigo-400 ring-2 ring-indigo-500/15' : 'border-slate-200'
                      } ${owned ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl shadow-sm ${checked ? 'bg-gradient-to-br from-indigo-600 to-violet-600' : 'bg-slate-100'}`}>{feature.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-black text-slate-900">{feature.name}</span>
                          {owned && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">In your plan</span>}
                          {feature.badge && !owned && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-800">{feature.badge}</span>}
                        </span>
                        <span className="mt-1 block text-[12px] font-semibold leading-5 text-slate-600">{feature.description}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`text-[14px] font-black ${checked ? 'text-indigo-700' : 'text-slate-500'}`}>₹{featurePrice.toFixed(0)}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{CYCLE_HINTS[billingCycle]}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative ml-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                          checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-slate-200'
                        } ${owned ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 overflow-hidden rounded-[24px] border border-indigo-100 bg-white/95 shadow-[0_18px_50px_rgba(79,70,229,0.1)]">
                <div className="border-b border-indigo-100 px-5 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <span>✨</span>
                      <span>What you get with your bundle</span>
                    </span>
                  </p>
                </div>
                <div className="grid gap-2 p-5 sm:grid-cols-2">
                  {plan.benefits.map(benefit => (
                    <div key={benefit} className="flex items-start gap-2 text-[13px] font-bold leading-6 text-slate-800">
                      <span className="mt-0.5 text-indigo-600">✓</span>
                      <span>{benefit}</span>
                    </div>
                  ))}
                  {plan.unlockProductIds.length > 0 && (
                    <div className="flex items-start gap-2 text-[13px] font-bold leading-6 text-slate-800 sm:col-span-2">
                      <span className="mt-0.5 text-indigo-600">✓</span>
                      <span>
                        Selected premium content: <span className="text-indigo-700">{unlockedProducts.join(' • ')}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="subscription-plan-card relative lg:sticky lg:top-6 rounded-[22px] border border-indigo-200 bg-white/95 p-5 shadow-[0_28px_80px_rgba(79,70,229,0.16)] ring-1 ring-white/80 sm:p-6">
                {membershipActive && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] sm:h-28 sm:w-28" aria-label="Subscription purchased and active">
                    <div className="absolute inset-2 rounded-full border-[3px] border-double border-red-900 bg-white/95 shadow-[0_12px_30px_rgba(185,28,28,0.22)]" />
                    <div className="absolute inset-4 rounded-full border-2 border-dashed border-red-700" />
                    <div className="absolute inset-x-0 top-[43%] -translate-y-1/2 bg-gradient-to-r from-red-950 via-red-700 to-red-950 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-md sm:text-xs">Owned</div>
                    <span className="absolute inset-x-0 top-4 text-center text-[8px] font-black uppercase tracking-[0.18em] text-red-900 sm:top-5 sm:text-[9px]">Purchased</span>
                    <span className="absolute inset-x-0 bottom-4 text-center text-[7px] font-black uppercase tracking-[0.14em] text-red-900 sm:bottom-5 sm:text-[8px]">Active plan</span>
                  </div>
                )}
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">
                  <span className="inline-flex items-center gap-1">
                    <span>🛒</span>
                    <span>{membershipActive ? 'Upgrade your plan' : 'Your plan'}</span>
                  </span>
                </p>

                {membershipActive && (
                  <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-800">
                    You already own {ownedFeatureKeys.length} feature{ownedFeatureKeys.length === 1 ? '' : 's'}. Only newly added features are charged — just toggle the ones you want to add.
                  </p>
                )}

                <div className="mt-4 space-y-2.5">
                  {SUBSCRIPTION_FEATURES
                    .filter(feature => selectedFeatures.includes(feature.key))
                    .map(feature => {
                      const owned = ownedFeatureKeys.includes(feature.key);
                      const price = getSubscriptionFeaturePrice(feature, billingCycle);
                      return (
                        <div key={feature.key} className="flex items-center justify-between gap-2 text-[12px] font-bold text-slate-700">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <span className="text-base">{feature.icon}</span>
                            <span className="truncate">{feature.name}</span>
                            {owned && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-700">Included</span>}
                          </span>
                          <span className={owned ? 'text-emerald-700' : 'text-slate-800'}>
                            {owned ? '₹0' : `₹${price.toFixed(0)}`}
                          </span>
                        </div>
                      );
                    })}
                </div>

                {selectedFeatures.length === 0 && (
                  <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[12px] font-bold text-slate-500">
                    No features selected yet. Toggle the features you need on the left.
                  </p>
                )}

                {bundleSavings > 0 && (
                  <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-800">
                    <span>🎉 Full bundle discount · value ₹{planPrice.toFixed(0)}</span>
                    <span>-₹{bundleSavings.toFixed(0)}</span>
                  </div>
                )}

                <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-4 text-[12px] font-bold text-slate-600">
                  <div className="flex justify-between gap-3">
                    <span>Subtotal</span>
                    <span>₹{payableTotal.toFixed(0)}</span>
                  </div>
                  {bundleSavings > 0 && (
                    <div className="flex justify-between gap-3">
                      <span>You save</span>
                      <span className="text-emerald-700">-₹{bundleSavings.toFixed(0)}</span>
                    </div>
                  )}
                  {validAppliedCoupon && (
                    <div className="flex justify-between gap-3">
                      <span>Coupon ({validAppliedCoupon.code})</span>
                      <span className="text-emerald-700">-₹{couponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {activeDiscount && (
                    <div className="flex justify-between gap-3">
                      <span>EduCoin Discount</span>
                      <span className="text-emerald-700">-₹{eduCoinDiscount}</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-3">
                    <div>
                      <span className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">Total</span>
                      <span className="text-[10px] font-bold text-slate-400">/{billingLabel}</span>
                    </div>
                    <span className="text-4xl font-black tracking-[-0.05em] text-indigo-700">₹{finalPrice.toFixed(0)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isOwned && addableFeatures.length === 0}
                  onClick={() => (inTrialMode ? onStartFreeTrial?.() : onActivatePlan(plan, billingCycle, validAppliedCoupon?.code || null, addableFeatures.length ? addableFeatures : selectedFeatures))}
                  className={`subscription-primary-action eduvora-primary-action mt-5 block min-h-12 w-full rounded-[16px] border px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.08em] outline-none transition active:scale-[0.99] ${
                    isOwned && addableFeatures.length === 0
                      ? 'cursor-not-allowed border-slate-300 bg-gradient-to-r from-slate-100 to-white text-slate-500 shadow-sm'
                      : inTrialMode
                        ? 'border-emerald-600 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_18px_42px_rgba(16,185,129,0.32)] hover:-translate-y-0.5'
                        : 'border-indigo-600 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_18px_42px_rgba(79,70,229,0.32)] hover:-translate-y-0.5'
                  }`}
                >
                  {primaryCta}
                </button>

                {inTrialMode && (
                  <button
                    type="button"
                    onClick={onStartFreeTrial}
                    className="mt-2 block min-h-10 w-full rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.08em] text-emerald-800 transition hover:bg-emerald-100"
                  >
                    🎁 Pehle {freeTrialDays}-din FREE trial try karo — ₹0
                  </button>
                )}

                {!inTrialMode && coinPrice > 0 && (
                  <button
                    type="button"
                    disabled={isOwned || !canPayWithCoins}
                    onClick={() => onActivatePlanWithCoins?.(plan, billingCycle, addableFeatures.length ? addableFeatures : selectedFeatures)}
                    className="subscription-educoin-action mt-2 block min-h-11 w-full rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.06em] text-amber-800 outline-none transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {isOwned ? 'Membership active' : !canUseEduCoins ? 'EduCoin use unlocks with Pro' : canPayWithCoins ? `Redeem ${coinPrice} EduCoins for free` : `Need ${missingCoins} more coins`}
                  </button>
                )}

                <div className="mt-4 rounded-[16px] border border-indigo-100 bg-slate-50/90 p-3.5">
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
                      disabled={isOwned && addableFeatures.length === 0}
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-black uppercase tracking-[0.08em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:border-indigo-400 disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      disabled={isOwned && addableFeatures.length === 0}
                      onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] hover:bg-indigo-50 disabled:bg-slate-100"
                    >
                      {validAppliedCoupon ? '✓ Remove' : 'Apply'}
                    </button>
                  </div>
                  {couponErrors[planId] && <p className="mt-2 text-[11px] font-bold text-red-700">{couponErrors[planId]}</p>}
                  {validAppliedCoupon && <p className="mt-2 text-[11px] font-bold text-emerald-700">✓ {validAppliedCoupon.code} applied successfully.</p>}
                </div>

                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold leading-5 text-amber-900">
                  🔄 No auto-renew. Aapka plan manually renew karna hoga — jab expiry karegi toh we will notify you and your features lock until you renew.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-14 w-full max-w-4xl overflow-hidden rounded-[26px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 text-left shadow-[0_22px_60px_rgba(79,70,229,0.12)] sm:p-9">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-2xl shadow-[0_14px_30px_rgba(109,40,217,0.3)]">⌛</div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">Sach jo aapko jaanna chahiye</p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.02em] text-slate-900 sm:text-2xl">Subscription expire hone par kya hota hai?</h2>
                <p className="mt-3 text-[14px] font-semibold leading-7 text-slate-700 sm:text-[15px]">
                  Jab aapka subscription expire hota hai, hum aapko renew karne ki clear notification bhejte hain. Jab tak renew nahi hoti, aapke selected features lock rahenge — jaise AI Mentor, Community, EduCoins, aur baaki sab. Renew karte hi wahi features turant wapas unlock ho jayenge. Aap kabhi bhi naye features add karke upgrade kar sakte ho.
                </p>
                <p className="mt-3 text-[13px] font-bold leading-6 text-indigo-800">{pageContent.renewalNote}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: '🧩', title: 'Pay only for what you need', desc: 'Features toggle karo, price instantly update hota hai.' },
              { icon: '🛡️', title: 'Secure payments', desc: 'Razorpay verified checkout, har payment safe.' },
              { icon: '🔓', title: 'Upgrade anytime', desc: 'Baad mein bhi naye features add kar sakte ho.' },
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

          <div className="mt-12 w-full max-w-4xl">
            <div className="text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-600">Benefits</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-slate-900 sm:text-4xl">{pageContent.valueTitle}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-[13px] font-semibold leading-6 text-slate-700 sm:text-sm sm:leading-7">{pageContent.valueDescription}</p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SUBSCRIPTION_FEATURES.map(feature => (
                <div key={feature.key} className="rounded-[20px] border border-indigo-100 bg-white/90 p-5 text-left shadow-[0_14px_40px_rgba(79,70,229,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(79,70,229,0.14)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-xl shadow-[0_10px_24px_rgba(109,40,217,0.24)]">{feature.icon}</div>
                  <h3 className="mt-4 text-[15px] font-black text-slate-900">{feature.name}</h3>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-700">{feature.description}</p>
                  <p className="mt-3 text-[12px] font-black text-indigo-700">₹{feature.monthlyPrice}/mo</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SubscriptionPage;
