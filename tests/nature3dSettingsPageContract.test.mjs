// tests/nature3dSettingsPageContract.test.mjs
//
// The ⋮ kebab is gone. A gear opens a full-page game settings overlay:
// the right rail has exactly Light, Scene and Dock; the left pane shows that
// page's controls — no extra features.
//
// DOCK (2026-09-29): the third page is the dock's own Advanced section —
// drag-scroll auto-hide (the hold-the-line, drag, lift-to-click gesture that
// the home footer and every course dock speak), ON by default, plus the
// dock-hide row. The Light page offers the five daylight moments including
// the real night.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
const pageCode = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const setCode = SETTINGS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the tray gear opens a full-page Light / Scene / Dock settings overlay", () => {
  // The gear lives on the bottom dock (the "settings" item), and the overlay
  // it opens is the tagged full-page component.
  assert.match(PAGE, /id: "settings", label: "Settings", icon: Settings as any/, "the gear is a dock item");
  assert.doesNotMatch(pageCode, /MoreVertical/, "the kebab is gone");
  assert.match(PAGE, /<SanctuarySettings/, "the overlay is mounted on the stage");
  assert.match(SETTINGS, /data-sanctuary-settings/, "the overlay is tagged");
  assert.match(SETTINGS, /data-settings-rail/, "the right tray is tagged");
});

test("the right tray has exactly Light, Scene and Dock", () => {
  assert.match(setCode, /label="Light"/);
  assert.match(setCode, /label="Scene"/);
  assert.match(setCode, /label="Dock"/);
  assert.match(SETTINGS, /data-settings-page="light"/);
  assert.match(SETTINGS, /data-settings-page="scene"/);
  assert.match(SETTINGS, /data-settings-page="dock"/);
  // Only those three page keys exist.
  assert.match(SETTINGS, /export type SettingsPage = "light" \| "scene" \| "dock"/);
});

test("existing Light and Scene controls are still wired, nothing extra", () => {
  for (const label of ["Auto", "Morning", "Midday", "Evening", "Night"]) {
    assert.match(SETTINGS, new RegExp(`label: "${label}"`), `light still has ${label}`);
  }
  for (const label of ["Ice Age", "Anime sky", "Wind strength", "Auto 360° orbit"]) {
    assert.match(SETTINGS, new RegExp(`label="${label}"`), `scene still has ${label}`);
  }
  assert.match(SETTINGS, /Back to Digital Catalyst/);
  assert.match(PAGE, /setDaylightMode\(mode\)/);
  assert.match(PAGE, /setIceAge\(next\)/);
  assert.match(PAGE, /setAnimeSky\(next\)/);
});

test("the Dock page holds the drag-scroll auto-hide Advanced toggle", () => {
  // OWNER BRIEF (2026-09-29): "sanctuary dock ke liye ek advance option
  // setting mein rakhna … option on off karne ka drag scroll auto hide —
  // by default enable rakho."
  assert.match(SETTINGS, /data-settings-page="dock"/);
  assert.match(SETTINGS, /label="Drag scroll auto-hide"/);
  assert.match(SETTINGS, /dockAutoHide/);
  // The dock-hide row lives on the same page.
  assert.match(SETTINGS, /label="Bottom dock"/);
  // The preference is ON by default and survives the session.
  assert.match(PAGE, /DOCK_AUTO_HIDE_KEY = "sanctuary\.dockAutoHide"/);
  assert.match(PAGE, /localStorage\.getItem\(DOCK_AUTO_HIDE_KEY\) !== "off"/, "the default is ENABLED");
  assert.match(PAGE, /const \[dockAutoHide, setDockAutoHide\] = useState<boolean>/);
  // The gesture itself: drag left/right on the line reveals the dock, the
  // wave follows the finger, the button under the lift is the one clicked.
  assert.match(PAGE, /const dockItemAtPoint = useCallback/);
  assert.match(PAGE, /data-glass-dock-item/);
  assert.match(PAGE, /dockPointerX\.set\(e\.clientX\)/);
  assert.match(PAGE, /pointerX=\{dockPointerX\}/);
});
