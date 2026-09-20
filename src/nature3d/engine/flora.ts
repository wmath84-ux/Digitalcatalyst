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
import { createSite, siteAt, SUN_SIDE_X, SUN_SIDE_Z, type Site } from "./environment";
import type { TextureSet } from "./textures";

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
  update(dt: number, time: number, wind: number): void;
  dispose(): void;
}

interface TreeLayout {
  x: number;
  z: number;
  scale: number;
  kind: "broadleaf" | "pine" | "acacia";
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
    const r = 9 + Math.sqrt(Math.random()) * maxRadius;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (insideRiver(x, z)) continue;
    if (Math.hypot(x, z) < 8) continue;
    if (Math.abs(x) < 4 && z > -6 && z < 6) continue; // keep the board sightline clear
    const h = terrainHeight(x, z);
    if (h < -0.8) continue;
    if (h > 34) continue; // above the tree line
    // Spacing relaxes with distance — dense grove near you, open woodland far off.
    const minGap = r < 60 ? 4.2 : r < 160 ? 6 : 9;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < minGap)) continue;
    const roll = Math.random();
    // Ask the environmental field what this spot is like before the tree is
    // built: soil depth decides whether the roots show, crowding decides how
    // much bare trunk it grows, and both are geography, not chance (§1).
    const site = siteAt(x, z, treeSite);
    out.push({
      x,
      z,
      scale: 0.85 + Math.random() * 0.85,
      kind: roll < 0.58 ? "broadleaf" : roll < 0.84 ? "pine" : "acacia",
      // ~55 % of close trees sway, dropping to ~8 % past 150 m. Over the whole
      // forest that lands near "3 in 10", which is what was asked for.
      sways: Math.random() < (r < 70 ? 0.55 : r < 150 ? 0.3 : 0.08),
      crowding: site.crowding,
      soil: site.soil,
      impostor: r > IMPOSTOR_RADIUS,
    });
  }
  return out;
}

