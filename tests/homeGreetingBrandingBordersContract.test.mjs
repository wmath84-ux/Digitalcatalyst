import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Home uses one greeting with a bold first name and vector wave; only Flow keeps a welcome row", () => {
  const app = read("src/home/App.tsx");
  const header = read("src/home/components/Header.tsx");
  const preview = read("src/admin/pages/BrandingPage.tsx");

  assert.match(app, /split\(\/\\s\+\/\)\[0\]/, "the home page must pass only the first word of the user's name");
  assert.match(header, /const firstName = userName\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| "Learner"/);
  // Only the FlowPath variant replaces the greeting (with its own wordmark);
  // every other surface gets the one greeting.
  assert.match(header, /headerVariant === "flow" \? "FlowPath" : \(/);
  assert.match(header, /data-home-greeting/);
  assert.match(header, /<strong className="font-extrabold">Hello<\/strong>/);
  assert.match(header, /data-home-user-name>, \{firstName\}<\/span>/);
  assert.match(header, /PiHandWavingDuotone data-home-wave/);
  assert.match(header, /truncate whitespace-nowrap/);
  assert.doesNotMatch(header, /Good to see you|👋/);
  assert.doesNotMatch(preview, /Good to see you|👋/);
  assert.match(preview, /PiHandWavingDuotone/);
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
