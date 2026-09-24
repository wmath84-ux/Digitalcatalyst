// src/nature3d/engine/flora.ts
//
// TREES, SHRUBS, FLOWERS, PERCHED BIRDS.
//
// The forest is the second-biggest triangle sink after the grass, so it is
// built the same way:
//
//   * ONE InstancedMesh holds every leaf card in the whole forest. A 30-tree
//     canopy with 18 cards each = 540 instances in a single draw call, wind
//     animated on the GPU exactly like the grass.
//   * Trunks + boughs are merged per tree and share one material.
//   * Flowers and shrubs are instanced too.
//   * Perched birds sit on real branch positions (the tree factory reports
//     them), so no bird ever floats in the air beside a trunk. They idle,
//     hop, preen and occasionally flick their wings; when the wind gusts they
//     bob with the branch.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { insideRiver, terrainHeight } from "./terrain";
import { insideWarehouse } from "./warehouseSite";
import { insideBeachHouse } from "./beachHouseSite";
import { createSite, siteAt, SUN_SIDE_X, SUN_SIDE_Z, type Site } from "./environment";
import type { TextureSet } from "./textures";

// Sanctuary scattering is reproducible: the same seed gives identical
// placement, silhouettes and ground contact on every load. Keeping one tiny
// PRNG here also avoids Math.random changing the world between hot reloads.
let seededRandom = (() => {
  let state = 0x6d2b79f5;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

function resetVegetationSeed(seed = 0x4e415455): void {
  let state = seed | 0;
  seededRandom = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Flora {
  group: THREE.Group;
  /** World positions of branch perches, for the bird colony. */
  perches: THREE.Vector3[];
  /**
   * Materials split by shading model, so the atmosphere pass can give the
   * LEAVES its backlit transmission term without turning the bark into a
   * lantern. The split is a property of the material, not of the group, so it
   * has to be published rather than guessed by a scene traversal.
   */
  foliageMaterials: THREE.Material[];
  solidMaterials: THREE.Material[];
  update(time: number, wind: number): void;
  dispose(): void;
}

export interface BirdColony {
  group: THREE.Group;
  /**
   * `camPos` + `flyerCullSq` (metres²) implement the screen-size cull from
   * `cull.ts`: a flying bird farther than the ~4 px cutoff is a speck of
   * noise, so its trig amble (position, banking, flap cycle) sleeps until it
   * is readable again. Perched birds keep their own 45 m gate.
   */
  update(dt: number, time: number, wind: number, camPos?: THREE.Vector3, flyerCullSq?: number): void;
  dispose(): void;
}

interface TreeLayout {
  x: number;
  z: number;
  scale: number;
  kind: "broadleaf" | "pine" | "acacia" | "palm";
  /** Only these trees get wind-animated leaf cards. */
  sways: boolean;
  /**
   * Competition for light, 0…1, from the environmental field. A crowded tree
   * grows a long bare trunk and keeps its leaves at the top; an open-grown
   * tree keeps low branches. This one number is the difference between a
   * plantation and a woodland (research §1, §5).
   */
  crowding: number;
  /** Soil depth, 0…1. Shallow soil → visible root flare and a smaller crown. */
  soil: number;
  /**
   * The palm variation A–E (0…4): trunk height, curvature, crown size, frond
   * count and droop all read off this one index, so no two neighbouring palms
   * are clones and yet every palm is one of five authored archetypes rather
   * than random noise (Phase 7).
   */
  variant: number;
  /**
   * Which way the palm leans, in radians — beach palms lean OUT TO SEA, the
   * classic tropical-island silhouette, and the coast direction is simply the
   * outward radial at the palm's position. 0 for inland trees.
   */
  leanAngle: number;
  /** 0…1, from the environmental field: how close to the beach this tree is. */
  coastal: number;
  /**
   * Beyond this radius the tree is rendered as its own LOD: a crossed pair of
   * painted canopy cards instead of trunk + boughs + twenty leaf cards. The
   * impostor is the classic mobile LOD step (research §5, §21) — 4 triangles
   * standing in for ~60, at a distance where the difference is invisible.
   */
  impostor: boolean;
}

/** The radius at which a tree switches to its impostor LOD. */
const IMPOSTOR_RADIUS = 300;

/**
 * Scatter trees across the whole kilometre.
 *
 * `sways` is the important field. Animating every leaf card in a 500-tree
 * forest is pure waste: at 200 m you cannot see a leaf move, and a forest
 * where EVERY canopy pulses in unison looks synthetic — real woodland has
 * still trees and moving trees side by side. So only a fraction of the trees
 * are flagged as animated, and the flag is biased towards the ones near the
 * clearing where the motion is actually legible.
 */
function treeLayout(count: number): TreeLayout[] {
  const out: TreeLayout[] = [];
  const treeSite: Site = createSite();
  let guard = 0;
  // Scatter out to the foot of the hills, not just around the clearing.
  const maxRadius = 430;
  while (out.length < count && guard < count * 30) {
    guard += 1;
    // sqrt keeps the density even per unit AREA instead of bunching at the centre.
    const r = 9 + Math.sqrt(seededRandom()) * maxRadius;
    const a = seededRandom() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (insideRiver(x, z)) continue;
    // A trunk against the wall puts its crown on the roof. 8 m clears it.
    if (insideWarehouse(x, z, 8)) continue;
    // A crown must not sit on a beach house's ridge either.
    if (insideBeachHouse(x, z, 9)) continue;
    if (Math.hypot(x, z) < 8) continue;
    if (Math.abs(x) < 4 && z > -6 && z < 6) continue; // keep the board sightline clear
    const h = terrainHeight(x, z);
    if (h < -0.8) continue;
    if (h > 34) continue; // above the tree line
    // Spacing relaxes with distance — dense grove near you, open woodland far off.
    // On the beach the gaps tighten: coconut palms grow almost colonially
    // along the shore, and the clustered palms ARE the beach read.
    const site = siteAt(x, z, treeSite);
    const minGap = site.coastal > 0.3 ? 3.4 : r < 60 ? 4.2 : r < 160 ? 6 : 9;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < minGap)) continue;
    // Ask the environmental field what this spot is like before the tree is
    // built: soil depth decides whether the roots show, crowding decides how
    // much bare trunk it grows, and both are geography, not chance (§1).
    const roll = seededRandom();
    // THE TROPICAL DISTRIBUTION (Phase 7/8): the coast belongs to the coconut
    // palm; the inland woods stay lush broadleaf with a savanna accent; only
    // the high ground keeps a handful of iron-pines for altitude variety.
    const kind: TreeLayout["kind"] = site.coastal > 0.3
      ? (roll < 0.78 ? "palm" : "broadleaf")
      : roll < 0.52
        ? "broadleaf"
        : roll < 0.82
          ? "palm"
          : roll < 0.94
            ? "acacia"
            : "pine";
    // Beach palms reach — more sun, less competition, salt wind. Inland
    // palms are the slender, taller variant.
    const scale = site.coastal > 0.3
      ? 1.0 + seededRandom() * 0.5
      : 0.85 + seededRandom() * 0.85;
    out.push({
      x,
      z,
      scale,
      kind,
      // ~55 % of close trees sway, dropping to ~8 % past 150 m. Over the whole
      // forest that lands near "3 in 10", which is what was asked for.
      sways: seededRandom() < (r < 70 ? 0.55 : r < 150 ? 0.3 : 0.08),
      crowding: site.crowding,
      soil: site.soil,
      variant: (seededRandom() * 5) | 0,
      // Beach palms lean OUT TO SEA — the outward radial — with a few
      // rebellious leaners for naturalism. Inland palms keep a small
      // random lean; broadleaf/pine/acacia ignore it.
      leanAngle: kind === "palm"
        ? (site.coastal > 0.3 && seededRandom() < 0.72
            ? Math.atan2(z, x)
            : seededRandom() * Math.PI * 2)
        : 0,
      coastal: site.coastal,
      impostor: r > IMPOSTOR_RADIUS,
    });
  }
  return out;
}

export function createFlora(tex: TextureSet, budget: QualityBudget): Flora {
  resetVegetationSeed();
  const group = new THREE.Group();
  group.name = "flora";
  const shadows = budget.shadowMapSize > 0;
  const perches: THREE.Vector3[] = [];

  // `vertexColors: true` on both: the tree factory bakes its AO, its moss and
  // its needle gradient into vertex colours (see `woodColor`/`tierColor`
  // below), which is a texture lookup's worth of shading for zero memory.
  // The palm gets its OWN material + merged mesh: its ringed, sun-bleached
  // trunk is one of the strongest tropical reads in the whole scene, and
  // temperate bark would undo it.
  const trunkMat = new THREE.MeshLambertMaterial({ map: tex.bark, vertexColors: true });
  const palmTrunkMat = new THREE.MeshLambertMaterial({ map: tex.palmBark, vertexColors: true });
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2a8a28, vertexColors: true });

  // STATIC GEOMETRY IS MERGED, NOT ADDED.
  //
  // Trunks, boughs and pine tiers never move independently — only the leaf
  // cards sway — so every one of them is baked into ONE merged geometry per
  // material. A 26-tree forest goes from ~180 draw calls to 2. This is the
  // single biggest win in the whole scene and it is why the forest is free
  // even on an integrated GPU.
  const woodParts: THREE.BufferGeometry[] = [];
  const palmWoodParts: THREE.BufferGeometry[] = [];
  const pineParts: THREE.BufferGeometry[] = [];
  const bakeMatrix = new THREE.Matrix4();
  const bakeEuler = new THREE.Euler();
  const bakeQuat = new THREE.Quaternion();
  const bakeScale = new THREE.Vector3(1, 1, 1);
  const bakePos = new THREE.Vector3();
  const bake = (
    parts: THREE.BufferGeometry[],
    geo: THREE.BufferGeometry,
    x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0,
  ) => {
    bakePos.set(x, y, z);
    bakeQuat.setFromEuler(bakeEuler.set(rx, ry, rz));
    bakeMatrix.compose(bakePos, bakeQuat, bakeScale);
    parts.push(geo.applyMatrix4(bakeMatrix));
  };

  // ── Leaf instances: TWO buckets, still and swaying ───────────────────
  //
  // The still bucket uses the stock Lambert shader — the GPU does no extra
  // work per vertex at all. Only the swaying bucket pays for the wind, and it
  // holds roughly three trees in ten. On top of that the wind amplitude fades
  // to zero with distance inside the shader, so a swaying tree 200 m away
  // costs the vertex maths but produces no visible motion and no shimmer.
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  // Palm fronds pivot at the ROOT (the crown), not the centre, so the card is
  // re-based to the left edge before instancing — a rotating frond then sweeps
  // around the crown point like the real thing instead of spinning in place.
  const frondGeo = new THREE.PlaneGeometry(1, 0.5);
  frondGeo.translate(0.5, 0, 0);

  const makeLeafMaterial = (animated: boolean, map: THREE.Texture = tex.leaf) => {
    const mat = new THREE.MeshLambertMaterial({
      map,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    if (!animated) return mat;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWind = { value: 1 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform float uWind;
          float dcHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>
          vec3 dcOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float dcPhase = dcHash(dcOrigin.xz + dcOrigin.y) * 6.2831;
          // Higher leaves sway more — the canopy edge always moves first.
          float dcHeightGain = clamp(dcOrigin.y / 9.0, 0.15, 1.0);
          // Distance fade: past ~120 m the motion is sub-pixel, so switch it
          // off rather than paying for invisible shimmer.
          vec4 dcView = modelViewMatrix * vec4(dcOrigin, 1.0);
          float dcFade = 1.0 - smoothstep(60.0, 130.0, -dcView.z);
          float dcAmp = uWind * dcHeightGain * dcFade;
          float dcSway = sin(uTime * 1.6 + dcPhase) + sin(uTime * 3.7 + dcPhase * 1.7) * 0.4;
          transformed.x += dcSway * 0.11 * dcAmp;
          transformed.z += cos(uTime * 1.3 + dcPhase) * 0.08 * dcAmp;
          transformed.y += sin(uTime * 2.4 + dcPhase) * 0.035 * dcAmp;
          `,
        );
      mat.userData.shader = shader;
    };
    return mat;
  };

  const leafMatStill = makeLeafMaterial(false);
  const leafMatSway = makeLeafMaterial(true);

  const layout = treeLayout(budget.treeCount);
  // LOD/culling (audit §5): the LEAF pools size to broadleaf/acacia trees
  // only — palms write fronds into their own pools below, and pine tiers are
  // merged geometry — so instance buffers carry no dead slots. The IMPOSTOR
  // radius (300 m) sits inside the scatter radius (430 m) so every far tree
  // is a 2-card silhouette, never full geometry.
  const leafSwayTrees = layout.filter((t) => t.sways && t.kind !== "palm").length;
  const leafStillTrees = layout.filter((t) => !t.sways && t.kind !== "palm").length;
  const maxSway = leafSwayTrees * budget.leavesPerTree + 8;
  const maxStill = leafStillTrees * budget.leavesPerTree + 8;

  const leavesSway = new THREE.InstancedMesh(leafGeo, leafMatSway, Math.max(1, maxSway));
  const leavesStill = new THREE.InstancedMesh(leafGeo, leafMatStill, Math.max(1, maxStill));
  for (const m of [leavesSway, leavesStill]) {
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    m.frustumCulled = false; // canopy spans the whole scene
  }

  // Palm fronds get their OWN bucket pair: the same per-instance wind
  // mechanics as the leaf cards, but on the root-pivoted frond geometry and
  // the frond texture — a broadleaf leaf card would read as a blob, and the
  // centre-pivoted leaf geometry would spin fronds in place instead of
  // sweeping them around the crown.
  const frondMatSway = makeLeafMaterial(true, tex.frond);
  const frondMatStill = makeLeafMaterial(false, tex.frond);
  const palmSwayTrees = layout.filter((t) => t.kind === "palm" && t.sways && !t.impostor).length;
  const palmStillTrees = layout.filter((t) => t.kind === "palm" && !t.sways && !t.impostor).length;
  const maxFrondSway = palmSwayTrees * (budget.leavesPerTree + 6) + 8;
  const maxFrondStill = palmStillTrees * (budget.leavesPerTree + 6) + 8;
  const frondSway = new THREE.InstancedMesh(frondGeo, frondMatSway, Math.max(1, maxFrondSway));
  const frondStill = new THREE.InstancedMesh(frondGeo, frondMatStill, Math.max(1, maxFrondStill));
  for (const m of [frondSway, frondStill]) {
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    m.frustumCulled = false;
  }
  let frondSwayIndex = 0;
  let frondStillIndex = 0;
  let swayIndex = 0;
  let stillIndex = 0;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ── Wood weathering: vertex-colour AO + moss on the shade side ──────
  //
  // Bark is never one colour and never evenly lit. This bakes the two things
  // that always happen in a real wood into the vertex data — where the tree is
  // dark (the base, beneath the canopy) and where it is damp enough to grow
  // moss (the side away from the sun, low down) — for the cost of one float
  // per vertex. That is the "vertex-colour AO" technique (research §21), and
  // it replaces both an ambient-occlusion texture and a moss mask.
  const woodColor = (
    geo: THREE.BufferGeometry,
    kind: "trunk" | "branch",
  ): THREE.BufferGeometry => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const t = (pos.getY(i) - minY) / span; // 0 at the base of the piece, 1 at its top
      // Ambient occlusion: dark where the piece meets the ground or its
      // parent branch, opening up with height.
      const ao = kind === "trunk" ? 0.46 + 0.54 * Math.pow(t, 0.5) : 0.6 + 0.4 * t;
      // Which way does this bit of bark face? (Local space is world-aligned
      // for trunks, which is where the moss matters.)
      const len = Math.hypot(x, z) || 1e-4;
      const facing = (x / len) * SUN_SIDE_X + (z / len) * SUN_SIDE_Z;
      // Moss needs damp AND shade: it grows on the side away from the sun and
      // stops climbing at about chest height, exactly as in a real wood
      // (research §1, §11 — weathering is a story about water and light).
      const moss = kind === "trunk" ? Math.pow(Math.max(0, -facing), 1.4) * (1 - t) * 0.85 : 0;
      colors[i * 3] = ao * (1 - moss * 0.45);
      colors[i * 3 + 1] = ao * (1 - moss * 0.28);
      colors[i * 3 + 2] = ao * (1 - moss * 0.62);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  };

  /** A pine tier: darker where the tier above shadows it, brighter at the rim. */
  const tierColor = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < pos.count; i += 1) {
      // The needle mass is darkest underneath (occluded by its own tier) and
      // lightest at the crown — the same tip-bright, base-dark gradient the
      // grass blades carry, for the same reason (research §4).
      const t = (pos.getY(i) - minY) / span;
      const v = 0.72 + 0.5 * t;
      colors[i * 3] = v * 0.98;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v * 0.9;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  };

  // ── Impostors: the far-tree LOD (research §5, §21) ──────────────────
  //
  // Past 300 m a tree is four triangles' worth of information on screen. It is
  // drawn as a crossed pair of painted canopy cards: no trunk geometry, no
  // boughs, no twenty leaf cards — one InstancedMesh holds the whole distant
  // forest, and the silhouette (which is all the eye has at that range) is
  // carried by painted alpha instead of by polygons. Palms get their own
  // card + mesh: their silhouette (slim curved trunk, radiating crown) is so
  // distinctive that a round broadleaf blob would read as a mistake.
  const impostorTrees = layout.filter((t) => t.impostor).length;
  const impostorMat = makeLeafMaterial(true, tex.canopy);
  const impostors = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    impostorMat,
    Math.max(1, impostorTrees * 2 + 4),
  );
  impostors.castShadow = false;
  impostors.receiveShadow = false;
  impostors.frustumCulled = false;
  let impostorIndex = 0;

  const palmImpostorTrees = layout.filter((t) => t.impostor && t.kind === "palm").length;
  const palmImpostorMat = makeLeafMaterial(true, tex.palmCanopy);
  const palmImpostors = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    palmImpostorMat,
    Math.max(1, palmImpostorTrees * 2 + 4),
  );
  palmImpostors.castShadow = false;
  palmImpostors.receiveShadow = false;
  palmImpostors.frustumCulled = false;
  let palmImpostorIndex = 0;

  // The sun's mean azimuth: where the light comes from all day. Branches chase
  // it (phototropism), the far side of every trunk grows the moss.
  const sunAzimuth = Math.atan2(SUN_SIDE_Z, SUN_SIDE_X);

  for (const t of layout) {
    const baseY = terrainHeight(t.x, t.z);
    const s = t.scale;

    if (t.kind === "palm") {
      // ════════════════════════════════════════════════════════════════
      // THE COCONUT PALM (Phase 7) — five ORIGINAL archetypes, A…E.
      //
      // Each archetype pins the five numbers that make a palm read as a palm:
      // trunk height, total lean, crown radius, frond count and droop. The
      // trunk is a curved stack of tapered cylinders (with the ring scars
      // coming from the texture's banding), the crown is 8–11 instanced
      // frond cards pivoting at the crown point, and 2–3 coconuts finish it.
      // The whole tree is ~120 trunk triangles + ~10 cards — cheaper than
      // one broadleaf's leaf cluster.
      // ════════════════════════════════════════════════════════════════
      const PALMS = [
        { h: 5.6, bend: 0.17, crown: 2.6, fronds: 9, droop: 1.0 },   // A: the classic
        { h: 7.3, bend: 0.26, crown: 3.0, fronds: 10, droop: 1.14 }, // B: the tall leaner
        { h: 4.3, bend: 0.08, crown: 2.3, fronds: 8, droop: 0.9 },   // C: the young one
        { h: 6.5, bend: 0.32, crown: 2.8, fronds: 11, droop: 1.22 }, // D: the wind-swept
        { h: 5.0, bend: 0.11, crown: 2.4, fronds: 9, droop: 0.95 },  // E: the stout one
      ] as const;
      const P = PALMS[t.variant % PALMS.length];
      const trunkH = P.h * s * (0.92 + seededRandom() * 0.18);
      const leanDirX = Math.cos(t.leanAngle);
      const leanDirZ = Math.sin(t.leanAngle);
      // Beach palms commit to the lean (salt wind, phototropism over open
      // water); inland palms only suggest it.
      const totalLean = P.bend * (t.coastal > 0.3 ? 1 : 0.45) * (0.75 + seededRandom() * 0.5);
      const SEGS = 5;
      let px = t.x;
      let pz = t.z;
      let py = baseY - 0.15 * s; // sink the root slightly, like every rock
      for (let seg = 0; seg < SEGS; seg += 1) {
        const f0 = seg / SEGS;
        const f1 = (seg + 1) / SEGS;
        // Radius tapers with height; alternate segments bulge ±7 % — the
        // texture's ring bands then land on real geometry ridges.
        const ring = seg % 2 === 0 ? 1.07 : 0.93;
        const r0 = (0.21 - 0.105 * f0) * s * (seg === 0 ? 1.18 : ring);
        const r1 = (0.21 - 0.105 * f1) * s * (seg === SEGS - 1 ? 0.8 : ring);
        const segLen = trunkH / SEGS;
        const tilt = (totalLean / SEGS) * (seg + 0.5);
        const midX = px + leanDirX * Math.sin(tilt) * segLen * 0.5;
        const midZ = pz + leanDirZ * Math.sin(tilt) * segLen * 0.5;
        // Impostor palms only need the CURVE (for the card's crown anchor) —
        // the trunk itself is baked by nothing, so skip the geometry.
        if (!t.impostor) {
          bake(
            palmWoodParts,
            woodColor(new THREE.CylinderGeometry(r1, r0, segLen * 1.04, 7), "trunk"),
            midX,
            py + Math.cos(tilt) * segLen * 0.5,
            midZ,
            leanDirZ * tilt,
            0,
            -leanDirX * tilt,
          );
        }
        px += leanDirX * Math.sin(tilt) * segLen;
        pz += leanDirZ * Math.sin(tilt) * segLen;
        py += Math.cos(tilt) * segLen;
      }
      // Crown point: where the trunk curve ends.
      const crownX = px;
      const crownY = py;
      const crownZ = pz;
      const crownR = P.crown * s;

      // Coconuts: three small husk spheres tucked under the crown. Constant
      // vertex colour (the palette's coconut husk) — no extra material.
      // (Impostor palms skip them — the silhouette card already implies the
      // crown cluster, and a nut at 200 m is sub-pixel.)
      if (!t.impostor) {
        const nuts = 2 + ((seededRandom() * 2) | 0);
        for (let n = 0; n < nuts; n += 1) {
          const na = (n / nuts) * Math.PI * 2 + seededRandom();
          const nut = new THREE.SphereGeometry(0.15 * s, 6, 5);
          const nPos = nut.attributes.position as THREE.BufferAttribute;
          const nCol = new Float32Array(nPos.count * 3);
          for (let vi = 0; vi < nPos.count; vi += 1) {
            nCol[vi * 3] = 0.33;
            nCol[vi * 3 + 1] = 0.26;
            nCol[vi * 3 + 2] = 0.16;
          }
          nut.setAttribute("color", new THREE.BufferAttribute(nCol, 3));
          nut.translate(Math.cos(na) * 0.3 * s, -0.24 * s, Math.sin(na) * 0.3 * s);
          palmWoodParts.push(nut);
        }
      }

      // ── The frond crown ──────────────────────────────────────────────
      if (t.impostor) {
        // Far LOD: two crossed palm-silhouette cards spanning trunk + crown.
        const imW = crownR * 1.5;
        const imH = (trunkH + crownR * 1.5) * s * 0.98;
        for (let k = 0; k < 2; k += 1) {
          if (palmImpostorIndex >= palmImpostors.instanceMatrix.count) break;
          dummy.position.set(t.x, baseY + imH / 2, t.z);
          dummy.rotation.set(0, (k * Math.PI) / 2 + seededRandom() * 0.4, 0);
          dummy.scale.set(imW, imH, 1);
          dummy.updateMatrix();
          palmImpostors.setMatrixAt(palmImpostorIndex, dummy.matrix);
          // A salt-stressed palm is yellower; a sheltered one deeper green.
          color.setHSL(
            0.30 + seededRandom() * 0.03,
            0.62 + seededRandom() * 0.12,
            0.34 - t.crowding * 0.04 + seededRandom() * 0.09,
          );
          palmImpostors.setColorAt(palmImpostorIndex, color);
          palmImpostorIndex += 1;
        }
        perches.push(new THREE.Vector3(crownX, crownY + 0.2, crownZ));
        continue;
      }

      const target = t.sways ? frondSway : frondStill;
      const cap = t.sways ? maxFrondSway : maxFrondStill;
      const fronds = Math.min(P.fronds, Math.max(6, budget.leavesPerTree));
      const frondQ = new THREE.Quaternion();
      const frondRoll = new THREE.Quaternion();
      const frondDir = new THREE.Vector3();
      const X_AXIS = new THREE.Vector3(1, 0, 0);
      const unhealthy = t.variant === 2 && seededRandom() < 0.4; // some C-palms yellow
      for (let f = 0; f < fronds; f += 1) {
        const slot = t.sways ? frondSwayIndex : frondStillIndex;
        if (slot >= cap) break;
        const yaw = (f / fronds) * Math.PI * 2 + seededRandom() * 0.5;
        // Fronds near the top stay almost upright; outer ones droop. The
        // archetype's `droop` scales the whole fan — archetype D sags hardest.
        const rank = f % 3; // 0 upright, 1 mid, 2 outer
        const pitch = rank === 0
          ? 0.1 + seededRandom() * 0.16
          : rank === 1
            ? 0.42 + seededRandom() * 0.2
            : (0.78 + seededRandom() * 0.26) * P.droop;
        const cp = Math.cos(pitch);
        frondDir.set(Math.cos(yaw) * cp, -Math.sin(pitch), Math.sin(yaw) * cp).normalize();
        frondQ.setFromUnitVectors(X_AXIS, frondDir);
        // A little twist around the frond's own axis so cards never pair up
        // into visible mirrored planes.
        frondRoll.setFromAxisAngle(frondDir, (seededRandom() - 0.5) * 0.55);
        frondQ.premultiply(frondRoll);
        dummy.position.set(crownX, crownY + 0.08 * s, crownZ);
        dummy.quaternion.copy(frondQ);
        const len = crownR * (1.25 + seededRandom() * 0.4);
        dummy.scale.set(len, len * 0.52, 1);
        dummy.updateMatrix();
        target.setMatrixAt(slot, dummy.matrix);
        // Sunlit fronds are warm yellow-green; shaded and unhealthy ones go
        // deeper, then yellow. Hue jitter keeps no two fronds identical.
        const outer = rank / 2;
        color.setHSL(
          unhealthy ? 0.22 + seededRandom() * 0.03 : 0.30 + outer * 0.014 + seededRandom() * 0.012,
          unhealthy ? 0.58 : 0.64 + outer * 0.1 + seededRandom() * 0.08,
          0.34 + outer * 0.12 + seededRandom() * 0.08,
        );
        target.setColorAt(slot, color);
        if (t.sways) frondSwayIndex += 1;
        else frondStillIndex += 1;
      }
      // Birds perch in palm crowns — the frond bases ARE the branches.
      perches.push(new THREE.Vector3(crownX + 0.4 * s, crownY + 0.3, crownZ));
      continue;
    }

    if (t.kind === "pine") {
      // A conifer is the purest phototropism in nature: one vertical leader
      // racing for the light, carrying only as much crown as competition
      // forces on it. A crowded pine grows taller and barer (research §1, §5).
      const trunkH = 5.4 * s * (1 + t.crowding * 0.35);
      bake(
        woodParts,
        woodColor(new THREE.CylinderGeometry(0.16 * s, 0.44 * s, trunkH, 8), "trunk"),
        t.x,
        baseY + trunkH / 2,
        t.z,
      );
      for (let tier = 0; tier < 4; tier += 1) {
        const f = 1 - tier * 0.2;
        // Gravity: every tier below the crown sags a little further out.
        const droop = 1 + tier * 0.07;
        bake(
          pineParts,
          tierColor(new THREE.ConeGeometry(1.9 * s * f * droop, 2.3 * s * f, 9)),
          t.x,
          baseY + trunkH * (0.42 + tier * 0.19) - tier * 0.06 * s,
          t.z,
        );
      }
      perches.push(new THREE.Vector3(t.x + 1.1 * s, baseY + trunkH * 0.7, t.z));
      continue;
    }

    const isAcacia = t.kind === "acacia";

    // COMPETITION: a crowded tree grows TALL and BARE — all of its biomass goes
    // into escaping the canopy above it, so the trunk lengthens and the crown
    // rides up. An open-grown tree stays short and wide (research §1, §5).
    const trunkH = (isAcacia ? 4.6 : 4.0) * s * (1 + t.crowding * 0.6);

    // ROOT FLARE: on thin soil the tree cannot go deep, so it goes wide. The
    // base radius grows as the soil shallows, exactly as an exposed-root tree
    // on a rocky ridge does — "agar zameen rocky hai, toh massive root
    // structures visible honge" (research §1).
    const baseFlare = 0.46 * s * (1 + (1 - t.soil) * 0.55);
    bake(
      woodParts,
      woodColor(new THREE.CylinderGeometry(0.2 * s, baseFlare, trunkH, 9), "trunk"),
      t.x,
      baseY + trunkH / 2,
      t.z,
    );

    // Buttress roots — only where the soil is thin enough to have exposed them.
    if (t.soil < 0.6) {
      const roots = 4 + ((seededRandom() * 3) | 0);
      for (let r = 0; r < roots; r += 1) {
        const ra = (r / roots) * Math.PI * 2 + seededRandom() * 0.5;
        const rl = (0.7 + seededRandom() * 0.6) * s;
        bake(
          woodParts,
          woodColor(new THREE.CylinderGeometry(0.05 * s, 0.16 * s, rl, 5), "branch"),
          t.x + Math.cos(ra) * rl * 0.42,
          baseY + 0.08 * s,
          t.z + Math.sin(ra) * rl * 0.42,
          Math.sin(ra) * 1.25,
          0,
          -Math.cos(ra) * 1.25,
        );
      }
    }

    // ── Boughs: phototropism vs gravity — also the bird perches ───────
    //
    // Every branch is a tug-of-war (research §5). Phototropism pulls it towards
    // the light, which biases its AZIMUTH towards the sun's side of the sky;
    // gravity pulls the tip down, which adds TILT — and because an old branch
    // is heavier and lower than a young one, the droop grows the lower the
    // branch sits on the trunk.
    const boughCount = isAcacia ? 5 : 4;
    const leading = 1 + Math.round(t.crowding * 2); // crowded trees lead harder for the light
    for (let b = 0; b < boughCount; b += 1) {
      const even = (b / boughCount) * Math.PI * 2 + seededRandom();
      const toward = sunAzimuth + (seededRandom() - 0.5) * 1.2;
      const heightFrac = 0.72 + seededRandom() * 0.2;
      // Upper boughs chase the sun hardest; lower ones keep their radial spread.
      const pull = (b < leading ? 0.55 : 0.18) * heightFrac;
      const vx = Math.cos(even) + Math.cos(toward) * pull;
      const vz = Math.sin(even) + Math.sin(toward) * pull;
      const ang = Math.atan2(vz, vx);

      // GRAVITY: the lower the bough sits, the more it sags.
      const baseTilt = isAcacia ? 1.15 : 0.65;
      const gravityDroop = (1 - heightFrac) * 1.05 + t.crowding * 0.12;
      const tilt = baseTilt + gravityDroop;
      const len = (isAcacia ? 2.1 : 1.6) * s * (1 + t.crowding * 0.35);
      const by = baseY + trunkH * heightFrac;
      bake(
        woodParts,
        woodColor(new THREE.CylinderGeometry(0.05 * s, 0.11 * s, len, 6), "branch"),
        t.x + Math.cos(ang) * Math.sin(tilt) * len * 0.5,
        by + Math.cos(tilt) * len * 0.5,
        t.z + Math.sin(ang) * Math.sin(tilt) * len * 0.5,
        Math.sin(ang) * tilt,
        0,
        -Math.cos(ang) * tilt,
      );

      perches.push(new THREE.Vector3(
        t.x + Math.cos(ang) * Math.sin(tilt) * len * 0.92,
        by + Math.cos(tilt) * len * 0.92,
        t.z + Math.sin(ang) * Math.sin(tilt) * len * 0.92,
      ));
    }

    // ── Dead lower twigs (the price of losing the race for light) ─────
    //
    // In a crowded stand the light never reaches the low branches: they die and
    // stay. Two or three bare stubs is the cheapest possible proof that this
    // tree has spent years competing (research §5, §11).
    if (t.crowding > 0.5) {
      const dead = 2 + ((seededRandom() * 2) | 0);
      for (let d = 0; d < dead; d += 1) {
        const da = seededRandom() * Math.PI * 2;
        const dl = (0.5 + seededRandom() * 0.5) * s;
        bake(
          woodParts,
          woodColor(new THREE.CylinderGeometry(0.02 * s, 0.05 * s, dl, 5), "branch"),
          t.x + Math.cos(da) * dl * 0.4,
          baseY + trunkH * (0.42 + seededRandom() * 0.12),
          t.z + Math.sin(da) * dl * 0.4,
          Math.sin(da) * 1.5,
          0,
          -Math.cos(da) * 1.5,
        );
      }
    }

    // ── Canopy ────────────────────────────────────────────────────────
    //
    // Leaves are arranged as a HEMISPHERICAL CLUSTER, never a flat disc:
    // biased upward (every leaf is racing for the sky) and stretched towards
    // the sun's side, which is what an open-grown crown looks like from below
    // (research §5, principle 19).
    const canopyY = baseY + trunkH * (isAcacia ? 1.02 : 0.94);
    const spread = (isAcacia ? 3.4 : 2.4) * s * (1 + t.crowding * 0.12);

    if (t.impostor) {
      // The far LOD: two crossed cards standing in for the whole crown.
      const imScale = spread * 1.7;
      for (let k = 0; k < 2; k += 1) {
        if (impostorIndex >= impostors.instanceMatrix.count) break;
        dummy.position.set(t.x, canopyY + spread * 0.35, t.z);
        dummy.rotation.set(0, (k * Math.PI) / 2 + seededRandom() * 0.5, 0);
        dummy.scale.set(imScale, imScale * 1.05, imScale);
        dummy.updateMatrix();
        impostors.setMatrixAt(impostorIndex, dummy.matrix);
        // Hue follows the tree's own exposure: a crowded crown is darker (it
        // is in shade), an open one is yellow-green.
        color.setHSL(
          0.30 + seededRandom() * 0.03,
          0.62 + t.crowding * 0.08,
          0.34 - t.crowding * 0.06 + seededRandom() * 0.1,
        );
        impostors.setColorAt(impostorIndex, color);
        impostorIndex += 1;
      }
      continue;
    }

    const target = t.sways ? leavesSway : leavesStill;
    const cap = t.sways ? maxSway : maxStill;
    for (let l = 0; l < budget.leavesPerTree; l += 1) {
      const slot = t.sways ? swayIndex : stillIndex;
      if (slot >= cap) break;
      // Hemisphere: cosine-weighted towards the top of the crown.
      const u = seededRandom();
      const cosT = 1 - Math.pow(u, 1.35);
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = seededRandom() * Math.PI * 2;
      // Sunward stretch: the crown is fatter on the side the light comes from.
      const sunward = Math.max(0, Math.cos(phi) * SUN_SIDE_X + Math.sin(phi) * SUN_SIDE_Z);
      const radial = spread * (0.55 + 0.45 * sunward) * sinT;
      dummy.position.set(
        t.x + Math.cos(phi) * radial,
        canopyY + cosT * spread * (isAcacia ? 0.5 : 0.95) - spread * 0.25,
        t.z + Math.sin(phi) * radial,
      );
      dummy.rotation.set((seededRandom() - 0.5) * 1.6, seededRandom() * Math.PI, (seededRandom() - 0.5) * 1.6);
      const size = (1.5 + seededRandom() * 1.3) * s;
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      target.setMatrixAt(slot, dummy.matrix);
      // Leaf colour carries the same story as the geometry: the outer, sunlit
      // leaves are yellow-green and bright; the inner ones are dark and
      // cooler. TROPICAL: the whole band is warmer and brighter than the old
      // temperate olive — the island canopy is vivid but still varied.
      const outer = Math.min(1, radial / Math.max(0.001, spread));
      color.setHSL(
        0.30 + outer * 0.025 + seededRandom() * 0.02,
        0.64 + outer * 0.12 + seededRandom() * 0.08,
        0.32 + outer * 0.14 - t.crowding * 0.04 + seededRandom() * 0.10,
      );
      target.setColorAt(slot, color);
      if (t.sways) swayIndex += 1;
      else stillIndex += 1;
    }
  }

  impostors.count = impostorIndex;
  impostors.instanceMatrix.needsUpdate = true;
  if (impostors.instanceColor) impostors.instanceColor.needsUpdate = true;
  group.add(impostors);

  palmImpostors.count = palmImpostorIndex;
  palmImpostors.instanceMatrix.needsUpdate = true;
  if (palmImpostors.instanceColor) palmImpostors.instanceColor.needsUpdate = true;
  group.add(palmImpostors);

  // Flush the merged static forest: 2 draw calls for every trunk, bough and
  // pine tier in the scene (3 with the palms, which carry their own bark).
  if (woodParts.length) {
    const merged = mergeGeometries(woodParts, false);
    if (merged) {
      const wood = new THREE.Mesh(merged, trunkMat);
      wood.castShadow = shadows;
      wood.receiveShadow = shadows;
      wood.name = "forest-wood";
      group.add(wood);
    }
    woodParts.forEach((g) => g.dispose());
  }
  if (palmWoodParts.length) {
    const merged = mergeGeometries(palmWoodParts, false);
    if (merged) {
      const palmWood = new THREE.Mesh(merged, palmTrunkMat);
      palmWood.castShadow = shadows;
      palmWood.receiveShadow = shadows;
      palmWood.name = "forest-palm-wood";
      group.add(palmWood);
    }
    palmWoodParts.forEach((g) => g.dispose());
  }
  if (pineParts.length) {
    const merged = mergeGeometries(pineParts, false);
    if (merged) {
      const pines = new THREE.Mesh(merged, pineMat);
      pines.castShadow = shadows;
      pines.name = "forest-pines";
      group.add(pines);
    }
    pineParts.forEach((g) => g.dispose());
  }

  leavesSway.count = swayIndex;
  leavesStill.count = stillIndex;
  for (const m of [leavesSway, leavesStill]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  group.add(leavesSway, leavesStill);

  frondSway.count = frondSwayIndex;
  frondStill.count = frondStillIndex;
  for (const m of [frondSway, frondStill]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  group.add(frondSway, frondStill);

  // ── Shrubs live in `sorrel.ts` now ──────────────────────────────────
  //
  // The old placeholder was one icosahedron repeated 50–147 times — the
  // "one mesh, many placements" shortcut the research warns about (§6).
  // The meadow's shrubby ground layer is now the real authored plant:
  // "Shrub Sorrel 01" (Poly Haven, CC0), instanced across the field by
  // `createSorrelField` with patch-noise clumping and the environmental
  // veto (river, trails, beach, rock, closed canopy).

  // ── Wildflowers ──────────────────────────────────────────────────────
  // TROPICAL: the island's blooms — hibiscus, plumeria, bougainvillea and
  // white ginger — instead of the temperate meadow set.
  const flowerGeo = new THREE.SphereGeometry(0.06, 5, 4);
  const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, budget.flowers);
  const palette = [0xe8446e, 0xfff0d0, 0xc23fb0, 0xf2a03d, 0xff6b81];
  let fi = 0;
  for (let i = 0; i < budget.flowers * 3 && fi < budget.flowers; i += 1) {
    const r = 3 + Math.sqrt(seededRandom()) * 34;
    const a = seededRandom() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (insideRiver(x, z)) continue;
    dummy.position.set(x, terrainHeight(x, z) + 0.28, z);
    dummy.rotation.set(0, seededRandom() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + seededRandom() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix);
    color.set(palette[(seededRandom() * palette.length) | 0]);
    flowers.setColorAt(fi, color);
    fi += 1;
  }
  flowers.count = fi;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);

  // ── Boulders are NOT built here any more ─────────────────────────────
  //
  // The old scatter was one dodecahedron repeated with random rotation: the
  // exact "one rock, 300 placements" shortcut the research warns about
  // (research §6). Rocks now come from the ROCK KIT in `rocks.ts` — carved
  // masters, bedding planes, world-aligned moss and dust, contact decals, a
  // grass skirt at every base and a real far LOD — and are placed by slope and
  // drainage rather than by uniform chance. This factory keeps trees, shrubs,
  // flowers and birds; the forest stays in two draw calls, the rocks in eight.

  return {
    group,
    perches,
    foliageMaterials: [leafMatSway, leafMatStill, impostorMat, palmImpostorMat, frondMatSway, frondMatStill],
    solidMaterials: [trunkMat, palmTrunkMat, pineMat, flowerMat],
    update(time, wind) {
      // Every wind-animated foliage material — the near canopy, the palm
      // fronds, and both impostor sets — runs off the same two uniforms.
      for (const mat of [leafMatSway, impostorMat, palmImpostorMat, frondMatSway]) {
        const shader = mat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
        if (!shader) continue;
        shader.uniforms.uTime.value = time;
        shader.uniforms.uWind.value = wind;
      }
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      });
      group.clear();
    },
  };
}

/**
 * Birds that actually SIT on the branches (the brief's "birds tree per baithe
 * hue dikhni chahie"), plus a few circling the sky.
 *
 * Each perched bird is ~90 triangles and only animates inside 45 m.
 */
/** Smooth 0..1 ramp with zero first AND second derivative at both ends. */
function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createBirds(perches: THREE.Vector3[], tex: TextureSet, budget: QualityBudget): BirdColony {
  const group = new THREE.Group();
  group.name = "birds";

  // One MERGED, vertex-coloured body per plumage: torso + head + beak + tail
  // in a single geometry. A perched bird is therefore 3 draw calls (body +
  // two wing cards) instead of six, and every bird of a plumage shares the
  // same geometry and the same material object.
  const PLUMAGE = [
    { body: 0xe07a3f, head: 0x2b2b30 }, // robin
    { body: 0x3f6fd0, head: 0x25407e }, // jay
    { body: 0xf2d34e, head: 0x4a4231 }, // finch
    { body: 0x6c7c8c, head: 0x424e59 }, // sparrow
    { body: 0x35a06c, head: 0x1f6b47 }, // bee-eater
  ];

  const tintGeo = (geo: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  const birdMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bodyGeos = PLUMAGE.map((pal) => {
    const parts: THREE.BufferGeometry[] = [];

    const torso = new THREE.SphereGeometry(0.1, 8, 7);
    torso.scale(1.45, 1, 1);
    torso.rotateZ(-0.22);
    parts.push(tintGeo(torso, pal.body));

    const skull = new THREE.SphereGeometry(0.065, 7, 6);
    skull.translate(0.13, 0.08, 0);
    parts.push(tintGeo(skull, pal.head));

    const beak = new THREE.ConeGeometry(0.022, 0.075, 5);
    beak.rotateZ(-Math.PI / 2);
    beak.translate(0.205, 0.075, 0);
    parts.push(tintGeo(beak, 0xf0a63c));

    const fan = new THREE.ConeGeometry(0.05, 0.18, 4);
    fan.rotateZ(Math.PI / 2 + 0.35);
    fan.translate(-0.19, 0.02, 0);
    parts.push(tintGeo(fan, pal.body));

    const merged = mergeGeometries(parts, false) ?? parts[0];
    parts.forEach((g) => { if (g !== merged) g.dispose(); });
    return merged;
  });

  const wingGeo = new THREE.PlaneGeometry(0.2, 0.1);
  const wingMat = new THREE.MeshLambertMaterial({ map: tex.feather, transparent: true, side: THREE.DoubleSide, depthWrite: false });

  interface Perched {
    g: THREE.Group;
    wings: [THREE.Object3D, THREE.Object3D];
    head: THREE.Object3D;
    phase: number;
    next: number;
    state: "idle" | "preen" | "flutter" | "hop";
  }
  const perched: Perched[] = [];

  // Shuffle the perches so the birds are spread around the whole forest.
  const shuffled = perches.slice().sort(() => seededRandom() - 0.5);
  const wanted = Math.min(budget.perchedBirds, shuffled.length);
  for (let i = 0; i < wanted; i += 1) {
    const p = shuffled[i];
    const g = new THREE.Group();
    g.position.copy(p);
    g.position.y += 0.1;
    g.rotation.y = seededRandom() * Math.PI * 2;
    g.scale.setScalar(0.8 + seededRandom() * 0.5);

    const bodyMesh = new THREE.Mesh(bodyGeos[(seededRandom() * bodyGeos.length) | 0], birdMat);
    g.add(bodyMesh);

    const wings: [THREE.Object3D, THREE.Object3D] = [new THREE.Group(), new THREE.Group()];
    wings.forEach((w, k) => {
      const side = k === 0 ? 1 : -1;
      w.position.set(0, 0.02, side * 0.07);
      const mesh = new THREE.Mesh(wingGeo, wingMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = side * 0.09;
      w.add(mesh);
      g.add(w);
    });

    group.add(g);
    // `head` points at the merged body: the "head flick" is a small yaw on the
    // whole bird, which reads identically at bird scale for a fraction of the
    // cost of a separate skull mesh.
    perched.push({ g, wings, head: bodyMesh, phase: seededRandom() * 10, next: 1 + seededRandom() * 6, state: "idle" });
  }

  // ── Circling birds in the sky ────────────────────────────────────────
  interface Flyer {
    g: THREE.Group;
    wings: [THREE.Object3D, THREE.Object3D];
    radius: number;
    speed: number;
    height: number;
    angle: number;
  }
  const flyers: Flyer[] = [];
  const flyBody = new THREE.ConeGeometry(0.11, 0.42, 5);
  flyBody.rotateX(Math.PI / 2);
  const flyMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const flyWingGeo = new THREE.PlaneGeometry(0.62, 0.2);
  for (let i = 0; i < budget.flyingBirds; i += 1) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(flyBody, flyMat));
    const wings: [THREE.Object3D, THREE.Object3D] = [new THREE.Group(), new THREE.Group()];
    wings.forEach((w, k) => {
      const side = k === 0 ? 1 : -1;
      const mesh = new THREE.Mesh(flyWingGeo, wingMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.x = side * 0.31;
      w.add(mesh);
      g.add(w);
    });
    group.add(g);
    flyers.push({
      g,
      wings,
      radius: 34 + seededRandom() * 40,
      speed: 0.1 + seededRandom() * 0.12,
      height: 16 + seededRandom() * 14,
      angle: seededRandom() * Math.PI * 2,
    });
  }

  return {
    group,
    update(dt, time, wind, camPos, flyerCullSq = Infinity) {
      for (let i = 0; i < perched.length; i += 1) {
        const b = perched[i];
        b.next -= dt;
        if (b.next <= 0) {
          const roll = seededRandom();
          b.state = roll < 0.45 ? "idle" : roll < 0.7 ? "preen" : roll < 0.9 ? "flutter" : "hop";
          b.next = 1.2 + seededRandom() * 5;
        }
        const t = time + b.phase;
        // Branch bob follows the wind so the bird belongs to the tree.
        b.g.position.y += Math.sin(t * 1.9) * 0.0012 * wind;
        if (b.state === "preen") {
          // Tuck the beak under a wing: a roll + yaw on the merged body.
          b.head.rotation.z = -0.55 + Math.sin(t * 9) * 0.18;
          b.head.rotation.y = 0.7;
        } else {
          b.head.rotation.z = THREE.MathUtils.lerp(b.head.rotation.z, 0, Math.min(1, dt * 5));
          // Quick, bird-like head flicks rather than a smooth sweep.
          const flick = Math.sin(t * 0.9);
          b.head.rotation.y = flick > 0.8 ? (flick - 0.8) * 3.2 : flick < -0.8 ? (flick + 0.8) * 3.2 : 0;
        }
        const flutter = b.state === "flutter" ? Math.sin(t * 22) * 0.9 : 0;
        b.wings[0].rotation.x = flutter;
        b.wings[1].rotation.x = -flutter;
        if (b.state === "hop") {
          b.g.position.y += Math.max(0, Math.sin(t * 7)) * 0.004;
          b.g.rotation.y += dt * 0.7;
        }
      }

      // Soaring birds. Real birds do not flap continuously on a fixed circle:
      // they beat a few times, then hold a glide, and they BANK into the turn
      // (roll proportional to how hard they are turning). Both are almost
      // free — a couple of sines — and they are most of what separates a
      // convincing bird from a flapping cardboard cut-out.
      for (let i = 0; i < flyers.length; i += 1) {
        const f = flyers[i];
        // Screen-size cull (research: UE MinScreenRadius). Past the pixel
        // cutoff the bird is unresolvable — skip ALL the trig; the frozen
        // pose is never distinguishable from motion at that size.
        if (camPos) {
          const dx = f.g.position.x - camPos.x;
          const dy = f.g.position.y - camPos.y;
          const dz = f.g.position.z - camPos.z;
          if (dx * dx + dy * dy + dz * dz > flyerCullSq) continue;
        }
        f.angle += f.speed * dt;

        // Wandering radius and height so the path is never a clean circle.
        const wobbleR = Math.sin(time * 0.23 + f.angle * 0.7) * f.radius * 0.14;
        const r = f.radius + wobbleR;
        f.g.position.set(
          Math.cos(f.angle) * r,
          f.height + Math.sin(time * 0.7 + f.angle * 2) * 1.6 + Math.sin(time * 0.31 + i) * 2.4,
          Math.sin(f.angle) * r,
        );
        f.g.rotation.y = -f.angle - Math.PI / 2;

        // Bank into the turn, the way a real bird does.
        const turnRate = f.speed + Math.cos(time * 0.23 + f.angle * 0.7) * 0.12;
        f.g.rotation.z = THREE.MathUtils.clamp(turnRate * 2.6, -0.85, 0.85)
          + Math.sin(time * 0.8 + f.angle) * 0.12;

        // Flap-then-glide: a slow cycle gates the fast wingbeat, so each bird
        // beats for a moment and then holds its wings out and coasts.
        const cycle = (Math.sin(time * 0.42 + i * 1.7) + 1) * 0.5;
        const beating = smootherstep(0.42, 0.62, cycle);
        const flap = Math.sin(time * 11 + f.angle * 4) * 0.62 * beating;
        // Wings stay slightly raised in a dihedral while gliding.
        const glide = (1 - beating) * 0.16;
        f.wings[0].rotation.z = flap + glide;
        f.wings[1].rotation.z = -flap - glide;
      }
    },
    dispose() {
      bodyGeos.forEach((g) => g.dispose());
      [wingGeo, flyBody, flyWingGeo].forEach((g) => g.dispose());
      birdMat.dispose();
      wingMat.dispose();
      flyMat.dispose();
      group.clear();
    },
  };
}
