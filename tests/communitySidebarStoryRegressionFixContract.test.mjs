import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const homeDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const bottomDock = fs.readFileSync('components/BottomGlassDock.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('desktop website side panel is restored for desktop-width viewports while hover preview stays pointer-safe', () => {
  assert.match(app, /const readDesktopSidebarViewport = \(\) => \{/);
  assert.match(app, /return window\.matchMedia\('\(min-width: 1024px\)'\)\.matches/);
  assert.match(app, /const readDesktopSidebarPointerViewport = \(\) => \{/);
  assert.match(app, /return window\.matchMedia\('\(min-width: 1024px\) and \(hover: hover\) and \(pointer: fine\)'\)\.matches/);
  assert.match(app, /const desktopSidebarMedia = window\.matchMedia\('\(min-width: 1024px\)'\)/);
  assert.match(app, /const desktopSidebarPointerMedia = window\.matchMedia\('\(min-width: 1024px\) and \(hover: hover\) and \(pointer: fine\)'\)/);
  assert.match(homeDock, /if \(event\.pointerType === 'mouse'\) beginHoverPreview\(event\.pointerType\);/);
  assert.match(app, /websiteSettings\.desktop\.navigationMode === 'sidebar' && isDesktopSidebarViewport/);
  assert.match(app, /useCommunityDesktopSidebar = useDesktopSidebar && isPointerDesktopSidebarViewport/);
});

test('Community sidebar navigation leaves Community before opening non-community overlays', () => {
  assert.match(app, /onOpenBlogModal=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(\(\) => openReadingHub\('blog'\), 0\); \}\}/);
  assert.match(app, /onOpenAnnouncementsModal=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(\(\) => openReadingHub\('news'\), 0\); \}\}/);
  assert.match(app, /onCartClick=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(openCartSidebar, 0\); \}\}/);
});

test('Community Status tab remains a valid root tab and browser Back does not close the app', () => {
  assert.doesNotMatch(community, /page === 'chat' && activeView === 'status'\) setActiveView\('feed'\)/);
  assert.match(community, /const handledInsideCommunity = goBack\(\{ fromBrowser: true \}\)/);
  assert.match(community, /onClose\?\.\(\)/);
  assert.match(community, /__eduvoraCommunityHandledBack = true/);
});

test('Profile story cards keep text compact and image captions below the image', () => {
  assert.match(community, /community-profile-story-text-preview/);
  assert.match(community, /story\.imagePreview && \(story\.body \|\| story\.title\)/);
  assert.match(community, /line-clamp-3 break-words text-\[11px\]/);
  assert.doesNotMatch(community, /story\.imagePreview \? <SafeImage[\s\S]{0,320}absolute/);
});

test('Story viewer captions are below media and expand inside a scrollable text block', () => {
  assert.match(community, /community-story-bottom relative z-30 shrink-0/);
  assert.match(community, /community-story-caption-button/);
  assert.match(community, /is-expanded max-h-\[42dvh\] overflow-y-auto whitespace-pre-wrap/);
  assert.match(community, /position: relative !important;/);
  assert.match(community, /max-height: min\(42dvh, 22rem\)/);
});

test('Admin can customize website side panel font and HomeSideDock consumes it', () => {
  assert.match(bottomDock, /sidebarFontFamily: 'Inter'/);
  assert.match(app, /sidebarFontFamily\?: string/);
  assert.match(homeDock, /sidebarFontOptions/);
  assert.match(homeDock, /fontFamily: sidebarFontFamily/);
  assert.match(settings, /Website side panel font/);
  assert.match(settings, /sidebarFontOptions\.map/);
  assert.match(settings, /updateDockStyle\('sidebarFontFamily'/);
});
