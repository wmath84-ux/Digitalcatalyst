import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/light-theme-pages.css", "utf8");
// Bound the slice to the toast section itself — later sections (glass bars,
// PDP, ...) are not toast rules.
const toastStart = css.indexOf("/* Shared toast surfaces:");
const rules = css.slice(toastStart, css.indexOf("/*", toastStart + 10));

test("both toast renderers expose shared surface, copy and dismiss hooks", () => {
  for (const path of ["src/components/ui/glass-toast.tsx", "src/revision/recall/shims/toast.tsx"]) {
    const source = fs.readFileSync(path, "utf8");
    for (const hook of ["data-dc-toast", "data-dc-toast-copy", "data-dc-toast-dismiss"]) {
      assert.ok(source.includes(hook), `${path}: ${hook}`);
    }
  }
});

test("light toast surfaces are opaque white with black copy and visible controls", () => {
  assert.match(rules, /background: #fff !important/);
  assert.match(rules, /color: #000 !important/);
  assert.match(rules, /\[data-dc-toast-copy\] \*/);
  assert.match(rules, /\[data-dc-toast-dismiss\] \*/);
  assert.match(rules, /opacity: 1/);
  assert.match(rules, /button:focus-visible/);
  assert.match(css, /--gt-shell: #fff/);
  assert.match(css, /--gt-shell-on-light: #fff/);
});

test("toast overrides are light-only and do not restyle unrelated status regions", () => {
  assert.doesNotMatch(rules, /\[role=/);
  for (const rule of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selectors = rule[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",");
    for (const selector of selectors) {
      assert.ok(selector.trim().startsWith('html[data-theme="light"] [data-dc-toast]'));
    }
  }
});
