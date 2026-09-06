// tests/flowpathRoutingContract.test.mjs
//
// Contract for the FlowPath (task-planning) dashboard integration:
//
//   1. The FlowPath glass surfaces are scoped under `.flowpath-app` so the
//      theme-aware glass wins over the dark `.glass-panel` from landing.css,
//      fixing the header appearing black even in light mode.
//   2. The FlowPath theme blocks set `color-scheme` and the display font,
//      matching the provided design zip.
//   3. The dock's Home / MyDay / Revision radial items navigate to the real
//      pages instead of showing a "coming soon" stub.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexCss = fs.readFileSync("src/index.css", "utf8");
const flowPathApp = fs.readFileSync("src/FlowPathApp.tsx", "utf8");
const bottomDock = fs.readFileSync("src/components/flowpath/BottomDock.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");

test("FlowPath surfaces are the pack GlassSurface; no hand-painted .glass-panel remains", () => {
  assert.match(flowPathApp, /flowpath-app relative min-h-screen/);
  // Wave 14: landing.css no longer defines `.glass-panel` and index.css no
  // longer scopes a theme-aware copy under `.flowpath-app` — FlowPath's
  // cards / sheets / radial items render the registry GlassSurface in JSX.
  assert.doesNotMatch(indexCss, /\.flowpath-app \.glass-panel\s*\{/);
  assert.doesNotMatch(fs.readFileSync("src/landing.css", "utf8"), /\.glass-panel\s*\{/);
  for (const f of ["ActivityCard", "CreateModal", "CurveSettingsModal", "RadialMenu"]) {
    const src = fs.readFileSync(`src/components/flowpath/${f}.tsx`, "utf8");
    assert.match(src, /<GlassSurface/, `${f} renders the pack surface`);
    assert.doesNotMatch(src, /className="[^"]*glass-panel/, `${f} still paints .glass-panel`);
  }
});

test("FlowPath theme blocks set color-scheme and the display font", () => {
  // Matches the provided design zip: each theme sets color-scheme and a
  // .font-display class is supplied for the Sora display font.
  assert.match(indexCss, /--fp-violet-text: #ddd6fe;[\s\S]*color-scheme: dark;/);
  assert.match(indexCss, /--fp-violet-text: #6d28d9;[\s\S]*color-scheme: light;/);
  assert.match(indexCss, /\.font-display\s*\{[\s\S]*font-family: "Sora"/);
});

test("dock Home / MyDay / Revision radial items navigate to real pages", () => {
  // Home quick links
  assert.match(bottomDock, /"home-purchase": "#\/store\/purchases"/);
  assert.match(bottomDock, /"home-store": "#\/store"/);
  assert.match(bottomDock, /"home-subscription": "#\/subscription"/);
  assert.match(bottomDock, /"home-profile": "#\/profile"/);
  assert.match(bottomDock, /"home-wishlist": "#\/favorites"/);
  assert.match(bottomDock, /"home-cart": "#\/cart"/);
  // MyDay sections (MyDay reads ?section=)
  assert.match(bottomDock, /day: "#\/my-day"/);
  assert.match(bottomDock, /"day-task": "#\/my-day\?section=tasks"/);
  assert.match(bottomDock, /"day-schedule": "#\/my-day\?section=schedule"/);
  assert.match(bottomDock, /"day-reminder": "#\/my-day\?section=reminders"/);
  assert.match(bottomDock, /"day-note": "#\/my-day\?section=notes"/);
  // Revision pages
  assert.match(bottomDock, /"rev-dashboard": "#\/revision"/);
  assert.match(bottomDock, /"rev-bank": "#\/revision\/bank"/);
  assert.match(bottomDock, /"rev-progress": "#\/revision\/progress"/);
  assert.match(bottomDock, /"rev-profile": "#\/revision\/profile"/);
  // Selecting an item performs a real navigation.
  assert.match(bottomDock, /window\.location\.hash = route;/);
});

test("home header keeps the leaderboard action; FlowPath stays reachable from the nav chrome", () => {
  // The action cluster is the pack ExpandingTabs with a data-driven item
  // list, so the accessible labels live on the item objects (the component
  // renders them as aria-label) instead of inline attributes.
  assert.match(homeHeader, /id: "leaderboard"/);
  assert.match(homeHeader, /ariaLabel: "Leaderboard"/);
  assert.match(homeHeader, /window\.location\.hash = "#\/leaderboard"/);
  // The dedicated header Plus shortcut was retired; FlowPath is reached from
  // the mobile bottom nav (and the desktop dock) instead.
  const bottomNav = fs.readFileSync("src/components/BottomNav.tsx", "utf8");
  assert.match(bottomNav, /if \(key === "flowpath"\) window\.location\.hash = "#\/flowpath"/);
});
