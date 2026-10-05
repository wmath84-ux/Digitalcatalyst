// tests/revisionScenePlateContract.test.mjs
//
// Regression contract for the active Recall-backed Revision UI. The older
// scene-plate assertions described the retired five-tab glass implementation;
// Revision now uses Recall's light/dark token surfaces inside a scoped root.
// Keep the checks here focused on the currently rendered shell, readable form
// and preview surfaces, and the host navigation that surrounds the feature.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const revisionApp = read("src/revision/RevisionApp.tsx");
const recallTheme = read("src/revision/recall-theme.css");
const recallTokens = read("src/revision/recall-tokens.css");
const indexCss = read("src/index.css");
const desktopShell = read("src/components/DesktopShell.tsx");
const bulkImport = read("src/revision/pages/BulkImportPage.tsx");
const bottomNav = read("src/components/BottomNav.tsx");
const footerNav = read("src/components/SiteFooterNav.tsx");

/* ------------------------------------------------------------------ */
/* Active surface + scoped theme                                       */
/* ------------------------------------------------------------------ */

test("the active Revision route uses the scoped Recall surface system", () => {
  assert.match(revisionApp, /import "\.\/recall-theme\.css"/);
  assert.match(revisionApp, /data-recall-root[\s\S]{0,140}?className="min-h-dvh bg-background/);
  assert.match(recallTheme, /\[data-recall-root\] \{/);
  assert.match(recallTheme, /--rc-background: #f7f9fb;/);
  assert.match(recallTokens, /--color-background: var\(--rc-background\)/);
  assert.match(indexCss, /@import "\.\/revision\/recall-tokens\.css"/);
  assert.doesNotMatch(recallTheme.replace(/\/\*[\s\S]*?\*\//g, ""), /^\s*:root\s*\{/m);
  assert.doesNotMatch(revisionApp, /dc-scene-plate/);
});

test("desktop Revision reserves its light surface and uses the shell's real scroller", () => {
  assert.match(
    indexCss,
    /\.dc-desktop-shell \[data-recall-root\]\[data-revision-app\] \{[\s\S]{0,420}?height: auto !important;[\s\S]{0,240}?overflow: visible !important;[\s\S]{0,180}?background: var\(--rc-background\) !important;/,
  );
  assert.match(desktopShell, /data-desktop-content/);
  assert.match(indexCss, /\.dc-desktop-shell \[data-revision-shell\] > \[data-revision-scroll\]/);
  assert.match(indexCss, /\[data-revision-scroll\][^{]*\{[^}]*padding-top: calc\(var\(--desktop-topbar-height, 64px\)/);
});

/* ------------------------------------------------------------------ */
/* Keep the host shell and its navigation                              */
/* ------------------------------------------------------------------ */

test("host header, horizontal Revision tabs and footer navigation stay in place", () => {
  assert.match(revisionApp, /!isDesktopHost && !isFocused && \(\s*<Header/);
  assert.match(revisionApp, /!isDesktopHost && !isFocused && <RevisionTabs route=\{route\} \/>/);
  assert.match(revisionApp, /!isDesktopHost && !isFocused && \(\s*<BottomNav/);
  assert.match(revisionApp, /useRegisterTopBarTabs\(/);

  for (const item of [
    '{ id: "dashboard", label: "Dashboard"',
    '{ id: "bank", label: "Test Bank"',
    '{ id: "decks", label: "Decks"',
    '{ id: "bulk-import", label: "Import"',
  ]) {
    assert.ok(revisionApp.includes(item), `missing desktop navigation item: ${item}`);
  }
  assert.match(desktopShell, /data-desktop-topbar-row/);
  assert.match(desktopShell, /data-desktop-content/);
  assert.match(bottomNav, /<SiteFooterNav/);
  assert.match(footerNav, /<GlassDock siteFooter/);
});

/* ------------------------------------------------------------------ */
/* Import form and question-card preview                               */
/* ------------------------------------------------------------------ */

test("Bulk Import uses readable Recall controls and keeps question previews", () => {
  assert.match(bulkImport, /<RecallPage/);
  assert.match(bulkImport, /<RecallCard/);
  assert.match(bulkImport, /from "\.\.\/recall\/components\/ui\/input"/);
  assert.match(bulkImport, /from "\.\.\/recall\/components\/ui\/textarea"/);
  assert.match(bulkImport, /Question preview/);
  assert.match(bulkImport, /<article[\s\S]{0,220}?bg-surface-container-low/);
  assert.match(bulkImport, /role="radio"|type="radio"/);
  assert.doesNotMatch(bulkImport, /dc-field|dc-scene-plate|<GlassCard|<GlassButton/);
});
