// tests/storeChromeDockDragScrollContract.test.mjs
//
// Contract for the 2026-09-06 owner follow-up (after the Home plate pass):
//
//   "it is looking good now also: (a) optimise the bottom navigation bar,
//    (b) when we use our mouse it is not interacting as thumb left-right scroll
//    interaction, (c) optimise the store page."
//
// (a) THE FOOTER DOCK. The dock painted `DOCK_PANEL_BG` — the pack's pinned
//     docs tint, rgba(60,62,68,0.105) — inline on its panel, and the same token
//     on all six tooltips. Over the Winter Wonderland scene's snow band that is
//     10% grey on near-white: no edge, no material, white labels floating on
//     nothing. It now wears the shared contrast plate (the numbers the review
//     cards wear) — from src/glass.css, keyed off the `[data-glass-dock]` hook
//     the dock already ships, because Wave 1 froze the dock's own files and
//     `liquidGlassWaveOneContract` still guards them. The pinned docs
//     SENSITIVITY in TS is untouched; this is the same CSS-side plate.
//
// (b) MOUSE ↔ THUMB PARITY. The rails are `overflow-x-auto` with the scrollbar
//     hidden, so a thumb swipes them and a mouse cannot move them at all (a
//     vertical wheel does not drive a horizontal scroller; only Shift+wheel
//     does, which nobody discovers). `useDragScroll` gives a mouse/pen the same
//     left-right drag, with a fling, click suppression and a scroll-snap
//     hand-off. Touch is deliberately left to the browser.
//
// (c) THE STORE PAGE. Its cards were already plated (GlassCard carries
//     `.dc-glass-card` on every route), so what was left was everything that is
//     not a card: the chrome strips, the search capsule, the filter segment,
//     the hero's pills and loose copy, the coverflow hint, the view popover.
//
// Rules this contract holds the line on:
//   1. every rule stays behind the glass gate, so `?glass=off` restores the
//      published material byte-for-byte (including the dock's refraction lens,
//      which used to survive the kill switch);
//   2. no dock file, and no vendored registry item, is edited to get there;
//   3. the pinned `--dc-chrome-glass` token is NOT retuned — the plate is an
//      override at the call sites, so the token's other consumers (the course
//      player's `--course-surface`) keep their published material;
//   4. the drag hook never hijacks the wheel and never touches touch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const css = read("src/glass.css");
const indexCss = read("src/index.css");
const hook = read("src/hooks/useDragScroll.ts");
const dock = read("src/components/glass-dock/GlassDock.tsx");
const dockMaterial = read("src/components/glass-dock/GlassMaterial.tsx");
const bottomNav = read("src/components/BottomNav.tsx");
const sharedHeader = read("src/components/Header.tsx");
const storePage = read("src/components/StorePage.tsx");
const storeHero = read("src/components/Hero.tsx");
const searchBar = read("src/components/SearchBar.tsx");
const chips = read("src/components/FilterChips.tsx");
const coverflow = read("src/components/TiltedCoverflow.tsx");
const searchPage = read("src/components/SearchPage.tsx");
const homeCategories = read("src/home/components/CategoryNav.tsx");
const homeReviews = read("src/home/components/Reviews.tsx");

/* ------------------------------------------------------------------ */
/* 1. (b) Mouse drag-to-scroll                                        */
/* ------------------------------------------------------------------ */

