// src/nature3d/engine/grassTufts.ts
//
// THE GRASS TUFT FIELD — real 3D grass clumps decorating the meadow.
//
// "Grass Medium 02" by Rico Cilliers, Poly Haven (CC0 — free of all known
// copyright restrictions, no credit required; the URL is kept so the asset
// can be traced to its source):
//   https://polyhaven.com/a/grass_medium_02
//
// The asset ships as FIVE variant models (v1–v5) — five differently built
// clumps, from a short squat one (714 tris) to a tall feathery one (2 489
// tris) — and the brief is to use ALL of them, so no two neighbouring clumps
// are the same plant. They ship in `public/sanctuary/models/` (same
// convention as the safari kit); the sanctuary is OFFLINE-FIRST, so nothing
// here is hot-linked at runtime.
//
// ── Cost model ──────────────────────────────────────────────────────────
//
//   * One InstancedMesh PER VARIANT (five draw calls total). Each variant's
//     geometry is normalised at boot to UNIT HEIGHT with its base at the
//     origin, so a single instance scale (in metres) sizes the whole clump
//     and the wind bend reads the same normalised height in the shader.
//   * The five variants share ONE material, so the whole field is five draw
//     calls and one compiled program.
//   * Wind is a VERTEX SHADER injection (the grass idiom): one uTime uniform
//     per frame, no matrix rebuilds, no GC.
//   * Alpha-TEST (the blade planes are cut by the asset's alpha map), not
//     alpha-blend — no sorting, no overdraw explosion (principle 35).
//   * Per-tier instance counts are static, so clumps never pop in/out at
//     runtime.
//
// ── Naturalness ─────────────────────────────────────────────────────────
//
//   Same scatter discipline as the sorrel field: a two-octave simplex patch
//   field carves the meadow into clumps and gaps; the environmental veto
//   keeps the water, the trails, the chair's trodden disc, the beach, the
//   rock band and the closed canopy bare. On top of that every clump gets a
//   random variant, a full 2π yaw, a lean, an independent x/z width jitter
//   and a subtle tint that inherits the ground's hue.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TextureLoader } from "three";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight, RIVER_CENTER_X, OCEAN_LEVEL, coastWeight } from "./terrain";
import { insideWarehouse } from "./warehouseSite";
import { createSite, dryCover, siteAt, pathWeight, groundColorAt, type Site } from "./environment";
import { GROUND_PALETTE } from "./palette";
import { noise } from "./simplex";

export interface GrassTuftField {
  group: THREE.Group;
  /** The shared clump material, published for the atmosphere + winter passes. */
  materials: THREE.Material[];
  update(time: number, windStrength: number): void;
  /**
   * Thermal fail-safe: 0 = all five variants, both rings · 1 = far ring
   * hidden · 2 = near ring trimmed to 50 %. Allocation-free (see grass).
   */
  setShed(level: number): void;
  dispose(): void;
}

const VARIANT_URLS = [1, 2, 3, 4, 5].map((i) => `sanctuary/models/grass_medium_02_v${i}.gltf`);
const DIFF_URL = "sanctuary/models/textures/grass_medium_02_diff_2k.jpg";
// Downscaled 1 K diffuse for the low tier (generated from the 2 K original):
// a quarter of the texels = a quarter of the texture bandwidth, and at the
// low tier's 0.85× render scale the extra resolution was never displayed.
const DIFF_1K_URL = "sanctuary/models/textures/grass_medium_02_diff_1k.jpg";
const NORMAL_URL = "sanctuary/models/textures/grass_medium_02_nor_gl_2k.jpg";
const ARM_URL = "sanctuary/models/textures/grass_medium_02_arm_2k.jpg";
const ALPHA_URL = "sanctuary/models/textures/grass_medium_02_alpha_1k.png";

/**
 * Per-tier instance counts: [near ring, far ring].
 *
 * One clump is 714–2 489 triangles of alpha-tested double-sided foliage —
 * cheap individually, brutal in the aggregate. The low tier packs its clumps
 * around the seat and stops early rather than spreading thin to the hills:
 * same lushness where the learner actually looks, a fraction of the draw.
 */
function tuftCounts(budget: QualityBudget): [number, number] {
  switch (budget.tier) {
    case "low": return [64, 20];
    case "medium": return [400, 100];
    case "high": return [700, 180];
    case "ultra": return [1000, 280];
  }
}

/** The near ring's outer radius, and where the far ring ends. */
function tuftRadii(budget: QualityBudget): [number, number] {
  if (budget.tier === "low") return [55, 110];
  return [70, Math.max(140, budget.grassFarRadius * 0.85)];
}

