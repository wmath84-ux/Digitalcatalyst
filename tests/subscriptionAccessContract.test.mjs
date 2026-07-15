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

test('subscription access model contains exactly normal, pro and elite tiers', () => {
  assert.match(accessSource, /export type SubscriptionTier = 'normal' \| 'pro' \| 'elite'/);
  assert.match(accessSource, /accessTier: 'pro'/);
  assert.match(accessSource, /accessTier: 'elite'/);
  assert.match(accessSource, /earningMultiplier: 2/);
  assert.match(accessSource, /monthlyPrice: 499/);
  assert.match(accessSource, /yearlyPrice: 499 \* 12/);
  assert.match(accessSource, /return DEFAULT_SUBSCRIPTION_PLANS\.map/);
});

test('locked messages preserve the approved student-facing copy', () => {
  assertContainsAll(accessSource, [
    'Unlock AI Mentor with Pro or Elite',
    'Upgrade to Pro or Elite to start learning with AI Mentor.',
    'Unlock Learning Community with Pro or Elite',
    'Upgrade to Pro or Elite to join the learning community.',
    'Start earning EduCoins with Pro or Elite',
    'Upgrade to Pro or Elite and start building your learning wallet.',
  ]);
});

test('subscription activation persists tier and earning multiplier without downgrading', () => {
  assert.match(appSource, /const unlockSubscriptionPlan = \(plan: SubscriptionPlanConfig/);
  assert.match(appSource, /getHigherSubscriptionTier\(getUserSubscriptionTier\(currentUser\), requestedTier\)/);
  assert.match(appSource, /subscriptionTier: nextTier/);
  assert.match(appSource, /eduCoinMultiplier: nextMultiplier/);
  assert.match(appSource, /eliteStatus: nextTier === 'elite'/);
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

test('all coin earning and spending helpers require premium membership', () => {
  assert.match(walletSource, /if \(!hasPremiumMembership\(userData\)\)/);
  assert.match(walletSource, /reason: 'membership_required'/);
  assert.match(walletSource, /getUserEduCoinMultiplier\(userData\)/);
  assert.match(appSource, /if \(!currentUser \|\| amount <= 0 \|\| !hasPremiumMembership\(currentUser\)\) return false/);
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
  assert.match(settingsSource, /Pro & Elite Access Customizer/);
  assert.match(settingsSource, /Page Header & Billing Labels/);
  assert.match(settingsSource, /Monthly Price \(₹\)/);
  assert.match(settingsSource, /Yearly Price \(₹\)/);
  assert.match(settingsSource, /Earning Multiplier/);
  assert.match(settingsSource, /Selected premium products\/content/);
  assert.match(settingsSource, /AI Mentor Locked Message/);
  assert.match(settingsSource, /Community Locked Message/);
  assert.match(settingsSource, /Normal User Profile Message/);
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
});

test('subscription billing cycle is stored in user and order metadata', () => {
  assert.match(accessSource, /export type SubscriptionBillingCycle = 'monthly' \| 'yearly'/);
  assert.match(accessSource, /getSubscriptionPeriodMonths/);
  assert.match(accessSource, /getSubscriptionBillingPrice/);
  assert.match(accessSource, /const monthlyPrice = Math\.max\(0, Number\(record\.monthlyPrice/);
  assert.match(appSource, /subscriptionBillingCycle: nextTier === requestedTier \? billingCycle/);
  assert.match(appSource, /subscriptionExpiresAt: expiresAtDate\.toISOString\(\)/);
  assert.match(appSource, /subscriptionBillingCycle: billingCycle/);
  assert.match(appSource, /subscriptionPeriodMonths: getSubscriptionPeriodMonths\(billingCycle\)/);
});
