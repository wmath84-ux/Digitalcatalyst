// A reversible seasonal layer over the EXISTING Sanctuary world.
//
// ── What this file is for ───────────────────────────────────────────────
//
// The first version of Ice Age was a white filter: one uniform pushed every
// registered material 62–100 % of the way to a pale blue-white, and the fog
// and the sky horizon were lerped 80 % towards near-white. The owner's report
// was exact — "the entire world becomes almost completely white, washed-out and
// low-contrast. Terrain, vegetation, paths, houses and other environmental
// elements lose their identity" — and that is precisely what a global tint
// does. It is not a winter; it is a sheet of paper over the lens.
//
// So this is a SEASONAL TRANSFORMATION, not a tint. Nothing here replaces a
// material, nothing here multiplies the whole scene, and no mesh is rebuilt.
// Each surface class answers one question — "how much snow settles HERE, on
// this pixel, at this moment of the season?" — from the pixel's own world
// position and world normal:
//
//     snowAmount = elevationMask × slopeMask × driftMask × stencil(noise)
//
//   • ELEVATION: snow deepens with altitude. The meadow keeps patchy snow; the
//     crests pack down. (Requirement 3: never 100 % of the terrain.)
//   • SLOPE: `dot(normal, worldUp)` is gravity. Roof tops, rock tops and
//     up-facing branches accumulate; vertical walls and trunks barely frost.
//     (Requirement 12.)
//   • DRIFT: a low-frequency noise so cover varies across the map instead of
//     following a contour line.
//   • STENCIL: the coverage value is used as a THRESHOLD on a higher-frequency
//     noise, not as a blend factor. That is the whole difference between
//     "patchy snow with exposed grass between the patches" and "the ground is
//     now 35 % paler everywhere".
//
// The snow itself is never #FFFFFF. It is a small palette — bright snow,
// blue-grey shadow snow, warm dirty snow, compacted snow — chosen per pixel
// from the base albedo's own luminance, so a dark forest floor grows blue-grey
// shadow snow and a dry bright pasture grows lighter snow, and the terrain's
// shape stays readable through it. (Requirements 4 and 17.)
//
// Cost: ONE texture-free shader branch per registered material (no new draw
// calls, no new meshes, no new textures), plus the two GPU particle draws that
// were already there. The whole thing is one shared uniform, so switching
// season is free and reversible to the pixel. (Requirements 20 and 21.)

import * as THREE from "three";
import { injectWorldVaryings } from "./atmosphere";
import type { DaylightState } from "./daylight";
import type { QualityTier } from "./quality";
import { terrainHeight } from "./terrain";

/**
 * What a surface IS, for snow purposes. The default for an unclassified mesh
 * is `"solid"` (furniture, frames, the odd prop): gravity-driven cover with a
 * low ceiling, so nothing turns into a white silhouette.
 *
 *   ground  terrain, banks, the meadow floor — the full elevation/slope/drift
 *           mask, patchy, with the base albedo surviving between patches
 *   foliage grass, tufts, sorrel, moss, flowers — dormant tint + light flecks
 *   canopy  tree leaves, needles, fronds, impostors — flecks on up-facing
 *           leaves, the dark foliage stays the majority colour
 *   trunk   bark, palm trunks — a dusting on top, never a white silhouette
 *   rock    stones and boulders — caps on up-facing surfaces only
 *   roof    houses, docks, the villa — heavy on top faces, nothing on walls
 *   solid   everything else
 *   ice     water
 *   board   the lesson screen — the UV perimeter only
 */
export type Surface =
  | "ground"
  | "foliage"
  | "canopy"
  | "trunk"
  | "rock"
  | "roof"
  | "wall"
  | "solid"
  | "ice"
  | "board";

/** Surfaces that count as "built thing" for the daylight response. */
const ALL_SURFACES: readonly Surface[] = [
  "ground", "foliage", "canopy", "trunk", "rock", "roof", "wall", "solid", "ice", "board",
];

