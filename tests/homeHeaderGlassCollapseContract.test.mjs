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
  assert.match(homeHeader, /backdropFilter/);
  assert.match(homeHeader, /saturate\(160%\)/);
});

test("Home header collapses on scroll to brand + action buttons", () => {
  assert.match(homeHeader, /data-home-header/);
  assert.match(homeHeader, /--home-collapse/);
  assert.match(homeHeader, /data-collapsed/);
  assert.match(homeHeader, /data-home-search-slot/);
  assert.match(homeHeader, /data-home-actions/);
  assert.match(homeHeader, /data-home-chrome/);
  assert.match(homeHeader, /addEventListener\("scroll"/);
  assert.match(homeHeader, /aria-label="Leaderboard"/);
  assert.match(homeHeader, /aria-label="Open FlowPath planning"/);
  assert.match(homeHeader, /aria-label="Notifications"/);
  assert.match(homeHeader, /aria-label="Favorites"/);
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
  // Phase A: the chrome token is the pack GlassSurface dark material at its defaults.
  assert.match(css, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.21\)/);
  assert.match(css, /--dc-chrome-glass-blur: blur\(9\.8px\) saturate\(1\.3\)/);
  assert.doesNotMatch(
    css.slice(css.lastIndexOf("CHROME GLASS")),
    /rgba\(255,\s*255,\s*255,\s*0\.9[0-9]\)/,
    "chrome glass must not restore an opaque white fill",
  );
});
