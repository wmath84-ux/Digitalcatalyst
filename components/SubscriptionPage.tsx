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
  const accentLines = ['from-yellow-300 to-yellow-100', 'from-cyan-300 to-cyan-100', 'from-pink-300 to-pink-100'];
  const [couponInputs, setCouponInputs] = React.useState<Record<string, string>>({});
  const [appliedCouponCodes, setAppliedCouponCodes] = React.useState<Record<string, string>>({});
  const [couponErrors, setCouponErrors] = React.useState<Record<string, string>>({});

  const calculateCouponDiscount = React.useCallback((coupon: Coupon, price: number) => {
    if (coupon.type === 'fixed') return Math.min(coupon.value, price);
    return Math.min(price, (price * coupon.value) / 100);
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

    if (coupon.timesUsed >= coupon.usageLimit) return 'Coupon usage limit reached.';
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

    const coupon = coupons.find(item => item.code.toUpperCase() === normalizedCode);
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

  const handleRemoveCoupon = React.useCallback((planId: string) => {
    setAppliedCouponCodes(prev => {
      const next = { ...prev };
      delete next[planId];
      return next;
    });
    setCouponErrors(prev => ({ ...prev, [planId]: '' }));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eaf3fb] pb-32 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.96)_0%,rgba(235,246,252,0.86)_24%,rgba(219,236,248,0.86)_54%,rgba(232,242,251,0.95)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-cyan-100/50 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <button onClick={onBack} className="w-fit rounded-full border border-white/80 bg-white/55 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_35px_rgba(116,153,176,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/80">
          ← Back
        </button>

        <section className="flex flex-1 flex-col items-center justify-center py-10">
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-[0.32em] text-slate-500">Premium learning access</p>
            <h1 className="mt-3 text-3xl font-light tracking-wide text-slate-900 sm:text-4xl">Pricing table example</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
              Choose your trusted subscription plan and unlock premium notes, courses, and resources in one clean learning space.
            </p>
          </div>

          <div className="mt-10 grid w-full max-w-4xl gap-8 md:grid-cols-3 md:gap-10">
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
              const appliedCoupon = appliedCouponCode ? coupons.find(coupon => coupon.code.toUpperCase() === appliedCouponCode.toUpperCase()) : undefined;
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
                <article key={plan.id} className={`group relative flex min-h-[25rem] flex-col rounded-[2.2rem] border border-white/80 bg-[#edf7fb]/80 px-5 pb-6 pt-5 text-center shadow-[18px_22px_42px_rgba(118,157,180,0.22),-12px_-14px_28px_rgba(255,255,255,0.88)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 ${isHighlighted ? 'scale-[1.03]' : ''}`}>
                  {isHighlighted && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-400 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(168,85,247,0.22)]">{plan.badge || 'Best Value'}</span>}
                  
                  <h2 className="text-base font-medium text-slate-700">{plan.name}</h2>
                  <div className={`mx-auto mt-2 h-px w-full bg-gradient-to-r from-transparent ${accentLines[index % accentLines.length]} to-transparent`} />

                  <div className="mt-4 flex items-start justify-center text-slate-950">
                    <span className="mt-2 text-2xl font-light">₹</span>
                    <span className="text-5xl font-light leading-none tracking-tight">{finalPlanPrice.toFixed(0)}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-500">Price Example</p>
                  
                  {}
                  {(activeDiscount || validAppliedCoupon) && (
                    <div className="mx-auto mt-3 w-full rounded-2xl border border-emerald-100 bg-white/55 p-3 text-xs font-semibold text-emerald-700">
                      <div className="flex justify-between"><span>Subtotal</span><span>₹{planPrice}</span></div>
                      {validAppliedCoupon && <div className="flex justify-between"><span>Coupon ({validAppliedCoupon.code})</span><span>-₹{couponDiscount.toFixed(2)}</span></div>}
                      {activeDiscount && <div className="flex justify-between"><span>EduCoin Discount</span><span>-₹{eduCoinDiscount}</span></div>}
                      <div className="mt-1 flex justify-between font-black"><span>Final Price</span><span>₹{finalPlanPrice.toFixed(2)}</span></div>
                    </div>
                  )}
                  
                  <p className="mx-auto mt-4 min-h-10 max-w-[12rem] text-[11px] leading-5 text-slate-400">{plan.description}</p>

                  <div className="mt-4 rounded-3xl border border-white/75 bg-white/45 p-3 text-left shadow-inner">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Have a coupon?</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={couponInputs[planId] || ''}
                        onChange={event => setCouponInputs(prev => ({ ...prev, [planId]: event.target.value.toUpperCase() }))}
                        placeholder="Coupon code"
                        disabled={allUnlocked}
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-bold outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                        aria-label={`Coupon code for ${plan.name}`}
                      />
                      <button
                        type="button"
                        disabled={allUnlocked}
                        onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')}
                        className={`rounded-2xl px-3 py-2 text-xs font-black transition active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${validAppliedCoupon ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-slate-950 text-white hover:-translate-y-0.5'}`}
                      >
                        {validAppliedCoupon ? 'Remove' : 'Apply'}
                      </button>
                    </div>
                    {(couponErrors[planId] || appliedCouponError) && <p className="mt-2 text-xs font-bold text-rose-500">{couponErrors[planId] || appliedCouponError}</p>}
                    {validAppliedCoupon && <p className="mt-2 text-xs font-black text-emerald-600">{validAppliedCoupon.code} applied. You saved ₹{couponDiscount.toFixed(2)}.</p>}
                  </div>

                  <ul className="mx-auto mt-4 flex-1 space-y-2 text-left text-[11px] leading-4 text-slate-500">
                    {unlockedProducts.length ? unlockedProducts.slice(0, 5).map((title, productIndex) => (
                      <li key={title} className="flex items-start gap-2">
                        <span className={productIndex === 3 ? 'text-rose-400' : 'text-emerald-400'}>{productIndex === 3 ? '×' : '✓'}</span>
                        <span>{title}</span>
                      </li>
                    )) : <li className="text-slate-400">No products selected yet.</li>}
                  </ul>

                  {}
                  <div className="mt-5 space-y-2">
                    <button disabled={allUnlocked} onClick={handlePlanCheckout} className={`mx-auto block rounded-full px-7 py-2.5 text-[11px] font-bold text-white shadow-[0_10px_20px_rgba(168,85,247,0.24)] transition active:scale-95 ${allUnlocked ? 'cursor-not-allowed bg-slate-300' : 'bg-violet-400 hover:-translate-y-0.5 hover:bg-violet-500'}`}>
                      {allUnlocked ? 'Already Active' : validAppliedCoupon || activeDiscount ? 'Apply & Activate' : 'Get this plan'}
                    </button>
                    
                    {coinPrice > 0 && (
                      <button disabled={allUnlocked || !canPayWithCoins} onClick={() => onActivatePlanWithCoins?.(plan)} className="mx-auto block rounded-full border border-amber-100 bg-white/65 px-5 py-2 text-[11px] font-bold text-amber-600 shadow-sm transition hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
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