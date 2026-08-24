// tests/storeFiltersAdminProductContract.test.mjs
//
// Contracts covered here:
//
//   1. STORE FILTERS MODEL — chips are admin-managed data (id/label/group/
//      active) with a legacy fallback so existing products keep matching.
//   2. ADMIN PANEL — the product editor exposes a "Store filters" tab where a
//      product is attached to filters AND brand-new filters can be created.
//   3. PERSISTENCE — filterIds round-trip Firestore → editor → Firestore and
//      reach the Store page through CatalogContext.
//   4. STORE PAGE — the chip row is driven by the live admin list and filters
//      products through the shared matcher.
//   5. PDP — the three small trust boxes (Secure checkout / Instant access /
//      Lifetime library) are gone.
//   6. LOOK — store and product detail use glassmorphism + shadows.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  ALL_STORE_FILTER,
  derivedStoreFilters,
  normalizeStoreFilters,
  productMatchesStoreFilter,
  slugifyStoreFilterId,
  STORE_FILTERS_DOC_ID,
  uniqueStoreFilterId,
} from "../src/data/storeFilters.ts";

const read = (rel) => fs.readFileSync(rel, "utf8");

const storePage = read("src/components/StorePage.tsx");
const filterChips = read("src/components/FilterChips.tsx");
const productCard = read("src/components/ProductCard.tsx");
const hero = read("src/components/Hero.tsx");
const pdp = read("src/PdpApp.tsx");
const editor = read("src/components/admin/products/ProductEditor.tsx");
const adminClient = read("src/lib/admin/client.ts");
const catalog = read("src/context/CatalogContext.tsx");
const mapping = read("utils/productMapping.js");
const productType = read("src/data/products.ts");
const hook = read("src/hooks/useStoreFilters.ts");

/* ------------------------------------------------------------------ */
/* 1. Model                                                            */
/* ------------------------------------------------------------------ */

