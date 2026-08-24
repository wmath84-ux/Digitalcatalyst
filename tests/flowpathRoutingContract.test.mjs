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

test("FlowPath glass is scoped under .flowpath-app so light mode shows a light header", () => {
  assert.match(flowPathApp, /flowpath-app relative min-h-screen/);
  // The theme-aware glass beats landing.css's fixed dark .glass-panel.
  assert.match(indexCss, /\.flowpath-app \.glass-panel\s*\{/);
  assert.match(indexCss, /\.flowpath-app \.glass-panel-strong\s*\{/);
  assert.match(indexCss, /\.flowpath-app \.glass-panel[\s\S]*background: var\(--fp-panel\)/);
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

test("home header has a Plus shortcut next to the leaderboard that opens FlowPath", () => {
  assert.match(homeHeader, /aria-label="Leaderboard"/);
  assert.match(homeHeader, /aria-label="Open FlowPath planning"/);
  assert.match(homeHeader, /window\.location\.hash = "#\/flowpath"/);
  assert.match(homeHeader, /<Plus size=\{18\}/);
});
