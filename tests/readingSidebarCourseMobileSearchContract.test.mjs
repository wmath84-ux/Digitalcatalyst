import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reading = readFileSync('components/ReadingDrawer.tsx', 'utf8');
const dock = readFileSync('components/HomeSideDock.tsx', 'utf8');
const app = readFileSync('App.tsx', 'utf8');
const community = readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const course = readFileSync('components/CoursePlayer.tsx', 'utf8');
const home = readFileSync('components/MobileAppHome.tsx', 'utf8');
const store = readFileSync('components/ProductShowcase.tsx', 'utf8');
const mobileSearch = readFileSync('components/MobileProductSearchPage.tsx', 'utf8');
const search = readFileSync('utils/productSearch.ts', 'utf8');

test('rich News and Blog HTML receives configured in-article ads and keeps the final multiplex slot', () => {
  assert.match(reading, /splitRichHtmlForInArticleAds/);
  assert.match(reading, /RICH_HTML_AD_BREAKPOINTS/);
  assert.match(reading, /richSections\.map/);
  assert.match(reading, /variant="inArticle"/);
  assert.match(reading, /variant="multiplex"/);
});

test('desktop website sidebar preserves persistent layout width across all pages', () => {
  assert.match(dock, /export type DesktopSidebarState/);
  assert.match(dock, /onStateChange\?:/);
  assert.match(dock, /sidebarState === 'expanded' \? expandedWidth : sidebarState === 'collapsed' \? collapsedWidth : 0/);
  assert.match(app, /desktopSidebarState/);
  assert.match(app, /onStateChange=\{setDesktopSidebarState\}/);
  assert.doesNotMatch(app, /activeItem="Community"[\s\S]{0,180}openExpandedOnMount/);
  assert.match(community, /community-site-sidebar-compact/);
  assert.match(community, /community-site-sidebar-expanded/);
});

test('Course Player desktop chrome is compact and docs index opens by default on desktop', () => {
  assert.match(course, /setIsSidebarOpen\(!isCompactDocs\)/);
  assert.match(course, /clamp\(17rem, 22vw, 21rem\)/);
  assert.match(course, /lg:rounded-lg/);
  assert.match(course, />Course modules</);
  assert.doesNotMatch(course, />Learning Mode</);
  assert.doesNotMatch(course, />Course Panel</);
});

test('Community supports direct @username search and lowercase letters-only profile usernames', () => {
  assert.match(community, /normalizeEditableUsername/);
  assert.match(community, /\^\[a-z\]\{3,30\}\$/);
  assert.match(community, /Search name or @username/);
  assert.match(community, /directUsername/);
});

test('Home and Store share a nested live mobile search with fuzzy matching and two-column cards', () => {
  assert.match(home, /MobileProductSearchPage/);
  assert.match(store, /MobileProductSearchPage/);
  assert.match(mobileSearch, /fixed inset-0/);
  assert.match(mobileSearch, /grid grid-cols-2/);
  assert.match(mobileSearch, /popstate/);
  assert.match(search, /boundedTokenDistance/);
  assert.match(search, /looseTokenMatch/);
});
