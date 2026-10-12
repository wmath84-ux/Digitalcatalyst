import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/light-theme.css", "utf8");
const sidebar = fs.readFileSync("src/components/glass-dock/GlassSidebar.tsx", "utf8");

test("compact sidebar labels and tooltips expose scoped light-theme hooks", () => {
  for (const hook of ["data-glass-sidebar-label", "data-glass-sidebar-tooltip"]) {
    assert.ok(sidebar.includes(hook));
    assert.ok(css.includes(`html[data-theme="light"] [data-glass-sidebar] [${hook}]`));
  }
});

test("light sidebar copy overrides inline colours without changing dark mode or badges", () => {
  const section = css.slice(css.indexOf("/* Compact tablet rail"));
  assert.match(section, /color: #000 !important/);
  assert.match(section, /background: var\(--dc-bg-secondary\) !important/);
  assert.match(section, /\[data-glass-sidebar\] p,/);
  assert.match(section, /\[data-glass-sidebar\] button/);
  assert.doesNotMatch(section, /\[data-glass-sidebar\] \*/);
  for (const rule of section.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",")) {
      assert.ok(selector.trim().startsWith('html[data-theme="light"]'));
    }
  }
});
