import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const home = fs.readFileSync('components/MobileAppHome.tsx', 'utf8');
const dock = fs.readFileSync('components/BottomGlassDock.tsx', 'utf8');
const adminSettings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('bottom dock never auto-hides on scroll and persists across main mobile pages', () => {
  assert.match(dock, /const autoHideOnScroll = false;/);
  assert.match(dock, /persistAcrossPages: true/);
  assert.match(app, /dockPersistAcrossPages/);
  assert.match(app, /dockAlwaysVisibleViews/);
  assert.match(app, /new Set\(\['home', 'allProducts', 'myPurchases', 'blog', 'news', 'profile', 'wishlist', 'freeProducts'\]\)/);
  assert.match(app, /dockPersistAcrossPages \? !dockAlwaysVisibleViews\.has\(currentView\) : currentView !== 'home'/);
});

test('mobile side panel menu items open their matching pages', () => {
  assert.match(home, /\['💎','Subscriptions', onNavigateToSubscriptions\]/);
  assert.match(home, /\['♡','Wishlist', onNavigateToWishlist\]/);
  assert.match(home, /\['📄','Blog', onOpenBlog\]/);
  assert.match(home, /\['💬','Community', onOpenCommunity\]/);
  assert.match(home, /\['👤','Profile', onProfileClick\]/);
  assert.match(home, /\['🛒','Cart', onCartClick\]/);
  assert.match(home, /\['🎁','Free', onNavigateToFreeProducts\]/);
  assert.match(home, /\['📣','News', onOpenNews\]/);
});

test('mobile home wires the new side panel navigation callbacks through the app shell', () => {
  assert.match(app, /onNavigateToWishlist=\{handleNavigateToWishlist\}/);
  assert.match(app, /onNavigateToSubscriptions=\{handleNavigateToSubscription\}/);
  assert.match(app, /onOpenBlog=\{\(\) => openReadingHub\('blog'\)\}/);
  assert.match(app, /onOpenCommunity=\{\(\) => \{ setCurrentView\('community'\); window\.scrollTo\(0, 0\); \}\}/);
});

test('admin dock settings expose a toggle to turn off the persistent dock update', () => {
  assert.match(adminSettings, /Keep dock on all main pages/);
  assert.match(adminSettings, /updateDockStyle\('persistAcrossPages', e\.target\.checked\)/);
  assert.match(adminSettings, /dockStyle\.persistAcrossPages !== false/);
});
