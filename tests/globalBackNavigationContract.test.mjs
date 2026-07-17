import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const communitySource = readFileSync(new URL('../components/EduvoraCommunity.tsx', import.meta.url), 'utf8');
const courseSource = readFileSync(new URL('../components/CoursePlayer.tsx', import.meta.url), 'utf8');

test('reading drawer consumes its own browser back close step', () => {
  assert.match(appSource, /const nextViewAfterReading = normalizeHistoryView\(event\.state\?\.dcView\);/);
  assert.match(appSource, /if \(!historyOverlay && \(!nextViewAfterReading \|\| nextViewAfterReading === currentViewRef\.current\)\) \{\n\s+return;/);
});

test('community profile subpages are represented in history state', () => {
  assert.match(communitySource, /dcCommunityProfileViewMode/);
  assert.match(communitySource, /const pushProfileHistory = \(/);
  assert.match(communitySource, /applyCommunityProfileHistoryState\(state\)/);
  assert.match(communitySource, /pushProfileHistory\('edit', \{ selectedProfileId: null \}\)/);
  assert.match(communitySource, /pushProfileHistory\('settings', \{ selectedProfileId: null \}\)/);
  assert.match(communitySource, /pushProfileHistory\('relations', \{ profileRelationTab: tab \}\)/);
  assert.match(communitySource, /pushProfileHistory\('post', \{ profileSelectedPostId: messageId \}\)/);
});

test('story/profile jumps preserve the previous community page', () => {
  assert.match(communitySource, /if \(ownerId\) \{ setSelectedProfileId\(ownerId\); setProfileViewMode\('overview'\); setProfileContentTab\('posts'\); pushPage\('profile'\); \}/);
});

test('mobile CoursePlayer seeds open-close-open entries before the app exit boundary', () => {
  assert.ok(courseSource.includes("const courseHistoryReadyRef = useRef(false);"));
  assert.ok(courseSource.includes("dcCourseBackStep: 'exit-ready'"));
  assert.ok(courseSource.includes("dcCourseBackStep: 'closed-cycle'"));
  assert.ok(courseSource.includes("dcCourseBackStep: 'initial-open'"));
  assert.ok(courseSource.includes("window.history.replaceState(exitReadyModulesState, '', window.location.href);"));
  assert.ok(courseSource.includes("window.history.pushState(closedCycleState, '', window.location.href);"));
  assert.ok(courseSource.includes("window.history.pushState(initialModulesState, '', window.location.href);"));
  assert.ok(courseSource.includes("if (!courseHistoryReadyRef.current || courseHistoryRestoringRef.current) return;"));
});

test('course player module panel and AI mentor remain browser-back layers', () => {
  assert.match(courseSource, /dcCourseLayer/);
  assert.match(courseSource, /writeCourseHistoryLayer\('mentor', 'push'\)/);
  assert.match(courseSource, /writeCourseHistoryLayer\('modules', 'push'\)/);
  assert.match(courseSource, /if \(isMentorOpenRef\.current\) \{\n\s+closeCourseMentor\(\);\n\s+return;\n\s+\}/);
  assert.match(courseSource, /window\.history\.state\?\.dcView === 'coursePlayer'[\s\S]*window\.history\.back\(\)/);
});
