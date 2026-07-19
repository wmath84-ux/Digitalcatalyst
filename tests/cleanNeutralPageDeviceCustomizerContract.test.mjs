import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const admin = readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');
const studio = readFileSync('components/admin/CleanNeutralDesignStudio.tsx', 'utf8');
const customizer = readFileSync('utils/cleanNeutralCustomizer.ts', 'utf8');
const css = readFileSync('public/styles/clean-neutral-theme.css', 'utf8');

const expectedPages = [
  'home','mayDay','allProducts','product','myPurchases','wishlist','freeProducts',
  'subscription','congratulations','profile','community','auth','policies',
  'coursePlayer','course','eduCoinGuide','news','article','announcement','reading',
  'hero','purchased','purchases','topRated','services','about','trust','upcoming',
  'faq','adminLogin','admin',
];

const expectedRules = [
  'pageBackground','sectionBackground','surfaceBackground','headingColor',
  'bodyTextColor','secondaryTextColor','mutedTextColor','iconColor',
  'primaryButtonBackground','primaryButtonText','secondaryButtonBackground',
  'secondaryButtonText','activeStateBackground','activeStateText',
  'inactiveStateText','borderColor','controlRadius','cardRadius',
  'shadowIntensity','motionIntensity',
];

test('stable registry includes all inspected page IDs', () => {
  expectedPages.forEach(pageId => assert.match(customizer, new RegExp(`id: '${pageId}'`)));
  assert.equal(expectedPages.length, 31);
});

test('exact 20-rule schema is present', () => {
  expectedRules.forEach(rule => assert.match(customizer, new RegExp(`'${rule}'`)));
  assert.equal(expectedRules.length, 20);
  assert.match(studio, /cleanNeutralDesignStudioRuleCount = CLEAN_NEUTRAL_RULE_IDS\.length/);
});

test('desktop tablet mobile targeting and bulk selectors exist', () => {
  assert.match(customizer, /CLEAN_NEUTRAL_DEVICE_SCOPES = \['desktop', 'tablet', 'mobile'\]/);
  assert.match(studio, /All Pages/);
  assert.match(studio, /All \{labelForDevice\(device\)\}/);
  assert.match(studio, /DeviceIcon/);
});

test('settings are normalized, sparse and backward compatible', () => {
  assert.match(app, /cleanNeutralCustomizer\?: CleanNeutralCustomizerSettings/);
  assert.match(app, /cleanNeutralCustomizer: DEFAULT_CLEAN_NEUTRAL_CUSTOMIZER/);
  assert.match(app, /normalizeCleanNeutralCustomizer\(\(incoming\.theme as any\)\?\.cleanNeutralCustomizer\)/);
  assert.match(customizer, /targets: \{\}/);
  assert.doesNotMatch(studio, /<textarea\b/i);
  assert.doesNotMatch(studio, /dangerouslySetInnerHTML/);
});

test('runtime applies active page and resolved viewport scope', () => {
  assert.match(app, /applyCleanNeutralRuntime\(/);
  assert.match(app, /currentView,/);
  assert.match(app, /window\.innerWidth/);
  assert.match(app, /currentView, isMobileViewport, isDesktopSidebarViewport/);
  assert.match(customizer, /root\.dataset\.cleanNeutralPage/);
  assert.match(customizer, /root\.dataset\.cleanNeutralDevice/);
});

test('Admin Studio is directly below Clean Neutral contract', () => {
  const contractIndex = admin.indexOf('Professional design contract locked');
  const studioIndex = admin.indexOf('<CleanNeutralDesignStudio');
  const classicIndex = admin.indexOf('Classic Trust workspace layer');
  assert.ok(contractIndex >= 0);
  assert.ok(studioIndex > contractIndex);
  assert.ok(classicIndex > studioIndex);
});

test('semantic CSS variables consume page-device values', () => {
  [
    '--cn-icon',
    '--cn-secondary-foreground',
    '--cn-active-foreground',
    '--cn-inactive-foreground',
    'var(--cn-secondary-foreground)',
    'var(--cn-active-foreground)',
    'var(--cn-inactive-foreground)',
    'var(--cn-icon)',
  ].forEach(marker => assert.ok(css.includes(marker), marker));
});

test('source-specific Home and AI neutral colours are covered', () => {
  assert.match(css, /bg-\[#F7F9FC\]/);
  assert.match(css, /bg-\[#F2F5F9\]/);
  assert.match(css, /text-\[#10213F\]/);
  assert.match(css, /border-\[#E1E7F0\]/);
});
