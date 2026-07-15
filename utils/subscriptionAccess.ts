export type SubscriptionTier = 'normal' | 'pro' | 'elite';
export type PremiumSubscriptionTier = Exclude<SubscriptionTier, 'normal'>;
export type SubscriptionBillingCycle = 'monthly' | 'yearly';

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
}

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
  title: 'Unlock AI Mentor with Pro or Elite',
  description: `AI Mentor is your personal study partner inside the course player.

Ask doubts, get lesson summaries, create quick revision notes, understand difficult topics, and prepare better with smart guidance while you study.

This feature is available for Pro and Elite members because it is designed to help serious students learn faster, stay consistent, and never feel stuck while studying.

Upgrade to Pro or Elite to start learning with AI Mentor.`,
  ctaLabel: 'Upgrade to Pro or Elite',
};

export const DEFAULT_COMMUNITY_LOCKED_MESSAGE: MembershipMessage = {
  eyebrow: 'Focused learning space',
  title: 'Unlock Learning Community with Pro or Elite',
  description: `Community is not just a chat page. It is a focused learning space for serious students.

Inside the community, you can connect with other learners, share progress, ask questions, follow creators, discuss course topics, and stay motivated through a positive study environment.

This space is available for Pro and Elite members so the community stays valuable, focused, and helpful for students who are serious about growth.

Upgrade to Pro or Elite to join the learning community.`,
  ctaLabel: 'Upgrade to Pro or Elite',
};

export const DEFAULT_PROFILE_UPGRADE_MESSAGE: MembershipMessage = {
  eyebrow: 'Learning rewards',
  title: 'Start earning EduCoins with Pro or Elite',
  description: `Your learning deserves rewards.

With Pro or Elite, every serious study action can help you earn EduCoins. Watch lessons, read notes, complete quizzes, finish modules, and build your learning progress.

You can use EduCoins to get discounts, unlock paid modules, and continue your study journey with more confidence.

EduCoin is designed to help students stay motivated. It turns learning into progress, progress into rewards, and consistency into real benefits.

Upgrade to Pro or Elite and start building your learning wallet.`,
  ctaLabel: 'Upgrade to Pro or Elite',
};

