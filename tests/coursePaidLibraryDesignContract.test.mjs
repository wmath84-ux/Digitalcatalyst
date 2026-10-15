// Owner brief (5 points):
//   1. Resource Library ka search box hatao — and keep the rest of its
//      design/appearance unchanged.
//   2. Paid-page listing ka design module resources ki library ke bilkul
//      same karo.
//   3. Paid resources mein folder ke naam se pehle lock icon dikhao.
//   4. Paid resources ka price clearly dikhao.
//
// These tests pin exactly that: no search anywhere near the Resource
// Library (markup, state, or leftover styles), the Paid listing rendered
// through the library's own BranchedMenu with the library's own props and
// row marks, a lock in the folder head's icon slot (before the name), and
// a clear price mark on every paid folder (and its Unlock leaf).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const library = read('src/course/CourseResourceLibrary.tsx');
const libraryCss = read('src/course/courseResourceLibrary.css');
const overlay = read('src/course/CourseOverlay.tsx');
const menu = read('src/components/branched-menu/BranchedMenu.tsx');

/* ── 1 · No search box in the Resource Library ─────────────────────────── */

test('the Resource Library renders no search box and carries no search state', () => {
  assert.doesNotMatch(library, /LibrarySearchBar|searchQuery|data-library-search|library-search|type="search"|placeholder="Search/);
  // The header + branched listing that remain are the existing design.
  assert.match(library, /<CoursePageHeader\n        title="Resource Library"/);
  assert.match(library, /<BranchedMenu/);
  assert.match(library, /data-course-library-menu/);
});

test('no dead search styles remain in the library sheet; the rest is untouched', () => {
  assert.doesNotMatch(libraryCss, /\.library-search|library-no-results/);
  // The existing layout/appearance rules are all still there.
  for (const kept of ['.course-resource-library {', '.library-body {', '.course-library__menu {', '.library-header__count {', '.course-library__lock {']) {
    assert.ok(libraryCss.includes(kept), `library sheet must keep ${kept}`);
  }
});

/* ── 2 · Paid listing = the module resources library's design ──────────── */

test('the Paid page renders through the same BranchedMenu with the same props', () => {
  const panel = overlay.slice(overlay.indexOf('function PaidLibraryPanel'));
  assert.match(panel, /<BranchedMenu/);
  // The Modules library's exact menu configuration (CourseResourceLibrary).
  for (const prop of ['fullWidth', 'rowHeight={40}', 'fontSize={14}', 'indent={40}', 'className="course-library__menu"']) {
    assert.ok(panel.includes(prop), `paid menu must use ${prop}`);
    assert.ok(library.includes(prop), `modules library must use ${prop}`);
  }
  assert.match(panel, /ariaLabel="Paid course content"/);
  assert.match(panel, /"data-listing": "paid"/);
  assert.match(library, /"data-listing": "modules"/);
  // Same scroll body class as the library.
  assert.match(panel, /className="library-body" data-course-paid-library/);
  // The overlay wires the real data + buy handlers into the panel, and the
  // StudyContent paid branch renders it under the shared page header.
  assert.match(overlay, /<PaidLibraryPanel\n          updates=\{props\.updates\}/);
  assert.match(overlay, /onBuyUpdate=\{props\.onBuyUpdate\}/);
  assert.match(overlay, /paidPanel=\{/);
});

/* ── 3 · Lock icon before the folder name ──────────────────────────────── */

test('section heads render an icon before the name; paid folders use it for the lock', () => {
  // BranchedMenu's head: icon slot ahead of the head-label (library pages
  // pass no section icon, so their heads are visually unchanged).
  const head = menu.slice(menu.indexOf('branched-menu__head-label') - 400, menu.indexOf('branched-menu__head-label'));
  assert.match(head, /branched-menu__icon/);
  assert.ok(menu.indexOf('branched-menu__icon') < menu.indexOf('branched-menu__head-label'));
  // Every paid folder (update + module) passes the amber lock as that icon.
  const panel = overlay.slice(overlay.indexOf('function PaidLibraryPanel'));
  assert.match(panel, /const folderLock = <LockKeyhole size=\{16\}/);
  assert.equal((panel.match(/icon: folderLock,/g) || []).length, 2);
  assert.match(panel, /className="course-library__lock"/);
  // The library sheet still owns the lock's colour.
  assert.match(libraryCss, /\.course-library__lock \{\n  color: #fbbf24;\n\}/);
});

/* ── 4 · Price, clearly ────────────────────────────────────────────────── */

test('every paid folder shows its price in the library price mark', () => {
  const panel = overlay.slice(overlay.indexOf('function PaidLibraryPanel'));
  // Updates: ₹ price on the folder AND on its Unlock leaf.
  assert.match(panel, /const priceLabel = `₹\$\{update\.price\.toLocaleString\("en-IN"\)\}`;/);
  assert.match(panel, /label: "Unlock this update",[\s\S]*?meta: price\(priceLabel\),/);
  // Modules: their own paidUpdatePrice, or the owning update's ₹ price.
  assert.match(panel, /module\.paidUpdatePrice\?\.trim\(\)/);
  assert.match(panel, /label: "Unlock this module",[\s\S]*?meta: priceLabel \? price\(priceLabel\) : undefined,/);
  // The price mark itself: full-weight, tabular, never truncated.
  assert.match(panel, /<span className="course-library__price" data-paid-price>/);
  assert.match(libraryCss, /\.course-library__price \{\n  font-size: 12px;\n  font-weight: 800;[\s\S]*?white-space: nowrap;/);
  // Buy actions keep the overlay's existing hooks + handlers.
  assert.match(panel, /"data-course-overlay-buy-update": String\(update\.id\)/);
  assert.match(panel, /"data-course-overlay-buy-module": moduleId/);
  assert.match(panel, /buyByValue\.set\(buyValue, \(\) => onBuyUpdate\(update\)\)/);
  assert.match(panel, /buyByValue\.set\(buyValue, \(\) => onBuyModule\(\{/);
  // Locked contents stay visible-but-unselectable, like the library's.
  assert.match(panel, /disabled: true,\n          meta: leafLock,/);
});
