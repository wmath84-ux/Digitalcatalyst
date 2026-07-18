import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const readingDrawer = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');
const productCard = fs.readFileSync('components/ProductCard.tsx', 'utf8');
const homeDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('news/blog reading pages reserve visible article ad fields between content and at the end', () => {
  assert.match(readingDrawer, /const ReadingAdSlot/);
  assert.match(readingDrawer, /reading-ad-field/);
  assert.match(readingDrawer, /Sponsored space reserved between reading sections/);
  assert.match(readingDrawer, /<ReadingAdSlot[\s\S]*variant="inArticle"/);
  assert.match(readingDrawer, /<ReadingAdSlot[\s\S]*variant="multiplex"/);
  assert.doesNotMatch(readingDrawer, /className="mt-10 rounded-\[2rem\] border p-5 shadow-sm backdrop-blur-xl"/);
});

test('desktop sidebar does not leak into touch landscape and is not duplicated on Community', () => {
  assert.match(app, /\(min-width: 1024px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(app, /useDesktopSidebar && currentView !== 'community' &&/);
  assert.match(app, /style=\{\{ paddingLeft: useDesktopSidebar \? 'var\(--desktop-site-sidebar-offset, 320px\)' : undefined \}\}/);
});

test('Status hub keeps Create Story top-right and removes the Rules button from the hero', () => {
  assert.match(community, /absolute right-0 top-0 rounded-2xl bg-gradient-to-r from-\[#1769FF\] to-\[#7B61FF\]/);
  assert.match(community, /mt-3 flex gap-2 overflow-x-auto/);
  assert.doesNotMatch(community, /onClick=\{\(\) => setShowStatusRulesModal\(true\)\} className="rounded-2xl border border-\[#BFD7FF\]/);
});

test('story captions render below images and profile story text stays compact/readable', () => {
  assert.match(community, /background: #050505 !important;/);
  assert.match(community, /community-profile-story-readable-card/);
  assert.match(community, /font-size: clamp\(0\.56rem, 1\.05vw, 0\.68rem\)/);
  assert.match(community, /story\.imagePreview && \(story\.body \|\| story\.title\)/);
});

test('purchased product UI hides unpaid unlock copy and purchased cards hide the arrow indicator', () => {
  assert.match(productDetail, /\{!isPurchased && \(\s*<div className="product-detail-action-focus-copy/);
  assert.match(productCard, /\{!isPurchased && <span className=\{`\$\{compactMobile \? 'hidden sm:inline' : 'inline'\} ml-1`\}>/);
  assert.doesNotMatch(productCard, /\{isPurchased \? 'Purchased' : 'Details'\} <span/);
});

test('Admin side-panel font setting remains wired to HomeSideDock', () => {
  assert.match(settings, /Website side panel font/);
  assert.match(settings, /updateDockStyle\('sidebarFontFamily'/);
  assert.match(homeDock, /sidebarFontOptions/);
  assert.match(homeDock, /fontFamily: sidebarFontFamily/);
});
