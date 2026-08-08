export type SubscriptionTier = 'normal' | 'pro' | 'elite';
export type PremiumSubscriptionTier = Exclude<SubscriptionTier, 'normal'>;
export type SubscriptionBillingCycle = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const SUBSCRIPTION_BILLING_CYCLES: SubscriptionBillingCycle[] = ['once', 'weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Build-your-bundle feature model. A user buys exactly the features they
 * select and the cart price updates instantly from the chosen set. Every
 * feature is unlockable on its own, addable later during an upgrade, and
 * locked again as soon as the subscription expires.
 */
export type SubscriptionFeatureKey = 'aiMentor' | 'community' | 'educoins' | 'coinDiscounts' | 'mayday' | 'contentAccess';

export interface SubscriptionFeature {
  key: SubscriptionFeatureKey;
  name: string;
  icon: string;
  description: string;
  monthlyPrice: number;
  badge?: string;
}

export const ALL_SUBSCRIPTION_FEATURE_KEYS: SubscriptionFeatureKey[] = [
  'aiMentor',
  'community',
  'educoins',
  'coinDiscounts',
  'mayday',
  'contentAccess',
];

export const SUBSCRIPTION_FEATURES: SubscriptionFeature[] = [
  {
    key: 'aiMentor',
    name: 'AI Mentor',
    icon: '🧠',
    monthlyPrice: 149,
    badge: 'Best for doubts',
    description: 'Real-time AI study partner inside every course and the community. Ask doubts, get lesson summaries, and prepare better while you study.',
  },
  {
    key: 'community',
    name: 'Learning Community',
    icon: '💬',
    monthlyPrice: 99,
    description: 'Join serious learners. Share progress, ask questions, follow creators, and stay motivated in a focused study space.',
  },
  {
    key: 'educoins',
    name: 'EduCoins & Rewards',
    icon: '🪙',
    monthlyPrice: 99,
    badge: 'Study & earn',
    description: 'Earn EduCoins for every serious study action, unlock streaks, badges, milestone rewards, and grow your learning wallet.',
  },
  {
    key: 'coinDiscounts',
    name: 'EduCoin Discounts',
    icon: '🏷️',
    monthlyPrice: 49,
    description: 'Spend your EduCoins to get discounts on paid products, modules, and your subscription itself.',
  },
  {
    key: 'mayday',
    name: 'MyDay Pro',
    icon: '🚨',
    monthlyPrice: 49,
    description: 'Premium planner: weekly streaks, milestone tracking, and deeper progress insights inside MyDay.',
  },
  {
    key: 'contentAccess',
    name: 'Premium Content',
    icon: '📚',
    monthlyPrice: 129,
    badge: 'Courses unlocked',
    description: 'Unlock selected premium products and courses that are bundled with your subscription.',
  },
];

export const SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY = 499;

export const getSubscriptionFeature = (key: SubscriptionFeatureKey): SubscriptionFeature =>
  SUBSCRIPTION_FEATURES.find(feature => feature.key === key) || SUBSCRIPTION_FEATURES[0];

export const isSubscriptionFeatureKey = (value: unknown): value is SubscriptionFeatureKey =>
  typeof value === 'string' && (ALL_SUBSCRIPTION_FEATURE_KEYS as string[]).includes(value);

/**
 * Derive the price of a monthly amount for any billing cycle.
 * Weekly ≈ a quarter of a month, Yearly ≈ 40% off the monthly rate,
 * One-time ≈ lifetime access at a fixed premium.
 */
export const getSubscriptionCyclePrice = (monthly: number, billingCycle: SubscriptionBillingCycle): number => {
  const safeMonthly = Math.max(0, Number(monthly) || 0);
  switch (billingCycle) {
    case 'weekly': return Math.max(1, Math.round(safeMonthly * 0.26));
    case 'quarterly': return Math.max(1, Math.round(safeMonthly * 3));
    case 'yearly': return Math.max(1, Math.round(safeMonthly * 12 * 0.6));
    case 'once': return Math.max(1, Math.round(safeMonthly * 12 * 1.3));
    default: return safeMonthly;
  }
};

export const getSubscriptionFeaturePrice = (feature: SubscriptionFeature, billingCycle: SubscriptionBillingCycle): number =>
  getSubscriptionCyclePrice(Math.max(0, Number(feature.monthlyPrice) || 0), billingCycle);

export const getSubscriptionCycleSavingsPercent = (billingCycle: SubscriptionBillingCycle): number => {
  const monthly = 1;
  const cycle = getSubscriptionCyclePrice(monthly, billingCycle);
  if (billingCycle === 'once' || billingCycle === 'monthly') return 0;
  return Math.round((1 - cycle / (monthly * getPeriodCountForCycle(billingCycle))) * 100);
};

const getPeriodCountForCycle = (billingCycle: SubscriptionBillingCycle): number => {
  switch (billingCycle) {
    case 'weekly': return 4.33;
    case 'quarterly': return 3;
    case 'yearly': return 12;
    default: return 1;
  }
};

/**
 * Total monthly amount for a set of chosen features. When every feature is
 * selected the cheaper full-bundle price applies automatically.
 */
export const getFeatureBundleMonthlyTotal = (featureKeys: SubscriptionFeatureKey[], bundleMonthly = SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY): number => {
  const allSelected = ALL_SUBSCRIPTION_FEATURE_KEYS.every(key => featureKeys.includes(key));
  if (allSelected) return Math.max(0, Number(bundleMonthly) || SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY);
  return SUBSCRIPTION_FEATURES
    .filter(feature => featureKeys.includes(feature.key))
    .reduce((sum, feature) => sum + Math.max(0, Number(feature.monthlyPrice) || 0), 0);
};

export const getFeatureBundleCycleTotal = (featureKeys: SubscriptionFeatureKey[], billingCycle: SubscriptionBillingCycle, bundleMonthly?: number): number =>
  getSubscriptionCyclePrice(getFeatureBundleMonthlyTotal(featureKeys, bundleMonthly), billingCycle);

/**
 * Features the user currently owns. An active full membership without an
 * explicit feature list (legacy accounts) is treated as owning everything.
 * An expired subscription returns an empty list so all features lock.
 */
export const getSubscriptionFeatureKeys = (user: unknown): SubscriptionFeatureKey[] => {
  const record = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;
  if (getUserSubscriptionTier(record) === 'normal') return [];
  const stored = Array.isArray(record.subscriptionFeatures)
    ? (record.subscriptionFeatures as unknown[]).filter(isSubscriptionFeatureKey)
    : [];
  if (stored.length > 0) return stored;
  return [...ALL_SUBSCRIPTION_FEATURE_KEYS];
};

export const hasSubscriptionFeature = (user: unknown, key: SubscriptionFeatureKey): boolean => {
  if (getUserSubscriptionTier(user) === 'normal') return false;
  return getSubscriptionFeatureKeys(user).includes(key);
};

export const isSubscriptionActive = (user: unknown): boolean => getUserSubscriptionTier(user) !== 'normal';

export const canEarnEduCoins = (user: unknown): boolean => hasSubscriptionFeature(user, 'educoins');

export const canSpendEduCoins = (user: unknown): boolean =>
  hasSubscriptionFeature(user, 'educoins') || hasSubscriptionFeature(user, 'coinDiscounts');

export interface MembershipMessage {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
}

export interface SubscriptionPageContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  monthlyLabel: string;
  yearlyLabel: string;
  yearlyBadge: string;
  aiMentorLocked: MembershipMessage;
  communityLocked: MembershipMessage;
  profileUpgrade: MembershipMessage;
  cardImages: string[];
  valueTitle: string;
  valueDescription: string;
  renewalNote: string;
}

