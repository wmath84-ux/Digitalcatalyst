// tests/liquidGlassWaveTwoContract.test.mjs
//
// Contract for Wave 2 of the website-glass rollout (see
// docs/liquid-glass-rollout-plan.md): the global chrome. Header action row, the
// desktop rail + top bar, the store search capsule and the dev preview.
//
// These tests are deliberately about the invariants that make the wave
// reviewable rather than about pixels: the anchors the rest of the suite and
// the app depend on must survive, the registry material must actually be what
// renders, light-mode contrast must be fixed in CSS (never by editing a
// vendored item), and everything stays inert under the `data-glass="off"` kill
// switch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const header = read("src/components/Header.tsx");
const shell = read("src/components/DesktopShell.tsx");
const searchBar = read("src/components/SearchBar.tsx");
const css = read("src/glass.css");
const tooltip = read("src/components/ui/glass-tooltip.tsx");
const input = read("src/components/ui/glass-input.tsx");

const expandingTabs = read("src/components/ui/ExpandingTabs.tsx");

// ── the frozen shell of the site header ──────────────────────────────────────

test("the site header keeps every class/attribute the other chrome tests pin", () => {
  // mobileHeaderGlowContract + chromeOverlayHeaderContract assert on these
  // literals; converting the action row must not disturb the header's shell.
  for (const anchor of [
    "data-site-header",
    "sticky top-0",
    "bg-white/75",
    "backdrop-blur-xl",
    "mobile-header-glow",
  ]) {
    assert.ok(header.includes(anchor), `Header.tsx must keep ${anchor} — the glow/overlay contracts read it`);
  }
});

test("header actions become registry tooltips, not native title text", () => {
  // The action cluster is the aicanvas.me Expanding Tabs bar: every item
  // names itself (aria-label + title from the same literal), so the header
  // no longer wires a tooltip provider of its own.
  assert.match(header, /<ExpandingTabs/);
  assert.match(expandingTabs, /aria-label=\{item\.ariaLabel \?\? item\.label\}/);
  assert.match(expandingTabs, /title=\{item\.ariaLabel \?\? item\.label\}/);
  assert.doesNotMatch(header, /onOpenChange/, "no controlled tooltip state in the header");
});

test("every header disc is a real glass lens with a light-mode tint", () => {
  // The Expanding Tabs rail is the disc row now: frosted capsule with the
  // reference's inset top-light, icon circles that morph into the pill.
  assert.match(expandingTabs, /rounded-full border border-white\/\[0\.08\] bg-white\/\[0\.05\]/);
  assert.match(expandingTabs, /shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.16\)\]/);
  assert.match(expandingTabs, /backdrop-blur-md/);
});

test("the header still exposes its badges and its aria labels", () => {
  // Wave 2 must not lose information: counts move from the old inline pill to
  // the same pill, and the accessible name stays on the trigger.
  // The frozen `Help & FAQ` name must stay a literal in the file: a call site
  // that hides it behind a variable breaks tests/subscriptionDowngradeGuard.
  assert.match(header, /ariaLabel: "Help & FAQ"/);
  assert.match(header, /ariaLabel: "Notifications"/);
  assert.match(expandingTabs, /aria-label=\{item\.ariaLabel \?\? item\.label\}/);
  assert.match(expandingTabs, /aria-label=\{item\.badgeAriaLabel\}/, "the count gets its own accessible name");
  assert.match(header, /"99\+"/, "big counts stay capped, as they were before the swap");
  assert.match(header, /badge:/, "badges are still passed in from the live counters");
});

// ── desktop rail ─────────────────────────────────────────────────────────────

