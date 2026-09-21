// src/nature3d/engine/sorrel.ts
//
// THE SORREL FIELD — real 3D plant geometry for the meadow's ground layer.
//
// "Shrub Sorrel 01" by Rico Cilliers, Poly Haven (CC0 — free of all known
// copyright restrictions, no credit required; the URL is kept here so the
// asset can be traced back to its source):
//   https://polyhaven.com/a/shrub_sorrel_01
//
// The glTF + textures ship in `public/sanctuary/models/` (same convention as
// the safari kit in `public/safari/models/`) — the sanctuary is an
// OFFLINE-FIRST scene, so nothing here is hot-linked at runtime.
//
// ── Why a new module instead of a flora.ts edit ─────────────────────────
//
// The old stand-in "shrubs" were one icosahedron repeated 50–147 times —
// exactly the "one mesh, many placements" shortcut the research pass keeps
// calling out (research §6). This module replaces that blob with the real
// authored plant: eleven leaf/flower planes (3 319 triangles) that carry the
// sorrel's scalloped three-leaf rosettes, the brown edge wear and the pink
// five-petaled blossoms, cut out by its own alpha map.
//
// ── Cost model ──────────────────────────────────────────────────────────
//
//   * ALL eleven parts are merged into ONE geometry at boot, so the whole
//     field is TWO draw calls — one InstancedMesh per ring (near/far), the
//     same split the grass field uses. The CPU never touches a plant after
//     build.
//   * The wind is a VERTEX SHADER effect (onBeforeCompile, like the grass):
//     one uTime uniform per frame, no matrix rebuilds, no GC.
//   * Alpha-TEST, not alpha-blend: no sorting, no overdraw explosion — the
//     same rule the grass lives by (principle 35).
//   * Per-ring counts live in `sorrelCounts()` below and are read from the
//     quality tier, so the scene can never pop plants in/out at runtime.
//
// ── Naturalness (the brief: "gap aur kaise dekhne mein natural lage") ────
//
//   No two plants are clones: full 2π yaw, a small lean, INDEPENDENT x/y/z
//   scale (one squat and wide, one tall and narrow) and a per-instance tint
//   that inherits the ground's hue.
//   Plants do not grow on a lattice either: a two-octave simplex patch
//   field decides WHERE the meadow is thick and where it is bare, so the
//   field comes out in organic clumps with real gaps between them — the
//   way sorrel actually colonises a meadow, rosette by rosette.
//   And the environment still has veto: no plants in the river, on the
//   worn trails, on the trodden disc under the chair, on rock faces, on
//   the beach, or under a crowded closed canopy (research §8 — the ground
//   decides what grows, not the random number generator).

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TextureLoader } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight, RIVER_CENTER_X, OCEAN_LEVEL, coastWeight } from "./terrain";
import { createSite, siteAt, pathWeight, groundColorAt, type Site } from "./environment";
import { GROUND_PALETTE } from "./palette";
import { noise } from "./simplex";

export interface SorrelField {
  group: THREE.Group;
  /**
   * The plant material, published so `scene.ts` can register it with the
   * atmosphere pass as FOLIAGE (the thin leaves get the backlit sun
   * transmission term a solid object must not) and with the winter pass.
   */
  materials: THREE.Material[];
  update(time: number, windStrength: number): void;
  dispose(): void;
}

const MODEL_URL = "sanctuary/models/shrub_sorrel_01_1k.gltf";
const ALPHA_URL = "sanctuary/models/textures/shrub_sorrel_01_alpha_1k.png";

/**
 * The model is authored TINY — the whole plant is 0.084 m wide in its own
 * space (Poly Haven's "0.4 m wide" is the plant at ~5× this scale, which is
 * the size we want it at in the meadow: a ground-cover rosette a head above
 * the grass, well short of a bush).
 */
const BASE_SCALE = 5;

/** The plant's height in its own (pre-scale) space, for the wind bend curve. */
const MODEL_HEIGHT = 0.058;

