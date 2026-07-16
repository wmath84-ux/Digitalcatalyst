import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const installButton = fs.readFileSync('components/InstallAppButton.tsx', 'utf8');
const coursePlayer = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const productDetail = fs.readFileSync('components/ProductDetailPage.tsx', 'utf8');

test('installed PWA app uses Eduvora name everywhere install metadata matters', () => {
  assert.match(viteConfig, /name: 'Eduvora'/);
  assert.match(viteConfig, /short_name: 'Eduvora'/);
  assert.match(indexHtml, /apple-mobile-web-app-title" content="Eduvora"/);
  assert.match(indexHtml, /<title>Eduvora \| Notes, Courses & AI Learning Store<\/title>/);
  assert.match(installButton, /Install Eduvora/);
  assert.match(installButton, /Add Eduvora/);
});

test('course module panel keeps expanded lessons after lesson selection and only resets on course exit', () => {
  assert.match(coursePlayer, /const closeCourseSidebar = useCallback\(\(\) => \{\s*setIsSidebarOpen\(false\);\s*closeCourseLayerHistory\('modules'\);\s*\}, \[closeCourseLayerHistory\]\);/s);
  assert.match(coursePlayer, /const openCourseSidebar = useCallback\(\(\) => \{\s*setIsMentorOpen\(false\);\s*setIsSidebarOpen\(true\);\s*\}, \[\]\);/s);
  assert.match(coursePlayer, /resetCourseModulePanel\(\);\s*void flushYoutubeCoins\('closed'\);\s*onBack\(\);/);
  assert.doesNotMatch(coursePlayer, /resetCourseModulePanel\(\);\s*setIsSidebarOpen\(false\);/);
  assert.doesNotMatch(coursePlayer, /resetCourseModulePanel\(\);\s*setIsMentorOpen\(false\);/);
  assert.doesNotMatch(coursePlayer, /resetCourseModulePanel\(\); setIsDesktopSidebarCollapsed/);
});

test('product detail checkout buttons are visually focused and action-first', () => {
  assert.match(productDetail, /product-detail-eye-catching-actions/);
  assert.match(productDetail, /Ready to unlock/);
  assert.match(productDetail, /product-detail-primary-pay-button/);
  assert.match(productDetail, /eduvora-primary-action/);
  assert.match(productDetail, /Pay now/);
  assert.match(productDetail, /Pay ₹\$\{finalTotalPrice\.toFixed\(2\)\} securely/);
  assert.match(productDetail, /product-detail-educoin-button/);
  assert.match(productDetail, /product-detail-secondary-cart-button/);
});
