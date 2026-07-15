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

test('course module panel resets expansion state on close, reopen and desktop collapse toggle', () => {
  assert.match(source, /const \[modulePanelResetKey, setModulePanelResetKey\] = useState\(0\)/);
  assert.match(source, /const resetCourseModulePanel = useCallback\(\(\) => \{/);
  assert.match(source, /setModulePanelResetKey\(value => value \+ 1\)/);
  assert.match(source, /const closeCourseSidebar = useCallback\(\(\) => \{\s*resetCourseModulePanel\(\);\s*setIsSidebarOpen\(false\);/s);
  assert.match(source, /const openCourseSidebar = useCallback\(\(\) => \{\s*resetCourseModulePanel\(\);\s*setIsMentorOpen\(false\);\s*setIsSidebarOpen\(true\);/s);
  assert.match(source, /onClick=\{\(\) => \{ resetCourseModulePanel\(\); setIsDesktopSidebarCollapsed\(value => !value\); \}\}/);
});