test("the drag hook is mouse/pen only and never hijacks the wheel or touch", () => {
  // A thumb keeps the browser's own scrolling, momentum and snap.
  assert.match(hook, /event\.pointerType !== "mouse" && event\.pointerType !== "pen"/);
  // Only the left button starts a drag.
  assert.match(hook, /event\.button !== 0/);
  // A rail that fits its content stays inert.
  assert.match(hook, /node\.scrollWidth <= node\.clientWidth \+ 1/);
  // The wheel is NOT converted: turning a vertical wheel into horizontal rail
  // scroll would steal page scrolling from the store's sticky filter bar.
  assert.doesNotMatch(hook, /addEventListener\("wheel"|onWheel/, "the wheel stays the page's");
  assert.doesNotMatch(hook, /preventDefault\(\)[\s\S]{0,80}wheel/i);
  // A fling is motion, so reduced-motion stops the rail dead.
  assert.match(hook, /prefers-reduced-motion: reduce/);
  // A drag is not a tap: the click it ends with is swallowed once, in capture.
  assert.match(hook, /node\.addEventListener\("click", onClickCapture, true\)/);
  assert.match(hook, /suppressClick\.current = state\.moved/);
  // Artwork and links inside a rail must not start a native HTML5 drag.
  assert.match(hook, /addEventListener\("dragstart"/);
  // The rail's reachable range is clamped in the hook rather than left to the
  // browser (LTR-only app), so an edge behaves the same everywhere.
  assert.match(hook, /Math\.min\(Math\.max\(left, 0\), Math\.max\(node\.scrollWidth - node\.clientWidth, 0\)\)/);
  // The held state is painted as an attribute, not as inline style churn.
  assert.match(hook, /setAttribute\("data-drag-scrolling", "true"\)/);
  assert.match(hook, /removeAttribute\("data-drag-scrolling"\)/);
});

test("the held-rail states live in index.css, outside the glass gate", () => {
  // Interaction, not material: it must keep working with `?glass=off`.
  const bare = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /\[data-drag-scrolling="true"\]\s*\{([^}]*)\}/.exec(bare)?.[1];
  assert.ok(rule, "expected a [data-drag-scrolling] rule in index.css");
  assert.match(rule, /cursor:\s*grabbing/);
  assert.match(rule, /user-select:\s*none/);
  // Scroll-snap is suspended while dragging so the rail follows the pointer 1:1,
  // and re-armed on release so it settles onto its nearest card.
  assert.match(rule, /scroll-snap-type:\s*none/);
  // Not gated on the glass tier: dragging a rail is interaction, not material.
  assert.doesNotMatch(indexCss, /data-glass[^{]*\[data-drag-scrolling/);
});

test("every horizontal rail on Home and the store takes the drag", () => {
  const rails = [
    ["home category strip", homeCategories, /className="mt-5 flex overflow-x-auto px-5 pb-1 no-scrollbar"/],
    ["home reviews rail", homeReviews, /overflow-x-auto px-5 pb-2 no-scrollbar snap-x-mandatory/],
    ["store filter chips", chips, /flex gap-2 overflow-x-auto pb-1/],
    ["search page chips", searchPage, /mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap/],
  ];
  for (const [name, source, shape] of rails) {
    assert.match(source, /useDragScroll/, `${name}: missing the drag hook`);
    assert.match(source, /ref=\{\w+\.ref\}\s*\n\s*onPointerDown=\{\w+\.onPointerDown\}/, `${name}: rail is not wired`);
    assert.match(source, shape, `${name}: the scroller itself changed shape`);
  }
  // The reviews rail keeps its snap + hidden scrollbar (pinned by the Home pass).
  assert.match(homeReviews, /snap-x-mandatory/);
  // The store's coverflow already owns a framer-motion `drag="x"` stage — it is
  // not a scroller, so the hook must not be layered on top of it.
  assert.match(coverflow, /drag="x"/);
  assert.doesNotMatch(coverflow, /useDragScroll/);
});

/* ------------------------------------------------------------------ */
/* 2. (a) The footer dock                                             */
/* ------------------------------------------------------------------ */

test("the dock's material is CSS — its files stay byte-comparable", () => {
  for (const [name, source] of [
    ["GlassDock.tsx", dock],
    ["GlassMaterial.tsx", dockMaterial],
    ["BottomNav.tsx", bottomNav],
  ]) {
    assert.doesNotMatch(source, /dc-scene-(plate|ink|field)/, `${name} must not carry scene hooks`);
    assert.doesNotMatch(source, /from "[^"]*ui\/glass-/, `${name} must not import registry primitives`);
  }
  // The pinned docs sensitivity never moved to "fix" the dock's contrast.
  assert.match(dockMaterial, /GLASS_DOCS_SURFACE\.tintAlpha/);
  assert.match(dockMaterial, /DOCK_PANEL_BG = `rgba\(\$\{GLASS_TINT_RGB\},\$\{GLASS_DOCS_SURFACE\.tintAlpha\}\)`/);
  // The plate is keyed off the hook the dock already ships.
  assert.match(dock, /data-glass-dock=""/);
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{/);
});

test("the dock wears the same plate numbers as the bars and cards", () => {
  const rule = /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, "expected the dock plate rule");
  // Same navy, same gradient stops as `.dc-scene-plate--bar`.
  assert.match(rule, /background-color: rgba\(8, 14, 30, 0\.74\) !important/);
  assert.match(rule, /rgba\(12, 20, 40, 0\.78\) 0%/);
  assert.match(rule, /rgba\(8, 14, 30, 0\.72\) 55%/);
  assert.match(rule, /rgba\(6, 11, 24, 0\.76\) 100%/);
  // The rim recipe the cards wear, and a lift off the scene.
  assert.match(rule, /inset 0 1px 0 rgba\(255, 255, 255, 0\.3\)/);
  assert.match(rule, /0 18px 44px -20px rgba\(2, 6, 16, 0\.9\)/);
  // Inline styles only yield to !important, so the two that fight the panel's
  // inline `background` / `boxShadow` tokens carry it explicitly.
  assert.match(rule, /background-image: linear-gradient\([\s\S]*?\) !important/);
  assert.match(rule, /box-shadow:[\s\S]*?!important/);
});

test("the dock plate wins the cascade against index.css's transparent panel", () => {
  // index.css keeps the dock from reserving a band by painting the capsule
  // `background: transparent !important` from a one-attribute selector — which
  // also beat the panel's inline `DOCK_PANEL_BG`, so the footer was a bare lens
  // over the scene. The plate is `html[data-glass="on"] :where([data-glass-dock])`:
  // same importance, one specificity point higher (html + the gate attribute),
  // so the material lands — and `?glass=off` still falls back to the bare lens.
  const bare = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(bare, /\[data-glass-dock\] \{\s*overflow: visible;\s*isolation: isolate;\s*background: transparent !important;\s*\}/);
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{\s*\n\s*background-color:/);
});

test("the dock tooltips are an opaque plate and drop their six live filters", () => {
  const rule = /html\[data-glass="on"\] :where\(\[data-glass-dock-item\]\) > div:first-child \{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, "expected the tooltip rule");
  assert.match(rule, /background-color: rgba\(6, 11, 26, 0\.9\) !important/);
  assert.match(rule, /color: rgba\(255, 255, 255, 0\.96\) !important/);
  // Six permanently-mounted backdrop-filters (one per tab, mounted even at
  // opacity 0) over the dock's own plate refract nothing worth the layers.
  assert.match(rule, /backdrop-filter: none !important/);
  assert.match(rule, /-webkit-backdrop-filter: none !important/);
});

test("?glass=off finally switches the dock's refraction lens off", () => {
  // GlassMaterial carries neither `[data-glass-lens]` nor `[data-glass-surface]`
  // and writes `backdrop-filter: url(#…)` inline, so the document-wide off rule
  // never reached it: the footer kept refracting with glass off.
  assert.doesNotMatch(dockMaterial, /data-glass-lens|data-glass-surface/);
  assert.match(css, /html\[data-glass="off"\] :where\(\[data-glass-dock\]\) > \[aria-hidden\] \* \{\s*\n\s*backdrop-filter: none !important/);
  // The plate itself is gated, so off restores the published 10% tint.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selectors] of bare.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    if (!/data-glass-dock/.test(selectors)) continue;
    for (const selector of selectors.split(",").map((s) => s.replace(/^[\s}]+/, "").trim())) {
      if (!/data-glass-dock/.test(selector)) continue;
      assert.match(
        selector,
        /^html\[data-glass="(on|off)"\]/,
        `a dock rule escaped the glass gate: ${selector.slice(0, 90)}`,
      );
    }
  }
});