/** Per-tier instance counts: [near ring, far ring]. */
function sorrelCounts(budget: QualityBudget): [number, number] {
  switch (budget.tier) {
    case "low": return [120, 40];
    case "medium": return [320, 90];
    case "high": return [600, 150];
    case "ultra": return [900, 220];
  }
}

/** The near ring's outer radius, and where the far ring ends. */
function sorrelRadii(budget: QualityBudget): [number, number] {
  return [60, Math.max(120, budget.grassFarRadius * 0.8)];
}

/**
 * Does a plant belong at (x, z, y)?
 *
 * The cheap rejections run FIRST, before the height field or the site
 * query are touched — the same ordering the grass field uses, because most
 * of the field is rejected on water/path alone and the site query costs a
 * handful of height samples each.
 */
function acceptsPlant(
  x: number, z: number, y: number,
  worn: number, site: Site, ring: "near" | "far",
): boolean {
  if (insideRiver(x, z)) return false;
  // The bare shingle the river scours: thin it out, keep a few stragglers
  // so the bank's edge is ragged, not drawn (mirrors the grass rule).
  if (Math.abs(x - RIVER_CENTER_X) < 8.6 && Math.random() < 0.7) return false;
  // No plant below the tide line + 1 m; the dry upper beach keeps only one
  // in five, exactly as the dune-grass rule does.
  const shoreUp = y - OCEAN_LEVEL;
  if (shoreUp < 1.0) return false;
  if (coastWeight(x, z) > 0.05 && shoreUp < 2.6 && Math.random() < 0.8) return false;
  // Worn ground: no sorrel on the trail's core, thin across its shoulder.
  if (worn > 0.3) return false;
  if (worn > 0.12 && Math.random() < worn * 1.5) return false;
  // The trodden disc under the chair + desk, widened for the plant's
  // footprint (the grass uses 1.9 m for a 7 cm blade).
  if (Math.hypot(x, z + 1.35) < 4.5) return false;
  // The site query is the expensive part — only the survivors reach it.
  if (site.slopeDeg > 30) return false; // rock band: no soil, no plant
  if (site.soil < 0.22) return false;
  if (site.wetness > 0.75 && Math.random() < 0.8) return false; // main channel
  // A closed canopy starves the floor of light: the far ring thins hard,
  // the near ring thins at all (research §1, §5 — competition is geography).
  if (site.crowding > 0.75 && Math.random() < (ring === "far" ? 0.85 : 0.45)) return false;
  return true;
}

/**
 * The PATCH FIELD: where the meadow is thick and where it is bare.
 *
 * Two octaves — a broad ~24 m meadow rhythm plus a ~7 m clump rhythm —
 * which is what makes the scatter read as one colonising species instead
 * of confetti. Returns -1…1; the caller thresholds it, so low values are
 * GAPS, not just thinning (the brief asked for visible gaps).
 */
function patchDensity(x: number, z: number): number {
  return noise.noise2D(x * 0.042, z * 0.042) * 0.62
    + noise.noise2D(x * 0.15 + 40.7, z * 0.15 - 17.3) * 0.38;
}