export const DEFAULT_SUBSCRIPTION_CARD_IMAGES: string[] = [
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=720&q=80',
];

export interface SubscriptionPlanConfig {
  id: string;
  name: string;
  accessTier: PremiumSubscriptionTier;
  /**
   * Legacy/current checkout price. Kept for old Firestore settings and existing admin saves.
   * New UI treats this as the monthly price fallback.
   */
  price: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
  weeklyPrice?: number;
  quarterlyPrice?: number;
  oncePrice?: number;
  coinPrice?: number;
  description: string;
  audienceLabel: string;
  benefits: string[];
  unlockProductIds: number[];
  badge?: string;
  ctaLabel: string;
  earningMultiplier: number;
  featured?: boolean;
}

export const DEFAULT_AI_MENTOR_LOCKED_MESSAGE: MembershipMessage = {
  eyebrow: 'Premium study support',
  title: 'Unlock AI Mentor with Eduvora Plus+',
  description: `AI Mentor is your personal study partner inside the course player.

Ask doubts, get lesson summaries, create quick revision notes, understand difficult topics, and prepare better with smart guidance while you study.

This feature is available for Eduvora Plus+ members because it is designed to help serious students learn faster, stay consistent, and never feel stuck while studying.

Upgrade to Eduvora Plus+ to start learning with AI Mentor.`,
  ctaLabel: 'Upgrade to Eduvora Plus+',
};

