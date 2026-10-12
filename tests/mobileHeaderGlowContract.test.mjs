// The header retains its sticky glass plate and inset hairline, but all
// exterior drop-shadow and pseudo-element glow layers are disabled.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");
const finalChromeCss = fs.readFileSync("src/light-theme-pages.css", "utf8");

test("shared header keeps its sticky glass surface without losing its layout hooks", () => {
  assert.match(header, /data-site-header/);
  assert.match(header, /sticky top-0/);
  assert.match(header, /bg-white\/75/);
  assert.match(header, /backdrop-blur-xl/);
});

test("legacy mobile glow styles are explicitly disabled at the end of the cascade", () => {
  assert.match(indexCss, /\.mobile-header-glow::before/);
  assert.match(indexCss, /\.mobile-header-glow::after/);
  assert.match(finalChromeCss, /html body \.mobile-header-glow::before/);
  assert.match(finalChromeCss, /html body \.mobile-header-glow::after/);
  const reset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Navigation refresh"));
  assert.match(reset, /display:\s*none\s*!important/);
  assert.match(reset, /content:\s*none\s*!important/);
});

test("all shared and desktop header bars retain only their inset rim, never an exterior shadow", () => {
  const reset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Navigation refresh"));
  for (const hook of ["[data-site-header]", "[data-revision-app-header]", "[data-rev-bank-header]", "[data-desktop-topbar]"]) {
    assert.ok(reset.includes(hook), `the ${hook} bar is covered`);
  }
  assert.match(reset, /box-shadow:\s*var\(--dc-chrome-glass-rim/);
  assert.match(reset, /Keep the inset glass hairline; remove only the exterior cast shadow/);
});
