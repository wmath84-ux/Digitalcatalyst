import { useMemo, useState } from "react";
import { ChevronLeft, HelpCircle } from "lucide-react";
import StackedCards from "./StackedCards";
import PlanOverview from "./PlanOverview";
import PromoCodeInput, { type PromoResult } from "./PromoCodeInput";
import CourseSelectTrigger from "./CourseSelectTrigger";
import CourseSelectModal from "./CourseSelectModal";
import FeatureSelectTrigger from "./FeatureSelectTrigger";
import FeatureSelectModal from "./FeatureSelectModal";
import PriceSummary from "./PriceSummary";
import SubscribeBar from "./SubscribeBar";
import SuccessOverlay from "./SuccessOverlay";
import HelpModal from "./HelpModal";
import { COURSES } from "../data/courses";
import { FEATURES } from "../data/features";
import { SHOWCASE_CARDS } from "../data/showcase";
import type { BillingCycle } from "../types";

const BASE_MONTHLY = 4.99;
const BASE_YEARLY = 29.99;

const COUPONS: Record<string, { percent: number; label: string }> = {
  WELCOME20: { percent: 20, label: "20% off your first payment" },
  SAVE10: { percent: 10, label: "10% off applied" },
  STUDENT15: { percent: 15, label: "15% student discount" },
};

const REFERRALS: Record<string, { flat: number; label: string }> = {
  FRIEND50: { flat: 5, label: "$5 credit from your friend" },
  REF2024: { flat: 5, label: "$5 referral credit" },
  TEAMUP: { flat: 3, label: "$3 referral credit" },
};