test("store filters live in one public settings document", () => {
  assert.equal(STORE_FILTERS_DOC_ID, "storeFilters");
  assert.match(hook, /doc\(db, "settings", STORE_FILTERS_DOC_ID\)/);
  assert.match(hook, /onSnapshot\(/);
});

test("filter ids are slugified and de-duplicated", () => {
  assert.equal(slugifyStoreFilterId("Class 10 Boards"), "class-10-boards");
  assert.equal(uniqueStoreFilterId("Notes", []), "notes");
  assert.equal(uniqueStoreFilterId("Notes", ["notes"]), "notes-2");
  assert.equal(uniqueStoreFilterId("Notes", ["notes", "notes-2"]), "notes-3");
});

test("normalizeStoreFilters drops junk, de-duplicates and sorts", () => {
  const filters = normalizeStoreFilters([
    { id: "b", label: "Beta", sortOrder: 2 },
    { id: "a", label: "Alpha", sortOrder: 1 },
    { id: "a", label: "Alpha duplicate", sortOrder: 3 },
    { id: "no-label" },
    null,
    "nonsense",
  ]);
  assert.deepEqual(filters.map((filter) => filter.id), ["a", "b"]);
  assert.equal(filters[0].active, true);
});

test("a product matches a filter it was explicitly attached to", () => {
  const product = { filterIds: ["class-10-boards"], category: "Course", classLevel: "", subject: "", tags: [] };
  assert.equal(productMatchesStoreFilter(product, { id: "class-10-boards", label: "Class 10 Boards" }), true);
  assert.equal(productMatchesStoreFilter(product, { id: "class-9", label: "Class 9" }), false);
});

test("legacy products still match by category, class, subject or tag", () => {
  const legacy = { category: "Notes", classLevel: "Class 10", subject: "Physics", tags: ["BOARD"] };
  assert.equal(productMatchesStoreFilter(legacy, { id: "notes", label: "Notes" }), true);
  assert.equal(productMatchesStoreFilter(legacy, { id: "class-10", label: "Class 10" }), true);
  assert.equal(productMatchesStoreFilter(legacy, { id: "physics", label: "Physics" }), true);
  assert.equal(productMatchesStoreFilter(legacy, { id: "board", label: "board" }), true);
  assert.equal(productMatchesStoreFilter(legacy, { id: "chemistry", label: "Chemistry" }), false);
});

test("the All chip always matches and derived chips cover the catalog", () => {
  assert.equal(productMatchesStoreFilter({}, ALL_STORE_FILTER), true);
  const derived = derivedStoreFilters([{ category: "Course", classLevel: "Class 10", subject: "Physics" }]);
  assert.deepEqual(derived.map((filter) => filter.label).sort(), ["Class 10", "Course", "Physics"]);
});

/* ------------------------------------------------------------------ */
/* 2. Admin panel: attach products + create new filters                */
/* ------------------------------------------------------------------ */

test("product editor has a dedicated Store filters tab", () => {
  assert.match(editor, /\{ key: "filters", label: "Store filters" \}/);
  assert.match(editor, /tab === "filters" &&/);
  assert.match(editor, /<StoreFiltersEditor/);
});

test("the editor can attach the product to existing filters", () => {
  assert.match(editor, /filterIds: string\[\]/);
  assert.match(editor, /selectedIds\.includes\(id\)/);
  assert.match(editor, /update\("filterIds", filterIds\)/);
});

test("the editor can create, rename, reorder, hide and delete filters", () => {
  assert.match(editor, /function addFilter\(/);
  assert.match(editor, /function renameFilter\(/);
  assert.match(editor, /function moveFilter\(/);
  assert.match(editor, /function removeFilter\(/);
  assert.match(editor, /uniqueStoreFilterId\(label, filters\.map/);
  // A newly created filter is attached to the open product immediately.
  assert.match(editor, /onChange\(\[\.\.\.selectedIds, filter\.id\]\)/);
});

test("filter list changes are persisted through the admin API", () => {
  assert.match(editor, /adminFetch<\{ filters: StoreFilter\[\] \}>\("\/api\/admin\/store\/filters"\)/);
  assert.match(editor, /"\/api\/admin\/store\/filters", \{ method: "PATCH"/);
  assert.match(adminClient, /p==="\/api\/admin\/store\/filters"/);
  assert.match(adminClient, /doc\(db, "settings", STORE_FILTERS_DOC_ID\)/);
  assert.match(adminClient, /normalizeStoreFilters\(body\.filters\)/);
});

/* ------------------------------------------------------------------ */
/* 3. Persistence round trip                                           */
/* ------------------------------------------------------------------ */

test("filterIds are written to Firestore and read back into the editor", () => {
  assert.match(adminClient, /filterIds: strList\(normalizedBody\.filterIds\)/);
  assert.match(mapping, /filterIds: arr\(editor\.filterIds\?\.length \? editor\.filterIds : raw\.filterIds\)\.map\(String\)/);
});

test("the catalog exposes filterIds to the store page", () => {
  assert.match(productType, /filterIds\?: string\[\]/);
  assert.match(catalog, /filterIds:/);
  assert.match(catalog, /data\.adminProduct\?\.filterIds/);
});

/* ------------------------------------------------------------------ */
/* 4. Store page uses the live admin filters                           */
/* ------------------------------------------------------------------ */

test("store page renders the live admin filter chips", () => {
  assert.match(storePage, /useStoreFilters\(\)/);
  assert.match(storePage, /adminFilters\.filter\(\(filter\) => filter\.active\)/);
  // Falls back to derived chips so the row is never empty.
  assert.match(storePage, /derivedStoreFilters\(products\)/);
  assert.match(storePage, /\[ALL_STORE_FILTER, \.\.\.list\]/);
});

test("store page filters products through the shared matcher", () => {
  assert.match(storePage, /productMatchesStoreFilter\(p, activeFilter\)/);
  // A deleted or hidden chip must not keep filtering the grid.
  assert.match(storePage, /setActiveFilterId\(ALL_STORE_FILTER\.id\)/);
});

test("filter chips component is driven by filter objects", () => {
  assert.match(filterChips, /filters: StoreFilter\[\]/);
  assert.match(filterChips, /activeId: string/);
  assert.doesNotMatch(filterChips, /chips: string\[\]/);
});

/* ------------------------------------------------------------------ */
/* 5. PDP: the three small trust boxes are removed                     */
/* ------------------------------------------------------------------ */

test("product detail no longer shows the Secure checkout / Instant access / Lifetime library boxes", () => {
  assert.doesNotMatch(pdp, /Secure checkout/);
  assert.doesNotMatch(pdp, /Instant access/);
  assert.doesNotMatch(pdp, /Lifetime library/);
  // The Trust box component itself is gone, along with its icon imports.
  assert.doesNotMatch(pdp, /function Trust\(/);
  assert.doesNotMatch(pdp, /<Trust /);
  assert.doesNotMatch(pdp, /RotateCcw/);
});

/* ------------------------------------------------------------------ */
/* 6. Glassmorphism + shadows on store and product detail              */
/* ------------------------------------------------------------------ */

test("store surfaces use frosted glass, colour and depth", () => {
  for (const [name, source] of [["StorePage", storePage], ["ProductCard", productCard], ["FilterChips", filterChips], ["Hero", hero]]) {
    assert.match(source, /backdrop-blur/, `${name} should use backdrop blur`);
    assert.match(source, /bg-white\/\d/, `${name} should use translucent surfaces`);
    assert.match(source, /shadow-/, `${name} should carry shadows`);
  }
  // Ambient colour behind the frosted layers.
  assert.match(storePage, /blur-3xl/);
  assert.match(hero, /from-indigo-600 via-violet-600 to-fuchsia-600/);
});

test("product detail uses the same glass treatment", () => {
  assert.match(pdp, /backdrop-blur-xl/);
  assert.match(pdp, /backdrop-blur-2xl/);
  assert.match(pdp, /bg-gradient-to-b from-indigo-50 via-slate-50 to-white/);
  assert.match(pdp, /shadow-\[0_16px_45px_-20px_rgba\(49,46,129,0\.55\)\]/);
});
