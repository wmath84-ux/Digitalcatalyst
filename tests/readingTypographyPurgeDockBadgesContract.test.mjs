import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const reading = fs.readFileSync('components/ReadingDrawer.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');
const management = fs.readFileSync('components/admin/NewsBlogManagement.tsx', 'utf8');
const automator = fs.readFileSync('utils/contentAutomator.ts', 'utf8');
const dockUtility = fs.readFileSync('utils/dockNewContent.ts', 'utf8');
const mobileDock = fs.readFileSync('components/BottomGlassDock.tsx', 'utf8');
const desktopDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');

test('Reading typography stays responsive with runtime defaults', () => {
  assert.match(app, /newsHeadingFont: 'Merriweather'/);
  assert.match(app, /blogHeadingFont: 'Montserrat'/);
  assert.match(app, /bodyFont: 'Lato'/);
  assert.match(app, /readingStyle: \{[\s\S]*defaultWebsiteSettings\.content\.readingStyle/);
  assert.match(reading, /--reading-heading-font/);
  assert.match(reading, /--reading-body-font/);
  assert.match(reading, /reading-article-title/);
  assert.match(reading, /reading-article-quote/);
  assert.match(reading, /reading-rich-html blockquote/);
  assert.match(reading, /--reading-content-width/);
  assert.doesNotMatch(settings, /Reading typography studio/);
  assert.doesNotMatch(settings, /Live Reading preview/);
  assert.doesNotMatch(settings, /updateReadingStyle/);
});

test('Content purge is opt-in, configurable and manually runnable', () => {
  assert.match(app, /readingAutomation: \{[\s\S]*autoPurgeEnabled: false/);
  assert.match(automator, /DEFAULT_CONTENT_PURGE_POLICY/);
  assert.match(automator, /autoPurgeEnabled: false/);
  assert.match(automator, /normalizeContentPurgePolicy/);
  assert.match(automator, /getExpiredContentIds/);
  assert.match(automator, /post\.type === 'news' \|\| post\.type === 'blog'/);
  assert.match(automator, /purgePolicy\.autoPurgeEnabled[\s\S]*purgeExpiredContent/);
  assert.match(management, /Auto purge is OFF by default/);
  assert.match(management, /Purge now/);
  assert.match(management, /Store products, purchases and community content are not included/);
  assert.match(management, /autoPurgeEnabled: currentPurgePolicy\.autoPurgeEnabled/);
});

test('dock badges use per-viewer baselines and mobile-only unseen glow', () => {
  assert.match(dockUtility, /eduvora\.dockSeen\.v1/);
  assert.match(dockUtility, /readOrInitializeDockSeenState/);
  assert.match(dockUtility, /viewerKey: string/);
  assert.match(dockUtility, /createBaseline\(viewerKey, inventory\)/);
  assert.match(dockUtility, /Store: additions\.Store/);
  assert.match(dockUtility, /Purchased: inventory\.Purchased\.length/);
  assert.match(dockUtility, /glowItems/);
  assert.match(app, /dockViewerKey/);
  assert.match(app, /acknowledgeDockDestination\('Store'\)/);
  assert.match(app, /acknowledgeDockDestination\(type === 'news' \? 'News' : 'Blog'\)/);
  assert.match(app, /dockBadgeCounts=\{dockActivity\.badgeCounts\}/);
  assert.match(app, /dockGlowItems=\{dockActivity\.glowItems\}/);
  assert.match(mobileDock, /dock-new-content-glow/);
  assert.match(mobileDock, /dockGlowItems\.includes/);
  assert.match(desktopDock, /dockBadgeCounts/);
  assert.doesNotMatch(desktopDock, /dock-new-content-glow/);
});