export function createSorrelField(budget: QualityBudget, anisotropy: number): Promise<SorrelField> {
  const group = new THREE.Group();
  group.name = "sorrel-field";

  const loader = new GLTFLoader();
  const shadows = budget.shadowMapSize > 0;
  const site: Site = createSite();

  return new Promise<SorrelField>((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        // ── One geometry for the whole plant ─────────────────────────
        //
        // All eleven parts share the one sorrel material and the same
        // POSITION/NORMAL/UV attribute set, so they merge cleanly. After the
        // merge the geometry is re-based so the plant's base sits at the
        // origin — that is what lets an instance matrix (position + yaw +
        // scale) place it the way the grass places a tuft.
        const parts: THREE.BufferGeometry[] = [];
        const meshes: THREE.Mesh[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            meshes.push(mesh);
            parts.push(mesh.geometry);
          }
        });
        if (parts.length === 0) {
          reject(new Error("sorrel: glTF contains no meshes"));
          return;
        }
        const geo = mergeGeometries(parts, false);
        parts.forEach((g) => g.dispose());
        if (!geo) {
          reject(new Error("sorrel: failed to merge plant parts"));
          return;
        }
        geo.translate(-0.004, 0.001, -0.0045); // base → origin, centred

        const material = meshes[0].material as THREE.MeshStandardMaterial;
        // The Poly Haven glTF ships MASK mode (alphaCutoff 0.5) but its JPG
        // base colour cannot carry an alpha channel, so the cutout map is
        // loaded separately and patched in — the plant keeps its scalloped
        // leaf silhouette instead of reading as a solid green blob.
        const alphaTex = new TextureLoader().load(ALPHA_URL);
        material.alphaMap = alphaTex;
        material.alphaTest = 0.5;
        material.side = THREE.DoubleSide;
        for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, alphaTex]) {
          if (tex) tex.anisotropy = anisotropy;
        }

        // ── Wind: the same onBeforeCompile idiom as the grass ─────────
        //
        // The bend lives in LOCAL space (before the instance matrix), so the
        // instance scale multiplies it for free — a 7× rosette visibly sways
        // more than a 3.5× seedling without any extra uniform. Amplitudes
        // are therefore in the plant's own (0.058 m tall) units, i.e. a few
        // percent of its height, not metres. Past ~90 m the sway is
        // sub-pixel and switches off instead of shimmering.
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = { value: 0 };
          shader.uniforms.uWind = { value: 1 };
          shader.uniforms.uWindDir = { value: new THREE.Vector2(0.86, 0.5) };
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              /* glsl */ `
              #include <common>
              uniform float uTime;
              uniform float uWind;
              uniform vec2  uWindDir;
              float dcSHash(vec3 p) {
                return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              }
              `,
            )
            .replace(
              "#include <begin_vertex>",
              /* glsl */ `
              #include <begin_vertex>
              vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
              float dcPhase = dcSHash(dcRoot) * 6.2831;
              // The base never moves; only the crown sways (t^2 is a stiffer
              // bend than a grass blade — a rosette is a rosette).
              float dcT = clamp(transformed.y / ${MODEL_HEIGHT.toFixed(3)}, 0.0, 1.0);
              float dcBend = dcT * dcT;
              vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
              float dcNear = 1.0 - smoothstep(40.0, 90.0, -dcView.z);
              float dcTravel = dot(dcRoot.xz, uWindDir) * 0.2;
              float dcSwell  = sin(uTime * 1.2 + dcTravel + dcPhase) * 0.5 + 0.5;
              float dcGust   = sin(uTime * 0.33 + dcTravel * 0.4 + dcPhase * 0.5) * 0.5 + 0.5;
              float dcAmp = (0.004 + dcSwell * 0.008 + dcGust * 0.006) * uWind * dcBend * dcNear;
              transformed.x += uWindDir.x * dcAmp;
              transformed.z += uWindDir.y * dcAmp;
              transformed.y -= dcAmp * dcAmp * 0.4;
              `,
            );
          material.userData.shader = shader;
        };
        material.customProgramCacheKey = () => "dc-sorrel";

        const [nearCount, farCount] = sorrelCounts(budget);
        const [nearRadius, farRadius] = sorrelRadii(budget);
        const near = buildRing(geo, material, nearCount, 4, nearRadius, 1, site, shadows);
        const far = buildRing(geo, material, farCount, nearRadius - 4, farRadius, 2.1, site, shadows);
        group.add(near, far);

        resolve({
          group,
          materials: [material],
          update(time, windStrength) {
            const shader = material.userData.shader as
              { uniforms: Record<string, { value: unknown }> } | undefined;
            if (!shader) return;
            shader.uniforms.uTime.value = time;
            shader.uniforms.uWind.value = windStrength;
          },
          dispose() {
            for (const mesh of [near, far]) {
              mesh.dispose();
            }
            geo.dispose();
            material.dispose();
            for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, alphaTex]) {
              (tex as THREE.Texture | null)?.dispose?.();
            }
            group.clear();
          },
        });
      },
      undefined,
      (err) => {
        // A missing asset must not take the sanctuary down: the meadow simply
        // keeps its grass and wildflowers.
        console.warn("sorrel: model failed to load, continuing without the sorrel field", err);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Build one ring of instanced plants.
 *
 * `gain` multiplies the base scale — the far ring's plants are ~2× bigger
 * than the near ring's, the grass field's `distanceGain` trick: a sparse far
 * field still reads as continuous meadow only if each clump covers more
 * ground.
 */
function buildRing(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  innerRadius: number,
  outerRadius: number,
  gain: number,
  site: Site,
  shadows: boolean,
): THREE.InstancedMesh {
  const ring: "near" | "far" = gain > 1.5 ? "far" : "near";
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = true;
  mesh.name = `sorrel-${ring}`;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const span = outerRadius - innerRadius;
  let placed = 0;
  let guard = 0;

  while (placed < count && guard < count * 14) {
    guard += 1;
    // sqrt() keeps the disc uniform; the patch field then carves it into
    // clumps and gaps afterwards.
    const r = Math.sqrt(Math.random()) * span + innerRadius;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    // The patch field is the first gate — it is what makes gaps exist.
    // Near plants need a lower threshold than far ones: the far ring is the
    // sparse volume layer and must not read as an even carpet.
    const d = patchDensity(x, z);
    const threshold = ring === "far" ? 0.06 : -0.18;
    if (d < threshold) continue;
    // High-density patches get MORE plants, not just some — that is what
    // turns "evenly sprinkled" into "colonising in clumps".
    const richness = Math.min(1, Math.max(0, (d + 1) / 2));
    if (Math.random() > 0.3 + 0.7 * richness) continue;

    // Cheap rejections first, then the expensive site query.
    const worn = pathWeight(x, z);
    if (worn > 0.3) continue;
    const y = terrainHeight(x, z);
    siteAt(x, z, site);
    if (!acceptsPlant(x, z, y, worn, site, ring)) continue;

    // ── Transform: no two plants are clones ──────────────────────────
    // Full 2π yaw (the flower faces every direction), a small lean against
    // the "wind", and INDEPENDENT axis scales — squat-wide, tall-narrow,
    // everything in between — so no neighbouring rosette is a copy.
    const s = BASE_SCALE * gain * (0.7 + Math.random() * 0.85);
    dummy.position.set(x, y - 0.01, z);
    dummy.rotation.set(
      (Math.random() - 0.5) * 0.12,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.12,
    );
    dummy.scale.set(
      s * (0.85 + Math.random() * 0.3),
      s * (0.8 + Math.random() * 0.45),
      s * (0.85 + Math.random() * 0.3),
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    // ── Tint: the plant wears the ground's colour, greened and warmed ──
    //
    // Same rule as the grass (research §12, §27): the vegetation is a
    // continuation of the terrain, not a carpet laid over it. The tint is
    // deliberately SUBTLE here (unlike the grass's full hue) because the
    // authored texture already carries the sorrel's green and the pink
    // blossom — a strong tint would dye the flower.
    groundColorAt(x, z, y, ground, GROUND_PALETTE, 1, worn);
    ground.getHSL(hsl);
    const sun = site.sunFacing;
    const hue = 0.31 + hsl.l * 0.02 + (Math.random() - 0.5) * 0.03 - sun * 0.012;
    const sat = 0.14 + hsl.s * 0.1 + Math.random() * 0.1;
    const lit = 0.86 + hsl.l * 0.1 + sun * 0.05 + (Math.random() - 0.5) * 0.08;
    color.setHSL(hue, sat, Math.min(1.0, lit));
    mesh.setColorAt(placed, color);
    placed += 1;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // The wind displaces vertices past the computed bounds, so the ring gets a
  // generous manual sphere (same as the grass rings).
  geo.computeBoundingSphere();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), outerRadius + 6);

  return mesh;
}