export default function SubscriptionPage() {
  // Billing
  const [cycle, setCycle] = useState<BillingCycle>("yearly");

  // Courses
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([
    "web-dev",
    "ui-ux",
  ]);
  const [isCourseModalOpen, setCourseModalOpen] = useState(false);

  // Features
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([
    "certificates",
  ]);
  const [isFeatureModalOpen, setFeatureModalOpen] = useState(false);

  // Help
  const [isHelpOpen, setHelpOpen] = useState(false);

  // Promo
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    label: string;
    amount: number;
  } | null>(null);
  const [referralApplied, setReferralApplied] = useState<{
    code: string;
    label: string;
    amount: number;
  } | null>(null);

  // Subscribe flow
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ---------- Derived data ----------
  const selectedCourses = useMemo(
    () => COURSES.filter((c) => selectedCourseIds.includes(c.id)),
    [selectedCourseIds]
  );

  const selectedFeatures = useMemo(
    () => FEATURES.filter((f) => selectedFeatureIds.includes(f.id)),
    [selectedFeatureIds]
  );

  const basePrice = cycle === "monthly" ? BASE_MONTHLY : BASE_YEARLY;

  const coursesTotal = useMemo(
    () => selectedCourses.reduce((s, c) => s + c.price, 0),
    [selectedCourses]
  );

  const featuresTotal = useMemo(
    () => selectedFeatures.reduce((s, f) => s + f.price, 0),
    [selectedFeatures]
  );

  const subtotal = basePrice + coursesTotal + featuresTotal;

  const couponDiscount = useMemo(() => {
    if (!couponApplied) return 0;
    return Number(((subtotal * couponApplied.amount) / 100).toFixed(2));
  }, [couponApplied, subtotal]);

  const afterCoupon = Math.max(subtotal - couponDiscount, 0);

  const referralDiscount = useMemo(() => {
    if (!referralApplied) return 0;
    return Math.min(referralApplied.amount, Math.max(afterCoupon - 0.5, 0));
  }, [referralApplied, afterCoupon]);

  const total = Math.max(afterCoupon - referralDiscount, 0.5);
  const hasDiscount = couponDiscount > 0 || referralDiscount > 0;

  // ---------- Handlers ----------
  const handleApplyCoupon = (rawCode: string): PromoResult => {
    const code = rawCode.trim().toUpperCase();
    if (REFERRALS[code]) {
      return {
        valid: false,
        message: "That looks like a referral code. Try the referral field.",
      };
    }
    const found = COUPONS[code];
    if (!found) {
      return { valid: false, message: "Invalid or expired coupon code." };
    }
    setCouponApplied({ code, label: found.label, amount: found.percent });
    return { valid: true, message: found.label };
  };

  const handleApplyReferral = (rawCode: string): PromoResult => {
    const code = rawCode.trim().toUpperCase();
    if (COUPONS[code]) {
      return {
        valid: false,
        message: "That looks like a coupon code. Try the coupon field.",
      };
    }
    const found = REFERRALS[code];
    if (!found) {
      return { valid: false, message: "This referral code isn't recognized." };
    }
    setReferralApplied({ code, label: found.label, amount: found.flat });
    return { valid: true, message: found.label };
  };

  const handleSubscribe = () => {
    setIsSubscribing(true);
    window.setTimeout(() => {
      setIsSubscribing(false);
      setShowSuccess(true);
    }, 1400);
  };

  // ---------- Render ----------
  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-gradient-to-b from-slate-50 to-slate-50/70 px-5 pb-2 pt-5 backdrop-blur-sm">
        <button
          onClick={() => {
            window.location.hash = "#/profile";
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-200 active:scale-90 transition-transform"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[15px] font-extrabold tracking-tight text-slate-900">
          Go Premium
        </h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-200 active:scale-90 transition-transform"
          aria-label="Help & FAQ"
        >
          <HelpCircle className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex-1 pb-4">
        <StackedCards cards={SHOWCASE_CARDS} />

        {/* Dynamic plan card */}
        <PlanOverview
          cycle={cycle}
          onChangeCycle={setCycle}
          basePriceMonthly={BASE_MONTHLY}
          basePriceYearly={BASE_YEARLY}
          selectedCourses={selectedCourses}
          selectedFeatures={selectedFeatures}
          coursesTotal={coursesTotal}
          featuresTotal={featuresTotal}
          finalPrice={total}
        />

        {/* Course selector trigger */}
        <CourseSelectTrigger
          courses={COURSES}
          selectedIds={selectedCourseIds}
          onOpen={() => setCourseModalOpen(true)}
        />

        {/* Feature selector trigger */}
        <FeatureSelectTrigger
          features={FEATURES}
          selectedIds={selectedFeatureIds}
          onOpen={() => setFeatureModalOpen(true)}
        />

        {/* Promo & referral section */}
        <div className="space-y-3 px-5 pt-5">
          <PromoCodeInput
            kind="coupon"
            label="Try WELCOME20, SAVE10 or STUDENT15"
            placeholder="Enter coupon code"
            appliedCode={couponApplied?.code ?? null}
            appliedMessage={couponApplied?.label ?? null}
            onApply={handleApplyCoupon}
            onRemove={() => setCouponApplied(null)}
          />
          <PromoCodeInput
            kind="referral"
            label="Try FRIEND50, REF2024 or TEAMUP"
            placeholder="Enter referral code"
            appliedCode={referralApplied?.code ?? null}
            appliedMessage={referralApplied?.label ?? null}
            onApply={handleApplyReferral}
            onRemove={() => setReferralApplied(null)}
          />
        </div>

        {/* Order summary */}
        <PriceSummary
          cycle={cycle}
          basePrice={basePrice}
          coursesTotal={coursesTotal}
          coursesCount={selectedCourseIds.length}
          featuresTotal={featuresTotal}
          featuresCount={selectedFeatureIds.length}
          couponDiscount={couponDiscount}
          couponCode={couponApplied?.code ?? null}
          referralDiscount={referralDiscount}
          referralCode={referralApplied?.code ?? null}
          total={total}
        />

        <p className="px-5 pt-5 text-center text-[11px] leading-relaxed text-slate-400">
          By subscribing you agree to the Terms of Service. Your subscription
          renews automatically{" "}
          {cycle === "monthly" ? "every month" : "every year"} until cancelled.
        </p>
      </div>

      {/* Sticky bottom bar */}
      <SubscribeBar
        total={total}
        originalTotal={subtotal}
        hasDiscount={hasDiscount}
        loading={isSubscribing}
        onSubscribe={handleSubscribe}
      />

      {/* Modals */}
      <CourseSelectModal
        open={isCourseModalOpen}
        courses={COURSES}
        selected={selectedCourseIds}
        onClose={() => setCourseModalOpen(false)}
        onChangeSelected={setSelectedCourseIds}
      />

      <FeatureSelectModal
        open={isFeatureModalOpen}
        features={FEATURES}
        selected={selectedFeatureIds}
        onClose={() => setFeatureModalOpen(false)}
        onChangeSelected={setSelectedFeatureIds}
      />

      <HelpModal open={isHelpOpen} onClose={() => setHelpOpen(false)} />

      <SuccessOverlay
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        total={total}
        cycle={cycle}
        courseCount={selectedCourseIds.length}
        featureCount={selectedFeatureIds.length}
      />
    </div>
  );
}