/**
 * Per-surface snow behaviour, as GLSL literals.
 *
 * `cover` is the CEILING: the most snow this surface can ever carry at full
 * winter. Nothing reaches 1.0 except a roof's flat top, and the ground's
 * ceiling is well under it because the elevation mask multiplies it down.
 *
 * `patch` is the stencil's spatial frequency (1/metres). Small = broad soft
 * drifts, large = fine flecks.
 */
const RULES: Record<Surface, { cover: string; patch: string; note: string }> = {
  // Terrain: the elevation and slope masks are computed in the shader below;
  // this is only the ceiling once they have had their say.
  ground: { cover: "0.92", patch: "0.20", note: "elevation × slope × drift, stencilled" },
  // Grass goes dormant and takes a light flecking; it must never vanish.
  foliage: { cover: "0.46", patch: "0.55", note: "dormant tint + snow flecks" },
  // Leaves and needles: snow rides the up-facing side of the cluster.
  canopy: { cover: "0.60", patch: "0.85", note: "up-facing flecks, foliage stays dark" },
  // Bark: a dusting on top of the trunk and the branch unions, nothing more.
  trunk: { cover: "0.17", patch: "1.30", note: "dusting only — trunks stay dark" },
  // Stone: caps.
  rock: { cover: "0.78", patch: "0.42", note: "snow caps on up-facing faces" },
  // Roofs take the most; the up-facing gate is what keeps walls clean.
  roof: { cover: "0.95", patch: "0.30", note: "heavy on top faces, walls stay bare" },
  wall: { cover: "0.12", patch: "0.60", note: "a rime line where snow melts off" },
  solid: { cover: "0.42", patch: "0.60", note: "gravity-driven, low ceiling" },
  ice: { cover: "1.0", patch: "0.0", note: "water — handled by the ice branch" },
  board: { cover: "0.55", patch: "0.9", note: "UV perimeter frost only" },
};

/** Name → surface, for meshes and materials that can name themselves. */
const NAME_RULES: ReadonlyArray<readonly [RegExp, Surface]> = [
  [/trunk|bark|palm-wood|forest-wood|wood/i, "trunk"],
  [/canopy|pine|needle|leaf|leaves|frond|impostor|foliage|branch/i, "canopy"],
  [/rock|stone|boulder|cliff/i, "rock"],
  [/roof|tile|shingle/i, "roof"],
  [/wall|plaster|render|siding/i, "wall"],
  [/path|trail|road|gravel|dirt/i, "ground"],
  [/flower|grass|tuft|sorrel|moss|fern|bush|shrub/i, "foliage"],
  [/water|river|ocean|sea|ice/i, "ice"],
];

/** `"wall"` behaves like `solid` with a near-zero ceiling. */
const CEILING_OVERRIDE: Partial<Record<Surface, string>> = { wall: "0.12" };

function surfaceFromName(name: string | undefined, fallback: Surface): Surface {
  if (!name) return fallback;
  for (const [re, surface] of NAME_RULES) if (re.test(name)) return surface;
  return fallback;
}

/**
 * Winter daylight, as a BLEND, not a replacement.
 *
 * `season` is 0 → untouched summer, 1 → full winter. Every lerp below is
 * scaled by it, so the transition is gradual by construction and a half-open
 * season is a real halfway state rather than a snap.
 *
 * The old version pushed the fog and the horizon 80 % of the way to near-white
 * (0xcbdde9 / 0xdceaf2) and cut the sun to 80 %: the distance went flat and
 * the foreground went with it. Winter is COOLER and slightly SOFTER than
 * summer — pale blue-grey, never white — and the sun keeps most of its strength
 * so silhouettes survive. (Requirements 14, 15 and 16.)
 */
