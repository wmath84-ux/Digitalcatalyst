// tests/productListingFilterAndEmptyStateContract.test.mjs
//
// Contract for the 2026-09-11 owner brief on the product marketplace's three
// shopping surfaces (Home, Store, My Purchases):
//
//   1. EMPTY STATE  — an empty product list is ONE designed component
//      (`EmptyProductState`) on every page, never a bare sentence.
//   2. FILTERS      — one filtering system (the store's admin chips + the
//      `FilterChips` component), mounted on all three pages through
//      `useProductFilters` / `ProductFilterBar`. No second implementation.
//   3. RADIUS       — the whole filter hierarchy takes one controlled corner
//      (`--dc-filter-radius`), not a set of capsules.
//   4. MY PURCHASES — a single-column list, a strict 1:1 thumbnail, a light
//      glacier glass card and a real page-level h1.
//   5. NOTHING ELSE moved — filtering semantics, product data and the store's
//      existing contracts stay exactly as they were.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(rel, "utf8");

const emptyState = read("src/components/EmptyProductState.tsx");
const filterBar = read("src/components/ProductFilterBar.tsx");
const filterChips = read("src/components/FilterChips.tsx");
const filterHook = read("src/hooks/useProductFilters.ts");
const home = read("src/home/App.tsx");
const storePage = read("src/components/StorePage.tsx");
const purchases = read("src/components/OtherTabs.tsx");
const indexCss = read("src/index.css");
const glassCss = read("src/glass.css");
const storeCss = read("src/store-glass.css");

/* ------------------------------------------------------------------ */
/* 1. One empty state, used by every product listing                   */
/* ------------------------------------------------------------------ */

test("the plain empty-category sentence is gone from the app", () => {
  const offenders = ["src/home/App.tsx", "src/components/StorePage.tsx", "src/components/OtherTabs.tsx"]
    .filter((file) => read(file).includes("No products in this category yet"));
  assert.deepEqual(offenders, [], `plain empty text left in: ${offenders.join(", ")}`);
});

test("EmptyProductState is a designed plate, not text in a box", () => {
  // glass surface + medallion + heading + supporting line + escape hatch.
  assert.match(emptyState, /<GlassCard/);
  assert.match(emptyState, /contentClassName="dc-empty"/);
  assert.match(emptyState, /className="dc-empty-art"/);
  assert.match(emptyState, /dc-empty-title/);
  assert.match(emptyState, /dc-empty-body/);
  assert.match(emptyState, /dc-empty-action/);
  // a drawn glyph, never an emoji, and it announces itself as a status.
  assert.match(emptyState, /export function EmptyShelfIcon/);
  assert.doesNotMatch(emptyState, /<span className="text-4xl">/);
  assert.match(emptyState, /role="status"/);
  // it is driven by the caller's state, so it works for any filter, not one.
  assert.match(emptyState, /heading = "No products found"/);
});

test("Home, Store and My Purchases all mount the same empty state", () => {
  for (const [name, source] of [["Home", home], ["Store", storePage], ["My Purchases", purchases]]) {
    assert.match(source, /import EmptyProductState from "[^"]*EmptyProductState"/, `${name} must import the shared component`);
    assert.match(source, /<EmptyProductState/, `${name} must render the shared component`);
    assert.doesNotMatch(source, /className="dc-empty"/, `${name} must not re-implement the empty markup`);
  }
  // Home's two empty paths (no category match, no search match) are both plated,
  // and each keeps a one-tap way out.
  assert.equal(home.match(/<EmptyProductState/g)?.length, 2, "Home plates both the filtered grid and the search miss");
  assert.match(home, /actionLabel=\{isFiltering \? "Clear filters" : undefined\}/);
  assert.match(home, /actionLabel="Clear search"/);
  // Store keeps its explanation + reset; Purchases distinguishes "owns
  // nothing" from "nothing under this filter".
  assert.match(storePage, /heading="No products found"/);
  assert.match(purchases, /heading="No purchases yet"/);
  assert.match(purchases, /actionLabel="Clear filters"/);
});

test("the empty plate stays compact", () => {
  // Width is capped and the block is centred; the padding is a card's, not a
  // hero's — no giant vertical space under an empty grid.
  assert.match(indexCss, /--dc-empty-max-width: 30rem;/);
  const card = /\.dc-empty-card \{([^}]*)\}/.exec(indexCss)?.[1];
  assert.ok(card, "expected a .dc-empty-card rule in index.css");
  assert.match(card, /max-width: var\(--dc-empty-max-width\)/);
  assert.match(card, /margin-inline: auto/);
  const empty = /\.dc-empty \{([^}]*)\}/.exec(indexCss)?.[1];
  assert.match(empty, /padding: 1\.75rem 1\.25rem/);
  assert.ok(!/padding: 2\.5rem/.test(indexCss), "the old full-height empty padding must be gone");
  // The medallion is a 3.25rem disc-ish square, not an illustration.
  assert.match(indexCss, /\.dc-empty-art \{[^}]*width: 3\.25rem/s);
});

