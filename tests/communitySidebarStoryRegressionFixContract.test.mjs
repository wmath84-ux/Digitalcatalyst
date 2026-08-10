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
  // Desktop navigation is hardcoded to the default sidebar layout since admin customization was removed.
  assert.match(app, /const useDesktopSidebar = isDesktopSidebarViewport;/);
  assert.match(app, /useCommunityDesktopSidebar = useDesktopSidebar/);
});

test('Community sidebar navigation leaves Community before opening non-community overlays', () => {
  assert.match(app, /onOpenBlogModal=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(\(\) => openReadingHub\('blog'\), 0\); \}\}/);
  assert.match(app, /onOpenAnnouncementsModal=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(\(\) => openReadingHub\('news'\), 0\); \}\}/);
  assert.match(app, /onCartClick=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(openCartSidebar, 0\); \}\}/);
  assert.match(app, /onNavigateToAllProducts=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(handleNavigateToAllProducts, 0\); \}\}/);
  assert.match(app, /onNavigateToWishlist=\{\(\) => \{ setCurrentView\('home'\); window\.setTimeout\(handleNavigateToWishlist, 0\); \}\}/);
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
  assert.match(community, /min-height: min\(62dvh, 32rem\)/);
});


test('Story viewer has a shared header and desktop-only back button', () => {
  assert.match(community, /community-story-topbar absolute inset-x-0 top-0 z-30 flex items-start justify-between/);
  assert.match(community, /aria-label="Story options"/);
  assert.match(community, /absolute left-0 top-12/);
  assert.match(community, /items-center justify-end gap-2 text-right text-white/);
  assert.match(community, /owner\.verified \? <BlueVerifiedTick \/> : null/);
  assert.match(community, /hidden h-10 w-10 items-center justify-center rounded-full border text-lg font-black shadow-xl lg:flex/);
});

test('Text-only story viewer fills the space above actions and scrolls without expand-collapse', () => {
  assert.match(community, /community-story-text-frame is-text-only/);
  assert.match(community, /community-story-text-card flex h-full w-full items-stretch justify-center/);
  assert.match(community, /pt-\[calc\(env\(safe-area-inset-top\)\+5\.8rem\)\]/);
  assert.match(community, /activeReelIsTextOnly/);
  assert.match(community, /const storyInteractionLocked = activeReelIsTextOnly \|\| expandedStatusTextId === selectedStatusId/);
  assert.match(community, /touch-action: pan-y/);
  assert.match(community, /-webkit-overflow-scrolling: touch/);
  assert.match(community, /onTouchMove=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(community, /onPointerMove=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(community, /scroller\?\.scrollBy\(\{ top: Math\.max\(160, scroller\.clientHeight \* 0\.72\), behavior: 'smooth' \}\)/);
  assert.doesNotMatch(community, /aria-expanded=\{longText \? expanded : undefined\}/);
  assert.doesNotMatch(community, /setExpandedStatusTextId\(expanded \? null : card\.id\)/);
});

test('website side panel appearance is hardcoded and admin customization is removed', () => {
  assert.match(bottomDock, /sidebarFontFamily: 'Inter'/);
  assert.match(bottomDock, /sidebarBackgroundColor: '#FBFDFF'/);
  assert.match(bottomDock, /sidebarTextOpacity: 100/);
  assert.match(homeDock, /const dockStyle = defaultDockStyle;/);
  assert.match(homeDock, /sidebarFontOptions/);
  assert.match(homeDock, /sidebarSurfaceColor/);
  assert.match(homeDock, /sidebarTextColor = hexToRgba\(sidebarTextBaseColor, sidebarTextOpacity\)/);
  assert.match(homeDock, /fontFamily: sidebarFontFamily/);
  assert.doesNotMatch(settings, /Website side panel only/);
  assert.doesNotMatch(settings, /Side panel colour/);
  assert.doesNotMatch(settings, /Font transparency/);
  assert.doesNotMatch(settings, /updateDockStyle/);
});
