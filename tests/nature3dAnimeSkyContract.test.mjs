// tests/nature3dAnimeSkyContract.test.mjs
//
// Contract tests for the anime skybox in the 3D Sanctuary — the Sketchfab
// "free - skybox anime sky" panorama wired in as an optional sky.
//
// The asset arrived as a GLB whose only content of value is one baked
// equirect JPEG: the mesh is a bare sphere, and the file is authored against
// KHR_materials_pbrSpecularGlossiness, which modern three removed — a
// GLTFLoader round-trip would hand back an untextured ball. So the engine
// ships the JPEG and draws it on its own dome. These tests pin the shape
// that makes that safe and cheap:
//
//   • the extracted 2:1 equirect JPEG exists in public/ and is a real JPEG;
//   • the GLB is never loaded at runtime;
//   • the anime dome REPLACES the procedural dome (never stacks on it),
//     shares its geometry, and toggling off restores the procedural sky;
//   • daylight keeps grading the panorama (baked noon must not glow at
//     midnight);
//   • the texture loads lazily exactly once, a failed load is cosmetic, and
//     the scene owns the texture's lifetime;
//   • the Studio page exposes the toggle in the Scene menu.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));

const SKY = read("src/nature3d/engine/sky.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");

// ── 1. The asset ───────────────────────────────────────────────────────

test("the anime panorama ships as a real 2:1 equirect JPEG in public/", () => {
  const path = "public/sanctuary/skybox_anime_sky.jpg";
  assert.ok(exists(path), `${path} is missing from the repo`);
  const buf = readFileSync(new URL(`../${path}`, import.meta.url));
  // JPEG magic, then the SOF0/SOF2 frame header carrying the dimensions.
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, "not a JPEG");
  let w = 0;
  let h = 0;
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      h = buf.readUInt16BE(i + 5);
      w = buf.readUInt16BE(i + 7);
      break;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  assert.equal(w, 4096, "equirect width");
  assert.equal(h, 2048, "equirect height (must be exactly 2:1)");
});

test("the GLB is never loaded at runtime — the JPEG is the asset", () => {
  const runtime = ["src/nature3d/engine/scene.ts", "src/nature3d/engine/sky.ts"]
    .map((p) => read(p))
    .join("\n");
  assert.doesNotMatch(runtime, /anime[^"']*\.(glb|gltf)/i, "no anime GLB may be fetched");
  assert.match(runtime, /skybox_anime_sky\.jpg/, "the extracted JPEG is the runtime asset");
});

// ── 2. The dome swap ──────────────────────────────────────────────────

test("the anime dome replaces the procedural dome and reuses its geometry", () => {
  const code = SKY
    // Comments document the removal; match on mechanism, not prose.
    .replace(/\/[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /setAnimeSkybox\(map: THREE\.Texture \| null\): void/, "interface exposes the swap");
  assert.match(code, /animeDome = new THREE\.Mesh\(dome\.geometry, animeMat\)/, "shares the dome geometry");
  assert.match(code, /dome\.visible = false/, "procedural dome hides while the panorama is up");
  assert.match(code, /dome\.visible = true/, "procedural dome returns on toggle-off");
  assert.match(code, /renderOrder = -1000/, "same draw slot as the dome it replaces");
  assert.match(code, /animeMat\?\.dispose\(\)/, "the anime material is disposed on toggle-off");
  assert.doesNotMatch(code, /map\?\.dispose|texture\.dispose/, "the TEXTURE survives toggle-off (cached upstream)");
});

test("daylight keeps grading the baked panorama", () => {
  const code = SKY.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /gradeAnime\(state\)/, "applyDaylight re-grades the panorama");
  assert.match(code, /dayFactor/, "the grade follows the day factor");
  assert.match(code, /lastDaylight/, "a texture arriving mid-session is graded on arrival");
});

// ── 3. The scene wiring ───────────────────────────────────────────────

test("the scene loads the panorama lazily, once, and survives a failure", () => {
  const code = SCENE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /setAnimeSky\(enabled: boolean\)/, "public toggle exists");
  assert.match(code, /animeSkyTexture/, "the texture promise is cached on the scene");
  assert.match(code, /loadAsync\(ANIME_SKY_URL\)/, "one lazy fetch from the public URL");
  assert.match(code, /return null/, "a failed load resolves to null instead of throwing");
  assert.match(code, /console\.warn/, "the failure is reported, not silent");
  assert.match(code, /this\.animeSkyWanted \? t : null/, "fast toggles honour the last wish");
  assert.match(code, /animeSkyTexture\?\.then\(\(t\) => t\?\.dispose\(\)\)/, "scene dispose frees the texture");
});

// ── 4. The page toggle ────────────────────────────────────────────────

test("the Studio page exposes an Anime sky toggle wired to the engine", () => {
  assert.match(PAGE, /const \[animeSky, setAnimeSky\] = useState\(false\)/, "UI state exists");
  assert.match(PAGE, /label="Anime sky"/, "the Scene menu carries the item");
  assert.match(PAGE, /engineRef\.current\?\.setAnimeSky\(next\)/, "the toggle reaches the engine");
  assert.match(PAGE, /Icon=\{Sparkles\}/, "the item has an icon");
});