/* ------------------------------------------------------------------ */
/* 2. One filtering system, three pages                                */
/* ------------------------------------------------------------------ */

test("Home and My Purchases reuse the store's filter component and data", () => {
  assert.match(filterBar, /import FilterChips from "\.\/FilterChips"/);
  assert.match(filterBar, /<FilterChips filters=\{chips\} activeId=\{activeId\} onSelect=\{onSelect\} variant=\{variant\}/);
  for (const [name, source] of [["Home", home], ["My Purchases", purchases]]) {
    assert.match(source, /<ProductFilterBar/, `${name} must mount the shared filter bar`);
    assert.doesNotMatch(source, /GlassToggleGroup|GlassTag\b/, `${name} must not build its own filter UI`);
  }
  // The store keeps its own sticky bar with the rail (full variant).
  assert.match(storePage, /<FilterChips filters=\{chips\} activeId=\{activeFilter\.id\} onSelect=\{setActiveFilterId\} \/>/);
  assert.match(filterChips, /variant\?: "full" \| "trigger"/);
});

test("the filter state comes from the store's admin model", () => {
  assert.match(filterHook, /useStoreFilters\(\)/);
  assert.match(filterHook, /adminFilters\.filter\(\(filter\) => filter\.active\)/);
  assert.match(filterHook, /derivedStoreFilters\(products\)/);
  assert.match(filterHook, /\[ALL_STORE_FILTER, \.\.\.list\]/);
  assert.match(filterHook, /productMatchesStoreFilter\(product, activeFilter\)/);
  // a chip that disappears stops filtering, exactly like the store page
  assert.match(filterHook, /setActiveFilterId\(ALL_STORE_FILTER\.id\)/);
  // Home and My Purchases read it instead of hand-rolling the wiring
  assert.match(home, /useProductFilters\(catalogProducts\)/);
  assert.match(purchases, /useProductFilters\(items\)/);
});