/**
 * Does a clump belong at (x, z, y)? Same veto rules as the sorrel field,
 * cheap rejections first, the site query last (it costs height samples).
 * Grass is a bit more tolerant of damp than sorrel — riverbank turf is
 * exactly where medium grass grows thickest.
 */
function acceptsTuft(
  x: number, z: number, y: number,
  worn: number, site: Site, ring: "near" | "far",
): boolean {
  if (insideRiver(x, z)) return false;
  if (insideWarehouse(x, z, 3)) return false;
  if (Math.abs(x - RIVER_CENTER_X) < 8.6 && Math.random() < 0.6) return false;
  const shoreUp = y - OCEAN_LEVEL;
  if (shoreUp < 1.0) return false;
  if (coastWeight(x, z) > 0.05 && shoreUp < 2.6 && Math.random() < 0.8) return false;
  if (worn > 0.3) return false;
  if (worn > 0.12 && Math.random() < worn * 1.5) return false;
  if (Math.hypot(x, z + 1.35) < 4.5) return false;
  if (site.slopeDeg > 30) return false;
  if (site.soil < 0.2) return false;
  if (site.wetness > 0.85 && Math.random() < 0.7) return false;
  const dry = dryCover(x, z, y, site.wetness);
  if (dry > 0.7 && Math.random() < 0.68) return false;
  if (dry > 0.5 && Math.random() < 0.28) return false;
  if (site.crowding > 0.75 && Math.random() < (ring === "far" ? 0.85 : 0.4)) return false;
  return true;
}

/**
 * The PATCH FIELD — same two-octave rhythm as the sorrel field, different
 * offset so the two species clump in DIFFERENT places: where the sorrel is
 * thick the turf can be open, and vice versa. That overlap-of-two-patterns
 * is what stops the field reading as one stamped carpet.
 */
function patchDensity(x: number, z: number): number {
  return noise.noise2D(x * 0.038 - 91.3, z * 0.038 + 55.9) * 0.62
    + noise.noise2D(x * 0.14 + 8.1, z * 0.14 - 66.4) * 0.38;
}

/** Load one variant, re-based to unit height with its base at the origin. */
function loadVariant(loader: GLTFLoader, url: string): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        let geo: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && !geo) geo = mesh.geometry;
        });
        if (!geo) {
          reject(new Error("grassTufts: variant has no mesh"));
          return;
        }
        const g = geo as THREE.BufferGeometry;
        g.computeBoundingBox();
        const box = g.boundingBox!;
        const h = Math.max(1e-4, box.max.y - box.min.y);
        g.translate(
          -box.min.x - (box.max.x - box.min.x) / 2,
          -box.min.y,
          -box.min.z - (box.max.z - box.min.z) / 2,
        );
        g.scale(1 / h, 1 / h, 1 / h); // unit height, base at origin, centred
        resolve(g);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