export const DEFAULT_COMMUNITY_LOCKED_MESSAGE: MembershipMessage = {
  eyebrow: 'Focused learning space',
  title: 'Unlock Learning Community with Eduvora Plus+',
  description: `Community is not just a chat page. It is a focused learning space for serious students.

Inside the community, you can connect with other learners, share progress, ask questions, follow creators, discuss course topics, and stay motivated through a positive study environment.

This space is available for Eduvora Plus+ members so the community stays valuable, focused, and helpful for students who are serious about growth.

Upgrade to Eduvora Plus+ to join the learning community.`,
  ctaLabel: 'Upgrade to Eduvora Plus+',
};

export const DEFAULT_PROFILE_UPGRADE_MESSAGE: MembershipMessage = {
  eyebrow: 'Learning rewards',
  title: 'Start earning EduCoins with Eduvora Plus+',
  description: `Your learning deserves rewards.

With Eduvora Plus+, every serious study action can help you earn EduCoins. Watch lessons, read notes, complete quizzes, finish modules, and build your learning progress.

You can use EduCoins to get discounts, unlock paid modules, and continue your study journey with more confidence.

EduCoin is designed to help students stay motivated. It turns learning into progress, progress into rewards, and consistency into real benefits.

Upgrade to Eduvora Plus+ and start building your learning wallet.`,
  ctaLabel: 'Upgrade to Eduvora Plus+',
};

export const DEFAULT_SUBSCRIPTION_PAGE_CONTENT: SubscriptionPageContent = {
  eyebrow: 'Premium learning access',
  title: 'Eduvora Plus+ · Sab Kuch, Ek Saath',
  subtitle: 'AI Mentor, Community, EduCoins, Streaks, Rewards aur MyDay — ek hi subscription mein. Padho pyaar se, results apne aap aayenge.',
  monthlyLabel: 'Monthly',
  yearlyLabel: 'Yearly',
  yearlyBadge: 'Save',
  aiMentorLocked: DEFAULT_AI_MENTOR_LOCKED_MESSAGE,
  communityLocked: DEFAULT_COMMUNITY_LOCKED_MESSAGE,
  profileUpgrade: DEFAULT_PROFILE_UPGRADE_MESSAGE,
  cardImages: [...DEFAULT_SUBSCRIPTION_CARD_IMAGES],
  valueTitle: 'Sirf ek subscription, lekin itna sab kuch',
  valueDescription: 'Eduvora Plus+ sirf ek membership nahi — yeh aapka apna study partner hai. Har feature isliye bana hai taaki aap bina atke, bina bore hue, roz aage badho.',
  renewalNote: 'Auto-renew on karo toh subscription apne aap renew hoti hai — bilkul transparent. Cancel anytime, koi tension nahi.',
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [
  {
    id: 'eduvora-plus',
    name: 'Eduvora Plus+',
    accessTier: 'elite',
    price: 499,
    monthlyPrice: 499,
    weeklyPrice: 149,
    quarterlyPrice: 1199,
    yearlyPrice: 2999,
    oncePrice: 5999,
    coinPrice: 1500,
    description: 'Har serious learner ke liye. AI Mentor, Community, EduCoins, Streaks, Rewards aur MyDay — sab kuch ek hi plan mein.',
    audienceLabel: 'Har serious learner ke liye',
    benefits: [
      'Real-time AI Mentor inside course player — har doubt ka turant jawab',
      'AI Mentor inside Community — better discussions aur better learning',
      'EduCoins har serious study action par',
      'Streaks, badges aur rewards — roz padho, roz jeeto',
      'EduCoins se discounts pao paid modules par',
      'MyDay feature — emergency mein instant study support',
      'Full Community access — serious learners ka apna ghar',
      'Selected premium courses/content unlock',
    ],
    unlockProductIds: [2],
    badge: 'Sabse Popular',
    ctaLabel: 'Activate Eduvora Plus+',
    earningMultiplier: 2,
    featured: true,
  },
];

const cleanText = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const clampMultiplier = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(5, Math.max(1, Math.round(parsed * 100) / 100));
};