test("filtering still drives the lists it is wired to", () => {
  // Home: the store chip list narrows the grid, and the type strip composes
  // with it — the grid's length (not a hardcoded category) decides the state.
  assert.match(home, /productFilters\.visible\.map\(\(product\) => product\.id\)/);
  assert.match(home, /categoryFiltered\.length === 0/);
  // Purchases: the owned list is what gets filtered.
  assert.match(purchases, /const visible = filters\.visible/);
  assert.match(purchases, /\{visible\.map\(\(item\) => \(/);
});

/* ------------------------------------------------------------------ */
/* 3. One controlled radius across the filter hierarchy                */
/* ------------------------------------------------------------------ */

test("the filter radius is one moderate token, not a capsule", () => {
  const token = /--dc-filter-radius: (\d+)px;/.exec(glassCss)?.[1];
  assert.ok(token, "--dc-filter-radius must be pinned in px");
  const radius = Number(token);
  assert.ok(radius >= 8 && radius <= 12, `expected a ~10% controlled corner, got ${radius}px`);

  const block = glassCss.slice(glassCss.indexOf("THE FILTER HIERARCHY"));
  assert.ok(block.length > 400, "the filter CSS block must exist");
  for (const hook of [
    ".dc-filter-ui[data-store-filter-bar]",
    ".dc-segment",
    "[data-toggle]",
    ".dc-filter-trigger",
    ".dc-filter-active",
    "[data-store-view-options]",
    ".dc-glass-select",
    "[data-store-filter-overlay]",
    ".liquid-metal-button",
  ]) {
    assert.ok(block.includes(hook), `the filter hierarchy must re-corner ${hook}`);
  }
  // …and nothing inside it reaches for a pill.
  assert.doesNotMatch(block, /border-radius:\s*(9999px|999px|var\(--radius-full\))/);
  assert.doesNotMatch(block, /\.dc-segment [^{]*\{[^}]*rounded-full/);
  // The pages carry the hook on their filter containers.
  assert.match(storePage, /data-store-filter-bar className="[^"]*dc-filter-ui[^"]*rounded-\[var\(--dc-filter-radius\)\]/);
  assert.match(filterBar, /"dc-filter-ui/);
  assert.match(filterChips, /className=\{cn\("relative px-4", className\)\}/);
  // The empty-state action is a filter control too, so it rounds like one.
  assert.match(indexCss, /\.dc-empty-action \{[^}]*border-radius: var\(--dc-filter-radius\)/s);
  assert.match(indexCss, /\.dc-empty-art \{[^}]*calc\(var\(--dc-filter-radius\) \+ 4px\)/s);
});

/* ------------------------------------------------------------------ */
/* 4. My Purchases — list, square, glacier, heading                    */
/* ------------------------------------------------------------------ */

test("My Purchases is one column on every screen, width-capped", () => {
  const bare = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");
  // No breakpoint may put the purchases list back into a multi-column grid.
  for (const rule of bare.match(/\[data-store-list\][^{]*\{[^}]*\}|\[data-library-list\][^{]*\{[^}]*\}/g) || []) {
    if (rule.includes("data-library-list")) {
      assert.doesNotMatch(rule, /grid-template-columns:\s*repeat/, "My Purchases must never tile");
      assert.match(rule, /flex-direction: column/);
    }
  }
  assert.ok(
    (bare.match(/\[data-library-list\][^{]*\{[^}]*\}/g) || []).length >= 1,
    "expected the single-column rule for [data-library-list]",
  );
  assert.match(purchases, /data-library-list className="mt-4 flex flex-col gap-3"/);
  // Sensible measure on a large desktop, and it stays centred.
  assert.match(purchases, /mx-auto w-full max-w-3xl/);
});

test("the purchased card is a 1:1 glacier glass row", () => {
  // square media, cropped not stretched, and free of the row's stretch
  assert.match(purchases, /aspect-square w-24 shrink-0 self-center/);
  assert.match(purchases, /className="absolute inset-0 h-full w-full object-cover/);
  assert.doesNotMatch(purchases, /h-16 w-24/, "the old fixed 3:2 thumbnail is gone");
  // the app's glass material: the store lens, lifted toward ice
  assert.match(purchases, /dc-glacier-glass/);
  assert.match(purchases, /tint=\{0\.62\}\s*\n\s*tintColor="173,216,255"\s*\n\s*blur=\{0\}/);
  const tint = /--dc-glacier-tint: rgba\(([^)]*)\);/.exec(storeCss)?.[1];
  assert.ok(tint, "--dc-glacier-tint must be pinned in store-glass.css");
  const [, , , alpha] = tint.split(/[\s,]+/);
  const density = Number(alpha);
  assert.ok(density >= 0.2 && density <= 0.35, `glacier tint should stay subtle, got ${density}`);
  const blur = /--dc-glacier-blur: (\d+(?:\.\d+)?)px/.exec(storeCss)?.[1];
  assert.ok(blur && Number(blur) >= 8 && Number(blur) <= 20, `blur must be soft, not muddy (got ${blur})`);
  assert.match(storeCss, /:where\(\.dc-glacier-glass\) > div\[aria-hidden\]:nth-of-type\(1\) \{[\s\S]*?backdrop-filter: blur\(var\(--dc-glacier-blur\)\)/);
  // border + restrained shadow + a kill-switch plate (never a dark glass card)
  assert.match(storeCss, /:where\(\.dc-glacier-glass\) > div\[aria-hidden\]:nth-of-type\(4\)/);
  assert.match(storeCss, /html\[data-glass="off"\] :where\(\.dc-glacier-glass\) > div\[aria-hidden\]:nth-of-type\(2\)/);
  // white copy on a light plate keeps the shared ink scrim
  assert.match(purchases, /dc-scene-ink/);
});

test("Your Purchases reads as a page heading", () => {
  assert.match(purchases, /<h1 className="dc-scene-ink text-2xl font-black leading-\[1\.08\] tracking-\[-0\.03em\] text-white md:text-3xl">\s*Your Purchases\s*<\/h1>/);
  assert.doesNotMatch(purchases, /<h2 className="text-lg font-extrabold text-white">Your purchases<\/h2>/);
});

/* ------------------------------------------------------------------ */
/* 5. Nothing else moved                                               */
/* ------------------------------------------------------------------ */

test("the pages keep their responsive guards and the store keeps its hooks", () => {
  // filter rows wrap instead of overflowing, and the active chip truncates
  assert.match(filterChips, /className="flex flex-wrap items-center gap-2"/);
  assert.match(glassCss, /\.dc-filter-active \{[^}]*max-width: 12rem/s);
  assert.match(home, /className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1\.5"/);
  // the store's own product/filter contracts are untouched
  assert.match(storePage, /data-store-grid/);
  assert.match(storePage, /dc-store-glass flex aspect-square w-full min-h-0 flex-col overflow-hidden/);
  assert.match(filterChips, /className="dc-segment dc-scene-plate shrink-0"/);
  assert.match(filterChips, /aria-expanded=\{showFilters\}/);
  // the store's own filter row is still the drag rail it always was
  assert.match(filterChips, /ref=\{chipRow\.ref\}\s*\n\s*onPointerDown=\{chipRow\.onPointerDown\}/);
  // no new dependencies were pulled in for this pass
  const pkg = JSON.parse(read("package.json"));
  assert.ok(!("motion" in (pkg.dependencies ?? {})), "framer-motion stays the single animation dep");
});
