import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("home greeting keeps both greeting rows on one line and only uses the first name", () => {
  const app = read("src/home/App.tsx");
  const header = read("src/home/components/Header.tsx");

  assert.match(app, /split\(\/\\s\+\/\)\[0\]/, "the home page must pass only the first word of the user's name");
  assert.match(header, /data-home-welcome/);
  assert.match(header, /whitespace-nowrap/);
  assert.match(header, /data-home-greeting/);
  assert.match(header, /truncate/);
});

test("branding border preference is applied globally and updates live", () => {
  const branding = read("src/utils/branding.ts");
  const context = read("src/context/BrandingContext.tsx");
  const css = read("src/index.css");
  const page = read("src/admin/pages/BrandingPage.tsx");

  assert.match(branding, /dataset\.hideFrameBorders/);
  assert.match(branding, /BRANDING_CHANGE_EVENT/);
  assert.match(context, /BRANDING_CHANGE_EVENT/);
  assert.match(css, /data-hide-frame-borders="true"/);
  assert.match(css, /\[data-site-header\]/);
  assert.match(css, /\[data-site-footer\]/);
  assert.match(css, /\[data-app-frame\]/);
  assert.match(page, /persist\(\{ hideFrameBorders: checked \}\)/);
});