export const normalizeSubscriptionTier = (value: unknown): SubscriptionTier => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'elite') return 'elite';
  if (normalized === 'pro' || normalized === 'premium') return 'pro';
  return 'normal';
};

export const inferPremiumTier = (plan: Partial<SubscriptionPlanConfig> | Record<string, unknown>): PremiumSubscriptionTier => {
  const explicit = normalizeSubscriptionTier((plan as any)?.accessTier);
  if (explicit === 'elite') return 'elite';
  if (explicit === 'pro') return 'pro';

  const identity = `${String((plan as any)?.id || '')} ${String((plan as any)?.name || '')}`.toLowerCase();
  return identity.includes('elite') ? 'elite' : 'pro';
};

export const normalizeSubscriptionBillingCycle = (value: unknown): SubscriptionBillingCycle => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'once' || normalized === 'one-time' || normalized === 'onetime' || normalized === 'lifetime') return 'once';
  if (normalized === 'weekly' || normalized === 'week') return 'weekly';
  if (normalized === 'quarterly' || normalized === 'quarter') return 'quarterly';
  if (normalized === 'yearly' || normalized === 'annual' || normalized === 'annually' || normalized === 'year') return 'yearly';
  return 'monthly';
};

export const getSubscriptionBillingCycleName = (billingCycle: SubscriptionBillingCycle): string => {
  switch (billingCycle) {
    case 'once': return 'One-time';
    case 'weekly': return 'Weekly';
    case 'quarterly': return 'Quarterly';
    case 'yearly': return 'Yearly';
    default: return 'Monthly';
  }
};

export const getSubscriptionBillingLabel = (billingCycle: SubscriptionBillingCycle): string => {
  switch (billingCycle) {
    case 'once': return 'one-time';
    case 'weekly': return 'week';
    case 'quarterly': return 'quarter';
    case 'yearly': return 'year';
    default: return 'month';
  }
};

export const getSubscriptionPeriodMonths = (billingCycle: SubscriptionBillingCycle): number => {
  switch (billingCycle) {
    case 'once': return 0;
    case 'weekly': return 0.25;
    case 'quarterly': return 3;
    case 'yearly': return 12;
    default: return 1;
  }
};

export const getSubscriptionExpiryDate = (activatedAt: Date, billingCycle: SubscriptionBillingCycle): string => {
  const next = new Date(activatedAt);
  switch (billingCycle) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      return next.toISOString();
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      return next.toISOString();
    case 'yearly':
      next.setMonth(next.getMonth() + 12);
      return next.toISOString();
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      return next.toISOString();
    case 'once':
    default:
      return '';
  }
};

export const getSubscriptionBillingPrice = (plan: Partial<SubscriptionPlanConfig> | Record<string, unknown>, billingCycle: SubscriptionBillingCycle): number => {
  const record = (plan && typeof plan === 'object' ? plan : {}) as Record<string, unknown>;
  const legacyPrice = Math.max(0, Number(record.price) || 0);
  const monthlyPrice = Math.max(0, Number(record.monthlyPrice ?? record.price) || legacyPrice);
  const weeklyPrice = Math.max(0, Number(record.weeklyPrice) || Math.round(monthlyPrice / 4));
  const quarterlyPrice = Math.max(0, Number(record.quarterlyPrice) || (monthlyPrice * 3));
  const yearlyPrice = Math.max(0, Number(record.yearlyPrice) || (monthlyPrice * 12));
  const oncePrice = Math.max(0, Number(record.oncePrice) || Math.round(yearlyPrice * 1.5));

  switch (billingCycle) {
    case 'once': return oncePrice;
    case 'weekly': return weeklyPrice;
    case 'quarterly': return quarterlyPrice;
    case 'yearly': return yearlyPrice;
    default: return monthlyPrice;
  }
};