export function winterDaylight(state: DaylightState, season = 1): DaylightState {
  const k = THREE.MathUtils.clamp(season, 0, 1);
  if (k <= 0) return state;
  // A grade, not a mutation. The scene builds a fresh state every frame, but a
  // function that edits its argument cannot be reasoned about (or tested), and
  // a caller that re-grades the same state twice would winterise it twice.
  state = {
    ...state,
    sunDir: state.sunDir.clone(),
    sunColor: state.sunColor.clone(),
    sunTint: state.sunTint.clone(),
    zenith: state.zenith.clone(),
    horizon: state.horizon.clone(),
    ground: state.ground.clone(),
    hemiSky: state.hemiSky.clone(),
    hemiGround: state.hemiGround.clone(),
    fog: state.fog.clone(),
  };
  // Cool, but never white: the horizon is a pale blue-grey, not paper.
  state.zenith.lerp(new THREE.Color(0x5d84ac), 0.42 * k);
  state.horizon.lerp(new THREE.Color(0xbcd2e2), 0.45 * k);
  // The hemisphere's ground bounce is snow-lit, so it lifts and cools.
  state.ground.lerp(new THREE.Color(0xa9bfd2), 0.55 * k);
  state.hemiSky.lerp(new THREE.Color(0xcfe2f6), 0.45 * k);
  state.hemiGround.lerp(new THREE.Color(0x9db3c8), 0.5 * k);
  state.sunColor.lerp(new THREE.Color(0xe9f2ff), 0.4 * k);
  state.sunTint.lerp(new THREE.Color(0xe9f2ff), 0.4 * k);
  // A winter sun is lower and weaker, but not by much: cutting it hard is what
  // turned every shadow into a flat grey and pushed the grade into mush.
  state.sunIntensity *= 1 - 0.1 * k;
  // Slightly LOWER exposure than summer. The old 0.91 was applied on top of an
  // already pale scene; with real snow tones the winter scene needs less, not
  // more, and must never approach pure white.
  state.exposure *= 1 - 0.06 * k;
  // Fog: a modest cool shift only. The old 80 % white lerp erased the
  // landscape; atmospheric perspective means "cooler and lower contrast with
  // distance", not "opaque".
  state.fog.lerp(new THREE.Color(0x9db9cc), 0.34 * k);
  return state;
}

/** Shared GLSL: hash noise, the drift field and the stencil. */
const SNOW_LIB = /* glsl */ `
// ── Winter: shared snow maths ───────────────────────────────────────────
uniform float uIceAge;

float dcHash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Value noise, smooth interpolated. Cheap, deterministic, no texture fetch.
float dcSnowNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dcHash12(i), dcHash12(i + vec2(1.0, 0.0)), u.x),
    mix(dcHash12(i + vec2(0.0, 1.0)), dcHash12(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

// Two octaves: the broad drift the eye reads as weather, plus a finer break so
// no field is ever a flat tint.
//
// THE FLATTENING IS LOAD-BEARING. Bilinear value noise is bell-shaped around
// 0.5 — it almost never reaches 0.15 or 0.85. Compare it against a threshold
// near either end and the comparison silently never fires, which is how a
// "30 % snow" mask ends up covering 3 % of the ground. Remapping through a
// smoothstep spreads it towards a uniform distribution, so COVER finally
// means "this fraction of the surface carries snow".
float dcSnowFbm(vec2 p) {
  float n = dcSnowNoise(p) * 0.66 + dcSnowNoise(p * 2.31 + 17.3) * 0.34;
  return smoothstep(0.16, 0.84, n);
}

// THE STENCIL. \`cover\` is how much snow this surface wants (0…1); the noise
// decides WHICH pixels get it. A blend factor would tint the whole surface by
// \`cover\` — that is the white filter this file replaced.
float dcSnowStencil(vec2 p, float cover, float patch) {
  if (cover <= 0.001) return 0.0;
  float n = dcSnowFbm(p * patch);
  float edge = 1.0 - clamp(cover, 0.0, 1.0);
  // Wider soft edge where cover is high: deep snow has no hard boundary.
  float w = 0.09 + 0.13 * cover;
  return smoothstep(edge - w, edge + w, n);
}

// The snow palette. Nothing here is white: bright snow is a cool off-white,
// shadow snow is a blue-grey, dirt snow is warm and grey, packed snow is the
// flat compacted tone a trail wears. Picked per pixel from the base albedo's
// own luminance so the world's contrast survives the season.
vec3 dcSnowTone(vec3 base, float shade, float dirt) {
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 bright = vec3(0.855, 0.893, 0.938);
  vec3 shadow = vec3(0.545, 0.645, 0.790);
  vec3 dirtSnow = vec3(0.735, 0.712, 0.632);
  vec3 packed = vec3(0.660, 0.695, 0.755);
  // Dark ground → shadow snow; bright ground → bright snow.
  vec3 c = mix(shadow, bright, clamp(l * 1.75, 0.0, 1.0));
  c = mix(c, dirtSnow, clamp(dirt, 0.0, 1.0) * 0.55);
  c = mix(c, packed, clamp(shade, 0.0, 1.0) * 0.35);
  return c;
}

// A cool rim of rime that survives at low season — what keeps a half-frozen
// scene reading as COLD rather than as tinted.
vec3 dcRimeTint(vec3 base, float amount) {
  return mix(base, base * vec3(0.82, 0.90, 1.0) + vec3(0.03, 0.045, 0.06), amount);
}
`;

