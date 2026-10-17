// Owner brief (5 points, 2026-10-15 — amended 2026-10-16):
//   1. The Resource Library's OLD dead search styles were removed, and on
//      2026-10-16 the owner asked for a REAL one: one box in the header that
//      reaches the whole library AND YouTube, opening a nested search page.
//      The rest of its design/appearance stays unchanged.
//   2. Paid-page listing ka design module resources ki library ke bilkul
//      same karo.
//   3. Paid resources mein folder ke naam se pehle lock icon dikhao.
//   4. Paid resources ka price clearly dikhao.
//
// These tests pin exactly that: the library's search is the SHARED experience
// (no dead, hand-rolled search state anywhere), the Paid listing rendered
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

/* ── 1 · The library's search is the SHARED one ────────────────────────── */

test('the Resource Library searches through the shared kit, and names itself on the page', () => {
  // The header no longer carries the name/icon/count: they are the page's own
  // title row now (owner brief, 2026-10-16), and the strip holds the search box.
  assert.match(library, /data-library-title-row/);
  assert.match(library, /data-course-page-title>Resource Library<\/h2>/);
  assert.match(library, /library-header__count/);
  assert.match(library, /data-library-search-open-button/);
  assert.match(library, /<SlidingSearchText text=\{STUDY_SEARCH_SENTENCE\}/);
  // The nested search page: back arrow, box with Enter inside it, the
  // self-convertible format button — and the shared loading/history pieces.
  assert.match(library, /data-library-search-back/);
  assert.match(library, /data-library-search-enter/);
  assert.match(library, /data-library-search-format-toggle/);
  assert.match(library, /<SearchFlashScan rows=\{5\}/);
  assert.match(library, /<SearchHistoryList/);
  // ONE search, two answers: the library's own rows and YouTube.
  assert.match(library, /matchResources\(/);
  assert.match(library, /await searchYouTube(Outcome)?\(text/);
  assert.match(library, /useStudySearch<LibrarySearchResults>\(\{\n    namespace: "course-library",/);
  // No hand-rolled search state of its own anywhere.
  assert.doesNotMatch(library, /searchQuery|setSearchQuery/);
  // The header + branched listing that were already there are untouched.
  assert.match(library, /<CoursePageHeader/);
  assert.match(library, /<BranchedMenu/);
  assert.match(library, /data-course-library-menu/);
});

test('the library sheet owns the search layout, and no dead search styles', () => {
  // The box's own layout is this sheet's; its shared LOOK is the kit's.
  assert.match(libraryCss, /\.library-searchbox \{/);
  assert.match(libraryCss, /\.library-searchbar__enter \{/);
  assert.match(libraryCss, /\.library-search-page \{/);
  assert.match(libraryCss, /\.library-title-row \{/);
  assert.doesNotMatch(libraryCss, /library-no-results|library-search-input|LibrarySearchBar/);
  // The page is PURE white, header and body included (owner brief).
  assert.match(libraryCss, /\.course-resource-library \{[\s\S]*?background: #ffffff;/);
  assert.match(libraryCss, /\.library-body \{[\s\S]*?background: #ffffff;/);
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
  assert.match(overlay, /<PaidLibraryPanel\s+updates=\{props\.updates\}/);
  // The same node serves the study body AND the plus deck's free blocks.
  assert.match(overlay, /const paidLibraryNode = /);
  assert.match(overlay, /paidPanel=\{paidLibraryNode\}/);
  assert.match(overlay, /onBuyUpdate=\{props\.onBuyUpdate\}/);
  assert.match(overlay, /paidPanel=\{/);
});

/* ── 3 · Lock icon before the folder name ──────────────────────────────── */

test('a folder carries ONE lock — separate resources carry their own', () => {
  // BranchedMenu's head: icon slot ahead of the head-label (library pages
  // pass no section icon, so their heads are visually unchanged).
  const head = menu.slice(menu.indexOf('branched-menu__head-label') - 400, menu.indexOf('branched-menu__head-label'));
  assert.match(head, /branched-menu__icon/);
  assert.ok(menu.indexOf('branched-menu__icon') < menu.indexOf('branched-menu__head-label'));
  const panel = overlay.slice(overlay.indexOf('function PaidLibraryPanel'), overlay.indexOf('function ComingSoonPanel'));
  // Owner's rule: "agar folder hai to keval folder per ek baar" — the folder
  // head is the ONE row that shows a lock, and it shows it once.
  assert.match(panel, /const folderLock = <LockKeyhole size=\{16\}/);
  assert.equal((panel.match(/icon: folderLock,/g) || []).length, 1);
  assert.equal((panel.match(/folderLock/g) || []).length, 2); // declaration + that one use
  // Everything INSIDE a folder is locked by being in it: no second lock, and
  // no lock mark on the content rows at all.
  const contents = panel.slice(panel.indexOf('entry.contents.forEach'), panel.indexOf('items.push({\n        value: `${entry.kind}:${entry.id}`'));
  assert.match(contents, /disabled: true,/);
  assert.doesNotMatch(contents, /LockKeyhole|folderLock|rowLock/);
  // "alag-alag resources hai to sab per individual lock" — a separate resource
  // is a row of its own and carries its own lock (the library's own lock mark).
  assert.match(panel, /const rowLock = <LockKeyhole size=\{12\}/);
  const resourceRow = panel.slice(panel.indexOf('if (entry.kind === "resource")'), panel.indexOf('// ── A purchasable thing'));
  assert.match(resourceRow, /meta: \([\s\S]*?\{rowLock\}/);
  assert.match(resourceRow, /"data-course-paid-row": "resource"/);
  assert.match(resourceRow, /"data-locked": "true"/);
  // The library sheet still owns the lock's colour.
  assert.match(libraryCss, /\.course-library__lock \{\n  color: #fbbf24;\n\}/);
});

/* ── 4 · One row per thing, price clearly, straight to the product page ── */

test('every paid thing is listed once, priced, and opens the product page', () => {
  const panel = overlay.slice(overlay.indexOf('function PaidLibraryPanel'), overlay.indexOf('function ComingSoonPanel'));
  // The dedupe is the shared rule, not a local filter: an update that already
  // holds a paid module never lists that module a second time.
  assert.match(panel, /const entries = buildPaidEntries\(\{ updates, modules, ownedUpdateIds \}\);/);
  assert.match(overlay, /import \{ buildPaidEntries, modulePriceLabel, type PaidContentEntry \} from "\.\/paidListing";/);
  // Updates: the price comes from the model; the leaf keeps its own mark.
  assert.match(panel, /label: entry.kind === "module" \? "Unlock this module" : "Unlock this update",/);
  assert.match(panel, /meta: priceLabel \? price\(priceLabel\) : undefined,/);
  // Modules: their own paidUpdatePrice, or the owning update's ₹ price.
  assert.match(panel, /modulePriceLabel\(entry, updates\)/);
  assert.match(panel, /const priceLabel = entry.kind === "module" \? modulePriceLabel\(entry, updates\) \|\| "" : entry.priceLabel \|\| "";/);
  // The price mark itself: full-weight, tabular, never truncated.
  assert.match(panel, /<span className="course-library__price" data-paid-price>/);
  assert.match(libraryCss, /\.course-library__price \{\n  font-size: 12px;\n  font-weight: 800;[\s\S]*?white-space: nowrap;/);
  // Buy actions keep the overlay's existing hooks, and every one of them now
  // hands the product detail page the row key of the thing that was tapped.
  assert.match(panel, /"data-course-overlay-buy-update": entry.id/);
  assert.match(panel, /"data-course-overlay-buy-module": entry.id/);
  // both the buy leaves and the separate-resource row go through it
  assert.equal((panel.match(/\(\) => openPaid\(entry\)\)/g) || []).length, 2);
  assert.match(panel, /"data-paid-key": entry.paidKey,/);
  assert.match(panel, /onOpenPaid\(entry\.paidKey\);/);
  assert.match(panel, /"data-course-paid-folder": entry.kind,/);
});
