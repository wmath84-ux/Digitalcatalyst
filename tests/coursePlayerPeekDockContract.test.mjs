// The Course Player's footer navigation IS the Workspace pill: the same
// markup hooks and the same stylesheet as src/work/WorkFooterNav.tsx, with
// every study tool as one of its cells. The footer's AREA (in-flow strip,
// 44px content height) is the strip it replaced — unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const nav = read('src/course/CoursePeekDock.tsx');
const css = read('src/course/course-strip-nav.css');
const player = read('src/CoursePlayerApp.tsx');
test('the Workspace pill replaces both the old reveal handle and duplicate pane dock', () => {
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
  // The Workspace cell's own selection semantics: the current destination.
  assert.match(nav, /aria-current=\{isActive \? 'page' : undefined\}/);
});
test('keyboard hides the pill and the footer occupies real layout space without a top spacer', () => {
  assert.match(nav, /if \(keyboardVisible \|\| immersivePage\) return null/);
  assert.match(css, /flex: 0 0 auto/);
  assert.doesNotMatch(css, /position: fixed/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /padding:\s*0 max\(8px, env\(safe-area-inset-right\)\)/);
  const overlay = read('src/course/CourseOverlay.tsx');
  assert.doesNotMatch(overlay, /peekPad|pb-\[calc\(max\(env\(safe-area-inset-bottom\),10px\)\+16px\)\]/);
});
test('the pill fits the unchanged 44px area and extra tools swipe inside it', () => {
  // The area token: the pill is exactly as tall as the buttons it replaced.
  assert.match(css, /--work-nav-h: 44px/);
  // The swipe: the pill itself scrolls horizontally, cells never shrink.
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /--work-nav-cell: 46px/);
  // Reachable names on every cell (aria-label + title), Workspace icon size.
  assert.match(nav, /title=\{item.heading\}/);
  assert.match(nav, /<Icon size=\{26\} \/>/);
});
test('the Workspace design itself is shared, not forked or restyled', () => {
  // The Workspace stylesheet is imported (immediately before the course
  // overrides) — the course strip carries no copy of the pill's paint.
  assert.match(nav, /import '\.\.\/work\/work-footer-nav\.css'\nimport '\.\/course-strip-nav\.css'/);
  assert.doesNotMatch(css, /course-strip-plate|course-strip-name|course-strip-track/);
  // The Workspace geometry the course pill inherits, still intact at home:
  const workCss = read('src/work/work-footer-nav.css');
  assert.match(workCss, /border-radius:\s*40px/);
  assert.match(workCss, /0 10px 15px rgba\(0, 0, 0, 0\.041\)/);
  assert.match(workCss, /translateY\(-4px\)/);
});
