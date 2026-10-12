import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/light-theme.css", "utf8");
const glass = fs.readFileSync("src/glass.css", "utf8");
const sidebar = fs.readFileSync("src/components/glass-dock/GlassSidebar.tsx", "utf8");
const menu = fs.readFileSync("src/components/MobileHeaderMenu.tsx", "utf8");

test("compact sidebar labels and tooltips expose scoped light-theme hooks", () => {
  for (const hook of ["data-glass-sidebar-label", "data-glass-sidebar-tooltip"]) {
    assert.ok(sidebar.includes(hook));
    assert.ok(css.includes(`html[data-theme="light"] [data-glass-sidebar] [${hook}]`));
  }
  assert.match(menu, /surfaceVariant="header-drawer"/);
  assert.match(sidebar, /data-glass-sidebar-surface=\{surfaceVariant\}/);
});

test("the header-avatar drawer uses a translucent Uiverse-style glass pane in the base theme", () => {
  const panel = glass.match(/\[data-glass-sidebar-surface="header-drawer"\]\s*\{([^}]*)\}/)?.[1];
  assert.ok(panel, "the mobile header drawer has a dedicated material hook");
  assert.match(panel, /rgba\(23, 30, 44, 0\.62\)/);
  assert.match(panel, /linear-gradient\(-75deg/);
  assert.match(panel, /backdrop-filter: blur\(16px\) saturate\(1\.2\)/);
  assert.match(panel, /inset 0 -0\.125em 0\.125em rgba\(255, 255, 255, 0\.5\)/);
});

test("light mode keeps the tablet rail solid but lets the avatar drawer and page backdrop show through", () => {
  const section = css.slice(css.indexOf("/* Compact tablet rail"));
  assert.match(section, /html\[data-theme="light"\] \[data-glass-sidebar\]\s*\{[^}]*color: #000;[^}]*background: var\(--dc-bg-secondary\) !important/s);
  assert.match(section, /html\[data-theme="light"\] \[data-glass-sidebar\]\[data-glass-sidebar-surface="header-drawer"\]\s*\{[\s\S]*?rgba\(235, 241, 248, 0\.44\) !important;[\s\S]*?backdrop-filter: blur\(16px\)/);
  assert.match(section, /html\[data-theme="light"\] \[data-mobile-header-drawer-backdrop\]\s*\{\s*background: rgba\(15, 23, 42, 0\.24\) !important;/);
  assert.match(section, /\[data-glass-sidebar\] p,/);
  assert.match(section, /\[data-glass-sidebar\] button/);
  assert.doesNotMatch(section, /\[data-glass-sidebar\] \*/);
  for (const rule of section.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",")) {
      assert.ok(selector.trim().startsWith('html[data-theme="light"]'));
    }
  }
});
