// tests/siteFooterNavUnificationContract.test.mjs
//
// Owner brief, 2026-09-16:
//
//   "Footer navigation ka jo design My Day per hai exactly vahi design har jagah
//    honi chahiye — home page aur sabhi jagah. Jahan-jahan footer navigation
//    hai, jis screen per, jaise tablet aur mobile check karke fix karo, aur
//    sabhi jagah footer navigation ka background blur aur transparency exactly
//    vahi apply karo jo product store mein hai."
//
// What was actually wrong: four copies of the same <nav> wrapper had drifted.
//   • the primary nav (Home / Store / PDP / Profile / Study Library / Checkout /
//     Notifications / Search / Queries / Leaderboard) carried
//     `data-primary-library-nav`, whose CSS turned the dock into a full-width
//     bar with a permanent label under all seven tabs and froze the
//     magnification wave — a different footer from every other screen;
//   • My Day and Revision hid the nav entirely from 768 px up, so a tablet in
//     portrait had no footer there while Home / Store / Cart kept theirs;
//   • Cart matched My Day by luck, not by construction.
//
// Now one component (src/components/SiteFooterNav.tsx) renders the capsule on
// every screen, and the MATERIAL — the light-blue frost and its transparency —
// is the single `html[data-glass="on"] :where([data-glass-dock])` rule in
// src/glass.css that the product store's footer already wore. These assertions
// are what stops the four copies from coming back.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const shared = read("src/components/SiteFooterNav.tsx");
const dock = read("src/components/glass-dock/GlassDock.tsx");
const css = read("src/index.css");
const glass = read("src/glass.css");

const FOOTERS = [
  ["primary (home / store / pdp / profile / library / checkout / notifications / search / queries / leaderboard)", "src/components/BottomNav.tsx"],
  ["my day", "src/components/myday/BottomNav.tsx"],
  ["revision", "src/revision/components/BottomNav.tsx"],
  ["cart + favourites", "src/cartWishlist/components/BottomNav.tsx"],
];

test("every screen footer renders the ONE shared wrapper", () => {
  for (const [label, file] of FOOTERS) {
    const source = read(file);
    assert.match(source, /import SiteFooterNav from /, `${label}: must import the shared footer`);
    assert.match(source, /<SiteFooterNav/, `${label}: must render the shared footer`);
    // No screen hand-rolls the wrapper markup any more — that is how the four
    // copies drifted apart in the first place.
    assert.doesNotMatch(source, /data-site-footer-nav/, `${label}: must not hand-roll the nav wrapper`);
    assert.doesNotMatch(source, /<GlassDock/, `${label}: the dock is mounted by the shared wrapper`);
  }
});

test("the shared wrapper IS the My Day design, at every screen's gutters", () => {
  // The floating capsule: overlay (not an in-flow band), centred, hugging its
  // icons, clear of the home indicator, above page content.
  assert.match(shared, /data-site-footer-nav/);
  assert.match(shared, /data-site-footer\b/);
  assert.match(shared, /pointer-events-none inset-x-0 bottom-0 z-30 w-full overflow-visible/);
  assert.match(shared, /pb-\[max\(env\(safe-area-inset-bottom\),10px\)\]/);
  assert.match(shared, /px-3/);
  assert.match(shared, /pt-2/);
  assert.match(shared, /pointer-events-auto mx-auto w-max max-w-full/);
  // …and it mounts the same dock component My Day always used, in its site
  // footer variant, so the magnification wave + label tooltip are identical.
  assert.match(shared, /<GlassDock siteFooter/);
  assert.match(dock, /data-glass-dock=""/);
});