test("the rail keeps its data contract and gains the lens only where it counts", () => {
  const railItem = shell.slice(shell.indexOf("function RailItem"), shell.indexOf("function RailStat"));
  for (const anchor of [
    "data-desktop-rail-item={entry.key}",
    'data-active={active ? "true" : "false"}',
    'aria-current={active ? "page" : undefined}',
    "title={entry.description}",
  ]) {
    assert.ok(railItem.includes(anchor), `rail rows must keep ${anchor}`);
  }
  assert.match(railItem, /aria-label=\{/, "an explicit name replaces the one the button element used to infer");
  // One lens, on the selected row only: eight refracting rows in a sticky rail
  // is the perf trap the plan calls out, and the row already shows its own
  // description, so the tooltip would repeat it.
  assert.match(railItem, /\{active \? \(\s*<GlassSurface/);
  assert.equal(railItem.match(/<GlassSurface/g).length, 1, "exactly one lens per rail row");
  assert.match(railItem, /<span className="relative/, "content must paint above the lens");
});

test("the rail's removed controls stay removed", () => {
  // desktopRailPeekDockContract: the collapse toggle must never come back.
  for (const banned of [
    "data-desktop-rail-toggle",
    "RailGlassToggle",
    "railCollapsed",
    "railHidden",
    "setPeekOpen",
    "onOpenChange",
  ]) {
    assert.ok(!shell.includes(banned), `DesktopShell.tsx must not contain ${banned}`);
  }
  assert.match(shell, /<DesktopPeekDock active=\{active\} purchasesBadge=\{ownedCount\} \/>/);
});

// ── top bar ──────────────────────────────────────────────────────────────────

test("the top-bar search is the registry input, still wired to the shell", () => {
  assert.match(shell, /<GlassInput\b/);
  assert.match(shell, /className="dc-glass-input w-full"/, "light-mode text colours hook on this class");
  assert.match(shell, /data-desktop-search/, "the search hook other tests query must stay on the field");
  assert.match(shell, /placeholder=\{`Search \$\{appName\}…`\}/);
  assert.match(shell, /aria-label="Search"/);
  assert.match(shell, /handleSearchSubmit\(\)/, "Enter still submits");
  assert.match(shell, /event\.key === "Escape" && query/, "Escape clears — the field lost its inline clear handler");
  assert.match(shell, /data-desktop-topbar-row/, "the row the actions contract reads is untouched");
});

test("top-bar actions keep their data hook and gain the expanding-tabs rail", () => {
  // The four discs became one aicanvas.me Expanding Tabs bar; the wrapper
  // keeps the `data-desktop-topbar-actions` hook the desktop contracts read.
  assert.match(shell, /data-desktop-topbar-actions/);
  const actions = shell.slice(shell.indexOf("data-desktop-topbar-actions"));
  assert.match(actions, /<ExpandingTabs/);
  for (const name of ["Notifications", "Favorites", "Cart", "Subscription"]) {
    assert.ok(actions.includes(`ariaLabel: "${name}"`), `top bar keeps the ${name} action`);
  }
  assert.match(actions, /notifications > 99 \? "99\+"/);
});

test("⌘K is owned by exactly one component — the registry palette", () => {
  // Wave 2 shipped a focus-the-field stand-in because `glass-command` had not
  // transferred yet. Wave 3 vendored it, so the stand-in is deleted rather than
  // left running beside the real palette (two handlers on one key = a toggle that
  // immediately re-opens, plus a doubled preventDefault).
  assert.doesNotMatch(shell, /metaKey|ctrlKey/, "the shell must not bind ⌘K any more");
  assert.match(shell, /GlassCommandPalette/, "…and must point at the component that does");
  assert.match(shell, /data-desktop-search/, "the field the palette can be pointed at still exists");

  const palette = read("src/components/GlassCommandPalette.tsx");
  assert.match(palette, /<GlassCommand\b/, "the palette is the vendored item, not a hand-rolled dialog");
  assert.match(palette, /shortcut=\{false\}/, "the wrapper keeps the key binding so the kill switch works");
  assert.match(palette, /dataset\.glass !== "off"/);
  assert.ok(palette.includes('startsWith("#/admin")'), "admin routes keep the browser's ⌘K");
  assert.match(palette, /isTyping\(event\.target\)/, "⌘K inside a field selects its text, as users expect");
  assert.match(palette, /GlassCommandEmpty/, "a filter with no matches says so");
  // Wave 11 (owner): the palette IS the store / home search box now, so it
  // lists the live catalogue (capped at 200; the pack item returns null for a
  // non-match, so only visible rows are mounted) and opens on tap via the
  // `dc:command-palette-open` bridge.
  assert.match(palette, /slice\(0, 200\)/, "the catalogue list is capped");
  assert.match(palette, /COMMAND_PALETTE_OPEN_EVENT/, "the search boxes open the palette on tap");
  assert.match(read("src/main.tsx"), /<GlassCommandPalette \/>/, "one instance, mounted next to the banner host");
});

test("the rail's quick-stats card is glass and its CTAs are the registry button", () => {
  const card = shell.slice(shell.indexOf("Quick stats"), shell.indexOf("Profile footer"));
  assert.match(card, /<GlassSurface\b/);
  assert.match(card, /<LiquidMetalButton/g);
  assert.match(card, /tone="primary"/);
  // Labels survive verbatim (only the material changed), each inside its own
  // span because the registry button sets `text-sm` on its content layer.
  assert.match(card, /<Trophy size=\{12\} \/>[\s\S]{0,80}Leaderboard[\s\S]{0,20}<\/span>/);
  assert.match(card, /<span className="text-\[11px\] font-black">plan today in Flowpath<\/span>/);
  assert.match(card, /<RailStat label="Cart" value=\{cartCount\} \/>/);
});

// ── store search capsule ─────────────────────────────────────────────────────

test("the store search keeps its public API and its tap-to-search contract", () => {
  assert.match(searchBar, /export default function SearchBar\(\{ value, onChange, sort, onSortChange \}/);
  for (const anchor of [
    "data-store-search-trigger",
    'role="button"',
    "tabIndex={0}",
    'event.key === "Enter" || event.key === " "',
    "readOnly",
    "onFocus={openSearchPage}",
    "#/search?q=",
    "Tap to search",
  ]) {
    assert.ok(searchBar.includes(anchor), `SearchBar must keep ${anchor} — other screens/tests rely on it`);
  }
  assert.match(searchBar, /<GlassSurface\b/, "the ad-hoc white pill is replaced by the pack lens");
  assert.doesNotMatch(searchBar, /className="[^"]*bg-white\/60/, "no leftover ad-hoc frost on the capsule itself");
  // Wave 3 note: this used to assert the native <select> stayed. It no longer
  // does — `glass-select` transferred, so the sort control is the registry
  // listbox; the tap-target contract above is what has to survive.
  assert.doesNotMatch(searchBar, /<select\b/, "the native sort select is gone");
  assert.match(searchBar, /<GlassSelect\b/);
});

// ── light-chrome CSS + vendored files ────────────────────────────────────────

test("light-chrome contrast is fixed in glass.css, inside the glass gate", () => {
  const waveTwo = css.slice(css.indexOf("── Wave 2 · global chrome ──"));
  assert.ok(waveTwo.length > 400, "the Wave 2 block must exist");
  for (const rule of [
    /html\[data-glass="on"\] \.dc-glass-input input \{/,
    /html\[data-glass="on"\] \.dc-glass-input input::placeholder \{/,
    /html\[data-glass="on"\] \.dc-glass-input span\.shrink-0 \{/,
    /html\[data-glass="on"\] \.dc-glass-input > div > div\[aria-hidden\] \{[\s\S]*?box-shadow:[\s\S]*?!important/,
    /html\[data-glass="on"\] :where\(\.dc-chrome-disc\) > div\[aria-hidden\]:nth-of-type\(4\)/,
  ]) {
    assert.match(waveTwo, rule, `the light bar needs ${rule}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[role="tooltip"\]/);
});

test("the vendored chrome items stay byte-faithful to the registry", () => {
  for (const file of [tooltip, input]) {
    assert.match(file, /^\/\/ Vendored from the website-glass shadcn registry:/m);
    assert.match(file, /npx shadcn@latest add https:\/\/websiteglass\.com\/r\/glass-(tooltip|input)\.json/);
  }
  // Contrast is an app-layer concern: if someone "fixes" the pack instead of
  // glass.css, this fails and the divergence gets discussed.
  assert.doesNotMatch(input, /tintColor/, "glass-input stays as published; the shell passes its own classes");
  assert.match(tooltip, /text-white/, "the pack's white label is untouched");
  assert.match(tooltip, /<div className="relative inline-flex">/);
});

test("the registry checker covers the two new chrome items", () => {
  // No network egress here, so `verify-glass-registry.mjs` can only SKIP in the
  // sandbox — but it must still know the files exist, otherwise a future
  // `npx shadcn add` drift on the tooltip/input goes unnoticed. They are
  // vendored verbatim, so they must NOT be excused as PORTED.
  const checker = read("scripts/verify-glass-registry.mjs");
  for (const item of ["glass-tooltip", "glass-input"]) {
    assert.match(checker, new RegExp(`"${item}",`), `${item} must be in the ITEMS manifest`);
    const ported = checker.match(/const PORTED = new Set\(\[([^\]]*)\]\)/)[1];
    assert.ok(!ported.includes(`${item}.tsx`), `${item} is a verbatim vendored file, not a port`);
  }
});

test("the preview shows the wave, and the home header stays out of it", () => {
  const preview = read("src/GlassPreview.tsx");
  assert.match(preview, /Wave 2 · global chrome/);
  for (const name of ["<GlassInput", "<ChromeDisc", "<TooltipContent"]) {
    assert.ok(preview.includes(name), `#/dev/glass-preview must render ${name}`);
  }
  // The home page has its own header with its own collapse contract
  // (homeHeaderGlassCollapseContract), so Wave 2 left it alone on purpose.
  // Wave 6 is the wave that was allowed to touch it — and only with the two
  // additive, pinned-by-name changes below, never by pulling Wave 2's chrome
  // components in. See tests/liquidGlassWaveSixContract.test.mjs.
  const homeHeader = read("src/home/components/Header.tsx");
  assert.match(homeHeader, /<ExpandingTabs/, "the hero actions are the Expanding Tabs bar");
  assert.match(homeHeader, /<GlassSurface/, "Phase A: the hero header IS the pack GlassSurface at defaults");
});
