import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const subscription = fs.readFileSync('components/SubscriptionPage.tsx', 'utf8');
const product = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const reading = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');

test('subscription purchased stamp is centered and red without touching plan logic', () => {
  assert.match(subscription, /Subscription purchased and active/);
  assert.match(subscription, /left-1\/2 top-1\/2/);
  assert.match(subscription, /-translate-x-1\/2 -translate-y-1\/2/);
  assert.match(subscription, /border-double border-red-900/);
  assert.match(subscription, /from-red-950 via-red-700 to-red-950/);
});

test('product owned stamp and paid update count badge use red treatment', () => {
  assert.match(product, /product-owned-stamp/);
  assert.match(product, /border-double border-red-900/);
  assert.match(product, /from-red-950 via-red-700 to-red-950/);
  assert.match(product, /text-red-700/);
  assert.match(product, /lockedPaidUpdateCount/);
});

test('community unread badge color is red and scoped to share badges', () => {
  assert.match(community, /\.community-share-unread-total,\n\s+\.community-share-unread-badge/);
  assert.match(community, /background: #dc2626 !important/);
  assert.match(community, /rgba\(220, 38, 38, 0\.24\)/);
});

test('reading reward bottom counter hides when article coin and time are both zero', () => {
  assert.match(reading, /articleReadingRewardDisabled/);
  assert.match(reading, /coinPerArticleRead <= 0 && economySettings\.articleReadTimeRequiredSec <= 0/);
  assert.match(reading, /selectedArticle && !articleReadingRewardDisabled/);
  assert.match(reading, /!articleReadingRewardDisabled &&\n\s+rewardStatus === 'idle'/);
});

test('admin order reset is a one-time latest-order-only migration with backup marker', () => {
  assert.match(app, /ADMIN_ORDER_LATEST_ONLY_RESET_DOC/);
  assert.match(app, /buildLatestCustomerOrderResetPlan/);
  assert.match(app, /latest-order-only-v2/);
  assert.match(app, /const keepOrders = \[latestOrder\]/);
  assert.match(app, /removedOrderSummaries/);
  assert.match(app, /batch\.delete\(doc\(db, GLOBAL_ORDERS_COLLECTION/);
  assert.match(app, /status: 'complete'/);
});