/**
 * The per-surface snow coverage, as GLSL.
 *
 * Returns the DECLARATIONS the expression needs and the EXPRESSION itself,
 * because a `return` inside the injected block would leave `main()` and skip
 * the rest of the fragment shader — the classic way an injected chunk takes a
 * whole material black.
 */
function coverageFor(surface: Surface): { decls: string; expr: string } {
  const rule = RULES[surface];
  const ceiling = CEILING_OVERRIDE[surface] ?? rule.cover;
  const up = "snowUp";
  const noise = (freq: string, offset = "") =>
    `dcSnowFbm(vDcWorldPos.xz * ${freq}${offset ? ` + ${offset}` : ""})`;
  switch (surface) {
    case "ground":
      return {
        decls: /* glsl */ `
        // ELEVATION — the meadow keeps patchy snow, the crests pack down.
        // Anchored BELOW the meadow floor on purpose: a curve that starts at
        // the clearing's own height leaves the whole study area bare, which
        // reads as "winter forgot the sanctuary" rather than as snow lying
        // where it drifted.
        // A POWER curve, not a smoothstep: a smoothstep wide enough to span
        // meadow-to-crest leaves the meadow at ~3 % cover, which reads as
        // "winter forgot the sanctuary". This one gives the study clearing
        // patchy snow, the hills mostly-covered ground and the crests deep
        // drifts — the four states the brief asks for, from one expression.
        float alt = clamp((vDcWorldPos.y + 5.0) / 40.0, 0.0, 1.0);
        float elevMask = pow(alt, 0.65);
        // SLOPE — steep faces shed their snow.
        float slopeMask = 1.0 - smoothstep(0.18, 0.62, 1.0 - ${up});
        // DRIFT — broad weather-scale variation, so cover is never a contour.
        float drift = dcSnowFbm(vDcWorldPos.xz * 0.035);
        `,
        expr: `uIceAge * ${ceiling} * elevMask * slopeMask * (0.30 + 0.95 * drift)`,
      };
    case "foliage":
      return {
        decls: `float drift = ${noise("0.09")};`,
        expr: `uIceAge * ${ceiling} * mix(0.25, 1.0, ${up}) * (0.35 + 0.8 * drift)`,
      };
    case "canopy":
      return {
        decls: `float clump = ${noise("0.7", "vDcWorldPos.y * 0.4")};`,
        expr: `uIceAge * ${ceiling} * smoothstep(0.15, 0.85, ${up}) * (0.35 + 0.75 * clump)`,
      };
    case "trunk":
      return {
        decls: `float barkNoise = ${noise("1.7")};`,
        expr: `uIceAge * ${ceiling} * pow(${up}, 2.2) * (0.4 + 0.6 * barkNoise)`,
      };
    case "rock":
      return {
        decls: `float stoneNoise = ${noise("0.55")};`,
        expr: `uIceAge * ${ceiling} * smoothstep(0.45, 0.92, ${up}) * (0.45 + 0.7 * stoneNoise)`,
      };
    case "roof":
      return {
        decls: `float roofNoise = ${noise("0.4")};`,
        expr: `uIceAge * ${ceiling} * smoothstep(0.18, 0.62, ${up}) * (0.55 + 0.55 * roofNoise)`,
      };
    case "wall":
      // Walls take a rime line where snow melts off, and nothing else.
      return {
        decls: "",
        expr: `uIceAge * ${ceiling} * pow(${up}, 6.0)`,
      };
    case "board":
      // The perimeter mask below decides where this survives.
      return {
        decls: `float boardNoise = ${noise("0.9")};`,
        expr: `uIceAge * 0.55 * mix(0.2, 1.0, ${up}) * (0.5 + 0.5 * boardNoise)`,
      };
    case "solid":
    default:
      return {
        decls: `float propNoise = ${noise("0.6")};`,
        expr: `uIceAge * ${ceiling} * mix(0.10, 1.0, ${up}) * (0.4 + 0.7 * propNoise)`,
      };
  }
}