export function createFlora(tex: TextureSet, budget: QualityBudget): Flora {
  const group = new THREE.Group();
  group.name = "flora";
  const shadows = budget.shadowMapSize > 0;
  const perches: THREE.Vector3[] = [];

  // `vertexColors: true` on both: the tree factory bakes its AO, its moss and
  // its needle gradient into vertex colours (see `woodColor`/`tierColor`
  // below), which is a texture lookup's worth of shading for zero memory.
  const trunkMat = new THREE.MeshLambertMaterial({ map: tex.bark, vertexColors: true });
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2f5c33, vertexColors: true });

  // STATIC GEOMETRY IS MERGED, NOT ADDED.
  //
  // Trunks, boughs and pine tiers never move independently — only the leaf
  // cards sway — so every one of them is baked into ONE merged geometry per
  // material. A 26-tree forest goes from ~180 draw calls to 2. This is the
  // single biggest win in the whole scene and it is why the forest is free
  // even on an integrated GPU.
  const woodParts: THREE.BufferGeometry[] = [];
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
  const swayTrees = layout.filter((t) => t.sways).length;
  const maxSway = swayTrees * budget.leavesPerTree + 8;
  const maxStill = (layout.length - swayTrees) * budget.leavesPerTree + 8;

  const leavesSway = new THREE.InstancedMesh(leafGeo, leafMatSway, Math.max(1, maxSway));
  const leavesStill = new THREE.InstancedMesh(leafGeo, leafMatStill, Math.max(1, maxStill));
  for (const m of [leavesSway, leavesStill]) {
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    m.frustumCulled = false; // canopy spans the whole scene
  }
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
  // carried by painted alpha instead of by polygons.
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

  // The sun's mean azimuth: where the light comes from all day. Branches chase
  // it (phototropism), the far side of every trunk grows the moss.
  const sunAzimuth = Math.atan2(SUN_SIDE_Z, SUN_SIDE_X);

  for (const t of layout) {
    const baseY = terrainHeight(t.x, t.z);
    const s = t.scale;

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
      const roots = 4 + ((Math.random() * 3) | 0);
      for (let r = 0; r < roots; r += 1) {
        const ra = (r / roots) * Math.PI * 2 + Math.random() * 0.5;
        const rl = (0.7 + Math.random() * 0.6) * s;
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
      const even = (b / boughCount) * Math.PI * 2 + Math.random();
      const toward = sunAzimuth + (Math.random() - 0.5) * 1.2;
      const heightFrac = 0.72 + Math.random() * 0.2;
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
      const dead = 2 + ((Math.random() * 2) | 0);
      for (let d = 0; d < dead; d += 1) {
        const da = Math.random() * Math.PI * 2;
        const dl = (0.5 + Math.random() * 0.5) * s;
        bake(
          woodParts,
          woodColor(new THREE.CylinderGeometry(0.02 * s, 0.05 * s, dl, 5), "branch"),
          t.x + Math.cos(da) * dl * 0.4,
          baseY + trunkH * (0.42 + Math.random() * 0.12),
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
        dummy.rotation.set(0, (k * Math.PI) / 2 + Math.random() * 0.5, 0);
        dummy.scale.set(imScale, imScale * 1.05, imScale);
        dummy.updateMatrix();
        impostors.setMatrixAt(impostorIndex, dummy.matrix);
        // Hue follows the tree's own exposure: a crowded crown is darker (it
        // is in shade), an open one is yellow-green.
        color.setHSL(
          0.235 + Math.random() * 0.04,
          0.4 + t.crowding * 0.1,
          0.3 - t.crowding * 0.06 + Math.random() * 0.1,
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
      const u = Math.random();
      const cosT = 1 - Math.pow(u, 1.35);
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = Math.random() * Math.PI * 2;
      // Sunward stretch: the crown is fatter on the side the light comes from.
      const sunward = Math.max(0, Math.cos(phi) * SUN_SIDE_X + Math.sin(phi) * SUN_SIDE_Z);
      const radial = spread * (0.55 + 0.45 * sunward) * sinT;
      dummy.position.set(
        t.x + Math.cos(phi) * radial,
        canopyY + cosT * spread * (isAcacia ? 0.5 : 0.95) - spread * 0.25,
        t.z + Math.sin(phi) * radial,
      );
      dummy.rotation.set((Math.random() - 0.5) * 1.6, Math.random() * Math.PI, (Math.random() - 0.5) * 1.6);
      const size = (1.5 + Math.random() * 1.3) * s;
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      target.setMatrixAt(slot, dummy.matrix);
      // Leaf colour carries the same story as the geometry: the outer, sunlit
      // leaves are yellow-green and bright; the inner ones are dark and cooler.
      const outer = Math.min(1, radial / Math.max(0.001, spread));
      color.setHSL(
        0.24 + outer * 0.045 + Math.random() * 0.03,
        0.42 + outer * 0.16 + Math.random() * 0.1,
        0.24 + outer * 0.14 - t.crowding * 0.04 + Math.random() * 0.12,
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

  // Flush the merged static forest: 2 draw calls for every trunk, bough and
  // pine tier in the scene.
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

  // ── Shrubs (instanced spheres of leaf cards would be heavy — use
  //    low-poly icospheres with the bark/leaf palette instead) ──────────
  const shrubGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const shrubMat = new THREE.MeshLambertMaterial({ color: 0x3b6b2c, flatShading: true });
  const shrubCount = Math.round(budget.flowers * 0.35);
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount);
  let si = 0;
  for (let i = 0; i < shrubCount * 3 && si < shrubCount; i += 1) {
    const r = 6 + Math.sqrt(Math.random()) * 300;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (insideRiver(x, z)) continue;
    dummy.position.set(x, terrainHeight(x, z) + 0.2, z);
    dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    const sc = 0.6 + Math.random() * 1.3;
    dummy.scale.set(sc, sc * 0.78, sc);
    dummy.updateMatrix();
    shrubs.setMatrixAt(si, dummy.matrix);
    color.setHSL(0.26 + Math.random() * 0.04, 0.5, 0.2 + Math.random() * 0.12);
    shrubs.setColorAt(si, color);
    si += 1;
  }
  shrubs.count = si;
  shrubs.instanceMatrix.needsUpdate = true;
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
  shrubs.castShadow = shadows;
  group.add(shrubs);

  // ── Wildflowers ──────────────────────────────────────────────────────
  const flowerGeo = new THREE.SphereGeometry(0.06, 5, 4);
  const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, budget.flowers);
  const palette = [0xffe066, 0xff6b81, 0x9ad0ff, 0xffffff, 0xd8a3ff];
  let fi = 0;
  for (let i = 0; i < budget.flowers * 3 && fi < budget.flowers; i += 1) {
    const r = 3 + Math.sqrt(Math.random()) * 34;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (insideRiver(x, z)) continue;
    dummy.position.set(x, terrainHeight(x, z) + 0.28, z);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + Math.random() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix);
    color.set(palette[(Math.random() * palette.length) | 0]);
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
    foliageMaterials: [leafMatSway, leafMatStill, impostorMat],
    solidMaterials: [trunkMat, pineMat, shrubMat, flowerMat],
    update(time, wind) {
      // Both wind-animated foliage materials — the near canopy and the distant
      // impostors — run off the same two uniforms.
      for (const mat of [leafMatSway, impostorMat]) {
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
  const shuffled = perches.slice().sort(() => Math.random() - 0.5);
  const wanted = Math.min(budget.perchedBirds, shuffled.length);
  for (let i = 0; i < wanted; i += 1) {
    const p = shuffled[i];
    const g = new THREE.Group();
    g.position.copy(p);
    g.position.y += 0.1;
    g.rotation.y = Math.random() * Math.PI * 2;
    g.scale.setScalar(0.8 + Math.random() * 0.5);

    const bodyMesh = new THREE.Mesh(bodyGeos[(Math.random() * bodyGeos.length) | 0], birdMat);
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
    perched.push({ g, wings, head: bodyMesh, phase: Math.random() * 10, next: 1 + Math.random() * 6, state: "idle" });
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
      radius: 34 + Math.random() * 40,
      speed: 0.1 + Math.random() * 0.12,
      height: 16 + Math.random() * 14,
      angle: Math.random() * Math.PI * 2,
    });
  }

  return {
    group,
    update(dt, time, wind) {
      for (let i = 0; i < perched.length; i += 1) {
        const b = perched[i];
        b.next -= dt;
        if (b.next <= 0) {
          const roll = Math.random();
          b.state = roll < 0.45 ? "idle" : roll < 0.7 ? "preen" : roll < 0.9 ? "flutter" : "hop";
          b.next = 1.2 + Math.random() * 5;
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
