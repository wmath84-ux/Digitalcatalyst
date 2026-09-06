// tests/homeHeaderGlassCollapseContract.test.mjs
//
// Home's branded gradient header (and every other app chrome header)
// must share the MAG / WebsiteGlass frost: watercolor, not an opaque
// white strip. The Home block still reads its admin colour stops, and
// while the page scroller moves it shrinks to the brand row + action
// buttons (leaderboard, FlowPath, notifications, favorites).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const sharedHeader = fs.readFileSync("src/components/Header.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");
const desktop = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const revision = fs.readFileSync("src/revision/components/AppHeader.tsx", "utf8");

test("Home header keeps brand gradient customization and frosts it", () => {
  assert.match(homeHeader, /useBranding\(\)/);
  assert.match(homeHeader, /homeGradientFrom/);
  assert.match(homeHeader, /homeGradientTo/);
  assert.match(homeHeader, /DEFAULT_HOME_GRADIENT_FROM/);
  assert.match(homeHeader, /DEFAULT_HOME_GRADIENT_TO/);
  assert.match(homeHeader, /data-home-gradient-from/);
  assert.match(homeHeader, /data-home-gradient-to/);
  assert.match(homeHeader, /linear-gradient\(to bottom right/);
  // 2026-09-04: the header surface is the pack GlassSurface at the pinned
  // docs sensitivity (websiteglass.com/docs/components/glass: tint 0.25 · dome 0.1),
  // with the owner's later override: background blur removed entirely (blur 0).
  assert.match(homeHeader, /tint=\{0\.25\}/);
  assert.match(homeHeader, /blur=\{0\}/);
});

test("Home header collapses on scroll to brand + action buttons", () => {
  assert.match(homeHeader, /data-home-header/);
  assert.match(homeHeader, /--home-collapse/);
  assert.match(homeHeader, /data-collapsed/);
  assert.match(homeHeader, /data-home-search-slot/);
  assert.match(homeHeader, /data-home-actions/);
  assert.match(homeHeader, /data-home-chrome/);
  assert.match(homeHeader, /addEventListener\("scroll"/);
  // The action cluster is data-driven (ExpandingTabs items); the labels
  // render as aria-label via the component.
  assert.match(homeHeader, /ariaLabel: "Leaderboard"/);
  assert.match(homeHeader, /ariaLabel: "Notifications"/);
  assert.match(homeHeader, /ariaLabel: "Favorites"/);
  assert.match(css, /\[data-home-header\] \[data-home-search-slot\]/);
  assert.match(css, /\[data-home-header\] \[data-home-welcome\]/);
  assert.match(css, /\[data-home-header\]\[data-collapsed\] \[data-home-search-slot\]/);
});

test("Home overlay seat is the expanded header height, not the collapse", () => {
  // Overlay padding lives on the scroller. If it shrank with --home-collapse
  // the content would double-move (header shrinks AND the pad shrinks).
  // Measure with collapse forced to 0, write the expanded height on the frame.
  assert.match(homeHeader, /const measureSeat = /);
  assert.match(homeHeader, /setProperty\("--home-collapse", "0"\)/);
  assert.match(homeHeader, /setProperty\("--dc-home-header-seat"/);
  assert.match(homeHeader, /closest\("\[data-app-frame\]"\)/);
  assert.match(homeHeader, /header\.offsetHeight/);
  const overlay = css.slice(css.lastIndexOf("CHROME OVERLAY"));
  assert.match(overlay, /var\(--dc-home-header-seat/);
  assert.doesNotMatch(overlay, /--home-collapse/);
});

test("shared, desktop, revision and search headers use watercolor glass, not opaque white", () => {
  assert.match(sharedHeader, /data-site-header/);
  assert.match(sharedHeader, /bg-white\/75/);
  assert.match(sharedHeader, /backdrop-blur-xl/);
  assert.match(desktop, /data-desktop-topbar/);
  assert.match(revision, /data-revision-app-header/);
  assert.match(css, /--dc-chrome-glass/);
  assert.match(css, /\[data-site-header\]:not\(\[data-home-header\]\)/);
  assert.match(css, /\.dc-desktop-shell \[data-desktop-topbar\]/);
  assert.match(css, /\[data-revision-app-header\]/);
  assert.match(css, /\[data-revision-app\] \.dc-glass-toolbar/);
  assert.match(css, /\[data-search-bar\]/);
  // 2026-09-04: the chrome token is the pack GlassSurface dark material at the
  // PINNED docs sensitivity (tint 0.25 → rgba(60,62,68, 0.25*0.42=0.105)),
  // with the owner's override: NO blur stage anywhere ("background blur
  // ekadam hata do") — the token carries saturate only.
  assert.match(css, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.105\)/);
  assert.match(css, /--dc-chrome-glass-blur: saturate\(1\.15\);/);
  // Bounded to the chrome section — the course player re-scopes the same token
  // with its own documented blur discipline elsewhere in the file.
  assert.doesNotMatch(
    css.slice(css.indexOf("--dc-chrome-glass:"), css.indexOf("DESIGN SYSTEM PASS")),
    /--dc-chrome-glass-blur:\s*blur\(/,
  );
  assert.doesNotMatch(
    // Bounded to the chrome section itself — the "DESIGN SYSTEM PASS" ink
    // scale below it legitimately uses 0.96 white for text.
    css.slice(css.lastIndexOf("CHROME GLASS"), css.indexOf("DESIGN SYSTEM PASS")),
    /rgba\(255,\s*255,\s*255,\s*0\.9[0-9]\)/,
    "chrome glass must not restore an opaque white fill",
  );
});