export function createGrassTuftField(
  budget: QualityBudget,
  anisotropy: number,
  /**
   * Up-facing points on the rock kit's boulders, as (x, y, z, size) quads —
   * see `rocks.ts`. Each one gets a couple of clumps, which is the brief's
   * "stones pe bhi grass" done with real geometry, at the range where a real
   * clump is still worth its triangles.
   */
  stonePoints?: Float32Array,
): Promise<GrassTuftField> {
  const group = new THREE.Group();
  group.name = "grass-tuft-field";
  const loader = new GLTFLoader();
  const shadows = budget.shadowMapSize > 0;

  return (async () => {
    // All five variants in parallel. A FAILED variant must not kill the
    // whole field — the old Promise.all did exactly that, silently, and a
    // single dropped asset made the entire tuft field vanish in the
    // browser with nothing in the console. Keep whatever loads; warn about
    // the rest. Only if NOTHING loads does the field degrade out.
    const results = await Promise.allSettled(VARIANT_URLS.map((u) => loadVariant(loader, u)));
    const variants: THREE.BufferGeometry[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") variants.push(r.value);
      else console.warn(`[sanctuary] grass tuft variant v${i + 1} failed to load`, r.reason);
    });
    if (variants.length === 0) {
      throw new Error("grassTufts: none of the five variants could be loaded");
    }

    // ── One material for all five variants ─────────────────────────────
    //
    // The Poly Haven glTF carries only the base-colour texture (JPGs cannot
    // ship alpha, and the exporter dropped the rest), so the normal map, the
    // ARM pack and the alpha cutout are patched in from the same folder —
    // the blades keep their authored silhouette instead of reading solid.
    //
    // LOW TIER (`cheapPlants`): MeshLambertMaterial with ONLY the 1 K diffuse
    // + the alpha cutout. No normal/ARM/AO fetches (≈17 MB of 2 K texture
    // that never has to move across the bus), Lambert ALU instead of PBR —
    // the two biggest single savings in the whole diet (see quality.ts).
    const material = budget.cheapPlants
      ? new THREE.MeshLambertMaterial({
          map: new TextureLoader().load(DIFF_1K_URL),
          alphaMap: new TextureLoader().load(ALPHA_URL),
          alphaTest: 0.45,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          map: new TextureLoader().load(DIFF_URL),
          normalMap: new TextureLoader().load(NORMAL_URL),
          roughnessMap: new TextureLoader().load(ARM_URL),
          metalnessMap: new TextureLoader().load(ARM_URL),
          alphaMap: new TextureLoader().load(ALPHA_URL),
          alphaTest: 0.45,
          side: THREE.DoubleSide,
          // The ARM blue channel (metalness) is 0 in this asset, and the glTF
          // pins metallicFactor at 0 — dry grass is not a metal.
          metalness: 0,
        });
    if (material instanceof THREE.MeshStandardMaterial) {
      material.aoMap = material.metalnessMap;
      if (material.aoMap) material.aoMapIntensity = 0.7;
    }
    for (const tex of [material.map, material.alphaMap, ...(material instanceof THREE.MeshStandardMaterial ? [material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap] : [])]) {
      if (tex) tex.anisotropy = anisotropy;
    }

    // ── Wind: the grass idiom, on UNIT-HEIGHT geometry ─────────────────
    //
    // transformed.y is 0..1 after the normalisation, so the bend curve is a
    // plain clamp; the instance scale (metres) multiplies the local
    // displacement for free, so a 0.7 m clump sways more than a 0.4 m one
    // without any extra uniform. Past ~90 m the sway is sub-pixel.
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
          float dcGHash(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }
          `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>
          vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float dcPhase = dcGHash(dcRoot) * 6.2831;
          // A clump is stiffer than a blade: t^2 keeps the base locked.
          float dcT = clamp(transformed.y, 0.0, 1.0);
          float dcBend = dcT * dcT;
          vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
          float dcNear = 1.0 - smoothstep(40.0, 90.0, -dcView.z);
          float dcTravel = dot(dcRoot.xz, uWindDir) * 0.22;
          float dcSwell  = sin(uTime * 1.15 + dcTravel + dcPhase) * 0.5 + 0.5;
          float dcGust   = sin(uTime * 0.31 + dcTravel * 0.4) * 0.5 + 0.5;
          float dcFlutter= sin(uTime * 5.2 + dcPhase * 2.3) * 0.1;
          float dcAmp = (0.03 + dcSwell * 0.05 + dcGust * 0.04 + dcFlutter) * uWind * dcBend * dcNear;
          transformed.x += uWindDir.x * dcAmp;
          transformed.z += uWindDir.y * dcAmp;
          transformed.y -= dcAmp * dcAmp * 0.5;
          `,
        );
      material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => (budget.cheapPlants ? "dc-grass-tuft-diet" : "dc-grass-tuft");

    // ── Five InstancedMeshes, one per variant ──────────────────────────
    const [nearCount, farCount] = tuftCounts(budget);
    const [nearRadius, farRadius] = tuftRadii(budget);
    // A boulder's top is a small, high-value piece of ground: two clumps per
    // anchor is what reads as "the stone has grown a crop", and the capacity
    // is reserved on top of the ring scatter's, never taken out of it.
    const stoneAnchors = stonePoints ? stonePoints.length >> 2 : 0;
    // A clump of real 3-D grass is 714–2 489 triangles whether it grows in the
    // meadow or out of a crack in a boulder, so the stone crop is CAPPED at a
    // fifth of the near ring's own count: enough that most boulders in sight
    // carry a tuft, never enough to out-spend the meadow it stands in.
    const stoneBudget = stoneAnchors > 0 ? Math.max(variants.length, Math.round(nearCount * 0.2)) : 0;
    const stonePerVariant = Math.ceil(stoneBudget / variants.length) + 2;
    const perVariant = (total: number) => Math.ceil(total / variants.length) + 1 + stonePerVariant;
    const nearMeshes = variants.map((g) => makeMesh(g, material, perVariant(nearCount), shadows));
    const farMeshes = variants.map((g) => makeMesh(g, material, perVariant(farCount), shadows));
    group.add(...nearMeshes, ...farMeshes);

    const site: Site = createSite();
    // STONES FIRST. The near rings are written from slot 0 and trimmed from
    // the END by the fail-safe ladder, so the clumps that live on the boulders
    // take the first slots and survive every rung — the same discipline the
    // blade field uses for its rock skirts.
    const planted = plantOnStones(nearMeshes, variants.length, stonePoints, stoneBudget);
    scatterInto(nearMeshes, variants.length, 4, nearRadius, 1, nearCount, site, planted);
    scatterInto(farMeshes, variants.length, nearRadius - 4, farRadius, 1.7, farCount, site, 0);

    // Thermal fail-safe ladder — allocation-free count trims (see grass).
    const fullNear = nearMeshes.map((m) => m.count);
    const applyShed = (level: number) => {
      farMeshes.forEach((m) => {
        m.visible = level < 1;
      });
      nearMeshes.forEach((m, i) => {
        // The stone crop holds its slots at the FRONT of each buffer, so it is
        // the last thing the ladder may take: a trimmed ring loses meadow
        // clumps before it loses the grass growing on the rocks.
        m.count = level >= 2 ? Math.max(stonePerVariant, Math.floor(fullNear[i] * 0.5)) : fullNear[i];
      });
    };

    return {
      group,
      materials: [material],
      setShed(level) {
        applyShed(level);
      },
      update(time, windStrength) {
        const shader = material.userData.shader as
          { uniforms: Record<string, { value: unknown }> } | undefined;
        if (!shader) return;
        shader.uniforms.uTime.value = time;
        shader.uniforms.uWind.value = windStrength;
      },
      dispose() {
        for (const m of [...nearMeshes, ...farMeshes]) m.dispose();
        variants.forEach((g) => g.dispose());
        material.dispose();
        for (const tex of [material.map, material.alphaMap, ...(material instanceof THREE.MeshStandardMaterial ? [material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap] : [])]) {
          (tex as THREE.Texture | null)?.dispose?.();
        }
        group.clear();
      },
    };
  })();
}

function makeMesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
  shadows: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, capacity);
  // Never cast: alpha-tested foliage in the shadow pass is 2× overdraw for
  // shadows the ground's baked AO gradient already sells (same rule as the
  // blade field and the sorrel).
  mesh.castShadow = false;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * GRASS ON THE STONES.
 *
 * A boulder that has stood in a meadow for a season grows a crop on top of
 * it — seed lodges in its crevices, dust and rain collect there, and the
 * shoulders come up green while the flanks stay bare. That is the one thing a
 * skirt of blades around the base can never say, and the owner's brief names
 * it directly ("stones pe bhi grass").
 *
 * The anchors come from `rocks.ts`, which probes each boulder's own tilted
 * geometry, so a clump lands on a facet that really exists — a shoulder, a
 * bedding ledge, the flat top — and never in mid-air beside the stone.
 * Stone-top turf is SHORTER than meadow turf (it is growing out of a crack
 * with a few centimetres of soil), it leans with the facet, and it is paler:
 * bleached by the same sun that dries the stone under it.
 *
 * Capacity is guaranteed by the caller (`stonePerVariant` per mesh), and the
 * guard below is a failsafe, not a policy: an anchor past the end of a mesh's
 * buffer is dropped rather than wrapping into a slot someone already owns.
 */
function plantOnStones(
  meshes: THREE.InstancedMesh[],
  variants: number,
  points: Float32Array | undefined,
  budget: number,
): number {
  if (!points || points.length < 4 || budget <= 0) return 0;
  const anchors = points.length >> 2;
  // Rocks are spread over the whole district, so the budget is spent ACROSS
  // them (a stride through the anchor list) rather than on the first few:
  // every corner of the meadow keeps its stony little tufts.
  const stride = Math.max(1, Math.ceil((anchors * 1.5) / budget));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  for (let a = 0; a < anchors && placed < budget; a += stride) {
    const i = a * 4;
    const anchorX = points[i];
    const anchorY = points[i + 1];
    const anchorZ = points[i + 2];
    const size = points[i + 3];
    // A big block gets a pair of clumps, a cobble gets one.
    const clumps = placed + 1 < budget && size > 1.1 ? 2 : 1;
    for (let c = 0; c < clumps && placed < budget; c += 1) {
      const mesh = meshes[placed % variants];
      const slot = mesh.count;
      if (slot >= (mesh.instanceMatrix as THREE.InstancedBufferAttribute).count) break;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * size * 0.45;
      // The anchor is ON the facet; only the clump's own jitter moves it, and
      // it is sunk a centimetre so the root never shows a seam against stone.
      const height = (0.42 + Math.random() * 0.5) * size;
      dummy.position.set(
        anchorX + Math.cos(ang) * rad,
        anchorY - 0.02 + Math.random() * 0.03,
        anchorZ + Math.sin(ang) * rad,
      );
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.34,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.34,
      );
      dummy.scale.set(
        height * (0.85 + Math.random() * 0.3),
        height,
        height * (0.85 + Math.random() * 0.3),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      color.setHSL(
        0.285 + Math.random() * 0.025,
        0.42 + Math.random() * 0.18,
        0.44 + Math.random() * 0.16,
      );
      mesh.setColorAt(slot, color);
      mesh.count = slot + 1;
      placed += 1;
    }
  }
  return placed;
}

