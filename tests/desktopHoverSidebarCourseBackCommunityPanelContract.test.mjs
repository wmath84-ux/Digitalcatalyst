import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const homeDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');

test('hidden desktop site navigation previews on mouse hover and leaves content offset unchanged', () => {
  assert.match(homeDock, /sidebarState === 'hidden' && \(/);
  assert.match(homeDock, /beginHoverPreview\(event\.pointerType\)/);
  assert.match(homeDock, /scheduleHoverClose\(event\.pointerType\)/);
  assert.match(homeDock, /Hover to preview · click to keep open/);
  assert.match(homeDock, /const layoutWidth = sidebarState === 'hidden' \? 0/);
  assert.match(homeDock, /data-temporary-preview/);
  assert.match(homeDock, /setPersistentState\('hidden'\)/);
});

test('CoursePlayer back sequence cycles modules once and then exits', () => {
  assert.match(course, /dcCoursePanelCycleReady/);
  assert.match(course, /dcCourseExitAfterModules/);
  assert.match(course, /courseExitAfterModulesRef/);
  assert.match(course, /window\.history\.replaceState\(modulesState/);
  assert.match(course, /window\.history\.pushState\(\{/);
  assert.match(course, /window\.setTimeout\(\(\) => window\.history\.back\(\), 0\)/);
  assert.match(course, /dcCourseLessonSelection === true[\s\S]*dcCoursePanelCycleReady === true/);
  assert.match(course, /setIsSidebarOpen\(layer === 'modules'\)/);
  assert.match(course, /closeCourseSidebarAfterLessonSelection\(file\.id\)/);
});

test('Community desktop side panel defaults compact and supports hover, pin and hidden trigger states', () => {
  assert.match(community, /type CommunityDesktopSidebarState = 'compact' \| 'pinned' \| 'hidden'/);
  assert.match(community, /return 'compact'/);
  assert.match(community, /beginDesktopSidebarPreview/);
  assert.match(community, /scheduleDesktopSidebarPreviewClose/);
  assert.match(community, /community-desktop-sidebar-trigger/);
  assert.match(community, /Hover to preview · click to pin/);
  assert.match(community, /setPersistentDesktopSidebarState\('hidden'\)/);
  assert.match(community, /Close Community side panel to the three-dot trigger/);
  assert.match(community, /data-community-sidebar-state/);
});

test('pinned Community side panel hides only the social desktop right rail', () => {
  assert.match(community, /useSocialDesktopLayout && desktopSidebarState !== 'pinned' \? <SocialDesktopRightRail/);
  assert.match(community, /<h3>Requests<\/h3>/);
  assert.match(community, /<h3>Suggestions for you<\/h3>/);
  assert.match(community, /desktopSidebarState === 'pinned'/);
});
