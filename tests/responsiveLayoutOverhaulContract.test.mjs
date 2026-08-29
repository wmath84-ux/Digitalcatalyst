// tests/responsiveLayoutOverhaulContract.test.mjs
//
// Regression coverage for the container-aware responsive layout overhaul.
//
// The core bug was that layouts decided to switch from single-column to
// multi-column based ONLY on the browser viewport. Inside the shared
// sidebar + content shell a 1024px window can leave far less horizontal
// space for the actual page, so cards and controls were compressed into
// narrow strips. These tests lock in the container/query architecture that
// fixes the actual available-width problem.
//
// These are pure code-shape / CSS contract tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const responsive = read("src/utils/responsive.ts");
const pageShell = read("src/revision/components/PageShell.tsx");
const revisionApp = read("src/revision/components/AppHeader.tsx");
const dashboard = read("src/revision/pages/DashboardPage.tsx");
const profile = read("src/revision/pages/RevisionProfilePage.tsx");
const progress = read("src/revision/pages/ProgressPage.tsx");
const bank = read("src/revision/pages/RevisionBankPage.tsx");
const aiGenerate = read("src/revision/pages/AiGeneratePage.tsx");
const aiConfigForm = read("src/revision/components/AiConfigForm.tsx");
const testResult = read("src/revision/pages/TestResultPage.tsx");
const sessionResult = read("src/revision/pages/RevisionSessionResultPage.tsx");
const mainProfile = read("src/profile/ProfileLayout.tsx");
const css = read("src/index.css");

test("responsive utilities expose the practical intermediate bands", () => {
  assert.match(responsive, /VIEWPORT_BANDS/);
  assert.match(responsive, /compactMobileMax: 479/);
  assert.match(responsive, /largeMobileMax: 639/);
  assert.match(responsive, /smallTabletMax: 767/);
  assert.match(responsive, /tabletPortraitMax: 959/);
  assert.match(responsive, /narrowDesktopMax: 1199/);
  assert.match(responsive, /getViewportBand/);
  assert.match(responsive, /useViewportBand/);
});

test("revision PageShell is the responsive foundation container", () => {
  assert.match(pageShell, /data-responsive-layout/);
  assert.match(pageShell, /data-revision-page-main/);
  assert.match(pageShell, /min-w-0/);
  assert.match(css, /\[data-revision-page-main\]\s*\{[^}]*container-type: inline-size/);
  assert.match(css, /\[data-revision-page-main\]\s*\{[^}]*container-name: dc-rev/);
});

test("revision headers wrap instead of clipping long titles and actions", () => {
  assert.match(revisionApp, /flex-wrap items-center gap-2/);
  assert.match(revisionApp, /min-w-0 flex-1/);
  assert.match(revisionApp, /\[overflow-wrap:anywhere\]/);
  assert.match(revisionApp, /max-w-full shrink-0 flex-wrap items-center gap-1/);
});

test("revision dashboard panels and stat grids are container-targeted", () => {
  assert.match(dashboard, /data-rev-panel="primary"/);
  assert.match(dashboard, /data-rev-panel="secondary"/);
  assert.match(dashboard, /data-rev-stat-grid/);
  assert.match(dashboard, /data-rev-bank-grid/);
  assert.match(css, /@container dc-rev \(max-width: 479px\)[\s\S]*\[data-rev-stat-grid\][\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("revision profile keeps secondary info available on compact widths", () => {
  assert.match(profile, /data-rev-col="left"/);
  assert.match(profile, /data-rev-col="middle"/);
  assert.match(profile, /data-rev-col="right"/);
  // The Quick Tips column no longer disappears below the desktop breakpoint;
  // it flows below primary content instead.
  assert.doesNotMatch(profile, /<div className="hidden lg:flex/);
  assert.match(profile, /data-rev-widget-grid/);
});

test("revision progress and result pages expose reflow grids", () => {
  assert.match(progress, /data-rev-panel="primary"/);
  assert.match(progress, /data-rev-panel="secondary"/);
  assert.match(progress, /data-rev-total-grid/);
  assert.match(testResult, /data-rev-result-grid/);
  assert.match(sessionResult, /data-rev-result-grid/);
  assert.match(bank, /data-rev-result-metrics/);
});

test("AI generation controls reflow via container-width columns", () => {
  assert.match(aiGenerate, /data-rev-choice-grid/);
  assert.match(aiGenerate, /data-rev-question-mode-grid/);
  assert.match(aiConfigForm, /data-ai-provider-grid/);
  assert.match(css, /@container dc-rev \(max-width: 479px\)[\s\S]*\[data-rev-choice-grid\][\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container dc-rev \(min-width: 660px\)[\s\S]*\[data-rev-choice-grid\][\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
});

test("saved test grid uses minimum usable card widths, not viewport columns", () => {
  assert.match(bank, /data-saved-tests-grid/);
  assert.match(css, /\[data-saved-tests-grid\]\s*\{[^}]*repeat\(auto-fill, minmax\(min\(240px, 100%\), 1fr\)\) !important/);
});

test("narrow desktop splits collapse to a single readable column", () => {
  assert.match(css, /@container dc-rev \(max-width: 859px\)[\s\S]*\[data-rev-layout="dashboard"\]/);
  assert.match(css, /@container dc-rev \(max-width: 859px\)[\s\S]*\[data-rev-layout="weak"\]/);
  assert.match(css, /@container dc-rev \(max-width: 859px\)[\s\S]*display: block !important/);
});

test("main profile is container-aware and stats never become thin strips", () => {
  assert.match(mainProfile, /data-profile-stats/);
  assert.match(css, /\[data-profile-layout\]\s*\{[^}]*container-name: dc-profile/);
  assert.match(css, /@container dc-profile \(max-width: 479px\)[\s\S]*\[data-profile-stats\][\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container dc-profile \(max-width: 719px\)[\s\S]*\[data-profile-layout\][\s\S]*display: block !important/);
});

test("shared desktop shell stacks a side panel on narrow content", () => {
  assert.match(css, /\.dc-desktop-shell \[data-desktop-content\]\s*\{[^}]*container-name: dc-shell/);
  assert.match(css, /@container dc-shell \(max-width: 1040px\)[\s\S]*\[data-desktop-side-panel\][\s\S]*flex-basis: 100%/);
});

test("desktop top bar wraps and shrinks its search on narrow desktop", () => {
  assert.match(css, /@media \(max-width: 1199px\)[\s\S]*\[data-desktop-topbar-row\][\s\S]*flex-wrap: wrap/);
  assert.match(css, /@media \(max-width: 1199px\)[\s\S]*\[data-desktop-search\][\s\S]*width: min\(220px, 30vw\) !important/);
});
