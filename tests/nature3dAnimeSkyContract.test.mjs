// tests/nature3dAnimeSkyContract.test.mjs
//
// REMOVAL CONTRACT — the anime skybox is GONE.
//
// This file used to pin the Sketchfab "free - skybox anime sky" panorama in
// place. The owner asked for the feature to be deleted outright (2026-09-25):
// the panorama is not the sanctuary's sky any more, the procedural dome is the
// only sky, and no menu offers a way back.
//
// So the contract inverted. What is pinned now is the ABSENCE of the feature
// across every layer it used to touch:
//
//   • no anime asset, GLB or JPEG, anywhere in the repo;
//   • no anime code in the engine (sky, scene, controls, page);
//   • no anime entry in any menu, tray or settings tab;
//   • the procedural dome still works, and is what boots.
//
// A removal contract is the only kind that stays useful here: it fails the
// moment someone re-introduces the panorama, which is exactly the regression
// the owner does not want.

import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));

const SKY = read("src/nature3d/engine/sky.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
const CONTROLS = read("src/nature3d/engine/controls.ts");

/** Source only — comments legitimately describe what was removed. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. The assets ──────────────────────────────────────────────────────

/** Binary asset extensions — the panorama arrived as a GLB and a JPEG. */
const ASSET_EXT = /\.(jpg|jpeg|png|webp|avif|hdr|exr|ktx2|basis|glb|gltf|bin|mp3|ogg|wav|mp4|webm|svg|ttf|woff2?)$/i;

test("no anime sky asset remains anywhere in the repo", () => {
  const strays = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".arena") continue;
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) walk(`${rel}/`);
      else if (/anime/i.test(entry.name) && ASSET_EXT.test(entry.name)) strays.push(rel);
    }
  };
  walk("./");
  assert.deepEqual(strays, [], `anime assets still on disk: ${strays.join(", ")}`);
  assert.ok(!exists("public/sanctuary/skybox_anime_sky.jpg"), "the panorama JPEG is still shipped");
  assert.ok(!exists("free_-_skybox_anime_sky.glb"), "the source GLB is still in the repo root");
});

// ── 2. The engine ──────────────────────────────────────────────────────

test("the sky engine carries no anime dome, texture or grade", () => {
  const c = code(SKY);
  for (const symbol of [
    "animeDome",
    "animeMat",
    "ANIME_NIGHT",
    "ANIME_DAY",
    "gradeAnime",
    "setAnimeSkybox",
    "animeSkyTexture",
    "skybox_anime_sky",
  ]) {
    assert.ok(!c.includes(symbol), `sky.ts still references ${symbol}`);
  }
  assert.doesNotMatch(c, /anime/i, "the word anime survives in sky.ts code");
});

test("the scene has no anime sky API, boot call or texture", () => {
  const c = code(SCENE);
  assert.doesNotMatch(c, /setAnimeSky/, "the engine still exposes the toggle");
  assert.doesNotMatch(c, /animeSkyWanted/, "the scene still tracks the wish");
  assert.doesNotMatch(c, /animeSkyTexture/, "the scene still caches the texture");
  assert.doesNotMatch(c, /anime/i, "the word anime survives in scene.ts code");
  // ...and the dome that replaced it is very much alive: the sky still owns a
  // procedural dome that daylight re-grades every frame.
  assert.match(SKY, /const dome = new THREE\.Mesh\(/, "the procedural dome mesh is still built");
  assert.match(c, /applyDaylight/, "the sky is still graded by daylight");
});

// ── 3. The UI ──────────────────────────────────────────────────────────

test("no menu, tray or settings tab offers the anime sky", () => {
  for (const [name, src] of [["page", PAGE], ["settings", SETTINGS]]) {
    assert.doesNotMatch(code(src), /anime/i, `${name} still mentions anime`);
  }
  assert.doesNotMatch(code(PAGE), /setAnimeSky/, "the page still calls the engine toggle");
});

test("controls.ts holds no anime sky entry either", () => {
  assert.doesNotMatch(code(CONTROLS), /anime/i, "controls.ts still mentions anime");
});

// ── 4. The sky that remains ────────────────────────────────────────────

test("the procedural dome is the only sky, and it is the one that boots", () => {
  // Nothing disables the dome at boot, and the daylight contract still holds:
  // the zenith dips to a deep blue at night rather than to black, which is the
  // rule the panorama used to be graded against too.
  const c = code(SCENE);
  assert.doesNotMatch(c, /setAnimeSky\(false\)/, "the boot no longer has a sky to turn off");
  assert.match(c, /createSky\(/, "the procedural sky is still constructed");
  assert.match(c, /this\.sky\.update\(/, "the procedural sky is still updated every frame");
  const DAYLIGHT = read("src/nature3d/engine/daylight.ts");
  assert.match(DAYLIGHT, /zenith: lerpColor\(0x1f7eef, 0x3f5f9e, warm\)/);
  assert.ok(!/lerpColor\(0x000000/.test(DAYLIGHT), "no curve may bottom out at black");
});

test("the settings sheet is the full-screen control surface now", () => {
  // The gear in the tray replaced the ⋮ dropdown; the sheet is where light,
  // boards, views and graphics live. Pinned so the dropdown cannot come back
  // by accident and hide half the controls again.
  assert.match(PAGE, /<Settings className="h-5 w-5" \/>/, "the tray's fifth button is a gear");
  assert.match(PAGE, /setSettingsOpen\(\(v\) => !v\)/, "the gear toggles the sheet");
  assert.match(PAGE, /import SanctuarySettings/, "the page renders the settings sheet");
  assert.match(SETTINGS, /aria-modal="true"/, "the sheet is a modal surface");
  assert.match(SETTINGS, /role="tablist"/, "the sheet is tabbed like a game settings screen");
  assert.ok(!code(PAGE).includes("MoreVertical"), "the kebab icon is gone");
  assert.ok(!code(PAGE).includes("MenuItem"), "the dropdown rows are gone");
});

test("the panorama's public asset directory is untouched", () => {
  // Sanity: removing the feature must not have taken the ground scan or the
  // rest of public/sanctuary with it.
  assert.ok(exists("public/sanctuary/ground_field.jpg"), "the ground scan is still shipped");
  const dir = new URL("public/sanctuary/", ROOT);
  for (const entry of readdirSync(dir)) {
    assert.ok(!/anime/i.test(entry), `${entry} is an anime leftover`);
    assert.ok(statSync(new URL(entry, dir)).size < 6_000_000, `${entry} is unexpectedly large`);
  }
});
