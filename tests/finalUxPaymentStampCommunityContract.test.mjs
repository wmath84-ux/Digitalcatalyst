import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx','utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx','utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx','utf8');
const subscription = fs.readFileSync('components/SubscriptionPage.tsx','utf8');
const payment = fs.readFileSync('components/PaymentModal.tsx','utf8');

test('community shell is edge-to-edge with responsive typography', () => {
  assert.match(app,/currentView === 'community'/);
  assert.match(app,/overflow-hidden bg-\[var\(--color-background\)\] p-0/);
  assert.match(community,/eduvora-community-app flex h-full w-full/);
  assert.match(community,/border-0/);
  assert.match(community,/border-radius: 0 !important/);
  assert.match(community,/font-size: clamp/);
});

test('product and subscription use premium owned seal and polished button states', () => {
  assert.match(product,/border-double border-red-900/);
  assert.match(product,/>Owned</);
  assert.match(product,/Purchased · Open My Purchases/);
  assert.match(product,/Unlock new update features/);
  assert.match(product,/paid update/);
  assert.match(subscription,/Subscription purchased and active/);
  assert.match(subscription,/border-double border-red-900/);
  assert.match(subscription,/psp-owned-stamp/);
});

test('checkout has real product image and context-specific product/update detail props', () => {
  assert.match(payment,/productImage\?: string/);
  assert.match(payment,/itemDescription\?: string/);
  assert.match(payment,/unlockDetails\?: string\[\]/);
  assert.match(payment,/<img src=\{productImage\}/);
  assert.match(payment,/Pay \$\{formatCheckoutMoney\(finalPayable\)\} & unlock update/);
  assert.match(product,/productImage=\{mainImage \|\| getProductImage/);
  assert.match(app,/productImage=\{getProductImage\(latestUpdateCheckout\.product/);
  assert.match(app,/This payment unlocks only/);
});

test('payment recovery and exact-price safety remain present', () => {
  assert.match(payment,/reconcilePendingCheckout/);
  assert.match(payment,/savePendingCheckout/);
  assert.match(payment,/clearPendingCheckout/);
  assert.match(payment,/api\/razorpay\/payment-status/);
  assert.match(payment,/finalPrice/);
  assert.match(payment,/payment-checkout-long-page/);
  assert.match(payment,/payment-checkout-blue-hero/);
  assert.match(payment,/payment-primary-action eduvora-primary-action/);
  assert.match(payment,/Razorpay protected/);
  assert.match(payment,/Payment recovery available/);
});