export const getSubscriptionExpiryTime = (profile: unknown): number => {
  const raw = (profile as Record<string, unknown> | null | undefined)?.subscriptionExpiresAt;
  const time = raw ? new Date(String(raw)).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

export const isSubscriptionExpired = (profile: unknown, now = Date.now()): boolean => {
  const tier = normalizeSubscriptionTier((profile as Record<string, unknown> | null | undefined)?.subscriptionTier);
  const expiry = getSubscriptionExpiryTime(profile);
  return tier !== 'normal' && expiry > 0 && expiry <= now;
};

export const getSubscriptionTierRank = (tier: SubscriptionTier): number => tier === 'elite' ? 2 : tier === 'pro' ? 1 : 0;

export const getHigherSubscriptionTier = (current: SubscriptionTier, requested: SubscriptionTier): SubscriptionTier => (
  getSubscriptionTierRank(requested) > getSubscriptionTierRank(current) ? requested : current
);

const toUserRecord = (user: unknown): Record<string, unknown> => (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;

export const getUserSubscriptionTier = (user: unknown): SubscriptionTier => {
  if (isSubscriptionExpired(user)) return 'normal';
  const record = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;
  const candidates = [record.subscriptionTier, record.membershipTier, record.planTier, record.subscriptionPlanId, record.subscriptionPlanName];
  for (const candidate of candidates) {
    const tier = normalizeSubscriptionTier(candidate);
    if (tier !== 'normal') return tier;
  }
  const identity = candidates.map(candidate => String(candidate || '')).join(' ').toLowerCase();
  if (identity.includes('elite')) return 'elite';
  if (identity.includes('pro') || identity.includes('premium')) return 'pro';
  return 'normal';
};

export const hasPremiumMembership = (user: unknown): boolean => getSubscriptionTierRank(getUserSubscriptionTier(user)) > 0;

export const getUserEduCoinMultiplier = (user: unknown): number => {
  const tier = getUserSubscriptionTier(user);
  if (tier === 'normal') return 0;
  if (!hasSubscriptionFeature(user, 'educoins')) return 0;
  const record = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;
  return clampMultiplier(record.eduCoinMultiplier, tier === 'elite' ? 2 : 1);
};

export const normalizeMembershipMessage = (value: unknown, fallback: MembershipMessage): MembershipMessage => {
  const record = (value && typeof value === 'object' ? value : {}) as Partial<MembershipMessage>;
  return {
    eyebrow: cleanText(record.eyebrow, fallback.eyebrow),
    title: cleanText(record.title, fallback.title),
    description: cleanText(record.description, fallback.description),
    ctaLabel: cleanText(record.ctaLabel, fallback.ctaLabel),
  };
};

export const normalizeSubscriptionPageContent = (value: unknown): SubscriptionPageContent => {
  const record = (value && typeof value === 'object' ? value : {}) as Partial<SubscriptionPageContent>;
  const rawImages = Array.isArray(record.cardImages) ? record.cardImages.map(item => String(item || '').trim()).filter(Boolean) : [];
  const cardImages = (rawImages.length >= 1 ? rawImages : DEFAULT_SUBSCRIPTION_CARD_IMAGES).slice(0, 6);
  while (cardImages.length < 6) cardImages.push(DEFAULT_SUBSCRIPTION_CARD_IMAGES[cardImages.length % DEFAULT_SUBSCRIPTION_CARD_IMAGES.length]);
  return {
    eyebrow: cleanText(record.eyebrow, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.eyebrow),
    title: cleanText(record.title, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.title),
    subtitle: cleanText(record.subtitle, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.subtitle),
    monthlyLabel: cleanText(record.monthlyLabel, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.monthlyLabel),
    yearlyLabel: cleanText(record.yearlyLabel, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.yearlyLabel),
    yearlyBadge: cleanText(record.yearlyBadge, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.yearlyBadge),
    aiMentorLocked: normalizeMembershipMessage(record.aiMentorLocked, DEFAULT_AI_MENTOR_LOCKED_MESSAGE),
    communityLocked: normalizeMembershipMessage(record.communityLocked, DEFAULT_COMMUNITY_LOCKED_MESSAGE),
    profileUpgrade: normalizeMembershipMessage(record.profileUpgrade, DEFAULT_PROFILE_UPGRADE_MESSAGE),
    cardImages,
    valueTitle: cleanText(record.valueTitle, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.valueTitle),
    valueDescription: cleanText(record.valueDescription, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.valueDescription),
    renewalNote: cleanText(record.renewalNote, DEFAULT_SUBSCRIPTION_PAGE_CONTENT.renewalNote),
  };
};

export const normalizeSubscriptionPlans = (value: unknown): SubscriptionPlanConfig[] => {
  const source = Array.isArray(value) ? value : [];
  const ranked = source
    .filter(plan => plan && typeof plan === 'object')
    .map(plan => {
      const record = plan as Record<string, unknown>;
      const tier = normalizeSubscriptionTier(record.accessTier);
      return { record, tier };
    })
    .filter(item => item.tier !== 'normal')
    .sort((a, b) => getSubscriptionTierRank(b.tier) - getSubscriptionTierRank(a.tier));
  const best = ranked[0]?.record || null;
  const fallback = DEFAULT_SUBSCRIPTION_PLANS[0];
  const record = best || {};

  const accessTier: PremiumSubscriptionTier = best
    ? (normalizeSubscriptionTier(record.accessTier) === 'elite' ? 'elite' : 'pro')
    : 'elite';
  const fallbackTier: PremiumSubscriptionTier = accessTier === 'elite' ? 'elite' : 'pro';
  const tierFallback = DEFAULT_SUBSCRIPTION_PLANS.find(item => item.accessTier === fallbackTier) || fallback;

  const benefits = Array.isArray(record.benefits)
    ? record.benefits.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const mergedBenefits = [...new Set([...tierFallback.benefits, ...benefits])];

  const monthlyPrice = Math.max(0, Number(record.monthlyPrice ?? record.price ?? tierFallback.monthlyPrice ?? tierFallback.price) || 0);
  const weeklyPrice = Math.max(0, Number(record.weeklyPrice) || Math.round(monthlyPrice / 4) || Math.round((tierFallback.weeklyPrice || monthlyPrice / 4) || 0));
  const quarterlyPrice = Math.max(0, Number(record.quarterlyPrice) || (monthlyPrice * 3) || (tierFallback.quarterlyPrice || monthlyPrice * 3));
  const yearlyPrice = Math.max(0, Number(record.yearlyPrice) || (monthlyPrice * 12) || (tierFallback.yearlyPrice || monthlyPrice * 12));
  const oncePrice = Math.max(0, Number(record.oncePrice) || Math.round((yearlyPrice || tierFallback.oncePrice || monthlyPrice * 12) * 1.5));

  const unified: SubscriptionPlanConfig = {
    id: 'eduvora-plus',
    name: 'Eduvora Plus+',
    accessTier: 'elite',
    price: monthlyPrice,
    monthlyPrice,
    weeklyPrice,
    quarterlyPrice,
    yearlyPrice,
    oncePrice,
    coinPrice: Math.max(0, Number(record.coinPrice) || tierFallback.coinPrice || 0),
    description: cleanText(record.description, fallback.description),
    audienceLabel: cleanText(record.audienceLabel, fallback.audienceLabel),
    benefits: mergedBenefits,
    unlockProductIds: Array.isArray(record.unlockProductIds)
      ? record.unlockProductIds.map(item => Number(item)).filter(item => Number.isFinite(item) && item > 0)
      : [...(tierFallback.unlockProductIds || [])],
    badge: String(record.badge || fallback.badge || '').trim() || 'Sabse Popular',
    ctaLabel: cleanText(record.ctaLabel, fallback.ctaLabel),
    earningMultiplier: clampMultiplier(record.earningMultiplier, 2),
    featured: true,
  };

  return [unified];
};
