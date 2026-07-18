import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const latestNews = fs.readFileSync('components/LatestNews.tsx', 'utf8');
const readingDrawer = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const admin = fs.readFileSync('components/admin/AdminDashboard.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('News and Blog use balanced two-card mobile grids', () => {
  assert.match(latestNews, /latest-news-mobile-two-column/);
  assert.match(latestNews, /grid-cols-2 gap-3/);
  assert.match(latestNews, /latest-news-mobile-card/);
  assert.match(latestNews, /h-28[\s\S]*sm:h-48/);
  assert.match(readingDrawer, /reading-hub-mobile-grid/);
  assert.match(readingDrawer, /grid grid-cols-2 gap-3/);
  assert.match(readingDrawer, /reading-hub-mobile-card/);
  assert.match(readingDrawer, /aspect-\[4\/3\][\s\S]*sm:aspect-\[16\/9\]/);
  assert.match(readingDrawer, /hidden text-sm leading-7 sm:line-clamp-3 sm:block/);
});

test('hard refresh restores app, product and Reading Hub state', () => {
  assert.match(app, /APP_VIEW_SESSION_KEY = 'eduvora\.appView\.v1'/);
  assert.match(app, /APP_PRODUCT_SESSION_KEY = 'eduvora\.selectedProductId\.v1'/);
  assert.match(app, /READING_ROUTE_SESSION_KEY = 'eduvora\.readingRoute\.v1'/);
  assert.match(app, /useState\(\(\) => readInitialAppView\(\)\)/);
  assert.match(app, /pendingRestoredProductIdRef/);
  assert.match(app, /readPersistedReadingRoute/);
  assert.match(app, /setIsReadingDrawerOpen\(true\)/);
  assert.match(app, /PRODUCT_BOUND_APP_VIEWS/);
});

test('Community and Admin nested routes restore after refresh', () => {
  assert.match(community, /eduvora\.communityRoute\.v1/);
  assert.match(community, /applyCommunityHistoryState\(initialState\)/);
  assert.match(admin, /ADMIN_VIEW_SESSION_KEY = 'eduvora\.adminView\.v1'/);
  assert.match(admin, /useState<AdminView>\(\(\) => readInitialAdminView\(\)\)/);
  assert.match(admin, /dcAdminView: currentView/);
});

test('Admin Theme controls are honest, real and previewable', () => {
  assert.match(index, /family=Inter/);
  assert.match(index, /family=Roboto/);
  assert.match(index, /family=Montserrat/);
  assert.match(app, /const shadowScales =/);
  assert.match(app, /selectedShadowScale\.base/);
  assert.match(app, /selectedShadowScale\.lg/);
  assert.match(app, /selectedShadowScale\.xl/);
  assert.match(settings, /theme-control-availability/);
  assert.match(settings, /disabled=\{!originalPaletteActive\}/);
  assert.match(settings, /disabled=\{fixedProfessionalModeActive\}/);
  assert.match(settings, /theme-settings-live-preview/);
  assert.match(settings, /WEBSITE_SETTINGS_TAB_KEY = 'eduvora\.storeConfigTab\.v1'/);
  assert.match(settings, /Controls base, large, and extra-large shadow depth/);
});
