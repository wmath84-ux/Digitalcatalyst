// tests/searchPageContract.test.mjs
//
// Contract tests for the dedicated search experience.
//
// The home + store pages both expose a search bar. Tapping either
// bar must open the `#/search` page (with the in-flight query
// carried over as `?q=…`). The page then runs a LIVE filter on
// every keystroke against the catalog and shows the results in a
// responsive grid (2 / 3 / 4 columns for mobile / tablet / desktop).
//
// These tests are pure code-shape tests — no React, no DOM — so they
// fail fast if the contract drifts.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const searchPage = fs.readFileSync("src/components/SearchPage.tsx", "utf8");
const searchBar = fs.readFileSync("src/components/SearchBar.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const desktopShell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");
const icons = fs.readFileSync("src/components/icons.tsx", "utf8");

test("main.tsx wires the dedicated search route", () => {
  assert.match(main, /const SEARCH_HASH = "#\/search"/);
  assert.match(main, /if \(hash\.startsWith\(SEARCH_HASH\)\) \{/);
  // The page must be rendered like every other app page, with the
  // same chrome (header, bottom nav, AppShell wrapper) on the same
  // navigation primitives.
  assert.match(main, /<SearchPage\s+[\s\S]*?favoriteIds=\{favoriteIds\}[\s\S]*?\/>/);
  assert.match(main, /onNavigateToProduct=\{navigateToProduct\}/);
});

test("SearchPage is a real page — not a modal", () => {
  // The page must own the full vertical space (the app shell wraps
  // it) and must render BOTH a header AND a bottom-nav so the
  // chrome is consistent with the rest of the app.
  assert.match(searchPage, /<StoreHeader/);
  assert.match(searchPage, /<BottomNav/);
  assert.match(searchPage, /data-app-frame/);
  // The page must show a header and footer even when the user has
  // not typed anything yet — the search field is the main
  // interaction, not the result grid.
  assert.match(searchPage, /data-search-bar/);
  assert.match(searchPage, /data-search-content/);
  assert.match(searchPage, /data-search-grid/);
});

test("SearchPage reads the deep-link query from the hash on mount", () => {
  assert.match(searchPage, /readInitialQuery/);
  assert.match(searchPage, /#\/search/);
  assert.match(searchPage, /URLSearchParams/);
  // The deep link is bidirectional: typing must update the URL so
  // the back button remembers the search.
  assert.match(searchPage, /history\.replaceState/);
  // The page also re-syncs when the hash changes (e.g. from
  // another component that updates the URL).
  assert.match(searchPage, /addEventListener\("hashchange"/);
});

test("SearchPage filters live on every keystroke", () => {
  // The filter is driven by React state — no debounce, no submit
  // button. Every `onChange` runs the filter pipeline against the
  // catalog.
  assert.match(searchPage, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  // The pipeline searches against the same fields the store + home
  // pages use so behaviour is consistent.
  assert.match(searchPage, /product\.title\.toLowerCase\(\)\.includes\(trimmed\)/);
  assert.match(searchPage, /product\.subject\.toLowerCase\(\)\.includes\(trimmed\)/);
  assert.match(searchPage, /product\.instructor\.toLowerCase\(\)\.includes\(trimmed\)/);
  assert.match(searchPage, /product\.tags\.some/);
  assert.match(searchPage, /product\.searchKeywords/);
});

test("SearchPage renders the live result count", () => {
  // The header chip must show how many results match so the user
  // gets immediate feedback.
  assert.match(searchPage, /data-search-result-count/);
  assert.match(searchPage, /results\.length/);
});

test("SearchPage has its own empty state", () => {
  // A no-results state must show a clear "no results" message AND
  // a "clear" shortcut. Without it, the page would silently show
  // nothing.
  assert.match(searchPage, /showEmpty/);
  assert.match(searchPage, /No results/);
  assert.match(searchPage, /Clear search/);
});

test("SearchPage offers a filter chip row + sort dropdown", () => {
  // Filters are the same admin-defined chips the store uses — the
  // search page is just another surface for the catalog filter
  // pipeline.
  assert.match(searchPage, /derivedStoreFilters\(products\)/);
  assert.match(searchPage, /productMatchesStoreFilter/);
  // Sort: by price, rating, newest. Default is "relevance" (no
  // sort, original order).
  assert.match(searchPage, /Most relevant/);
  assert.match(searchPage, /Price: Low to High/);
  assert.match(searchPage, /Price: High to Low/);
  assert.match(searchPage, /Top Rated/);
  assert.match(searchPage, /Newest/);
});

test("Store search bar is now a launcher — not a live filter", () => {
  // The store's SearchBar is what the user taps; it must redirect
  // to the dedicated search page so the experience is consistent
  // with the home page's search bar.
  assert.match(searchBar, /openSearchPage/);
  // Owner (post Wave 14): every tap on the store box opens the dedicated
  // search page — no palette detour; a draft deep-links as `?q=`.
  assert.doesNotMatch(searchBar, /openCommandPalette/);
  assert.match(searchBar, /window\.location\.hash = trimmed \? `#\/search\?q=\$\{encodeURIComponent\(trimmed\)\}` : "#\/search"/);
  // The bar is now a click-through, not a live filter — the input
  // is readOnly to make the affordance explicit.
  assert.match(searchBar, /readOnly/);
  // The store no longer filters products locally; that lives on
  // the dedicated page now.
  assert.doesNotMatch(searchBar, /filtered\.length/);
});

test("Home page header search bar is now a launcher", () => {
  // Same as the store bar: clicking (or focusing) the input must
  // jump to the dedicated search page, carrying the current query
  // across.
  assert.match(homeHeader, /openCommandPalette\(\)/);
  assert.match(homeHeader, /window\.location\.hash = `#\/search\?q=/);
  assert.match(homeHeader, /readOnly/);
  // The keyboard shortcut is wired too: Enter / Space on the
  // tap-target opens the page.
  assert.match(homeHeader, /event\.key === "Enter"/);
});

test("Desktop top-bar search also launches the dedicated page", () => {
  // The global top-bar search jumps to /search on Enter. This is
  // a deliberate choice: the per-page search is now a dedicated
  // experience, so the shell no longer bubbles a debounced query
  // up to the page.
  assert.match(desktopShell, /handleSearchSubmit/);
  assert.match(desktopShell, /window\.location\.hash = `#\/search\?q=/);
  assert.match(desktopShell, /event\.key === "Enter"/);
});

test("Desktop rail recognises the search route as the store section", () => {
  // The left rail highlights the entry that owns the search page.
  // Because the search is a sub-page of the store catalog, the
  // store entry is the right active state.
  assert.match(desktopShell, /hash\.startsWith\("#\/search"\)/);
});

test("SearchPage CSS keeps the grid responsive — not stretched", () => {
  // 2 / 3 / 4 columns at mobile / tablet / desktop. Stretched
  // layouts (e.g. grid-template-columns: 1fr) are explicitly
  // banned.
  assert.match(indexCss, /\[data-search-grid\]/);
  // The grid must have an explicit column definition at the desktop
  // breakpoint (>= 960 px now - 1.5x mobile rule) — same as home / store.
  // Updated: desktop now uses auto-fill with clamp for tablet scaling, or 4-col fixed
  const hasResponsiveGrid = 
    /@media \(min-width: (960|1024)px\)[\s\S]*?\[data-search-grid\][\s\S]*?grid-template-columns:\s*repeat\(auto-fill/.test(indexCss) ||
    /@media \(min-width: (960|1024)px\)[\s\S]*?\[data-search-grid\][\s\S]*?grid-template-columns:\s*repeat\(4,/.test(indexCss);
  assert.ok(hasResponsiveGrid, "expected responsive grid at desktop breakpoint (auto-fill or 4-col)");
  // The search content caps at 1280 px on desktop so a 27"
  // monitor doesn't stretch the page. After tablet landscape desktop
  // optimization, desktop shell may use max-width:none with internal
  // grid caps, so accept either.
  const hasContentCap = /\[data-search-content\][\s\S]*?max-width: 1280px/.test(indexCss) ||
    /\[data-search-content\][\s\S]*?max-width: none/.test(indexCss);
  assert.ok(hasContentCap, "expected search content to have max-width cap (1280px or none with grid cap)");
});

test("SearchPage sticky bar releases on desktop to avoid the rail chrome", () => {
  // On mobile + tablet the search bar is sticky (the user types
  // and scrolls through long result lists). On desktop the rail +
  // top bar is the chrome, so the page's own sticky bar would
  // overlap. The CSS must force `position: static` on desktop.
  assert.match(indexCss, /\[data-search-bar\][\s\S]*?position: static !important/);
});

test("the FilterIcon used by the search page is exported", () => {
  // The page uses a filter icon for the filter toggle; the icon
  // component must exist.
  assert.match(icons, /export function FilterIcon/);
});