export function createWinter(tier: QualityTier) {
  const amount = { value: 0 };
  /** Where the season is heading (0 or 1) and how fast it gets there. */
  let target = 0;
  let rate = 0;
  let registered = new WeakSet<THREE.Material>();
  const group = new THREE.Group();
  group.name = "ice-age-snowfall";
  group.visible = false;

  // Every hooked material, so disposal can put it back exactly as it was.
  // Winter has to be reversible down to the material, not just the pixel.
  const chains: {
    material: THREE.Material;
    previous: THREE.Material["onBeforeCompile"];
    cacheKey: THREE.Material["customProgramCacheKey"];
  }[] = [];

  function register(material: THREE.Material, surface: Surface = "solid") {
    // Leave unlit screen backings, contact decals and living characters alone.
    // Furniture and board frames opt in independently from their content.
    if (registered.has(material)) return;
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial)) return;
    registered.add(material);
    const previous = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey.bind(material);
    chains.push({ material, previous, cacheKey });
    // A mesh that can name itself gets the surface its name implies, unless the
    // caller was explicit. This is how a trunk and a canopy that share a scene
    // graph still snow differently without any per-mesh plumbing.
    const resolved =
      surface === "solid" ? surfaceFromName(material.name, "solid") : surface;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      const hasNormal = injectWorldVaryings(shader);
      shader.uniforms.uIceAge = amount;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>\n${SNOW_LIB}`,
      );
      if (resolved === "ice") {
        // After the water's reflection/glint pass, before tone mapping and fog.
        // World-space veins remain still when the flow clock is frozen.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <tonemapping_fragment>",
          /* glsl */ `
          float iceVein = pow(1.0 - abs(sin(vDcWorldPos.x * 0.7 + sin(vDcWorldPos.z * 0.38) * 2.0)), 18.0);
          float iceGrain = sin(vDcWorldPos.x * 3.1) * sin(vDcWorldPos.z * 2.7) * 0.025;
          // Cold blue ice with a pale fracture network — NOT white. The water
          // underneath keeps reading as water (requirement 11).
          vec3 iceColor = mix(vec3(0.24, 0.42, 0.58), vec3(0.62, 0.76, 0.86), iceVein * 0.7) + iceGrain;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, iceColor + gl_FragColor.rgb * 0.18, uIceAge);
          gl_FragColor.a = mix(gl_FragColor.a, 0.94, uIceAge);
          #include <tonemapping_fragment>
          `,
        );
        return;
      }
      // Gravity. Without a published normal (a MeshBasicMaterial decal, say)
      // the surface is treated as flat, which is the honest default.
      const upExpr = hasNormal ? "snowUp" : "1.0";
      const snowUpDecl = hasNormal
        ? `float snowUp = max(normalize(vDcWorldNormal).y, 0.0);`
        : `float snowUp = 1.0;`;

      // The path treatment is only compiled for a terrain shader that actually
      // publishes the trail weight (see terrain.ts). Probing the string keeps
      // the two files loosely coupled: no define plumbing, no silent breakage
      // if the terrain stops publishing it.
      const hasWorn = shader.fragmentShader.includes("varying float vDcWorn");
      const pathBlock = hasWorn
        ? /* glsl */ `
        // ── Snow-covered dirt paths (requirement 6) ─────────────────────
        // A path is COMPACTED snow: denser, greyer, flatter than the drifts
        // either side of it, with the worn core keeping dirt showing through
        // and the edges feathering into the wild snow. Never a white strip.
        float worn = clamp(vDcWorn, 0.0, 1.0);
        if (worn > 0.02) {
          // Self-contained elevation term: this block must not lean on the
          // ground branch's locals, because a material can publish vDcWorn
          // without being the terrain.
          float pathAlt = clamp((vDcWorldPos.y + 5.0) / 40.0, 0.0, 1.0);
          float pathCover = uIceAge * 0.88 * (0.45 + 0.55 * pathAlt);
          float pathSnow = dcSnowStencil(vDcWorldPos.xz * 0.45 + 31.7, pathCover, 1.0);
          // Irregular accumulation along the trail: ruts and banks.
          float rut = dcSnowFbm(vDcWorldPos.xz * 1.6 + vDcWorldPos.z * 0.4);
          vec3 packedTone = dcSnowTone(diffuseColor.rgb, 0.55 + 0.4 * rut, 0.15 + 0.3 * (1.0 - rut));
          vec3 packed = mix(diffuseColor.rgb, packedTone, pathSnow);
          // The heavily travelled centre keeps its dirt: boots and wheels
          // clear it, and that is what makes the path legible from the air.
          packed = mix(packed, diffuseColor.rgb * 0.92, smoothstep(0.45, 0.95, worn) * 0.42);
          // Soft snowy verge where the trail fades out.
          float verge = 1.0 - smoothstep(0.05, 0.42, worn);
          diffuseColor.rgb = mix(packed, diffuseColor.rgb, verge * (1.0 - pathSnow) * 0.55);
        }
        `
        : "";

      const cover = coverageFor(resolved);
      const patch = RULES[resolved].patch;
      const rime = resolved === "foliage" ? "0.30" : "0.16";
      const boardMask = resolved === "board" ? /* glsl */ `
        // Only the UV perimeter frosts over: preserve every word in the middle.
        #ifdef USE_MAP
          vec2 frostEdge = min(vMapUv, 1.0 - vMapUv);
          snowCover *= 1.0 - smoothstep(0.005, 0.045, min(frostEdge.x, frostEdge.y));
        #else
          snowCover = 0.0;
        #endif
      ` : "";

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        // ── Winter: this surface's snow, at this pixel ──────────────────
        // The whole block sits behind one early-out. Summer is the DEFAULT
        // state, so every registered material must cost nothing there: no
        // noise, no stencil, no albedo change. It also makes "winter is
        // reversible" structural rather than a hope — at uIceAge 0 the branch
        // is dead code and diffuseColor is untouched.
        if (uIceAge > 0.001) {
        ${snowUpDecl}
        float snowCover = 0.0;
        {
          ${cover.decls.replace(/snowUp/g, upExpr)}
          // Clamped: the ceiling and the drift multiplier are both authored
          // near 1, so their product can overshoot on a lucky pixel.
          snowCover = clamp(${cover.expr.replace(/snowUp/g, upExpr)}, 0.0, 1.0);
        }
        ${boardMask}
        // Dormant / frosted tint that survives even where no snow settles, so
        // a low-season world reads COLD without reading white.
        float dcRime = uIceAge * ${rime} * mix(0.3, 1.0, snowUp);
        diffuseColor.rgb = dcRimeTint(diffuseColor.rgb, dcRime);
        if (snowCover > 0.002) {
          // Per-pixel snow tone: shade from the surface's own facing, dirt
          // from the drift field. Both vary, so no two patches match.
          float dcShade = (1.0 - snowUp) * 0.6 + dcSnowFbm(vDcWorldPos.xz * 0.8) * 0.4;
          float dcDirt = smoothstep(0.55, 0.95, dcSnowFbm(vDcWorldPos.xz * 0.31 + 4.7));
          float snow = dcSnowStencil(vDcWorldPos.xz, snowCover, ${patch});
          vec3 snowColor = dcSnowTone(diffuseColor.rgb, dcShade, dcDirt);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snow);
        }
        ${pathBlock}
        #ifdef STANDARD
          // Snow is a rough dielectric; the glaze on near-vertical faces is
          // what catches the eye as ice rather than as paint.
          float dcGlaze = (1.0 - snowUp) * 0.5;
          roughnessFactor = mix(roughnessFactor, mix(0.92, 0.30, dcGlaze), snowCover * 0.85);
          metalnessFactor *= 1.0 - snowCover;
        #endif
        }
        #include <emissivemap_fragment>
        `,
      );
    };
    material.customProgramCacheKey = () => `${cacheKey}|winter-v3:${resolved}`;
    material.needsUpdate = true;
  }

  function registerTree(root: THREE.Object3D, surface: Surface = "solid") {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // A mesh may name itself (roof, trunk, rock); that wins over the group
      // default, because it is the more specific statement.
      const perMesh = surfaceFromName(mesh.name, surface);
      materials.forEach((material) => register(material, perMesh));
    });
  }

  // ── Falling snow ──────────────────────────────────────────────────────
  //
  // One GPU-animated draw. Low/moderate count, varied size, slow fall, slight
  // wind, distance fade: atmospheric, never a storm (requirement 13). The
  // counts are deliberately lower than the first version's — 1600 flakes over
  // a 130 m box read as static, not as weather.
  const count = tier === "low" ? 260 : tier === "medium" ? 520 : 900;
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uCenter: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform vec3 uCenter;
      varying float vFade;
      varying float vSize;
      void main() {
        vec3 p = position * vec3(120.0, 64.0, 120.0);
        // Slow, varied fall: each seed gets its own speed from its own z.
        float fall = 1.1 + position.z * 1.2;
        p.x = mod(p.x + uTime * uWind * 1.9 + sin(uTime * 0.6 + position.y * 20.0) * uWind * 1.6 - uCenter.x, 120.0) - 60.0;
        p.z = mod(p.z + sin(uTime * 0.25 + position.x * 30.0) * 2.4 - uCenter.z, 120.0) - 60.0;
        p.y = mod(p.y - uTime * fall - uCenter.y, 64.0) - 32.0;
        vFade = (1.0 - smoothstep(38.0, 60.0, length(p.xz))) * (1.0 - smoothstep(20.0, 32.0, abs(p.y)));
        // Depth-aware: distant flakes are smaller and fainter, so the field
        // never turns into a wall of dots in front of the far hills.
        vSize = 0.55 + position.x * 0.9;
        vec4 mv = viewMatrix * vec4(p + uCenter, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(vSize * 130.0 / max(1.0, -mv.z), 1.0, 4.2);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFade;
      varying float vSize;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        float alpha = (1.0 - smoothstep(0.12, 0.48, radius)) * vFade * 0.55;
        if (alpha < 0.02) discard;
        // Cool, never pure white, and the near flakes are the brightest.
        gl_FragColor = vec4(0.87, 0.92, 0.97, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const snow = new THREE.Points(geometry, material);
  snow.frustumCulled = false; // Shader positions follow the viewer, not seed bounds.
  group.add(snow);

  // Low wind-blown powder hugs the actual terrain (including highland slopes)
  // instead of following the camera's altitude. One extra draw, sampled at
  // 10 Hz with preallocated arrays; no extra terrain meshes or render passes.
  const dustCount = tier === "low" ? 64 : tier === "medium" ? 128 : 224;
  const dustSeeds = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustSeeds.length; i += 1) dustSeeds[i] = Math.random();
  const dustPositions = new Float32Array(dustCount * 3);
  const dustGeometry = new THREE.BufferGeometry();
  const dustAttribute = new THREE.BufferAttribute(dustPositions, 3);
  dustAttribute.setUsage(THREE.DynamicDrawUsage);
  dustGeometry.setAttribute("position", dustAttribute);
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xdfeeff, size: 1.5, transparent: true, opacity: 0.26,
    depthWrite: false, sizeAttenuation: true,
  });
  dustMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vPowderFade;")
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vPowderFade = 1.0 - smoothstep(34.0, 56.0, length(position.xz - cameraPosition.xz));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPowderFade;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec2 powder = (gl_PointCoord - 0.5) * vec2(1.0, 2.8);
        diffuseColor.a *= (1.0 - smoothstep(0.05, 0.5, length(powder))) * vPowderFade;
        if (diffuseColor.a < 0.01) discard;
      `);
  };
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = "wind-blown-snow-dust";
  dust.frustumCulled = false;
  group.add(dust);
  let dustClock = 0.1;
  const dustCenter = new THREE.Vector3(Infinity, Infinity, Infinity);
  const wrap = (value: number) => ((value % 120) + 120) % 120 - 60;

  return {
    group,
    register,
    registerTree,
    /** The season's current position, 0 = summer, 1 = winter. */
    get season() {
      return amount.value;
    },
    /**
     * Turn the season on or off. `smooth` eases the single uniform over
     * ~1.1 s so materials, light, fog and sky move together instead of
     * snapping (requirement 18). The default is immediate, which is what the
     * engine's own boot path and the contract tests use.
     */
    setEnabled(enabled: boolean, smooth = false) {
      target = enabled ? 1 : 0;
      if (smooth) {
        // The particle group is the snowfall, not the season: it stays up for
        // the whole blend in both directions and `update` drops it when the
        // season reaches 0.
        group.visible = true;
        rate = 1 / 1.1;
        // A season that is already past halfway finishes rather than reverses
        // through the middle: the visual difference is invisible and it halves
        // the number of frames the blend has to run for.
        if (Math.abs(amount.value - target) < 0.5) rate *= 2;
      } else {
        rate = 0;
        amount.value = target;
        group.visible = enabled;
      }
      dustClock = 0.1; // Populate immediately after re-enabling, even if paused.
    },
    update(dt: number, camera: THREE.Camera, wind: number, reducedMotion = false) {
      // Ease the season towards its target first: the caller reads `season`
      // afterwards to know whether the blend is still running.
      if (rate > 0) {
        const step = rate * dt;
        if (amount.value < target) amount.value = Math.min(target, amount.value + step);
        else if (amount.value > target) amount.value = Math.max(target, amount.value - step);
        if (Math.abs(amount.value - target) < 1e-4) {
          amount.value = target;
          rate = 0;
          group.visible = target > 0;
        }
      }
      if (amount.value <= 0) return;
      if (!reducedMotion) uniforms.uTime.value += dt;
      uniforms.uCenter.value.copy(camera.position);
      uniforms.uWind.value = wind;
      if (!reducedMotion) dustClock += dt;
      if (dustClock < 0.1 && dustCenter.distanceToSquared(camera.position) < 9) return;
      dustClock = 0;
      dustCenter.copy(camera.position);
      const time = uniforms.uTime.value;
      for (let i = 0; i < dustCount; i += 1) {
        const p = i * 3;
        const speed = 1.8 + dustSeeds[p + 1] * 2.2;
        const x = camera.position.x + wrap(dustSeeds[p] * 120 + time * wind * speed - camera.position.x);
        const z = camera.position.z + wrap(dustSeeds[p + 2] * 120 + time * wind * 0.7 - camera.position.z);
        dustPositions[p] = x;
        dustPositions[p + 1] = terrainHeight(x, z) + 0.25 + dustSeeds[p + 1] * 1.2 + Math.sin(time + i) * 0.15;
        dustPositions[p + 2] = z;
      }
      dustAttribute.needsUpdate = true;
    },
    dispose() {
      for (const chain of chains) {
        chain.material.onBeforeCompile = chain.previous;
        chain.material.customProgramCacheKey = chain.cacheKey;
      }
      chains.length = 0;
      registered = new WeakSet();
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      group.clear();
    },
  };
}

export type WinterSystem = ReturnType<typeof createWinter>;

/** Exported for the contract tests: every surface must have a rule. */
export const WINTER_SURFACES = ALL_SURFACES;

/** Exported for the contract tests: every surface has a rule. */
export const SURFACE_RULES = RULES;
