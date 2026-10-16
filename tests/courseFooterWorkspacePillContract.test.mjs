// Owner brief: "Workspace ke existing pill-style footer navigation ka exact
// design Course Player ke footer navigation mein use karo" — with the footer
// area's size unchanged, extra buttons reachable by left/right swipe, and
// the Workspace drawer's design itself untouched.
//
// So the Course Player footer must BE the Workspace pill (same component
// hooks, same stylesheet), not a look-alike: these tests pin the shared
// markup + shared CSS, the unchanged area geometry, the swipe, and the
// Workspace footer's own files staying exactly as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const dock = read('src/course/CoursePeekDock.tsx');
const stripCss = read('src/course/course-strip-nav.css');
const workNav = read('src/work/WorkFooterNav.tsx');
const workCss = read('src/work/work-footer-nav.css');
const overlay = read('src/course/CourseOverlay.tsx');

test('the course footer renders the Workspace pill markup, cell for cell', () => {
  // Same hooks, same nesting as WorkFooterNav (workPages pill).
  assert.match(dock, /<div data-work-footer-nav="" data-course-work-pill="" data-position="flow">/);
  assert.match(dock, /<div\s+data-site-footer=""/);
  assert.match(dock, /<div data-work-nav-row="">/);
  assert.match(dock, /data-work-nav-cell=\{item\.key\}/);
  assert.match(dock, /<span data-work-nav-icon="" aria-hidden="true">/);
  // Same selection semantics: current destination + its own accent inline.
  assert.match(dock, /aria-current=\{isActive \? 'page' : undefined\}/);
  assert.match(dock, /'--work-nav-active': item\.color/);
  // Course identity hooks survive for the player's own contracts.
  assert.match(dock, /<nav ref=\{navRef\} data-course-strip-nav/);
  assert.match(dock, /data-course-strip=\{item\.key\}/);
});

test('the design is the Workspace stylesheet itself — imported, never forked', () => {
  // The shared sheet is imported immediately before the course overrides, so
  // the shared paint wins every tie it owns.
  assert.match(dock, /import '\.\.\/work\/work-footer-nav\.css'\nimport '\.\/course-strip-nav\.css'/);
  // The course sheet carries NO pill paint of its own (no radius/shadow/plate
  // rules, no cell colours) — only the area + fit overrides below.
  assert.doesNotMatch(stripCss, /border-radius: 40px|box-shadow|0 10px 15px/);
  assert.doesNotMatch(stripCss, /\[data-work-nav-cell\][^{]*\{[^}]*color/);
});

test('every course tool is a pill cell with the Workspace button dimensions', () => {
  // All TABS tools render (no cap like the Workspace drawer's 8-cell width
  // budget — the excess scrolls instead, see the swipe test).
  assert.match(dock, /const items = TABS\.filter\(item => !hiddenTabs\.includes\(item\.key\)\)/);
  assert.match(dock, /data-nav-count=\{String\(items\.length\)\}/);
  assert.doesNotMatch(dock, /Math\.min\(8/);
  // The Workspace button dimension the course cells take: 26px icons inside
  // 46px cells (the design's width for a crowded 7–8 cell dock).
  assert.match(dock, /<Icon size=\{26\} \/>/);
  assert.match(stripCss, /--work-nav-cell: 46px;/);
  // …and the Workspace cell's other dimensions (26px glyph box) are the
  // shared stylesheet's own rules, still in force for both footers.
  assert.match(workCss, /\[data-work-nav-icon\] > svg \{\s+display: block;\s+width: 26px;\s+height: 26px;/);
});

test('the footer area keeps its exact size — only the pill token is fitted', () => {
  // The strip's box is byte-for-byte the one the old buttons lived in.
  assert.match(stripCss, /\[data-course-strip-nav\] \{\n  flex: 0 0 auto; min-width: 0; width: 100%; z-index: 80;/);
  assert.match(stripCss, /padding: 0 max\(8px, env\(safe-area-inset-right\)\) max\(4px, env\(safe-area-inset-bottom\)\) max\(8px, env\(safe-area-inset-left\)\);/);
  assert.match(stripCss, /background: #fff; border-top: 1px solid #e2e8f0;/);
  // Its content was 44px tall; the pill's height token takes exactly 44px,
  // and the cells take the same 44px (9px + 26px icon + 9px).
  assert.match(stripCss, /--work-nav-h: 44px;/);
  assert.match(stripCss, /\[data-work-nav-cell\] \{\n  height: 44px;\n  padding: 9px 12px;\n\}/);
  // Nothing about the area is fixed-position or stretched full-bleed.
  assert.doesNotMatch(stripCss, /position: fixed|position: absolute/);
});

test('extra buttons are reachable by left/right swipe inside the pill', () => {
  // The pill is the horizontal scroller; the row sizes to its cells so the
  // overflow is real scrollable distance, and the pill centres when it fits.
  assert.match(stripCss, /\[data-site-footer\]\[data-nav-count\] \{[\s\S]*?overflow-x: auto;/);
  assert.match(stripCss, /width: fit-content;\n  max-width: 100%;/);
  assert.match(stripCss, /\[data-work-nav-row\] \{\n  width: max-content;/);
  // No shrinking-to-fit trick: cells keep their fixed Workspace width.
  assert.doesNotMatch(stripCss, /flex: 1|scale\(|zoom/);
  // Keyboard users keep the strip's roving focus + scroll-into-view.
  assert.match(dock, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/);
});

test('the Workspace footer itself is untouched', () => {
  // Its component still renders the same pill from the same registry…
  assert.match(workNav, /data-work-footer-nav=""/);
  assert.match(workNav, /data-work-nav-cell=\{cell\.id\}/);
  assert.match(workNav, /const count = Math\.max\(1, Math\.min\(8, cells\.length\)\);/);
  // …and its design tokens are the reference's, unedited: 60px pill, 40px
  // radius, soft shadow, 70px cells, opacity ramp, −4px lift.
  assert.match(workCss, /height: var\(--work-nav-h, 60px\);/);
  assert.match(workCss, /border-radius: 40px;/);
  assert.match(workCss, /box-shadow: var\(--work-nav-shadow, 0 10px 15px rgba\(0, 0, 0, 0\.041\)\);/);
  assert.match(workCss, /height: 70px;/);
  assert.match(workCss, /opacity: 0\.8;/);
  assert.match(workCss, /transform: translateY\(-4px\);/);
  // The course pill does not register as the measured site footer.
  assert.doesNotMatch(dock, /data-site-footer-nav=""/);
  // Nor did the pill leak into the in-pane dock or other course surfaces.
  assert.match(overlay, /const dock = props\.peekDock \|\| props\.quad \? null : \(/);
});
