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

  const formatCouponBadge = React.useCallback((coupon: Coupon) => {
    const value = Math.max(0, Number(coupon.value) || 0);
    if (coupon.type === 'fixed') return `Coupon ₹${value} off`;
    return `Coupon ${value}% off`;
  }, []);

  const availableCoupon = React.useMemo(() => coupons.find(coupon => !getCouponError(coupon)), [coupons, getCouponError]);

  return (
    <div
      className="subscription-page-editorial-pricing relative min-h-screen overflow-x-hidden bg-[#FFFEF8] pb-24 font-mono text-[#111111]"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(17,17,17,0.13) 1px, transparent 0), linear-gradient(to right, rgba(17,17,17,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,17,17,0.045) 1px, transparent 1px)',
        backgroundSize: '22px 22px, 250px 100%, 100% 120px',
      }}
    >
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
        <button
          type="button"
          onClick={onBack}
          className="w-fit border border-[#181818] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#111111] shadow-none outline-none motion-safe:transition hover:-translate-y-0.5 hover:bg-[#F4F35B] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFEF8]"
        >
          ← Back
        </button>

        <section className="flex flex-1 flex-col items-center py-9 sm:py-12 lg:py-14">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#676767]">Premium learning access</p>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em] text-[#111111] sm:text-5xl">Choose Your Plan</h1>
            <p className="mx-auto mt-4 max-w-md text-[12px] leading-5 text-[#676767]">
              Select the perfect plan for your learning needs. Start free, upgrade when you are ready.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center border border-[#181818] bg-white text-[11px] font-black leading-none text-[#111111] sm:mt-7" aria-label="Billing preview toggle">
            <button
              type="button"
              aria-pressed={billingPreview === 'monthly'}
              onClick={() => setBillingPreview('monthly')}
              className={`h-9 min-w-24 border-r border-[#181818] px-5 outline-none motion-safe:transition focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-inset ${billingPreview === 'monthly' ? 'bg-[#F4F35B]' : 'bg-white hover:bg-[#FFFBC4]'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billingPreview === 'yearly'}
              onClick={() => setBillingPreview('yearly')}
              className={`flex h-9 min-w-24 items-center justify-center gap-1.5 px-5 outline-none motion-safe:transition focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-inset ${billingPreview === 'yearly' ? 'bg-[#F4F35B]' : 'bg-white hover:bg-[#FFFBC4]'}`}
            >
              <span>Yearly</span>
              <span className="border border-[#181818] bg-white px-1 py-0.5 text-[8px] leading-none">Save</span>
            </button>
          </div>

          <div className="mt-8 grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
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
              const planBadge = plan.badge || (isHighlighted ? 'Featured' : 'Plan');
              const couponBadgeText = validAppliedCoupon ? `${validAppliedCoupon.code} applied` : activeDiscount ? `EduCoin ₹${eduCoinDiscount} off` : availableCoupon ? formatCouponBadge(availableCoupon) : '';
              const couponBadgeTone = validAppliedCoupon || activeDiscount || availableCoupon;
              const priceLabel = finalPlanPrice <= 0 ? 'Free access' : 'One-time secure access';
              const includedCount = unlockedProducts.length;
              const planDetailLines = [
                includedCount > 0
                  ? `Unlocks ${includedCount} selected learning ${includedCount === 1 ? 'item' : 'items'} with this plan.`
                  : 'Admin can connect learning items to this plan anytime.',
                'Activated access is saved in your purchased learning library.',
                'Use the listed course/product access without buying each item separately.',
                coinPrice > 0
                  ? `EduCoin option available: activate with ${coinPrice} EduCoins when your balance is enough.`
                  : 'Standard checkout activation is available for this plan.',
                coupons.length > 0
                  ? (validAppliedCoupon ? `${validAppliedCoupon.code} coupon is applied before checkout.` : 'Valid coupon codes can be applied before checkout.')
                  : 'Clean one-time plan pricing is shown before checkout.',
              ];
              
              const handlePlanCheckout = () => {
                onActivatePlan(plan, validAppliedCoupon?.code || null);
              };

              return (
                <article
                  key={plan.id}
                  className={`subscription-plan-card group relative flex min-h-[620px] flex-col border bg-white px-5 pb-5 pt-7 text-left shadow-[8px_8px_0_rgba(17,17,17,0.06)] outline-none motion-safe:transition motion-safe:duration-200 hover:-translate-y-1 sm:px-6 ${isHighlighted ? 'border-2 border-[#181818] lg:-translate-y-2 lg:hover:-translate-y-3' : 'border-[#181818]'}`}
                >
                  {isHighlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 border border-[#181818] bg-[#F4F35B] px-4 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#111111]">
                      {plan.badge || 'Most Popular'}
                    </span>
                  )}

                  <div className="flex flex-wrap items-start gap-2">
                    <span className="border border-[#181818] bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#111111]">{planBadge}</span>
                    {couponBadgeText && (
                      <span className={`border border-[#181818] px-2 py-1 text-[10px] font-black uppercase tracking-[0.04em] text-[#111111] ${couponBadgeTone ? 'bg-[#F4F35B]' : 'bg-white'}`}>{couponBadgeText}</span>
                    )}
                  </div>

                  <div className="mt-8 text-center">
                    <h2 className="text-base font-black tracking-[0.04em] text-[#111111]">{plan.name}</h2>
                    <div className="mt-4 flex items-end justify-center gap-2 text-[#111111]">
                      {totalDiscount > 0 && <span className="mb-1 text-sm font-bold text-[#676767] line-through">₹{planPrice.toFixed(0)}</span>}
                      <span className="text-4xl font-black leading-none tracking-[-0.05em] sm:text-5xl">₹{finalPlanPrice.toFixed(0)}</span>
                    </div>
                    <p className="mt-2 text-[11px] font-bold lowercase tracking-[0.03em] text-[#676767]">{priceLabel}</p>
                  </div>

                  <p className="mx-auto mt-6 max-w-[15rem] text-center text-[12px] font-bold leading-5 text-[#676767]">{plan.description}</p>

                  {(activeDiscount || validAppliedCoupon) && (
                    <div className="mt-5 border border-[#181818] bg-[#FFFDF5] p-3 text-[11px] font-bold text-[#111111]">
                      <div className="flex justify-between gap-3"><span>Subtotal</span><span>₹{planPrice}</span></div>
                      {validAppliedCoupon && <div className="mt-1 flex justify-between gap-3"><span>Coupon ({validAppliedCoupon.code})</span><span>-₹{couponDiscount.toFixed(2)}</span></div>}
                      {activeDiscount && <div className="mt-1 flex justify-between gap-3"><span>EduCoin Discount</span><span>-₹{eduCoinDiscount}</span></div>}
                      <div className="mt-2 flex justify-between gap-3 border-t border-[#181818] pt-2 font-black"><span>Final Price</span><span>₹{finalPlanPrice.toFixed(2)}</span></div>
                    </div>
                  )}

                  <div className="mt-5 space-y-2.5">
                    <button
                      type="button"
                      disabled={allUnlocked}
                      onClick={handlePlanCheckout}
                      className={`block h-11 w-full border border-[#181818] px-4 text-center text-[12px] font-black uppercase tracking-[0.08em] text-[#111111] outline-none motion-safe:transition hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#9B9B94] disabled:bg-[#F2F2EE] disabled:text-[#676767] ${isHighlighted ? 'bg-[#F4F35B] hover:bg-[#111111] hover:text-white' : 'bg-white hover:bg-[#F4F35B]'}`}
                    >
                      {allUnlocked ? 'Plan active' : `Purchase ${plan.name} · ₹${finalPlanPrice.toFixed(0)}`}
                    </button>

                    {coinPrice > 0 && (
                      <button
                        type="button"
                        disabled={allUnlocked || !canPayWithCoins}
                        onClick={() => onActivatePlanWithCoins?.(plan)}
                        className="block h-10 w-full border border-[#181818] bg-white px-4 text-center text-[11px] font-black uppercase tracking-[0.06em] text-[#111111] outline-none motion-safe:transition hover:bg-[#F4F35B] active:translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#9B9B94] disabled:bg-[#F2F2EE] disabled:text-[#676767]"
                      >
                        {canPayWithCoins ? `Pay ${coinPrice} EduCoins` : `Need ${missingCoins} more coins`}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 border border-[#181818] bg-[#FFFDF5] p-3">
                    <label htmlFor={`coupon-${planId}`} className="text-[10px] font-black uppercase tracking-[0.12em] text-[#676767]">Coupon code</label>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input
                        id={`coupon-${planId}`}
                        type="text"
                        value={couponInputs[planId] || ''}
                        onChange={event => handleCouponInputChange(planId, event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter' && !validAppliedCoupon) handleApplyCoupon(planId, couponInputs[planId] || ''); }}
                        placeholder="Code"
                        disabled={allUnlocked}
                        className="h-10 w-full min-w-0 border border-[#181818] bg-white px-3 text-[12px] font-black uppercase tracking-[0.08em] text-[#111111] outline-none motion-safe:transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[#676767] focus:bg-[#FFFBC4] focus:ring-2 focus:ring-[#F4F35B] disabled:cursor-not-allowed disabled:border-[#9B9B94] disabled:bg-[#F2F2EE] disabled:text-[#676767]"
                      />
                      <button
                        type="button"
                        disabled={allUnlocked}
                        onClick={() => validAppliedCoupon ? handleRemoveCoupon(planId) : handleApplyCoupon(planId, couponInputs[planId] || '')}
                        className={`h-10 border border-[#181818] px-3 text-[11px] font-black uppercase tracking-[0.06em] outline-none motion-safe:transition active:translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#F4F35B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#9B9B94] disabled:bg-[#F2F2EE] disabled:text-[#676767] ${validAppliedCoupon ? 'bg-white text-[#B3261E] hover:bg-[#FFEDEA]' : 'bg-[#F4F35B] text-[#111111] hover:bg-[#111111] hover:text-white'}`}
                      >
                        {validAppliedCoupon ? 'Remove' : 'Apply'}
                      </button>
                    </div>
                    {(couponErrors[planId] || appliedCouponError) && <p className="mt-2 text-[11px] font-bold text-[#B3261E]">{couponErrors[planId] || appliedCouponError}</p>}
                    {validAppliedCoupon && <p className="mt-2 text-[11px] font-black text-[#146C2E]">{validAppliedCoupon.code} applied. You saved ₹{couponDiscount.toFixed(2)}.</p>}
                  </div>

                  <div className="mt-5 border-t border-[#181818] pt-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#676767]">Plan details:</p>
                    <ul className="mt-4 space-y-3 text-[12px] font-bold leading-5 text-[#111111]">
                      {planDetailLines.map((detail) => (
                        <li key={detail} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#181818] text-[9px] leading-none">✓</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-[#676767]">Included courses/products:</p>
                    <ul className="mt-4 space-y-3 text-[12px] font-bold leading-5 text-[#111111]">
                      {unlockedProducts.length ? unlockedProducts.map((title) => (
                        <li key={title} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#181818] text-[9px] leading-none">✓</span>
                          <span>{title}</span>
                        </li>
                      )) : (
                        <li className="text-[#676767]">No products selected yet.</li>
                      )}
                    </ul>
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
