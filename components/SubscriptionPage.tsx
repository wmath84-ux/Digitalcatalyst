import React from 'react';
import { ProductWithRating, WebsiteSettings, User } from '../App';
import {
  ALL_SUBSCRIPTION_FEATURE_KEYS,
  DEFAULT_SUBSCRIPTION_CARD_IMAGES,
  getFeatureBundleCycleTotal,
  getSubscriptionBillingPrice,
  getSubscriptionFeatureKeys,
  getSubscriptionFeaturePrice,
  getUserSubscriptionTier,
  normalizeSubscriptionPageContent,
  normalizeSubscriptionPlans,
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_FEATURES,
  SubscriptionBillingCycle,
  SubscriptionFeatureKey,
  SubscriptionPlanConfig,
} from '../utils/subscriptionAccess';

const CYCLE_LABELS: Record<SubscriptionBillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Annually',
  once: 'One-Time',
};

const CYCLE_ORDER: SubscriptionBillingCycle[] = SUBSCRIPTION_BILLING_CYCLES.filter(cycle => cycle !== 'quarterly');

const PERIOD_LABEL: Record<SubscriptionBillingCycle, string> = {
  once: 'one-time',
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

const Glyph: React.FC<{ type: string }> = ({ type }) => {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor' as const,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (type) {
    case 'aiMentor':
      return (
        <svg {...common}>
          <path d="M12 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          <path d="M12 21v-5.5a4.2 4.2 0 0 0-4.2-4.2H6.2A3.2 3.2 0 0 0 3 14.5V16" />
          <path d="M21 21v-1.8a4.2 4.2 0 0 0-4.2-4.2h-1.2" />
        </svg>
      );
    case 'community':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M2.5 19a6.5 6.5 0 0 1 13 0" />
          <circle cx="17.5" cy="9.2" r="2.4" />
          <path d="M15.6 13.6a4.8 4.8 0 0 1 5.9 4.6v.8" />
        </svg>
      );
    case 'educoins':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.4v9.2M14.9 9.5c-.6-1-1.7-1.5-2.9-1.5-1.6 0-2.8 1-2.8 2.3 0 2.8 5.7 1.4 5.7 4.2 0 1.2-1.2 2.3-2.9 2.3-1.2 0-2.3-.5-2.9-1.6" />
        </svg>
      );
    case 'coinDiscounts':
      return (
        <svg {...common}>
          <path d="M3 7.5a2 2 0 0 1 2-2h10l6 6v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5Z" />
          <path d="M15 5.5 9 18.5" />
          <circle cx="17.5" cy="13" r="0.7" fill="currentColor" />
        </svg>
      );
    case 'mayday':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="11.5" rx="2.5" />
          <path d="M8 8V6a4 4 0 0 1 8 0v2" />
          <circle cx="12" cy="13.8" r="0.7" fill="currentColor" />
        </svg>
      );
    case 'contentAccess':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m6 17 3.5-3.5 2.5 2.5 3-3 3.5 3.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
        </svg>
      );
  }
};

