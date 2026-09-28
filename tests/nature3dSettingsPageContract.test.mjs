// tests/nature3dSettingsPageContract.test.mjs
//
// The ⋮ kebab is gone. A gear opens a full-page game settings overlay:
// right rail has exactly Light and Scene; left pane shows that page's
// existing controls — no extra features.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
const pageCode = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const setCode = SETTINGS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the tray gear opens a full-page Light / Scene settings overlay", () => {
  assert.match(PAGE, /<Settings className="h-5 w-5" \/>/, "the 3-dot icon is a gear");
  assert.doesNotMatch(pageCode, /MoreVertical/, "the kebab is gone");
  assert.match(PAGE, /<SanctuarySettings/, "the overlay is mounted on the stage");
  assert.match(SETTINGS, /data-sanctuary-settings/, "the overlay is tagged");
  assert.match(SETTINGS, /data-settings-rail/, "the right tray is tagged");
});

test("the right tray has exactly Light and Scene", () => {
  assert.match(setCode, /label="Light"/);
  assert.match(setCode, /label="Scene"/);
  assert.match(SETTINGS, /data-settings-page="light"/);
  assert.match(SETTINGS, /data-settings-page="scene"/);
  // Only those two page keys exist.
  assert.match(SETTINGS, /export type SettingsPage = "light" \| "scene"/);
});

test("existing Light and Scene controls are still wired, nothing extra", () => {
  for (const label of ["Auto", "Morning", "Midday", "Evening"]) {
    assert.match(SETTINGS, new RegExp(`label: "${label}"`), `light still has ${label}`);
  }
  for (const label of ["Ice Age", "Anime sky", "Wind strength", "Auto 360° orbit", "Bottom tray"]) {
    assert.match(SETTINGS, new RegExp(`label="${label}"`), `scene still has ${label}`);
  }
  assert.match(SETTINGS, /Back to Digital Catalyst/);
  assert.match(PAGE, /setDaylightMode\(mode\)/);
  assert.match(PAGE, /setIceAge\(next\)/);
  assert.match(PAGE, /setAnimeSky\(next\)/);
});
