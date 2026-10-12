// The old reveal-only handle has been replaced by direct coloured strips.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const nav = read('src/course/CoursePeekDock.tsx');
const css = read('src/course/course-strip-nav.css');
const player = read('src/CoursePlayerApp.tsx');
test('course strips replace both the old reveal handle and duplicate pane dock', () => {
  assert.match(nav, /data-course-strip-nav/);
  assert.doesNotMatch(nav, /<GlassDock|<GlassMaterial|data-course-peek-line/);
  assert.match(player, /\n      peekDock\n/);
  assert.doesNotMatch(player, /legacyFooterDock/);
  assert.match(player, /<CoursePeekDock tab=\{dockTab\}/);
});
test('every available study tool remains reachable and keyboard accessible', () => {
  assert.match(nav, /TABS.filter\(item => !hiddenTabs.includes\(item.key\)\)/);
  assert.match(nav, /onClick=\{\(\) => onTabChange\(item.key\)\}/);
  assert.match(nav, /aria-label=\{item.heading\}/);
  assert.match(nav, /ArrowLeft.*ArrowRight.*Home.*End/);
  assert.match(nav, /aria-pressed=\{tab === item.key\}/);
});
test('keyboard hides strips and the footer occupies real layout space', () => {
  assert.match(nav, /if \(keyboardVisible\) return null/);
  assert.match(css, /flex: 0 0 auto/);
  assert.doesNotMatch(css, /position: fixed/);
  assert.match(css, /safe-area-inset-bottom/);
});
test('strips have readable labels, large touch targets and horizontal overflow', () => {
  assert.match(css, /font-size: 14px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@container \(min-width: 720px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /background: var\(--strip-color\)/);
});
