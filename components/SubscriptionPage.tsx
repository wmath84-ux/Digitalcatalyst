import React from 'react';
import { ActiveCoinDiscount, Coupon, ProductWithRating, WebsiteSettings, User } from '../App';
import { EconomySettings, resolveCoinPrice } from '../utils/economy';

interface Plan { 
  id: string; 
  name: string; 
  price: number; 
  coinPrice?: number; 
  description: string; 
  unlockProductIds: number[]; 
  badge?: string; 
}

const SubscriptionPage: React.FC<{
  economySettings: EconomySettings; 
  activeCoinDiscount?: ActiveCoinDiscount | null; 
  onConsumeCoinDiscount?: () => void; 
  settings: WebsiteSettings; 
  products: ProductWithRating[]; 
  purchasedProductIds: number[]; 
  onBack: () => void; 
  onActivatePlan: (plan: Plan, appliedCouponCode?: string | null) => void;
  currentUser?: User | null; 
  onActivatePlanWithCoins?: (plan: Plan) => void;
  coupons: Coupon[];
}> = ({ 
  economySettings, 
  activeCoinDiscount = null, 
  onConsumeCoinDiscount, 
  settings, 
  products, 
  purchasedProductIds, 
  onBack, 
  onActivatePlan, 
  currentUser, 
  onActivatePlanWithCoins,
  coupons
}) => {
  const plans: Plan[] = (settings.content as any).subscriptionPlans || [];
  const highlightedPlanIndex = plans.length > 1 ? 1 : 0;
  const accentLines = ['from-[#1A73E8] to-[#C2E7FF]', 'from-[#D3E3FD] to-[#E8F0FE]', 'from-[#1967D2] to-[#D2E3FC]'];
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
      setAppliedCouponCodes(prev => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
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

  return (
    <div className="subscription-page-modern relative min-h-screen overflow-x-hidden bg-[#F8FAFD] pb-32 text-[#202124]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.96)_0%,rgba(232,240,254,0.88)_24%,rgba(211,227,253,0.86)_54%,rgba(194,231,255,0.42)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-[#C2E7FF]/55 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        <button onClick={onBack} className="w-fit rounded-full border border-[#D2E3FC] bg-white/95 px-5 py-2.5 text-sm font-semibold text-[#5F6368] shadow-[0_14px_35px_rgba(26,115,232,0.14)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#E8F0FE]">
          ← Back
        </button>

        <section className="flex flex-1 flex-col items-center justify-center py-8 sm:py-10">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1967D2]">Premium learning access</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#202124] sm:text-5xl">Choose your learning plan</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5F6368]">
              Unlock premium notes, courses, and resources with a clear one-time purchase and instant access.
            </p>
          </div>

          <div className="mt-8 grid w-full max-w-5xl gap-5 sm:mt-10 md:grid-cols-3 md:items-stretch">
            {}
            {plans.map((plan, index) => {
              const allUnlocked = (plan.unlockProductIds || []).every((id: number) => purchasedProductIds.includes(id));
              const isHighlighted = index === highlightedPlanIndex;
              const unlockedProducts = (plan.unlockProductIds || []).map((id:number) => products.find(product => product.id === id)?.title || `Product #${id}`);
              const coinPrice = resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
              const coinBalance = currentUser?.eduCoins || 0;
              const canPayWithCoins = coinPrice > 0 && coinBalance >= coinPrice;
              const missingCoins = Math.max(0, coinPrice - coinBalance);
              const planId = String(plan.id);
              const planPrice = Number(plan.price || 0);
              const activeDiscount = activeCoinDiscount?.subscriptionId === planId ? activeCoinDiscount : null;
              const appliedCouponCode = appliedCouponCodes[planId];
              const appliedCoupon = appliedCouponCode ? coupons.find(coupon => coupon.code.trim().toUpperCase() === appliedCouponCode.toUpperCase()) : undefined;
              const appliedCouponError = appliedCoupon ? getCouponError(appliedCoupon) : '';
              const validAppliedCoupon = appliedCoupon && !appliedCouponError ? appliedCoupon : null;
              const couponDiscount = validAppliedCoupon ? calculateCouponDiscount(validAppliedCoupon, planPrice) : 0;
              const eduCoinDiscount = activeDiscount ? Math.min(planPrice - couponDiscount, activeDiscount.amount) : 0;
              const totalDiscount = Math.min(planPrice, couponDiscount + eduCoinDiscount);
              const finalPlanPrice = Math.max(0, planPrice - totalDiscount);
              
              const handlePlanCheckout = () => {
                onActivatePlan(plan, validAppliedCoupon?.code || null);
              };

              return (
                <article key={plan.id} className={`subscription-plan-card group relative flex min-h-0 flex-col rounded-[2rem] border border-[#D2E3FC] bg-white/95 px-5 pb-5 pt-6 text-center shadow-[0_24px_70px_rgba(26,115,232,0.13)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 sm:px-6 sm:pb-6 ${isHighlighted ? 'md:-translate-y-2 md:hover:-translate-y-3' : ''}`}>
                  {isHighlighted && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#1A73E8] px-4 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(26,115,232,0.22)]">{plan.badge || 'Best Value'}</span>}
                  
                  <h2 className="text-base font-medium text-[#202124]">{plan.name}</h2>
                  <div className={`mx-auto mt-2 h-px w-full bg-gradient-to-r from-transparent ${accentLines[index % accentLines.length]} to-transparent`} />

                  <div className="mt-4 flex items-start justify-center text-[#202124]">
                    <span className="mt-2 text-2xl font-light">₹</span>
                    <span className="text-5xl font-light leading-none tracking-tight">{finalPlanPrice.toFixed(0)}</span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[#5F6368]">One-time secure access</p>
                  
                  {}
                  {(activeDiscount || validAppliedCoupon) && (
                    <div className="mx-auto mt-3 w-full rounded-2xl border border-[#D2E3FC] bg-[#E8F0FE] p-3 text-xs font-semibold text-[#1967D2]">
                      <div className="flex justify-between"><span>Subtotal</span><span>₹{planPrice}</span></div>
                      {validAppliedCoupon && <div className="flex justify-between"><span>Coupon ({validAppliedCoupon.code})</span><span>-₹{couponDiscount.toFixed(2)}</span></div>}
                      {activeDiscount && <div className="flex justify-between"><span>EduCoin Discount</span><span>-₹{eduCoinDiscount}</span></div>}
                      <div className="mt-1 flex justify-between font-black"><span>Final Price</span><span>₹{finalPlanPrice.toFixed(2)}</span></div>
                    </div>
                  )}
                  
                  <p className="mx-auto mt-4 max-w-[15rem] text-sm font-semibold leading-6 text-[#5F6368]">{plan.description}</p>

                  <div className="mt-4 rounded-[1.5rem] border border-[#D2E3FC] bg-[#F8FAFD]/95 p-3 text-left shadow-inner sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1967D2]">Have a coupon?</p>
                      <span className="rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[10px] font-black text-[#137333]">Live coupons</span>
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input
                        type="text"
                        value={couponInputs[planId] || ''}
                        onChange={event => handleCouponInputChange(planId, event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter' && !validAppliedCoupon) handleApplyCoupon(planId, couponInputs[planId] || ''); }}
                        placeholder="Coupon code"
                        disabled={allUnlocked}
                        className="h-11 w-full min-w-0 rounded-xl border border-[#DADCE0] bg-white px-3 text-sm font-black uppercase tracking-[0.08em] outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[#9AA0A6] focus:border-[#1A73E8] focus:ring-2 focus:ring-[#D2E3FC] disabled:cursor-not-allowed disabled:bg-[#F8FAFD]"
                        aria-label={`Coupon code for ${plan.name}`}
                      />
                      <button
                        type="button"
                        disabled={allUnlocked}
                        onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')}
                        className={`h-11 rounded-xl px-4 text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:bg-[#DADCE0] disabled:text-[#5F6368] ${validAppliedCoupon ? 'bg-[#FCE8E6] text-[#C5221F] hover:bg-[#FAD2CF]' : 'bg-[#1A73E8] text-white hover:-translate-y-0.5'}`}
                      >
                        {validAppliedCoupon ? 'Remove' : 'Apply'}
                      </button>
                    </div>
                    {(couponErrors[planId] || appliedCouponError) && <p className="mt-2 text-xs font-bold text-[#C5221F]">{couponErrors[planId] || appliedCouponError}</p>}
                    {validAppliedCoupon && <p className="mt-2 text-xs font-black text-[#137333]">{validAppliedCoupon.code} applied. You saved ₹{couponDiscount.toFixed(2)}.</p>}
                  </div>

                  <ul className="mx-auto mt-5 flex-1 space-y-2.5 text-left text-xs font-semibold leading-5 text-[#5F6368]">
                    {unlockedProducts.length ? unlockedProducts.slice(0, 5).map((title, productIndex) => (
                      <li key={title} className="flex items-start gap-2">
                        <span className={productIndex === 3 ? 'text-[#C5221F]' : 'text-[#137333]'}>{productIndex === 3 ? '×' : '✓'}</span>
                        <span>{title}</span>
                      </li>
                    )) : <li className="text-[#5F6368]">No products selected yet.</li>}
                  </ul>

                  {}
                  <div className="mt-5 space-y-2.5">
                    <button disabled={allUnlocked} onClick={handlePlanCheckout} className={`block w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(26,115,232,0.24)] transition active:scale-95 ${allUnlocked ? 'cursor-not-allowed bg-[#DADCE0]' : 'bg-[#1A73E8] hover:-translate-y-0.5 hover:bg-[#1967D2]'}`}>
                      {allUnlocked ? 'Plan active' : `Purchase ${plan.name} · ₹${finalPlanPrice.toFixed(0)}`}
                    </button>
                    
                    {coinPrice > 0 && (
                      <button disabled={allUnlocked || !canPayWithCoins} onClick={() => onActivatePlanWithCoins?.(plan)} className="block w-full rounded-2xl border border-[#D2E3FC] bg-[#E8F0FE] px-5 py-3 text-xs font-black text-[#1967D2] shadow-sm transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                        {canPayWithCoins ? `Pay ${coinPrice} EduCoins` : `Need ${missingCoins} more coins`}
                      </button>
                    )}
                  </div>
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
