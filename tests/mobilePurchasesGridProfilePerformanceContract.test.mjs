import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const purchases = fs.readFileSync('components/PurchasedProducts.tsx', 'utf8');
const profile = fs.readFileSync('components/ProfilePage.tsx', 'utf8');

test('My Purchases uses a compact two-column mobile grid without changing mobile home', () => {
  assert.match(purchases, /purchased-mobile-two-column-grid/);
  assert.match(purchases, /isMobileHome \? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-2\.5 sm:gap-8'/);
  assert.match(purchases, /isCompactMobileGrid = !isMobileHome/);
  assert.match(purchases, /p-2\.5 sm:p-6/);
  assert.match(purchases, /hidden sm:block/);
  assert.match(purchases, /min-h-9 gap-1 px-2 py-2 text-\[10px\]/);
  assert.doesNotMatch(purchases, /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3/);
});

test('Purchased card image loading stays correct and becomes scroll friendly', () => {
  assert.match(purchases, /purchased-product-media-frame relative aspect-\[4\/3\] w-full overflow-hidden/);
  assert.match(purchases, /wrapperClassName="absolute inset-0 z-10 block"/);
  assert.match(purchases, /className="block h-full w-full object-contain"/);
  assert.match(purchases, /loading=\{delay <= 2 \? 'eager' : 'lazy'\}/);
  assert.match(purchases, /fetchPriority=\{delay <= 2 \? 'high' : 'auto'\}/);
  assert.match(purchases, /loadTimeoutMs=\{PURCHASED_IMAGE_LOAD_TIMEOUT_MS\}/);
});

test('Profile removes fixed blur repaint layers and defers long below-fold sections', () => {
  assert.match(profile, /profile-performance-root/);
  assert.match(profile, /profile-performance-backdrop/);
  assert.match(profile, /profile-deferred-section/);
  assert.match(profile, /content-visibility: auto/);
  assert.match(profile, /contain-intrinsic-size: 1px 760px/);
  assert.match(profile, /@media \(hover: none\), \(pointer: coarse\), \(max-width: 1024px\)/);
  assert.doesNotMatch(profile, /pointer-events-none fixed inset-0 overflow-hidden opacity-80/);
  assert.doesNotMatch(profile, /backdrop-blur-2xl/);
  assert.doesNotMatch(profile, /backdrop-blur-xl/);
  assert.doesNotMatch(profile, /blur-3xl/);
});

test('Profile access, wallet, course and membership behavior remains present', () => {
  assert.match(profile, /watchUserCoinWallet/);
  assert.match(profile, /onSnapshot/);
  assert.match(profile, /MembershipUpgradeCard message=\{subscriptionPage\.profileUpgrade\}/);
  assert.match(profile, /Continue Your Courses/);
  assert.match(profile, /handleContinueLearning/);
  assert.match(profile, /handleMilestoneClaim/);
  assert.match(profile, /handleRewardToggle/);
});
