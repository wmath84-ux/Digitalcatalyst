// tests/liquidGlassWaveThreeContract.test.mjs
//
// Contract for Wave 3 of the website-glass rollout (docs/liquid-glass-rollout-plan.md):
// commerce surfaces — store grid cards, filter row, sort control, the product
// page's tab strip, cart/favourites rows, and the ⌘K palette that replaced
// Wave 2's stand-in shortcut.
//
// Same philosophy as the Wave 1/2 contracts: the app-facing behaviour and data
// hooks must survive intact, the vendored items must stay byte-comparable to the
// registry, and every light-theme re-ink must be CSS (never a forked component)
// so `data-glass="off"` restores the published material.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);

const VENDORED_WAVE3 = [
  "glass-card",
  "glass-checkbox",
  "glass-radio",
  "glass-toggle-group",
  "glass-accordion",
  "glass-dropdown-menu",
  "glass-select",
  "glass-sheet",
  "glass-tile",
  "glass-swatch",
  "glass-command",
];

const card = read("src/components/ProductCard.tsx");
const chips = read("src/components/FilterChips.tsx");
const searchBar = read("src/components/SearchBar.tsx");
const pdp = read("src/PdpApp.tsx");
const cartRow = read("src/cartWishlist/components/CartItemCard.tsx");
const favRow = read("src/cartWishlist/components/FavoriteCard.tsx");
const palette = read("src/components/GlassCommandPalette.tsx");
const main = read("src/main.tsx");
const css = read("src/glass.css");

// ── the vendored items ───────────────────────────────────────────────────────

test("every Wave 3 registry item is vendored with its provenance banner", () => {
  for (const item of VENDORED_WAVE3) {
    const path = `src/components/ui/${item}.tsx`;
    assert.ok(exists(path), `${path} must exist after Wave 3`);
    const source = read(path);
    assert.match(source, /^\/\/ Vendored from the website-glass shadcn registry:/m, `${item} needs the banner`);
    assert.ok(
      source.includes(`npx shadcn@latest add https://websiteglass.com/r/${item}.json`),
      `${item} must record the exact install command that produced it`,
    );
    assert.match(source, /^"use client";$/m, `${item} keeps the registry's client directive`);
  }

  // 22 items in the pack: 18 vendored + `glass-toast` hand-ported, 3 left
  // (switch, slider, popover) and `glass-dock` (the repo's own dock stays).
  const checker = read("scripts/verify-glass-registry.mjs");
  const ported = checker.match(/const PORTED = new Set\(\[([^\]]*)\]\)/)[1];
  for (const item of VENDORED_WAVE3) {
    assert.ok(!ported.includes(`${item}.tsx`), `${item} is verbatim, not a port — the checker must not excuse it`);
  }
});

test("type-only deviations from the registry are declared, not hidden", () => {
  // These four items spell types as `React.X`; this tsconfig has no global React
  // namespace, so the imports are explicit. If the divergence isn't declared, a
  // future `npx shadcn add` diff looks like an upstream change.
  const checker = read("scripts/verify-glass-registry.mjs");
  for (const file of ["glass-select.tsx", "glass-dropdown-menu.tsx", "glass-sheet.tsx", "glass-command.tsx"]) {
    assert.match(checker, new RegExp(`"${file}": \\[`), `${file} needs a LOCAL_ADAPTATIONS entry`);
  }
  assert.match(checker, /type KeyboardEvent as ReactKeyboardEvent/, "the command palette must keep the DOM KeyboardEvent global");
});

test("the portalled items portal, and the cheap items stay cheap", () => {
  // Rules the pack itself documents, restated so a future refactor cannot
  // silently turn the store's grid into 200 displacement filters.
  for (const item of ["glass-select", "glass-dropdown-menu", "glass-sheet", "glass-command"]) {
    const source = read(`src/components/ui/${item}.tsx`);
    assert.match(source, /createPortal\(/, `${item} must render outside the scroller`);
    assert.match(source, /document\.body/);
  }
  const select = read("src/components/ui/glass-select.tsx");
  assert.match(select, /window\.addEventListener\("scroll", place, true\)/, "the list follows the trigger while the page scrolls");
  assert.match(select, /role="listbox"[\s\S]*role="option"/, "listbox semantics, not a fake menu");

  const tile = read("src/components/ui/glass-tile.tsx");
  assert.match(tile, /if \(!refract\) return;/, "a tile measures only when real refraction is asked for");
  assert.doesNotMatch(tile, /new ResizeObserver\(update\);\s*\n\s*ro\.observe\(el\);\s*\n\s*return \(\) => ro\.disconnect\(\);\s*\n\s*\}, \[\]/);

  const group = read("src/components/ui/glass-toggle-group.tsx");
  assert.match(group, /CSS\.escape\(active\)/, "a filter id like `all` or `#x` must not break the query");
});

