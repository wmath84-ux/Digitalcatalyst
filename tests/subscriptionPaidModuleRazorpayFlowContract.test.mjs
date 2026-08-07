import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const subscription = fs.readFileSync('components/SubscriptionPage.tsx', 'utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const payment = fs.readFileSync('components/PaymentModal.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');

test('subscription page follows the premium dark god-tier theme', () => {
  assert.match(subscription, /subscription-page-theme-adaptive premium-subscription-page/);
  assert.match(subscription, /psp-root/);
  assert.match(subscription, /psp-master-toggle/);
  assert.match(subscription, /psp-card-stage/);
  assert.match(subscription, /psp-glass-table/);
  assert.match(subscription, /psp-summary-card/);
  assert.match(subscription, /psp-cta/);
  assert.match(subscription, /psp-trust/);
  assert.doesNotMatch(subscription, /font-mono text-\[#111111\]/);
});

test('paid module and latest update actions use the same focused payment design', () => {
  assert.match(product, /paid-update-primary-action eduvora-primary-action/);
  assert.match(product, /Paid course update/);
  assert.match(product, /Unlock new update features/);
  assert.match(course, /paid-module-unlock-action/);
  assert.match(course, /paid-lesson-unlock-action/);
  assert.match(course, /course-player-paid-update-action eduvora-primary-action/);
  assert.match(payment, /latest-update-payment-action/);
  assert.match(payment, /Pay \$\{formatCheckoutMoney\(finalPayable\)\} & unlock update/);
  assert.match(payment, /label: 'Pay'/);
  assert.match(app, /initialCheckoutStep="checkout"/);
  assert.match(app, /checkoutType="latest-update"/);
});

test('Razorpay launch keeps scroll position, shows loading until open, and reports dismiss', () => {
  assert.match(payment, /isRazorpayLaunching/);
  assert.match(payment, /payment-razorpay-launch-overlay/);
  assert.match(payment, /Connecting to Razorpay/);
  assert.match(payment, /window\.setTimeout\(\(\) => setIsRazorpayLaunching\(false\), 120\)/);
  assert.match(payment, /Payment wasn’t completed\. No access was unlocked—retry when you’re ready\./);
  assert.match(payment, /If money was deducted, use “Check payment status” before paying again\./);
  assert.doesNotMatch(payment, /\[checkoutStep, presentation, showCoinGuide\]/);
  assert.match(payment, /theme: \{ color: '#1769ff' \}/);
  assert.match(payment, /name: 'Eduvora'/);
});
