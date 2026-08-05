import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const payment = fs.readFileSync('components/PaymentModal.tsx', 'utf8');

test('community desktop shell fills the highlighted outer border better', () => {
  assert.match(community, /sm:p-0 lg:p-0/);
  assert.match(community, /community-desktop-social\.eduvora-community-polish/);
  assert.match(community, /padding: 0\.55rem 0\.65rem 0\.75rem !important/);
  assert.match(community, /width: min\(100%, 50rem\)/);
});

test('product detail shows purchased stamp and latest update count badge', () => {
  assert.match(product, /lockedPaidUpdateCount/);
  assert.match(product, /product-owned-stamp/);
  assert.match(product, /OWNED/);
  assert.match(product, /Purchase the latest update/);
  assert.match(product, /text-red-700/);
  assert.match(product, /new paid content item/);
});

test('payment page uses focused detail-summary-pay checkout with a clear top heading', () => {
  assert.match(payment, /payment-checkout-long-page/);
  assert.match(payment, /Complete your checkout/);
  assert.match(payment, /label: 'Details'/);
  assert.match(payment, /label: 'Summary'/);
  assert.match(payment, /label: 'Pay'/);
  assert.match(payment, /Final price/);
  assert.match(payment, /What you unlock/);
  assert.match(payment, /Secure payment processing by Razorpay/);
  assert.match(payment, /Open verified Razorpay checkout/);
  assert.match(payment, /Check payment status/);
  assert.match(payment, /Pay with EduCoins/);
  assert.doesNotMatch(payment, /payment-detail-trust-panel/);
  assert.doesNotMatch(payment, /Amount payable/);
  assert.doesNotMatch(payment, /Review\. Pay\. Unlock\./);
});

test('phase 2 payment recovery and exact amount logic is preserved', () => {
  assert.match(payment, /dc_pending_checkout:/);
  assert.match(payment, /reconcilePendingCheckout/);
  assert.match(payment, /api\/razorpay\/payment-status/);
  assert.match(payment, /expectedAmount/);
});
