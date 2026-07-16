import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');

test('course module panel opens only the first top-level module by default', () => {
  assert.match(source, /defaultExpanded\?: boolean/);
  assert.match(source, /resetKey\?: number/);
  assert.match(source, /useState\(defaultExpanded\)/);
  assert.match(source, /setIsExpanded\(defaultExpanded\)/);
  assert.match(source, /courseContent\.map\(\(m, index\) =>/);
  assert.match(source, /defaultExpanded=\{index === 0\}/);
});

test('nested modules stay closed by default and inherit reset key', () => {
  assert.match(source, /key=\{`\$\{resetKey\}-\$\{subModule\.id\}`\}/);
  assert.match(source, /defaultExpanded=\{false\}/);
  assert.match(source, /resetKey=\{resetKey\}/);
});

test('course module panel preserves expansion during lesson navigation and resets only on course exit', () => {
  assert.match(source, /const \[modulePanelResetKey, setModulePanelResetKey\] = useState\(0\)/);
  assert.match(source, /const resetCourseModulePanel = useCallback\(\(\) => \{/);
  assert.match(source, /setModulePanelResetKey\(value => value \+ 1\)/);
  assert.match(source, /const closeCourseSidebar = useCallback\(\(\) => \{\s*setIsSidebarOpen\(false\);\s*closeCourseLayerHistory\('modules'\);\s*\}, \[closeCourseLayerHistory\]\);/s);
  assert.match(source, /const openCourseSidebar = useCallback\(\(\) => \{\s*setIsMentorOpen\(false\);\s*setIsSidebarOpen\(true\);\s*\}, \[\]\);/s);
  assert.match(source, /resetCourseModulePanel\(\);\s*void flushYoutubeCoins\('closed'\);\s*onBack\(\);/);
  assert.doesNotMatch(source, /resetCourseModulePanel\(\);\s*setIsSidebarOpen\(false\);/);
  assert.doesNotMatch(source, /resetCourseModulePanel\(\);\s*setIsMentorOpen\(false\);/);
  assert.doesNotMatch(source, /resetCourseModulePanel\(\); setIsDesktopSidebarCollapsed/);
});
