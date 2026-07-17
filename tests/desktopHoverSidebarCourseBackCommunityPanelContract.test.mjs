import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const homeDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('Community restores its original internal sidebar while header controls the main website navigation', () => {
  assert.match(community, /COMMUNITY_DESKTOP_SIDEBAR_COLLAPSED_KEY/);
  assert.match(community, /isDesktopSidebarCollapsed/);
  assert.doesNotMatch(community, /CommunityDesktopSidebarState/);
  assert.doesNotMatch(community, /COMMUNITY_DESKTOP_SIDEBAR_STATE_KEY/);
  assert.match(community, /community-website-sidebar-trigger/);
  assert.match(community, /onWebsiteSidebarPreviewStart/);
  assert.match(community, /onWebsiteSidebarPreviewEnd/);
  assert.match(community, /onWebsiteSidebarPin/);
  assert.match(app, /showWebsiteSidebarTrigger={useDesktopSidebar}/);
  assert.match(app, /showDetachedTrigger={false}/);
  assert.match(app, /overlayMode/);
  assert.match(app, /dispatchDesktopSidebarCommand\('preview-start'\)/);
  assert.match(app, /activeItem="Community"/);
});

test('main website side panel accepts shared preview and pin commands without shifting Community', () => {
  assert.match(homeDock, /DESKTOP_SIDEBAR_COMMAND_EVENT/);
  assert.match(homeDock, /DesktopSidebarCommand/);
  assert.match(homeDock, /command === 'preview-start'/);
  assert.match(homeDock, /command === 'preview-end'/);
  assert.match(homeDock, /command === 'pin'/);
  assert.match(homeDock, /showDetachedTrigger/);
  assert.match(homeDock, /overlayMode/);
  assert.match(homeDock, /if \(overlayMode\) return undefined/);
  assert.match(homeDock, /overlayMode \? 'z-\[1600\]'/);
});

test('CoursePlayer builds the exact open-close-open-exit browser Back stack', () => {
  const exitIndex = course.indexOf("dcCourseBackStep: 'exit-ready'");
  const closedIndex = course.indexOf("dcCourseBackStep: 'closed-cycle'", exitIndex);
  const initialIndex = course.indexOf("dcCourseBackStep: 'initial-open'", closedIndex);
  assert.ok(exitIndex >= 0 && closedIndex > exitIndex && initialIndex > closedIndex);
  assert.match(course, /window\.history\.replaceState\(exitReadyModulesState/);
  assert.match(course, /window\.history\.pushState\(closedCycleState/);
  assert.match(course, /window\.history\.pushState\(initialModulesState/);
  assert.match(course, /setIsSidebarOpen\(layer === 'modules'\)/);
  assert.match(course, /window\.history\.back\(\)/);
  assert.doesNotMatch(course, /dcCoursePanelCycleReady/);
  assert.doesNotMatch(course, /dcCourseExitAfterModules/);
  assert.match(course, /dcCourseBackStep: 'lesson-closed'/);
});

test('Community color studio is mode-specific and Social Workspace uses real surface variables', () => {
  assert.match(app, /latestPalette/);
  assert.match(app, /socialPalette/);
  assert.match(app, /classicPalette/);
  assert.match(settings, /selectedCommunityMode/);
  assert.match(settings, /selectedCommunityPaletteKey/);
  assert.match(settings, /updateSelectedCommunityPalette/);
  assert.match(settings, /Social Workspace colors/);
  assert.match(settings, /Live \{selectedCommunityMode\} preview/);
  assert.match(community, /activeCommunityPaletteMode/);
  assert.match(community, /--community-header-bg/);
  assert.match(community, /--community-sidebar-bg/);
  assert.match(community, /--community-composer-bg/);
  assert.match(community, /--community-right-rail-bg/);
});

test('Community header avoids social right-rail overlap without removing actions', () => {
  assert.match(community, /community-desktop-header-actions[^"]*flex-wrap/);
  assert.match(community, /community-desktop-feed-filters[^"]*2xl:flex/);
  assert.match(community, /grid-cols-\[minmax\(10rem,0\.75fr\)_minmax\(0,1\.25fr\)\]/);
  assert.match(community, /<h3>Requests<\/h3>/);
  assert.match(community, /<h3>Suggestions for you<\/h3>/);
  assert.match(community, /useSocialDesktopLayout \? <SocialDesktopRightRail \/> : null/);
});