// ── the converted surfaces ───────────────────────────────────────────────────

test("store cards are glass cards and keep their commerce contract", () => {
  assert.match(card, /<GlassCard\b/);
  assert.match(card, /contentClassName="p-0"/, "artwork stays edge-to-edge");
  assert.match(card, /onClick=\{\(\) => onView\(product\)\}/, "the whole card still opens the product");
  assert.match(card, /aria-label="Toggle wishlist"/);
  assert.match(card, /event\.stopPropagation\(\)/, "the disc and the CTA must not trigger the card");
  // the surface paints its own specular sheen, so the imitating layer is deleted
  assert.doesNotMatch(card, /<div aria-hidden className="pointer-events-none absolute inset-0 z-10/, "the hand-painted sheen div must be gone");
  assert.doesNotMatch(card, /className="[^"]*bg-white\/60/, "no ad-hoc card frost left (the comment may mention it)");
  // CTA: actionable → registry button; terminal states → flat status plate.
  assert.match(card, /<LiquidMetalButton\b[\s\S]*?tone="primary"/);
  assert.match(card, /purchased \|\| inCart \|\| unavailable \? \(/);
  for (const label of ["Purchased", "Not for sale", "In Cart", "Add to Cart"]) {
    assert.ok(card.includes(label), `the ${label} state must keep its copy`);
  }
});

test("the filter row is one sliding droplet, not N pills", () => {
  assert.match(chips, /<GlassToggleGroup\b/);
  assert.match(chips, /className="dc-segment shrink-0"/, "light ink + it must not shrink inside the scroller");
  assert.match(chips, /value=\{activeId\}/);
  assert.match(chips, /onValueChange=\{onSelect\}/, "the admin-driven filter contract is unchanged");
  assert.match(chips, /title=\{filter\.description \|\| filter\.label\}/, "a chip's description is still announced on hover");
  assert.match(chips, /overflow-x-auto/, "long filter lists still scroll sideways");
  assert.match(chips, /aria-expanded=\{showFilters\}/);
  // Deliberate: the panel stays an in-place popover rather than `glass-sheet`.
  // The sheet locks body scroll, and this app's desktop shell owns its own
  // scroller — a scroll-lock from a filter popover would fight it.
  assert.doesNotMatch(chips, /GlassSheet/, "no sheet here by design");
  assert.match(chips, /<GlassSurface\b[\s\S]*?radius=\{24\}/);
  assert.match(chips, /<LiquidMetalButton\b/g);
});

test("sort became the registry select", () => {
  assert.match(searchBar, /<GlassSelect value=\{sort\} onValueChange=\{onSortChange\}>/);
  assert.match(searchBar, /className="dc-glass-select h-9 w-auto min-w-\[11rem\] text-xs font-bold"/);
  assert.match(searchBar, /aria-label="Sort products"/);
  assert.match(searchBar, /<GlassSelectItem key=\{option\} value=\{option\}>/);
  // the tap-to-search contract from Wave 2 still holds after the rewrite
  for (const anchor of ["data-store-search-trigger", 'role="button"', "tabIndex={0}", "readOnly", "#/search?q="]) {
    assert.ok(searchBar.includes(anchor), `SearchBar must keep ${anchor}`);
  }
  assert.match(searchBar, /const SORT_OPTIONS = \["Recommended", "Price: Low to High", "Price: High to Low", "Top Rated", "Newest"\]/);
});

test("the product page keeps every pinned hook and swaps only the switcher", () => {
  const details = pdp.slice(pdp.indexOf("function DetailsCard"), pdp.indexOf("function CurriculumModuleRow"));
  assert.match(details, /data-pdp-tabbar/, "the sticky tab bar the scroll logic measures");
  assert.match(details, /rounded-t-\[23px\]/, "the stuck-state corner maths is untouched");
  assert.match(details, /<GlassToggleGroup\b/);
  assert.match(details, /className="dc-segment shrink-0"/);
  assert.match(details, /onTab\(next as DetailTab\)/, "the tab union type still narrows at the boundary");
  assert.doesNotMatch(details, /bg-zinc-100\/70/, "the ad-hoc grey track is gone");
  for (const anchor of ["data-pdp-curriculum", "data-pdp-curriculum-mode", "data-pdp-curriculum-module", "data-pdp-curriculum-upgrade-hint"]) {
    assert.ok(pdp.includes(anchor), `PDP curriculum tests pin ${anchor}`);
  }
});

test("cart and favourites rows are glass rows with glass actions", () => {
  for (const source of [cartRow, favRow]) {
    assert.match(source, /<GlassCard\b/);
    assert.doesNotMatch(source, /from-white\/40|from-white\/35/, "no hand-painted sheen left in either card");
  }
  assert.match(cartRow, /contentClassName="flex gap-3 p-2.5"/, "the row keeps its exact padding");
  assert.match(cartRow, /aria-label=\{`View \$\{product\.title\}`\}/);
  assert.match(cartRow, /aria-label="Remove item"/);
  assert.match(favRow, /disabled=\{inCart\}/, "the In-Cart state is a disabled action, not a colour swap");
  assert.match(favRow, /<LiquidMetalButton\b/g);
  assert.match(favRow, /formatINR\(product\.price\)/);
});

// ── the ⌘K palette ───────────────────────────────────────────────────────────

test("the palette lists real destinations and steps aside where it must", () => {
  assert.match(palette, /import \{ ALL_RAIL \} from "@\/components\/DesktopShell"/, "rail entries and palette items cannot drift apart");
  assert.match(palette, /<GlassCommandGroup heading="Go to">/);
  assert.match(palette, /keywords=\{`\$\{entry\.description\} \$\{entry\.hash\}`\}/);
  assert.match(palette, /<GlassCommandGroup heading="Catalogue">/);
  assert.match(palette, /availableForSale !== false/, "a product that cannot be bought is not a jump target");
  assert.match(main, /<GlassCommandPalette \/>/);
  assert.doesNotMatch(main, /<GlassCommandPalette \/>[\s\S]{0,200}<GlassCommandPalette \/>/, "exactly one instance");
});

test("the old stand-in shortcut is gone so one key has one owner", () => {
  const shell = read("src/components/DesktopShell.tsx");
  assert.doesNotMatch(shell, /metaKey|ctrlKey/, "Wave 2's focus-the-field handler must not double-fire with the palette");
  assert.match(shell, /GlassCommandPalette/);
  assert.match(palette, /shortcut=\{false\}/);
  assert.match(palette, /document\.documentElement|documentElement\.dataset\.glass !== "off"/, "kill switch first");
  assert.ok(palette.includes('startsWith("#/admin")'), "admin routes are out of scope, ⌘K included");
  assert.ok(palette.includes('startsWith("#/course/")'), "the player owns its own keys");
  assert.match(palette, /isTyping\(event\.target\)/);
});

// ── light-theme ink ──────────────────────────────────────────────────────────

test("light-chrome ink is CSS-only, gated, and never overrides the checked state", () => {
  const block = css.slice(css.indexOf("── Wave 3 · commerce ──"));
  assert.ok(block.length > 600, "the Wave 3 CSS block must exist");
  for (const rule of [
    /html\[data-glass="on"\] :where\(\.dc-choice\):not\(\[aria-checked="true"\]\)/,
    /html\[data-glass="on"\] :where\(\.dc-tile\):not\(\[data-selected\]\)/,
    /html\[data-glass="on"\] \.dc-glass-select \{/,
    /html\[data-glass="on"\] \.dc-glass-select-pop \[role="option"\] \{/,
    /html\[data-glass="on"\] :where\(\.dc-glass-card\) > div\[aria-hidden\]:nth-of-type\(4\)/,
    /html\[data-glass="on"\] \.dc-segment > div:last-child > div\[aria-hidden\]/,
  ]) {
    assert.match(block, rule, `missing light-ink rule ${rule}`);
  }
  // `:not([aria-checked="true"])` is load-bearing: an unlayered rule would
  // otherwise beat the pack's own accent-fill utility and flatten the checked box.
  assert.doesNotMatch(block, /html\[data-glass="on"\] :where\(\.dc-choice\) \{/, "the choice rule must not match the checked state");
});

test("the dev preview exercises every Wave 3 control", () => {
  const preview = read("src/GlassPreview.tsx");
  assert.match(preview, /Wave 3 · commerce/);
  for (const name of ["<GlassCard", "<GlassToggleGroup", "<GlassSelect", "<GlassCheckbox", "<GlassRadioGroup", "<GlassTile", "<GlassSwatch", "<GlassAccordion", "<GlassSheet", "<GlassDropdownMenu"]) {
    assert.ok(preview.includes(name), `#/dev/glass-preview must render ${name}`);
  }
  assert.match(preview, /press ⌘K \/ Ctrl\+K/);
});

test("the deferred commerce files landed in Wave 12; admin stays out", () => {
  // Home's own header/cards carried their own collapse + branding contracts and
  // were converted in Phase B · Wave 12; admin is excluded from the rollout entirely.
  assert.match(read("src/home/components/Reviews.tsx"), /from "\.\.\/\.\.\/components\/ui\/glass-card"/);
  assert.match(read("src/home/components/ProductCard.tsx"), /from "\.\.\/\.\.\/components\/ui\/glass-button"/);
  const admin = fs.readdirSync("src/components/admin").filter((f) => f.endsWith(".tsx"));
  for (const file of admin) {
    assert.doesNotMatch(read(`src/components/admin/${file}`), /@\/components\/ui\/glass-/, "admin stays out of the pack");
  }
});