/**
 * Fill one ring across all five variant meshes. The instance counter runs
 * GLOBALLY (not per variant) and round-robins `placed % variants`, so the
 * five clump shapes are interleaved evenly — a glance across the meadow
 * never finds a patch of "all v3".
 */
function scatterInto(
  meshes: THREE.InstancedMesh[],
  variants: number,
  innerRadius: number,
  outerRadius: number,
  gain: number,
  total: number,
  site: Site,
  /** Slots already written by an earlier pass (the stone clumps). */
  startPlaced = 0,
): void {
  const ring: "near" | "far" = gain > 1.5 ? "far" : "near";
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const span = outerRadius - innerRadius;
  // The ring scatter CONTINUES from whatever a previous pass wrote (the stone
  // clumps own slots 0…startPlaced-1); `placeAt` bumps `count` as it fills
  // slots, and the round-robin below can never outrun the per-variant
  // capacity, which reserves the stone pass's share on top.
  let placed = startPlaced;
  let guard = 0;

  while (placed < startPlaced + total && guard < total * 14) {
    guard += 1;
    const r = Math.sqrt(Math.random()) * span + innerRadius;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    const d = patchDensity(x, z);
    const threshold = ring === "far" ? 0.04 : -0.15;
    if (d < threshold) continue;
    const richness = Math.min(1, Math.max(0, (d + 1) / 2));
    if (Math.random() > 0.32 + 0.68 * richness) continue;

    const worn = pathWeight(x, z);
    if (worn > 0.3) continue;
    const y = terrainHeight(x, z);
    siteAt(x, z, site);
    if (!acceptsTuft(x, z, y, worn, site, ring)) continue;

    placeAt(meshes[placed % variants], x, z, y, worn, gain, site, dummy, color, ground, hsl);
    placed += 1;
  }

  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true;
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), outerRadius + 6);
  }
}

function placeAt(
  mesh: THREE.InstancedMesh,
  x: number, z: number, y: number,
  worn: number, gain: number,
  site: Site,
  dummy: THREE.Object3D,
  color: THREE.Color,
  ground: THREE.Color,
  hsl: { h: number; s: number; l: number },
): void {
  const slot = mesh.count;
  // Target clump height 2.5–4.3 m in the near ring (6× the original 0.42–0.7
  // m per the owner's directive); the far ring grows the clumps ×1.7 on top
  // so the sparse far field still reads as continuous turf.
  const s = (2.52 + Math.random() * 1.8) * gain;
  dummy.position.set(x, y - 0.015, z);
  dummy.rotation.set(
    (Math.random() - 0.5) * 0.1,
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * 0.1,
  );
  dummy.scale.set(
    s * (0.85 + Math.random() * 0.3),
    s,
    s * (0.85 + Math.random() * 0.3),
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(slot, dummy.matrix);

  // Same ground-inherited tint as the sorrel: subtle, because the authored
  // texture already carries the green (and the odd dried tan blade).
  groundColorAt(x, z, y, ground, GROUND_PALETTE, 1, worn);
  ground.getHSL(hsl);
  const sun = site.sunFacing;
  const hue = 0.305 + hsl.l * 0.02 + (Math.random() - 0.5) * 0.03 - sun * 0.012;
  const sat = 0.16 + hsl.s * 0.1 + Math.random() * 0.1;
  const lit = 0.88 + hsl.l * 0.08 + sun * 0.04 + (Math.random() - 0.5) * 0.08;
  color.setHSL(hue, sat, Math.min(1.0, lit));
  mesh.setColorAt(slot, color);
  mesh.count = slot + 1;
}