export const DEFAULT_SUBSCRIPTION_PAGE_CONTENT: SubscriptionPageContent = {
  eyebrow: 'Premium learning access',
  title: 'Choose Your Learning Plan',
  subtitle: 'Unlock the support, motivation, and premium learning tools that match your goals.',
  monthlyLabel: 'Monthly',
  yearlyLabel: 'Yearly',
  yearlyBadge: 'Save',
  aiMentorLocked: DEFAULT_AI_MENTOR_LOCKED_MESSAGE,
  communityLocked: DEFAULT_COMMUNITY_LOCKED_MESSAGE,
  profileUpgrade: DEFAULT_PROFILE_UPGRADE_MESSAGE,
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [
  {
    id: 'pro',
    name: 'Pro Plan',
    accessTier: 'pro',
    price: 499,
    monthlyPrice: 499,
    yearlyPrice: 499 * 12,
    coinPrice: 1200,
    description: 'For serious learners who want guidance, community, rewards, and stronger consistency.',
    audienceLabel: 'For serious learners',
    benefits: [
      'AI Mentor access inside course player',
      'Learning Community access',
      'Earn EduCoins from real study activity',
      'Use EduCoins for discounts and paid module unlocks',
      'Badges, streaks, and milestones',
      'Selected premium course/content access',
      'Better motivation system for students',
    ],
    unlockProductIds: [2],
    badge: 'Most Popular',
    ctaLabel: 'Upgrade to Pro',
    earningMultiplier: 1,
    featured: true,
  },
  {
    id: 'elite',
    name: 'Elite Plan',
    accessTier: 'elite',
    price: 999,
    monthlyPrice: 999,
    yearlyPrice: 999 * 12,
    coinPrice: 2200,
    description: 'For students who want maximum support, higher earning power, and the strongest unlock benefits.',
    audienceLabel: 'For maximum learning power',
    benefits: [
      'Everything in Pro',
      'Higher EduCoin earning power',
      'More premium modules/content access',
      'Elite profile badge',
      'Stronger discount and unlock benefits',
      'Full motivation system with badges, streaks, milestones',
      'Best plan for students who want maximum support',
    ],
    unlockProductIds: [2],
    badge: 'Maximum Support',
    ctaLabel: 'Upgrade to Elite',
    earningMultiplier: 2,
    featured: false,
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
  return normalized === 'yearly' || normalized === 'annual' || normalized === 'annually' ? 'yearly' : 'monthly';
};

export const getSubscriptionBillingLabel = (billingCycle: SubscriptionBillingCycle): string => (
  billingCycle === 'yearly' ? 'year' : 'month'
);

export const getSubscriptionPeriodMonths = (billingCycle: SubscriptionBillingCycle): number => (
  billingCycle === 'yearly' ? 12 : 1
);

export const getSubscriptionBillingPrice = (plan: Partial<SubscriptionPlanConfig> | Record<string, unknown>, billingCycle: SubscriptionBillingCycle): number => {
  const record = (plan && typeof plan === 'object' ? plan : {}) as Record<string, unknown>;
  const legacyPrice = Math.max(0, Number(record.price) || 0);
  const monthlyPrice = Math.max(0, Number(record.monthlyPrice ?? record.price) || legacyPrice);
  const yearlyPrice = Math.max(0, Number(record.yearlyPrice) || (monthlyPrice * 12));
  return billingCycle === 'yearly' ? yearlyPrice : monthlyPrice;
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
  };
};

export const normalizeSubscriptionPlans = (value: unknown): SubscriptionPlanConfig[] => {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .filter(plan => plan && typeof plan === 'object')
    .map<SubscriptionPlanConfig | null>((plan, index) => {
      const record = plan as Record<string, unknown>;
      const accessTier = inferPremiumTier(record);
      const fallback = DEFAULT_SUBSCRIPTION_PLANS.find(item => item.accessTier === accessTier) || DEFAULT_SUBSCRIPTION_PLANS[index % DEFAULT_SUBSCRIPTION_PLANS.length];
      const legacyIdentity = `${String(record.id || '')} ${String(record.name || '')}`.toLowerCase();
      const isLegacyNormalPlan = normalizeSubscriptionTier(record.accessTier) === 'normal' && !legacyIdentity.includes('pro') && !legacyIdentity.includes('elite');
      if (isLegacyNormalPlan) return null;

      const benefits = Array.isArray(record.benefits)
        ? record.benefits.map(item => String(item || '').trim()).filter(Boolean)
        : fallback.benefits;
      const unlockProductIds = Array.isArray(record.unlockProductIds)
        ? record.unlockProductIds.map(item => Number(item)).filter(item => Number.isFinite(item) && item > 0)
        : fallback.unlockProductIds;
      const monthlyPrice = Math.max(0, Number(record.monthlyPrice ?? record.price ?? fallback.monthlyPrice ?? fallback.price) || 0);
      const yearlyPrice = Math.max(0, Number(record.yearlyPrice ?? fallback.yearlyPrice ?? (monthlyPrice * 12)) || 0);

      return {
        id: cleanText(record.id, accessTier),
        name: cleanText(record.name, fallback.name),
        accessTier,
        price: monthlyPrice,
        monthlyPrice,
        yearlyPrice,
        coinPrice: Math.max(0, Number(record.coinPrice) || 0),
        description: cleanText(record.description, fallback.description),
        audienceLabel: cleanText(record.audienceLabel, fallback.audienceLabel),
        benefits: benefits.length ? benefits : fallback.benefits,
        unlockProductIds,
        badge: String(record.badge || fallback.badge || '').trim(),
        ctaLabel: cleanText(record.ctaLabel, fallback.ctaLabel),
        earningMultiplier: clampMultiplier(record.earningMultiplier, accessTier === 'elite' ? 2 : 1),
        featured: record.featured === true || (record.featured !== false && accessTier === 'pro'),
      } satisfies SubscriptionPlanConfig;
    })
    .filter((plan): plan is SubscriptionPlanConfig => plan !== null);

  const byTier = new Map<PremiumSubscriptionTier, SubscriptionPlanConfig>();
  normalized.forEach(plan => byTier.set(plan.accessTier, plan));

  return DEFAULT_SUBSCRIPTION_PLANS.map(defaultPlan => byTier.get(defaultPlan.accessTier) || { ...defaultPlan, benefits: [...defaultPlan.benefits], unlockProductIds: [...defaultPlan.unlockProductIds] });
};
