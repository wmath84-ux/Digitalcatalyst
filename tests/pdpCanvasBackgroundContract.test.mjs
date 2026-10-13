import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/light-theme-pages.css", "utf8");
const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");

test("desktop light-theme PDP uses one continuous white canvas around the page", () => {
  const rule = css.slice(css.lastIndexOf("Product detail desktop canvas"));
  assert.match(rule, /@media \(min-width: 1024px\)/);
  assert.match(rule, /html\[data-theme="light"\] body \.dc-desktop-shell \[data-desktop-content\]:has\(\[data-pdp-root\]\)/);
  assert.match(rule, /background-color: #ffffff/);
  assert.match(pdp, /data-pdp-root/);
  assert.match(shell, /data-desktop-content/);
});
