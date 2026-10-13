// Non-Home navigation bars have no drop shadow or detached glow/frost strip.
// Home intentionally keeps its existing branded/header elevation.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const desktopShell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");
const finalChromeCss = fs.readFileSync("src/light-theme-pages.css", "utf8");

test("shared and Home headers keep their separate layout hooks", () => {
  assert.match(header, /data-site-header/);
  assert.match(header, /sticky top-0/);
  assert.match(header, /bg-white\/75/);
  assert.match(header, /backdrop-blur-xl/);
  assert.match(homeHeader, /data-home-header/);
  assert.match(homeHeader, /data-site-header/);
});

test("legacy mobile glow effects are explicitly disabled for non-Home headers", () => {
  assert.match(indexCss, /\.mobile-header-glow::before/);
  assert.match(indexCss, /\.mobile-header-glow::after/);
  const reset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Navigation refresh"));
  assert.match(reset, /html body \[data-site-header\]:not\(\[data-home-header\]\)\.dc-scene-plate--bar::before/);
  assert.match(reset, /html body \.mobile-header-glow::before/);
  assert.match(reset, /html body \.mobile-header-glow::after/);
  assert.match(reset, /display:\s*none\s*!important/);
  assert.match(reset, /content:\s*none\s*!important/);
  assert.doesNotMatch(reset, /html body \[data-site-header\]\.dc-scene-plate--bar::before/);
});

test("all non-Home app header bars and page chrome have no box shadow", () => {
  const reset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Navigation refresh"));
  for (const hook of [
    "[data-site-header]:not([data-home-header])",
    "[data-revision-app-header]",
    "[data-rev-bank-header]",
    "[data-admin-topbar]",
    "[data-search-bar]",
    "[data-store-filter-bar]",
    ".dc-page-tabs",
    "[data-desktop-topbar]",
  ]) {
    assert.ok(reset.includes(hook), `the ${hook} bar is covered`);
  }
  assert.match(reset, /box-shadow:\s*none\s*!important/);
  assert.match(reset, /Home's branded mobile header and Home's active desktop top bar are intentionally/);
});

test("Home mobile header and Home's desktop top bar are explicitly excluded from the reset", () => {
  const reset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Navigation refresh"));
  assert.match(homeHeader, /data-home-header/);
  assert.match(desktopShell, /data-desktop-rail-item=\{entry\.key\}/);
  assert.match(reset, /\.dc-desktop-shell:not\(:has\(\[data-desktop-rail-item="home"\]\[data-active="true"\]\)\) \[data-desktop-topbar\]/);
  assert.match(reset, /\[data-site-header\]:not\(\[data-home-header\]\)/);
});


test("mobile headers have no cast shadow outside Home, while Home remains excluded", () => {
  const mobileReset = finalChromeCss.slice(finalChromeCss.lastIndexOf("Mobile header shadow reset"));
  assert.match(mobileReset, /@media \(max-width: 767px\)/);
  assert.match(mobileReset, /\[data-site-header\]\.dc-scene-plate--bar:not\(\[data-home-header\]\)/);
  assert.match(mobileReset, /\[data-revision-app-header\]\.dc-scene-plate--bar/);
  assert.match(mobileReset, /box-shadow: none !important/);
  assert.doesNotMatch(mobileReset, /\[data-site-header\]\.dc-scene-plate--bar\s*,/);
  assert.match(homeHeader, /data-home-header/);
});
