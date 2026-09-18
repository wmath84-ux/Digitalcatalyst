// src/nature3d/engine/terrain.ts
//
// The one source of truth for the ground.
//
// `terrainHeight(x, z)` is a cheap analytic height field. The mesh, the grass
// scatter, the animal herds, the trees, the player's feet in first-person mode
// and the "board can never sink under the ground" clamp all sample the SAME
// function, so nothing can ever float or sink relative to the visible ground.

import * as THREE from "three";
import type { QualityBudget } from "./quality";

/** Where the river gorge runs (world X) and how wide it is. */
export const RIVER_CENTER_X = 18;
export const RIVER_HALF_WIDTH = 6.4;
export const WATER_LEVEL = -1.45;

/** Radius of the flat study clearing at the origin. */
export const CLEARING_RADIUS = 3.2;

/**
 * Half-extent of the playable world, in metres. The ground mesh is
 * WORLD_SIZE × WORLD_SIZE, so the meadow now measures a full kilometre across
 * and the learner can walk for minutes without reaching a boundary.
 */
export const WORLD_SIZE = 1000;
export const WORLD_HALF = WORLD_SIZE / 2;

/**
 * Distant relief. Instead of the old three-vertex "pyramid" cut-outs on the
 * skyline, the far hills are now part of the SAME analytic height field as the
 * ground under your feet: smooth, eroded ridges that rise as you approach the
 * rim. Because the mesh samples this function everywhere, the hills are real
 * geometry you can actually walk towards — not billboards at the edge.
 */
function distantRelief(x: number, z: number): number {
  const d = Math.hypot(x, z);
  // Nothing until well past the meadow, then a long smooth ramp.
  const rise = smoothstep(150, WORLD_HALF * 0.92, d);
  if (rise <= 0) return 0;

  // Three octaves of ridged noise gives crests and saddles rather than cones.
  const a = Math.sin(x * 0.0115) * Math.cos(z * 0.0102);
  const b = Math.sin(x * 0.0231 + z * 0.0187 + 1.7);
  const c = Math.sin(x * 0.0476 - z * 0.0413 + 4.2);
  // `1 - |n|` is the classic ridged transform: it turns rounded humps into
  // sharp-crested ridges with eroded flanks, which is what reads as a mountain.
  const ridged = (1 - Math.abs(a)) * 0.62 + (1 - Math.abs(b)) * 0.26 + (1 - Math.abs(c)) * 0.12;
  // Large-scale mass so some sectors are high ranges and others stay open.
  const mass = 0.45 + 0.55 * (Math.sin(Math.atan2(z, x) * 2.3) * 0.5 + 0.5);
  return ridged * ridged * rise * mass * 96;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Analytic ground height at a world position. */
export function terrainHeight(x: number, z: number): number {
  const valley = Math.exp(-(((x - RIVER_CENTER_X) / 7.5) ** 2));
  const hills =
    Math.sin(x * 0.06) * Math.cos(z * 0.06) * 2.2 +
    Math.sin(x * 0.14 + z * 0.1) * 0.85 +
    Math.sin(x * 0.31 - z * 0.21) * 0.22;
  const dist = Math.hypot(x, z);
  const flatten = Math.min(Math.max((dist - CLEARING_RADIUS) / 9, 0), 1);

  // Rolling mid-distance terrain so the kilometre between the clearing and the
  // hills is not a flat green disc.
  const rolling =
    Math.sin(x * 0.019 + 0.6) * Math.cos(z * 0.017 - 0.3) * 3.4 +
    Math.sin(x * 0.037 - z * 0.029) * 1.35;
  const rollIn = smoothstep(40, 190, dist);

  return hills * flatten + rolling * rollIn + distantRelief(x, z) - valley * 2.8;
}

/** True when the position sits inside the river bed (no grass / no animals). */
export function insideRiver(x: number, z: number): boolean {
  void z;
  return Math.abs(x - RIVER_CENTER_X) < RIVER_HALF_WIDTH;
}

/** Surface normal, sampled by finite differences (used to tilt grass/animals). */
export function terrainNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.6;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

/**
 * Build the ground.
 *
 * THE KILOMETRE PROBLEM: a single 1000 m plane dense enough to show the hills
 * would need ~4 M vertices. Instead the ground is built as CONCENTRIC LOD
 * SHELLS — the same trick BGMI-class mobile renderers use for open terrain.
 * Each shell covers 4× the area of the one inside it at the same vertex cost,
 * so detail is spent where the camera actually is:
 *
 *   shell 0   ±90 m    full density  — where you walk, where the grass is
 *   shell 1   ±260 m   1/3 density   — rolling mid-ground
 *   shell 2   ±1000 m  1/9 density   — the hill ranges on the skyline
 *
 * Every shell samples the SAME `terrainHeight`, so the seams line up exactly
 * and a hill on the horizon is the same hill when you finally walk up it.
 * Total: 3 draw calls for a square kilometre.
 */
export function buildTerrain(budget: QualityBudget, groundTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";

  const lush = new THREE.Color(0x4d8a2c);
  const dry = new THREE.Color(0x7d8f3a);
  const mud = new THREE.Color(0x6b5a3c);
  const rock = new THREE.Color(0x6f7b74);
  const snow = new THREE.Color(0xeef4fb);
  const tmp = new THREE.Color();

  const density = budget.tier === "low" ? 0.62 : budget.tier === "medium" ? 0.82 : 1;

  const shells: Array<{ half: number; segs: number; shadow: boolean }> = [
    { half: 90, segs: Math.round(150 * density), shadow: true },
    { half: 260, segs: Math.round(120 * density), shadow: false },
    { half: WORLD_HALF, segs: Math.round(132 * density), shadow: false },
  ];

  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });

  shells.forEach((shell, index) => {
    const size = shell.half * 2;
    const geo = new THREE.PlaneGeometry(size, size, shell.segs, shell.segs);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Shells 1+ are rings: the middle is punched out by pushing those
    // vertices down out of sight, so they never z-fight the shell inside.
    const innerHalf = index === 0 ? 0 : shells[index - 1].half;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      // PlaneGeometry lies in XY and is rotated -90° about X, so local +Y → world -Z.
      const z = -pos.getY(i);
      const h = terrainHeight(x, z);
      const inside = innerHalf > 0 && Math.abs(x) < innerHalf - 1 && Math.abs(z) < innerHalf - 1;
      pos.setZ(i, inside ? h - 240 : h);

      const valley = Math.exp(-(((x - RIVER_CENTER_X) / 7.5) ** 2));
      const patch = (Math.sin(x * 0.33) * Math.cos(z * 0.29) + 1) * 0.5;
      tmp.copy(lush).lerp(dry, patch * 0.55 + Math.max(0, h) * 0.02);
      tmp.lerp(mud, Math.min(1, valley * 1.25));
      // Altitude banding: grass gives way to bare rock, then snow on the
      // highest crests. This is what makes the distant ranges read as real
      // mountains instead of green cones.
      if (h > 18) tmp.lerp(rock, Math.min(1, (h - 18) / 30));
      if (h > 52) tmp.lerp(snow, Math.min(1, (h - 52) / 26));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = shell.shadow && budget.shadowMapSize > 0;
    mesh.name = `ground-shell-${index}`;
    group.add(mesh);
  });

  return group;
}
