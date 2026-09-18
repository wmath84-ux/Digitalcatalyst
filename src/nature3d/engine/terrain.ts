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

/** Analytic ground height at a world position. */
export function terrainHeight(x: number, z: number): number {
  const valley = Math.exp(-(((x - RIVER_CENTER_X) / 7.5) ** 2));
  const hills =
    Math.sin(x * 0.06) * Math.cos(z * 0.06) * 2.2 +
    Math.sin(x * 0.14 + z * 0.1) * 0.85 +
    Math.sin(x * 0.31 - z * 0.21) * 0.22;
  const dist = Math.hypot(x, z);
  const flatten = Math.min(Math.max((dist - CLEARING_RADIUS) / 9, 0), 1);
  return hills * flatten - valley * 2.8;
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
 * Build the ground mesh.
 *
 * Two shells:
 *   - a detailed inner field (the playable 170 m square) with real vertex
 *     displacement so hills read correctly against the grass;
 *   - a cheap outer skirt that reaches the fog line so the horizon is never
 *     a hard edge.
 */
export function buildTerrain(budget: QualityBudget, groundTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";

  const segments = budget.tier === "low" ? 96 : budget.tier === "medium" ? 128 : 168;
  const size = 180;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const lush = new THREE.Color(0x4d8a2c);
  const dry = new THREE.Color(0x7d8f3a);
  const mud = new THREE.Color(0x6b5a3c);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    // PlaneGeometry lies in XY and is rotated -90° about X, so local +Y → world -Z.
    const z = -pos.getY(i);
    const h = terrainHeight(x, z);
    pos.setZ(i, h);

    // Vertex colour breakup: lush in the meadow, drier on the ridges, muddy
    // in the river bed. This is what keeps the ground from reading "plastic"
    // even before a single grass blade is drawn.
    const valley = Math.exp(-(((x - RIVER_CENTER_X) / 7.5) ** 2));
    const patch = (Math.sin(x * 0.33) * Math.cos(z * 0.29) + 1) * 0.5;
    tmp.copy(lush).lerp(dry, patch * 0.55 + Math.max(0, h) * 0.06);
    tmp.lerp(mud, Math.min(1, valley * 1.25));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });

  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = budget.shadowMapSize > 0;
  ground.name = "ground";
  group.add(ground);

  // Outer skirt — flat, fogged, 1 draw call, no shadows.
  const skirtGeo = new THREE.RingGeometry(size * 0.5 - 1, budget.farPlane * 0.52, 48, 1);
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4a7a33, roughness: 1, metalness: 0 });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.35;
  skirt.name = "ground-skirt";
  group.add(skirt);

  return group;
}
