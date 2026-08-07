import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const header = fs.readFileSync('components/CoursePlayerHeader.tsx', 'utf8');

test('CoursePlayer Header renders on every course page and carries SYNERGY LMS branding', () => {
  assert.match(header, /SYNERGY/);
  assert.match(header, /LMS Portal/);
  assert.match(header, /bg-gradient-to-b from-\[#E6F0FA\] to-white/);
  assert.match(header, /text-\[#1A2B4C\]/);
  assert.match(header, /bg-red-500/);
  assert.match(header, /NotificationBellIcon/);
  assert.match(header, /SearchIcon/);
  assert.match(header, /ProfileSilhouetteIcon/);
  assert.match(course, /import CoursePlayerHeader from '\.\/CoursePlayerHeader';/);
  assert.match(course, /<CoursePlayerHeader[\s\S]*currentUser=\{currentUser\}/);
  assert.match(course, /course-player-synergy-header order-first[\s\S]*lg:hidden/);
  assert.match(course, /course-player-synergy-header shrink-0 rounded-none border-b[\s\S]*lg:hidden/);
});

test('two system backs inside 50ms instantly escape the CoursePlayer back stack', () => {
  assert.match(course, /const lastCoursePopStateAtRef = useRef\(0\);/);
  assert.match(course, /const fastDoubleBackEscapeRef = useRef\(false\);/);
  assert.match(course, /const isFastDoubleBack = now - lastCoursePopStateAtRef\.current <= 50;/);
  assert.match(course, /fastDoubleBackEscapeRef\.current = true;/);
  assert.match(course, /window\.setTimeout\(\(\) => window\.history\.back\(\), 0\);/);
  assert.match(course, /if \(state\.dcView !== 'coursePlayer'\) return;/);
});

test('fast double back still preserves the App-level return target (My Purchases or Product)', () => {
  assert.match(app, /handleNavigateBack\('myPurchases'\)/);
  assert.match(app, /if \(nextView === 'product'\)[\s\S]*restoreProductForNavigation\(targetProductId\)/);
  assert.match(app, /nextView = 'myPurchases';/);
});