const PremiumSubscriptionPage: React.FC<{
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onBack: () => void;
  onActivatePlan: (plan: SubscriptionPlanConfig, billingCycle: SubscriptionBillingCycle, appliedCouponCode?: string | null, selectedFeatures?: SubscriptionFeatureKey[]) => void;
  currentUser?: User | null;
}> = ({ settings, onActivatePlan, currentUser }) => {
  const plans = normalizeSubscriptionPlans(settings.content.subscriptionPlans);
  const plan = plans[0];
  const pageContent = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const cardImages = pageContent.cardImages.length >= 6 ? pageContent.cardImages.slice(0, 6) : DEFAULT_SUBSCRIPTION_CARD_IMAGES;

  const currentTier = getUserSubscriptionTier(currentUser);
  const membershipActive = currentTier !== 'normal';
  const ownedFeatureKeys = membershipActive ? getSubscriptionFeatureKeys(currentUser) : [];

  const [billingCycle, setBillingCycle] = React.useState<SubscriptionBillingCycle>('monthly');
  const [selectedFeatures, setSelectedFeatures] = React.useState<SubscriptionFeatureKey[]>(
    membershipActive && ownedFeatureKeys.length > 0 ? [...ownedFeatureKeys] : [...ALL_SUBSCRIPTION_FEATURE_KEYS],
  );

  const [stack, setStack] = React.useState<number[]>(() => cardImages.map((_, index) => index));
  const [leavingIndex, setLeavingIndex] = React.useState<number | null>(null);
  const [leavingDirection, setLeavingDirection] = React.useState<-1 | 1>(-1);
  const animatingRef = React.useRef(false);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const mouseStartX = React.useRef<number | null>(null);
  const mouseStartY = React.useRef<number | null>(null);
  const ignoreClickUntil = React.useRef(0);

  const bundleMonthly = Math.max(0, getSubscriptionBillingPrice(plan, 'monthly'));
  const addableFeatures = selectedFeatures.filter(key => !ownedFeatureKeys.includes(key));
  const chargeableFeatures = membershipActive ? addableFeatures : selectedFeatures;
  const totalPrice = getFeatureBundleCycleTotal(chargeableFeatures, billingCycle, bundleMonthly);
  const canCheckout = chargeableFeatures.length > 0;

  const toggleFeature = (key: SubscriptionFeatureKey) => {
    if (membershipActive && ownedFeatureKeys.includes(key)) return;
    setSelectedFeatures(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]));
  };

  const handleCheckout = () => {
    if (!canCheckout) return;
    onActivatePlan(plan, billingCycle, null, chargeableFeatures);
  };

  const triggerSwipe = React.useCallback((direction: -1 | 1 = -1) => {
    if (animatingRef.current || cardImages.length < 2) return;
    animatingRef.current = true;
    const frontCard = stack[0];
    setLeavingIndex(frontCard);
    setLeavingDirection(direction);
    setStack(prev => {
      const next = [...prev];
      if (direction < 0) {
        const front = next.shift();
        if (front !== undefined) next.push(front);
      } else {
        const back = next.pop();
        if (back !== undefined) next.unshift(back);
      }
      return next;
    });
    window.setTimeout(() => {
      setLeavingIndex(null);
      animatingRef.current = false;
    }, 520);
  }, [cardImages.length, stack]);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null || startY == null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    const deltaY = (event.changedTouches[0]?.clientY ?? startY) - startY;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      ignoreClickUntil.current = Date.now() + 520;
      triggerSwipe(deltaX < 0 ? -1 : 1);
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    mouseStartX.current = event.clientX;
    mouseStartY.current = event.clientY;
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    const startX = mouseStartX.current;
    const startY = mouseStartY.current;
    mouseStartX.current = null;
    mouseStartY.current = null;
    if (startX == null || startY == null) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      ignoreClickUntil.current = Date.now() + 520;
      triggerSwipe(deltaX < 0 ? -1 : 1);
    }
  };

  const handleFrontClick = () => {
    if (Date.now() < ignoreClickUntil.current) return;
    triggerSwipe(-1);
  };

  const toggleIndex = Math.max(0, CYCLE_ORDER.findIndex(cycle => cycle === billingCycle));
  const toggleWidth = 'calc((100% - 14px) / 4)';
  const toggleLeft = `calc(7px + ${toggleIndex} * (100% - 14px) / 4)`;
  const periodLabel = PERIOD_LABEL[billingCycle];

  return (
    <div className="subscription-page-theme-adaptive premium-subscription-page">
      <div className="psp-root">
        <div className="psp-orb" style={{ width: 420, height: 420, top: -140, right: -120, background: 'rgba(23,105,255,0.34)' }} />
        <div className="psp-orb" style={{ width: 360, height: 360, top: 320, left: -160, background: 'rgba(124,58,237,0.28)' }} />
        <div className="psp-orb" style={{ width: 400, height: 400, bottom: 60, right: -140, background: 'rgba(34,211,238,0.22)' }} />

        <main className="relative z-10 mx-auto w-full max-w-[560px] px-5 pb-16 pt-10 sm:pt-14">
          <section aria-label="Billing cycle selector">
            <div className="psp-master-toggle">
              <span className="psp-toggle-highlight" style={{ width: toggleWidth, left: toggleLeft }} />
              {CYCLE_ORDER.map(cycle => (
                <button
                  key={cycle}
                  type="button"
                  aria-pressed={billingCycle === cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`psp-toggle-item ${billingCycle === cycle ? 'is-active' : ''}`}
                >
                  {CYCLE_LABELS[cycle]}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-12 text-center">
            <h1 className="psp-hero-title text-5xl sm:text-6xl">
              <span className="text-white">Eduvora</span> <span className="psp-plus-word">
                plus
                <span className="psp-plus-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </span>
            </h1>

            <div
              className="psp-card-stage mt-10"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
            >
              {cardImages.map((src, index) => {
                const pos = stack.indexOf(index);
                const depth = pos;
                const isFront = pos === 0;
                const isLeaving = leavingIndex === index;
                const zIndex = isLeaving ? 80 : 60 - depth;
                const transform = isLeaving ? undefined : `translateY(${-depth * 14}px) scale(${1 - depth * 0.06})`;
                const opacity = isLeaving ? undefined : depth === 0 ? 1 : Math.max(0.16, 1 - depth * 0.16);
                const filter = isLeaving ? undefined : depth === 0 ? 'none' : `blur(${depth * 1.1}px)`;
                return (
                  <div
                    key={index}
                    className={`psp-card ${isLeaving ? (leavingDirection < 0 ? 'is-leaving-left' : 'is-leaving-right') : ''}`}
                    style={{ transform, opacity, filter, zIndex, pointerEvents: isFront && leavingIndex === null ? 'auto' : 'none' }}
                    onClick={isFront && leavingIndex === null ? handleFrontClick : undefined}
                    aria-hidden={!isFront}
                  >
                    <img src={src} alt={`Eduvora Plus experience ${index + 1}`} draggable={false} loading={index === 0 ? 'eager' : 'lazy'} />
                  </div>
                );
              })}
            </div>

            <p className="psp-swipe-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 12h10M10 8l-4 4 4 4M14 8l4 4-4 4" />
              </svg>
              Swipe left or right to see the features
            </p>
          </section>

          <section className="mt-12" aria-label="Feature pricing">
            <div className="psp-glass-table">
              <div className="psp-table-header">
                <span>Features</span>
                <span className="psp-price-col">Price</span>
                <span className="psp-select-col">Selection</span>
              </div>
              {SUBSCRIPTION_FEATURES.map(feature => {
                const checked = selectedFeatures.includes(feature.key);
                const featurePrice = getSubscriptionFeaturePrice(feature, billingCycle);
                return (
                  <div key={feature.key} className={`psp-row ${checked ? '' : 'is-off'}`}>
                    <div className="psp-row-title">
                      <span className="psp-row-name">{feature.name}</span>
                      <span className="psp-row-desc">{feature.description}</span>
                    </div>
                    <div className={`psp-price ${checked ? '' : 'is-off'}`}>
                      ₹{featurePrice.toFixed(0)}
                      {!checked && <span className="psp-strike" />}
                      {!checked && <span className="psp-cross">✕</span>}
                    </div>
                    <button
                      type="button"
                      className={`psp-row-toggle ${checked ? '' : 'is-off'}`}
                      onClick={() => toggleFeature(feature.key)}
                      aria-pressed={checked}
                      aria-label={`Toggle ${feature.name}`}
                    />
                  </div>
                );
              })}
              <div className="psp-total-row">
                <span className="psp-total-label">Total Final Price</span>
                <span className="psp-total-price">₹{totalPrice.toFixed(0)}</span>
              </div>
            </div>
          </section>

          <section className="mt-8" aria-label="Checkout summary">
            <div className="psp-summary-card">
              <div className="psp-summary-head">
                <span className="psp-summary-name">Plus</span>
                <span className="psp-popular-badge">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
                    <path d="M12 2.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.4 6.6 19l1.2-6L3.3 8.8l6.1-.7L12 2.5Z" />
                  </svg>
                  POPULAR
                </span>
              </div>
              {membershipActive && (
                <div className="psp-owned-stamp left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="psp-owned-seal border-double border-red-900 from-red-950 via-red-700 to-red-950">Subscription purchased and active</span>
                </div>
              )}
              <div className="psp-summary-price">₹{totalPrice.toFixed(0)}</div>
              <div className="psp-summary-period">INR / {periodLabel} (inclusive of GST)</div>
              <div className="psp-summary-subtitle">Unlock the full experience</div>
              <button type="button" className="psp-cta" disabled={!canCheckout} onClick={handleCheckout}>
                Upgrade to Plus
              </button>
              <div className="psp-feature-list">
                {SUBSCRIPTION_FEATURES.filter(feature => selectedFeatures.includes(feature.key)).map(feature => (
                  <div key={feature.key} className="psp-feature-row">
                    <span className="psp-feature-icon">
                      <Glyph type={feature.key} />
                    </span>
                    <span>{feature.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="mt-12">
            <div className="psp-trust">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="10.5" width="14" height="9" rx="2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <circle cx="12" cy="15" r="0.7" fill="currentColor" />
              </svg>
              <span>100% Secure &amp; Genuine</span>
              <span className="psp-separator">|</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.5l2.2 1.7 2.8-.2 1 2.6 2.4 1.4-.6 2.7 1.6 2.3-1.6 2.3.6 2.7-2.4 1.4-1 2.6-2.8-.2L12 21.5l-2.2-1.7-2.8.2-1-2.6-2.4-1.4.6-2.7L2.6 11l1.6-2.3-.6-2.7 2.4-1.4 1-2.6 2.8.2L12 2.5Z" />
                <path d="M8.5 12l2.3 2.3 4.7-4.7" />
              </svg>
              <span>Trusted by thousands of learners.</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default PremiumSubscriptionPage;
