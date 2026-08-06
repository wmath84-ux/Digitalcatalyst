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
  assert.match(accessSource, /monthlyPrice: 499/);
  assert.match(accessSource, /yearlyPrice: 2999/);
  assert.match(accessSource, /FREE_TRIAL_DAYS = 7/);
  assert.match(accessSource, /canStartFreeTrial/);
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

test('new users can start a 7-day free trial once and it sets a trial window', () => {
  assert.match(appSource, /const handleStartFreeTrial = \(\) =>/);
  assert.match(appSource, /canStartFreeTrial\(currentUser\)/);
  assert.match(appSource, /FREE_TRIAL_DAYS \* 24 \* 60 \* 60 \* 1000/);
  assert.match(appSource, /subscriptionTrialStartedAt: activatedAt/);
  assert.match(appSource, /subscriptionTrialEndsAt: trialEndsAt/);
  assert.match(appSource, /subscriptionTrialUsed: true/);
  assert.match(appSource, /onStartFreeTrial=\{handleStartFreeTrial\}/);
  assert.match(accessSource, /getTrialDaysLeft/);
  assert.match(accessSource, /isTrialActive/);
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
  assert.match(settingsSource, /Trial Title/);
  assert.match(settingsSource, /Renewal Note/);
});

test('subscription cards use admin data and prevent normal EduCoin checkout', () => {
  assert.match(subscriptionSource, /normalizeSubscriptionPlans\(settings\.content\.subscriptionPlans\)/);
  assert.match(subscriptionSource, /normalizeSubscriptionPageContent\(settings\.content\.subscriptionPage\)/);
  assert.match(subscriptionSource, /getSubscriptionBillingPrice\(plan, billingCycle\)/);
  assert.match(subscriptionSource, /onActivatePlan\(plan, billingCycle/);
  assert.match(subscriptionSource, /const canUseEduCoins = currentTier !== 'normal'/);
  assert.match(subscriptionSource, /EduCoin use unlocks with Pro/);
  assert.match(subscriptionSource, /plan\.benefits\.map/);
  assert.match(subscriptionSource, /plan\.unlockProductIds/);
  assert.match(subscriptionSource, /onStartFreeTrial/);
  assert.match(subscriptionSource, /SUBSCRIPTION_BILLING_CYCLES/);
  assert.match(subscriptionSource, /One-time/);
  assert.match(subscriptionSource, /Quarterly/);
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

test('build-your-bundle page keeps feature selection across billing cycle changes', () => {
  assert.match(subscriptionSource, /aria-label="Billing cycle toggle"/);
  assert.match(subscriptionSource, /setBillingCycle\(cycle\)/);
  assert.match(subscriptionSource, /toggleFeature\(feature\.key\)/);
  assert.match(subscriptionSource, /selectedFeatures\.filter\(key => !ownedFeatureKeys\.includes\(key\)\)/);
  assert.match(subscriptionSource, /getFeatureBundleCycleTotal/);
});

test('feature gating helpers power EduCoin earning and spending', () => {
  assert.match(accessSource, /export const canEarnEduCoins/);
  assert.match(accessSource, /export const canSpendEduCoins/);
  assert.match(accessSource, /export const hasSubscriptionFeature/);
  assert.match(accessSource, /SUBSCRIPTION_FEATURE_BUNDLE_MONTHLY = 499/);
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
  assert.match(appSource, /getFeatureBundleCycleTotal\(selectedFeatures, billingCycle, bundleMonthly\)/);
  assert.match(appSource, /subscriptionAutoRenew: false/);
});