test("no screen hides its footer at a breakpoint of its own", () => {
  for (const [label, file] of FOOTERS) {
    assert.doesNotMatch(read(file), /md:hidden/, `${label}: tablet must keep the footer`);
  }
  assert.doesNotMatch(shared, /md:hidden/);
  // Release happens once, for everyone, in the hard desktop rules — 960 px up,
  // tablet-landscape-as-desktop, and inside the desktop shell.
  assert.match(css, /HARD RULE: Footer navigation never appears on desktop/);
  assert.match(css, /@media \(min-width: 960px\) \{\s*\[data-site-footer-nav\]/);
  assert.match(css, /html\[data-tablet-landscape-desktop="true"\] \[data-site-footer-nav\]/);
  assert.match(css, /\.dc-desktop-shell \[data-site-footer-nav\]/);
});

test("the blur + transparency are single-sourced from the store's own tokens", () => {
  // One definition of the material, and it is the footer the product store
  // page already wore: 40% of the blur ceiling, 18% light-blue tint.
  assert.match(glass, /--dc-footer-nav-blur: 16px;/);
  assert.match(glass, /--dc-footer-nav-tint: rgba\(173, 216, 255, 0\.18\);/);
  assert.equal(glass.match(/--dc-footer-nav-tint:/g)?.length, 1, "the tint token must be defined once");
  assert.equal(glass.match(/--dc-footer-nav-blur:/g)?.length, 1, "the blur token must be defined once");
  // The panel colour + the separate non-animating blur stage, both keyed on the
  // one hook every dock carries, so no screen can opt out.
  assert.match(glass, /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{/);
  assert.match(glass, /background-color: var\(--dc-footer-nav-tint\) !important;/);
  assert.match(glass, /backdrop-filter: blur\(var\(--dc-footer-nav-blur\)\) saturate\(1\.25\) !important;/);
});

test("no page repaints the footer dock (the course player tray is the documented exception)", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  };
  walk("src");

  for (const file of files) {
    const source = read(file);
    // Every rule that mentions the dock AND paints it must be either the one
    // material rule in glass.css or the course player's own solid tray, which
    // is a deliberate owner decision (docs/part20-classroom-removal-and-flat-player-panel-language.md)
    // and is player chrome, not site footer navigation.
    const painted = /[^{}]*\[data-glass-dock\][^{}]*\{[^}]*(background|backdrop-filter)[^}]*\}/g;
    for (const rule of source.match(painted) || []) {
      const selector = rule.slice(0, rule.indexOf("{"));
      const body = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
      const isMaterialRule = file.endsWith("src/glass.css");
      const isPlayerTray =
        selector.includes(".course-player-shell") ||
        selector.includes("[data-course-dock]") ||
        selector.includes("[data-course-peek-dock]") ||
        selector.includes("[data-course-image-viewer]");
      // index.css's layout rule keeps the dock from reserving a band and is the
      // `?glass=off` fallback: its ONLY paint is `background: transparent`.
      const isTransparentFallback =
        /background:\s*transparent !important/.test(body) &&
        !/backdrop-filter/.test(body) &&
        (body.match(/background/g) || []).length === 1;
      assert.ok(
        isMaterialRule || isPlayerTray || isTransparentFallback,
        `${file} repaints the footer dock outside the shared material: ${selector.trim()}`,
      );
    }
  }
});

test("seven tabs fit the capsule by tightening rhythm, never tap targets", () => {
  // The old escape hatch — a full-width labelled bar for the primary nav only —
  // is gone, hook and all.
  assert.doesNotMatch(css, /^\s*[^\n]*\[data-primary-library-nav\]/m, "no CSS may key off the old hook");
  assert.doesNotMatch(read("src/components/BottomNav.tsx"), /^\s*data-primary-library-nav\s*$/m, "the nav may not carry the old hook");
  // The wrapper publishes the tab count so the fit rules can scope to the
  // seven-tab nav instead of restyling every dock.
  assert.match(shared, /data-dock-count=\{String\(items\.length\)\}/);
  for (const band of ["429px", "379px", "349px", "319px"]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${band}\\) \\{\\s*\\[data-site-footer-nav\\]\\[data-dock-count="7"\\]`), `missing the ${band} fit band`);
  }
  // Below 350px the plates shrink through GlassDock's own `compact` size, so
  // the magnification wave keeps working (a CSS `width: … !important` would
  // freeze it, which is what the old bar did).
  assert.match(shared, /\(max-width: 349px\)/);
  assert.match(shared, /compact=\{compact\}/);
  assert.match(dock, /export const COMPACT_ICON_SIZE = 38/);
  assert.doesNotMatch(css, /\[data-site-footer-nav\]\[data-dock-count="7"\][^{]*\{[^}]*width: 44px !important/);
});

test("FlowPath's dock keeps the same capsule gutters as every footer", () => {
  // It pins to the viewport (its page has no positioned frame) and stays
  // visible inside the desktop shell, but the DESIGN — gutters, safe-area
  // padding and the shared dock — is the same capsule.
  const flow = read("src/components/flowpath/BottomDock.tsx");
  assert.match(flow, /px-3 pb-\[max\(env\(safe-area-inset-bottom\),10px\)\] pt-2/);
  assert.match(flow, /<GlassDock/);
  assert.match(css, /\.dc-desktop-shell \[data-fp-dock\]/);
});

test("the tablet text row steps aside where the capsule is now visible", () => {
  // Otherwise Revision on a tablet portrait would show two navs at once.
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 959px\) and \(orientation: portrait\)/);
  assert.match(css, /\[data-page-tabs\] \{\s*display: none !important/);
});