test("the dock plate actually clears AA over the brightest band of the scene", () => {
  // Worst case: the plate over the lit snow, with GlassMaterial's light-blue
  // wash (alpha 0.17 at the top of its gradient) composited on top, and the
  // tooltip's 96% white label over that.
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const over = (fg, alpha, bg) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const scene of [
    [77, 81, 93], // the measured mid-band of the winter scene
    [206, 214, 226], // the lit snow / lake at its brightest
  ]) {
    const plate = over([8, 14, 30], 0.74, scene);
    const washed = over([186, 230, 253], 0.17, plate);
    const label = over([255, 255, 255], 0.96, washed);
    const r = ratio(label, washed);
    assert.ok(r >= 4.5, `dock label over ${scene} measures ${r.toFixed(2)}:1, under AA`);

    const tooltip = over([6, 11, 26], 0.9, washed);
    const tooltipInk = over([255, 255, 255], 0.96, tooltip);
    const rt = ratio(tooltipInk, tooltip);
    assert.ok(rt >= 4.5, `dock tooltip over ${scene} measures ${rt.toFixed(2)}:1, under AA`);
  }
});

/* ------------------------------------------------------------------ */
/* 3. (c) The store page                                              */
/* ------------------------------------------------------------------ */

test("the app chrome strips take the bar plate, and the token stays pinned", () => {
  // The shared header is the store's header (and every other route's).
  assert.match(sharedHeader, /className=\{`dc-scene-plate dc-scene-plate--bar sticky top-0 z-30 bg-white\/75/);
  // The published material stays in the class list — `?glass=off` restores it.
  assert.match(sharedHeader, /bg-white\/75/);
  assert.match(sharedHeader, /backdrop-blur-xl/);
  // The store's sticky filter bar.
  assert.match(storePage, /data-store-filter-bar className="dc-scene-plate dc-scene-plate--bar sticky top-0 z-20/);

  // index.css paints those strips with the 10% chrome token at !important from
  // `[data-site-header]:not([data-home-header])` — specificity (0,2,0). The bar
  // rule has to out-rank that, which is why `body` joins the selector.
  assert.match(css, /html\[data-glass="on"\] body \.dc-scene-plate--bar \{/);
  const barRule = /html\[data-glass="on"\] body \.dc-scene-plate--bar \{([^}]*)\}/.exec(css)?.[1];
  assert.match(barRule, /background-color: rgba\(8, 14, 30, 0\.74\) !important/);

  // The token itself is NOT retuned: `--course-surface` and the desktop shell
  // read it too, and their published material must not move.
  assert.match(indexCss, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.105\)/);
  assert.match(indexCss, /--dc-chrome-glass-blur: saturate\(1\.15\);/);
  assert.doesNotMatch(indexCss, /dc-scene-plate/);
});

test("the store's own surfaces wear the plate", () => {
  // Search capsule: the pack surface is an overlay, the input its sibling.
  assert.match(searchBar, /className="dc-scene-plate pointer-events-none absolute inset-0/);
  assert.match(searchBar, /data-store-search-trigger/, "the tap-to-search contract is untouched");
  // The launcher-scoped ink, because `.dc-scene-field` cannot reach a sibling.
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-search-launcher\]\) input::placeholder \{/);
  assert.match(css, /:where\(\[data-search-launcher\]\) :where\(\.text-white\\\/35, \.text-white\\\/40, \.text-white\\\/45\)/);

  // The filter segment is the same hook Home's category strip wears.
  assert.match(chips, /className="dc-segment dc-scene-plate shrink-0"/);
  assert.match(chips, /overflow-x-auto/, "long filter lists still scroll sideways");
  // The filter sheet and the view-mode popover.
  assert.match(chips, /className="dc-scene-plate w-full overflow-hidden text-sm text-white\/85"/);
  assert.match(storePage, /className="dc-scene-plate absolute right-0 top-full z-30 mt-1\.5 flex w-max text-white"/);
});

test("the store's loose copy on the scene takes the ink scrim", () => {
  assert.match(storeHero, /<h2 className="dc-scene-ink mt-2\.5 text-\[28px\]/);
  assert.match(storeHero, /<p className="dc-scene-ink mt-2 max-w-sm text-sm leading-relaxed text-white\/75">/);
  assert.equal(storeHero.match(/dc-scene-plate/g)?.length, 4, "the brand pill + three trust pills");
  // The plate's ink floor paints `color` on the surface root, so the brand pill's
  // `text-indigo-200` accent has to be handed back explicitly.
  assert.match(storeHero, /className="dc-scene-plate inline-block text-indigo-200"/);
  assert.match(css, /html\[data-glass="on"\] :where\(\.dc-scene-plate\):where\(\.text-indigo-200\) \{\s*\n\s*color: #c7d2fe;/);
  assert.match(storePage, /className="dc-scene-ink dc-section-label px-4">Top rated</);
  assert.match(coverflow, /className="dc-scene-ink text-xs tracking-wide text-\[#9E9E98\]"/);
  // `.dc-section-label` is white at 56% (--dc-ink-3): unreadable over snow.
  assert.match(indexCss, /\.dc-section-label \{\s*\n\s*color: var\(--dc-ink-3\)/);
});

test("the ramp lift is justified by the band the hero actually sits on", () => {
  // The store hero is the first thing on the page, so its heading sits over the
  // TOP of the fixed winter scene: the #0a1224 sky plus the two radial glows
  // (blue at 20% 0%, violet at 80% 0%) from src/winter-background.css — never
  // the snow ground, which starts at 75vh. Measured there, the pinned ramp's
  // leading stop is under 3:1 (1.7:1 over the glows) and the lifted 300 stops
  // clear AA at every stop.
  //
  // The one bright pixel the heading can cross is the mountain's snow cap
  // (#e9f4ff, x < 12vw), where the published dark ramp would have been fine and
  // the lifted ramp is not. That is what `.dc-scene-ink` is for, and it is why
  // the scrim is pinned alongside the lift below: white ink on snow measures
  // 1.0:1 un-scrimmed, so every light label on this scene already depends on it.
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const over = (fg, a, bg) => fg.map((c, i) => a * c + (1 - a) * bg[i]);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  const sky = hex("#0a1224");
  const bands = {
    sky,
    "sky + blue glow": over(hex("#3b6dd1"), 0.45, sky),
    "sky + violet glow": over(hex("#8f5ee7"), 0.45, sky),
  };
  const publishedLead = "#4f46e5"; // indigo-600 — the ramp's first stop
  const lifted = ["#a5b4fc", "#c4b5fd", "#f0abfc"]; // the 300 stops glass.css paints

  for (const [band, bg] of Object.entries(bands)) {
    const before = ratio(hex(publishedLead), bg);
    assert.ok(before < 3, `${publishedLead} over ${band} measures ${before.toFixed(2)}:1 — the lift would not be needed`);
    for (const stop of lifted) {
      const after = ratio(hex(stop), bg);
      assert.ok(after >= 4.5, `${stop} over ${band} measures ${after.toFixed(2)}:1, under AA`);
    }
  }

  // And the scrim that carries the lifted ramp over the mountain's bright cap.
  assert.match(storeHero, /<h2 className="dc-scene-ink mt-2\.5/);
  assert.match(css, /:where\(\.dc-scene-ink\) \{\s*\n\s*text-shadow:/);
});

test("the hero's pinned gradient ramp is lifted in CSS, not rewritten in JSX", () => {
  // storeFiltersAdminProductContract pins the ramp in the JSX; it stays.
  assert.match(storeHero, /from-indigo-600 via-violet-600 to-fuchsia-600/);
  assert.match(storeHero, /bg-clip-text text-transparent/);
  // At the 600 stops the ramp is ~1.1:1 against the snow — the largest type on
  // the store page was its least readable. The 300 stops are the CSS-side lift.
  assert.match(
    css,
    /html\[data-glass="on"\] :where\(\.dc-scene-ink\) :where\(\.bg-clip-text\.text-transparent\) \{\s*\n\s*background-image: linear-gradient\(to right, #a5b4fc 0%, #c4b5fd 50%, #f0abfc 100%\) !important/,
  );
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-store-coverflow\]\) :where\(\.dc-scene-ink\) \{/);
});

/* ------------------------------------------------------------------ */
/* 4. Nothing vendored, frozen or off-route moved                     */
/* ------------------------------------------------------------------ */

test("the vendored registry items are still untouched", () => {
  for (const item of ["glass", "glass-card", "glass-input", "glass-toggle-group", "glass-button", "glass-select"]) {
    const src = read(`src/components/ui/${item}.tsx`);
    assert.doesNotMatch(src, /dc-scene-(plate|ink|field)/, `${item}.tsx must stay byte-comparable`);
    assert.doesNotMatch(src, /data-drag-scrolling/, `${item}.tsx must stay byte-comparable`);
  }
});

test("the store's cards needed no new work — GlassCard plates every route", () => {
  assert.match(read("src/components/ProductCard.tsx"), /<GlassCard\b/);
  assert.match(read("src/components/ui/GlassCard.tsx"), /dc-glass-card/);
  assert.match(storePage, /<GlassCard\b/);
});
