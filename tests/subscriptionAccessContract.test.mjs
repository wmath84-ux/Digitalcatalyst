import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const subscriptionSource = readFileSync(new URL('../components/SubscriptionPage.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../components/admin/WebsiteSettings.tsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../components/ProfilePage.tsx', import.meta.url), 'utf8');
const courseSource = readFileSync(new URL('../components/CoursePlayer.tsx', import.meta.url), 'utf8');
const walletSource = readFileSync(new URL('../utils/coinWallet.ts', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../utils/subscriptionAccess.ts', import.meta.url), 'utf8');

const assertContainsAll = (source, values) => values.forEach(value => assert.ok(source.includes(value), `Missing contract text: ${value}`));

test('subscription access model keeps internal tiers and a single unified Eduvora Plus+ plan', () => {
  assert.match(accessSource, /export type SubscriptionTier = 'normal' \| 'pro' \| 'elite'/);
  assert.match(accessSource, /id: 'eduvora-plus'/);
  assert.match(accessSource, /name: 'Eduvora Plus\+'/);
  assert.match(accessSource, /accessTier: 'elite'/);
  assert.match(accessSource, /earningMultiplier: 2/);
  assert.match(accessSource, /monthlyPrice: 0/);
  assert.match(accessSource, /yearlyPrice: 0/);
  assert.match(accessSource, /DEFAULT_SUBSCRIPTION_CARD_IMAGES/);
  assert.match(accessSource, /return \[unified\]/);
});

test('locked messages preserve the approved student-facing copy', () => {
  assertContainsAll(accessSource, [
    'Unlock AI Mentor with Eduvora Plus+',
    'Upgrade to Eduvora Plus+ to start learning with AI Mentor.',
    'Unlock Learning Community with Eduvora Plus+',
    'Upgrade to Eduvora Plus+ to join the learning community.',
    'Start earning EduCoins with Eduvora Plus+',
    'Upgrade to Eduvora Plus+ and start building your learning wallet.',
  ]);
});

test('subscription activation persists tier and earning multiplier without downgrading', () => {
  assert.match(appSource, /const unlockSubscriptionPlan = \(plan: SubscriptionPlanConfig/);
  assert.match(appSource, /getHigherSubscriptionTier\(getUserSubscriptionTier\(currentUser\), requestedTier\)/);
  assert.match(appSource, /subscriptionTier: nextTier/);
  assert.match(appSource, /eduCoinMultiplier: nextMultiplier/);
  assert.match(appSource, /eliteStatus: nextTier === 'elite'/);
});

test('free trial system has been fully removed from the codebase', () => {
  assert.ok(!/FREE_TRIAL_DAYS/.test(appSource), 'App.tsx still references FREE_TRIAL_DAYS');
  assert.ok(!/handleStartFreeTrial/.test(appSource), 'App.tsx still defines handleStartFreeTrial');
  assert.ok(!/canStartFreeTrial/.test(accessSource), 'subscriptionAccess.ts still exports canStartFreeTrial');
  assert.ok(!/subscriptionTrialStartedAt/.test(appSource), 'App.tsx still writes subscriptionTrialStartedAt');
  assert.ok(!/subscriptionTrialUsed/.test(appSource), 'App.tsx still writes subscriptionTrialUsed');
  assert.ok(!/onStartFreeTrial/.test(subscriptionSource), 'SubscriptionPage still wires onStartFreeTrial');
  assert.ok(!/trialDays/.test(subscriptionSource), 'SubscriptionPage still references trialDays');
});

test('normal users receive Community and AI Mentor upgrade gates', () => {
  assert.match(appSource, /hasPremiumMembership\(effectiveAppUser\).*EduvoraCommunity/s);
  assert.match(appSource, /communityLocked/);
  assert.match(courseSource, /hasPremiumAccess \? \(/);
  assert.match(courseSource, /subscriptionPage\.aiMentorLocked/);
  assert.match(courseSource, /Upgrade to Pro or Elite to unlock paid modules with EduCoins/);
});

test('normal profile hides wallet gamification and renders the upgrade experience', () => {
  assert.match(profileSource, /if \(!hasPremiumAccess\) \{/);
  assert.match(profileSource, /MembershipUpgradeCard message=\{subscriptionPage\.profileUpgrade\}/);
  assert.match(profileSource, /Continue Your Courses/);
  assert.match(profileSource, /subscriptionTier === 'elite' \? 'Elite Member' : 'Pro Member'/);
});

test('all coin earning and spending helpers require the premium membership feature', () => {
  assert.match(walletSource, /if \(!hasPremiumMembership\(userData\)\)/);
  assert.match(walletSource, /reason: 'membership_required'/);
  assert.match(walletSource, /getUserEduCoinMultiplier\(userData\)/);
  assert.match(appSource, /if \(!currentUser \|\| amount <= 0 \|\| !canSpendEduCoins\(currentUser\)\) return false/);
  assert.match(appSource, /EduCoin purchases are available only with Pro or Elite membership/);
  assert.match(appSource, /Paid-module EduCoin unlocks are available only with Pro or Elite membership/);
});

test('Elite reward UI shows multiplied quiz earnings', () => {
  assert.match(courseSource, /eduCoinMultiplier: number/);
  assert.match(courseSource, /Math\.floor\(coins \* eduCoinMultiplier\)/);
  assert.match(courseSource, /getUserEduCoinMultiplier\(currentUser\)/);
});

test('admin has a dedicated subscription customizer for page copy, plans and locks', () => {
  assert.match(settingsSource, /'subscriptions'/);
  assert.match(settingsSource, /Eduvora Plus\+ Subscription Customizer/);
  assert.match(settingsSource, /Page Header & Billing Labels/);
  assert.match(settingsSource, /Weekly Price \(₹\)/);
  assert.match(settingsSource, /Monthly Price \(₹\)/);
  assert.match(settingsSource, /Quarterly Price \(₹\)/);
  assert.match(settingsSource, /Yearly Price \(₹\)/);
  assert.match(settingsSource, /One-time Price \(₹\)/);
  assert.match(settingsSource, /Earning Multiplier/);
  assert.match(settingsSource, /Selected premium products\/content/);
  assert.match(settingsSource, /AI Mentor Locked Message/);
  assert.match(settingsSource, /Community Locked Message/);
  assert.match(settingsSource, /Normal User Profile Message/);
  assert.match(settingsSource, /Subscription Card Images/);
  assert.match(settingsSource, /Renewal Note/);
});

test('premium subscription page renders cards, modular pricing and checkout summary', () => {
  assert.match(subscriptionSource, /normalizeSubscriptionPlans\(settings\.content\.subscriptionPlans\)/);
  assert.match(subscriptionSource, /normalizeSubscriptionPageContent\(settings\.content\.subscriptionPage\)/);
  assert.match(subscriptionSource, /getSubscriptionBillingPrice\(plan, 'monthly'\)/);
  assert.match(subscriptionSource, /getFeatureBundleCycleTotal\(chargeableFeatures, billingCycle, bundleMonthly, subscriptionFeatures\)/);
  assert.match(subscriptionSource, /onActivatePlan\(plan, billingCycle, null, chargeableFeatures\)/);
  assert.match(subscriptionSource, /SUBSCRIPTION_BILLING_CYCLES/);
  assert.match(subscriptionSource, /CYCLE_ORDER/);
  assert.match(subscriptionSource, /DEFAULT_SUBSCRIPTION_CARD_IMAGES/);
  assert.match(subscriptionSource, /subscription-page-theme-adaptive premium-subscription-page/);
  assert.match(subscriptionSource, /psp-master-toggle/);
  assert.match(subscriptionSource, /psp-card-stage/);
  assert.match(subscriptionSource, /psp-glass-table/);
  assert.match(subscriptionSource, /psp-summary-card/);
  assert.match(subscriptionSource, /Total Final Price/);
  assert.match(subscriptionSource, /Upgrade to Plus/);
  assert.match(subscriptionSource, /One-Time/);
});

test('subscription billing cycle supports once, weekly, monthly, quarterly and yearly', () => {
  assert.match(accessSource, /export type SubscriptionBillingCycle = 'once' \| 'weekly' \| 'monthly' \| 'quarterly' \| 'yearly'/);
  assert.match(accessSource, /getSubscriptionPeriodMonths/);
  assert.match(accessSource, /getSubscriptionBillingPrice/);
  assert.match(accessSource, /const monthlyPrice = Math\.max\(0, Number\(record\.monthlyPrice/);
  assert.match(appSource, /subscriptionBillingCycle: nextTier === requestedTier \? billingCycle/);
  assert.match(appSource, /getSubscriptionExpiryDate/);
  assert.match(appSource, /subscriptionBillingCycle: billingCycle/);
  assert.match(appSource, /subscriptionPeriodMonths: getSubscriptionPeriodMonths\(billingCycle\)/);
});

test('premium page keeps feature selection across billing cycle changes', () => {
  assert.match(subscriptionSource, /aria-label="Billing cycle selector"/);
  assert.match(subscriptionSource, /setBillingCycle\(cycle\)/);
  assert.match(subscriptionSource, /toggleFeature\(feature\.key\)/);
  assert.match(subscriptionSource, /selectedFeatures\.filter\(key => !ownedFeatureKeys\.includes\(key\)\)/);
  assert.match(subscriptionSource, /getFeatureBundleCycleTotal/);
});

test('feature gating helpers power EduCoin earning and spending', () => {
  assert.match(accessSource, /export const canEarnEduCoins/);
  assert.match(accessSource, /export const canSpendEduCoins/);
  assert.match(accessSource, /export const hasSubscriptionFeature/);
  assert.match(accessSource, /SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY = 0/);
});

test('zero-priced subscriptions stay free: cycle price guards zero and no 499 fallback resurrects a price', () => {
  // cycle price must not floor a genuinely free plan up to 1 rupee
  assert.match(accessSource, /if \(safeMonthly <= 0\) return 0;/);
  // an explicit 0 bundle price must not fall back to the constant
  assert.match(accessSource, /Number\.isFinite\(Number\(bundleMonthly\)\) \? Math\.max\(0, Number\(bundleMonthly\)\)/);
  // no hardcoded 499 fallbacks remain anywhere in the checkout math
  assert.doesNotMatch(appSource, /\|\| 499/);
  assert.doesNotMatch(subscriptionSource, /\|\| 499/);
  // every subscription feature is explicitly free
  const featurePrices = accessSource.match(/monthlyPrice: \d+/g) || [];
  assert.ok(featurePrices.length >= 7, 'expected plan defaults + 6 features');
  assert.ok(featurePrices.every(price => price === 'monthlyPrice: 0'), `found non-zero feature price: ${featurePrices.join(', ')}`);
});

test('expiry locks all features, persists no auto-renew, and pushes a renewal notification', () => {
  assert.match(appSource, /subscriptionFeatures: \[\]/);
  assert.match(appSource, /subscriptionAutoRenew: false/);
  assert.match(appSource, /title: 'Your subscription has expired'/);
  assert.match(appSource, /category: 'unlock'/);
  assert.match(appSource, /target: \{ type: 'purchases' \}/);
});

test('subscription activation persists selected features and never auto-renews', () => {
  assert.match(appSource, /unlockSubscriptionPlan\(plan, paymentLabel, billingCycle, \{\}, selectedFeatures\)/);
  assert.match(appSource, /getFeatureBundleCycleTotal\(selectedFeatures, billingCycle, bundleMonthly, normalizeSubscriptionFeatures\(\(websiteSettings\.content as any\)\.subscriptionFeatures\)\)/);
  assert.match(appSource, /subscriptionAutoRenew: false/);
});
