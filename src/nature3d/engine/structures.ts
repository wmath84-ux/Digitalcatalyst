// src/nature3d/engine/structures.ts
//
// THE BAY DISTRICT — jetty, props and distant islands.
//
// The hamlet buildings (Palm House, Reef Pavilion, Lagoon Shops, Utility
// Shed and the Bay Beacon) are gone from the Sanctuary: the bay now keeps
// only the jetty, the beach props, the moored boat and the distant islands.
//
// PERFORMANCE SHAPE (Phase 25/26):
//   * every part is a primitive box/cylinder/cone — no imported models
//   * parts are MERGED per material, so the whole district is a handful of
//     draw calls
//   * vertex-colour AO replaces lightmap/AO textures on every module
//   * the district is static: matrices freeze, bounds are computed once,
//     frustum culling culls the whole village when it is behind you
//   * shadows only within the scene's 34 m shadow frustum (costs nothing at
//     1 km; the map simply never samples them)
//
// PLACEMENT IS MEASURED, NOT GUESSED: the bay's shore is found at build time
// by walking the analytic height field outward until it crosses OCEAN_LEVEL,
// on the bay's own azimuth — the same field the terrain, grass and palms
// read, so the village can never disagree with the coastline.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { QualityBudget } from "./quality";
import { terrainHeight, OCEAN_LEVEL } from "./terrain";
import { pathWeight } from "./environment";
import { noise } from "./simplex";

export interface Structures {
  group: THREE.Group;
  /** Gentle idle motion (the moored boat rides the swell). */
  update(time: number): void;
  dispose(): void;
}

/** The bay's azimuth — MUST match `BAY_AZIMUTH` in terrain.ts. */
const BAY_AZIMUTH = 0.92;

/** Shared build scratch. */

/** Deterministic placement RNG — the village must be identical every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vertex AO: dark at the bottom of each part, open at the top. */
function withAO(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const t = (pos.getY(i) - bb.min.y) / span;
    const ao = 0.68 + 0.32 * Math.pow(t, 0.7);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Flat white vertex colour. Every part in a merged bucket must carry the SAME
 * attribute set or `mergeGeometries` drops the WHOLE bucket — a bug that ate
 * one silently (a mixed wood bucket at the jetty). Unbaked parts get flat 1s:
 * visually identical to no vertex colour, but mergeable.
 */
function withFlatColor(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  colors.fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Where the sea actually starts, on one azimuth. Walks the REAL height field
 * outward — the shoreline is a measurement, not a constant.
 */
function shoreRadius(phi: number): number {
  const cx = Math.cos(phi);
  const cz = Math.sin(phi);
  for (let r = 980; r < 1500; r += 2) {
    if (terrainHeight(cx * r, cz * r) < OCEAN_LEVEL + 0.25) return r;
  }
  return 1215;
}

export function createStructures(budget: QualityBudget): Structures {
  const group = new THREE.Group();
  group.name = "structures";
  const shadows = budget.shadowMapSize > 0;
  const rand = mulberry32(0xba11_05e5);

  // ── ONE MATERIAL LANGUAGE (Phase 13) ─────────────────────────────────
  // Flat, cheap materials; every part merges into the matching one.
  // No metal, no sky reflection: a specular lobe under this sun clips white.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.92, metalness: 0, envMapIntensity: 0, vertexColors: true });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2e86a8, roughness: 0.72, metalness: 0, envMapIntensity: 0, vertexColors: true });
  const islandMat = new THREE.MeshLambertMaterial({ color: 0x3aaa48 });

  const parts: Array<{ mat: THREE.Material; list: THREE.BufferGeometry[] }> = [
    { mat: woodMat, list: [] },
  ];

  /** Add one box/cylinder/cone to a material bucket, AO-baked and placed. */
  const add = (
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    x: number, y: number, z: number,
    ry = 0,
    bake = true,
  ) => {
    // ALWAYS a colour attribute — AO where baked, flat white otherwise — so
    // every bucket merges (see withFlatColor).
    if (bake) withAO(geo);
    else withFlatColor(geo);
    if (ry !== 0) geo.rotateY(ry);
    geo.translate(x, y, z);
    parts.find((p) => p.mat === mat)!.list.push(geo);
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // ═════════════════════════════════════════════════════════════════════
  //  SITE SURVEY — the measured bay
  // ═════════════════════════════════════════════════════════════════════
  const shoreR = shoreRadius(BAY_AZIMUTH);
  const cosA = Math.cos(BAY_AZIMUTH);
  const sinA = Math.sin(BAY_AZIMUTH);
  /** World position from (along-shore, seaward) local bay coordinates. */
  const at = (along: number, sea: number): [number, number] => [
    cosA * (shoreR + sea) - sinA * along,
    sinA * (shoreR + sea) + cosA * along,
  ];
  // The hamlet buildings once stood on this azimuth past the notes board;
  // they are gone now. The villa behind the student is the rusty-roof model,
  // and the jetty and the boat stay on the water.
  const HAMLET_YAW = Math.atan2(66, -72 - 2.6);
  const groundAt = (x: number, z: number) => terrainHeight(x, z);
  const tooWorn = (x: number, z: number) => pathWeight(x, z) > 0.45;

  // ── 1. THE JETTY (wood, walking out over the water) ──────────────────
  {
    const deckY = OCEAN_LEVEL + 1.15;
    const start = -14;
    const end = 64;
    // Deck: repeated plank boards with tiny gaps — reads as timber at any range.
    for (let s = start; s < end; s += 1.15) {
      const [x, z] = at(0, s);
      const p = box(2.9, 0.09, 1.0);
      p.translate(x, deckY, z);
      withAO(p);
      parts.find((pp) => pp.mat === woodMat)!.list.push(p);
    }
    // Cross beams under the deck.
    for (let s = start + 1; s < end; s += 6) {
      const [x, z] = at(0, s);
      add(woodMat, box(3.2, 0.16, 0.28), x, deckY - 0.14, z, BAY_AZIMUTH + Math.PI / 2, false);
      // Piles down to the seabed.
      for (const side of [-1.25, 1.25]) {
        const [px, pz] = at(side, s);
        const bed = Math.min(groundAt(px, pz), OCEAN_LEVEL - 2.4);
        const h = deckY - bed;
        add(woodMat, new THREE.CylinderGeometry(0.13, 0.15, h, 6), px, bed + h / 2, pz, 0, false);
        // Mooring posts above deck at the outer end only.
        if (s > end - 9) {
          add(woodMat, new THREE.CylinderGeometry(0.09, 0.1, 1.0, 6), px, deckY + 0.5, pz, 0, false);
        }
      }
    }
    // A short landing platform at the shore end.
    const [lx, lz] = at(0, start - 1);
    add(woodMat, box(3.4, 0.12, 2.4), lx, deckY, lz, BAY_AZIMUTH + Math.PI / 2);
  }

  // ── 2. PROPS (Phase 21 — every one earns its place) ──────────────────
  // Beach umbrellas: two coral, one teal, one sun-yellow, clustered near the
  // jetty line — the "people were here" story of the bay. The POLES merge
  // into the static wood bucket (they never move); only the canopies stay as
  // individual meshes, because they are the one part that flutters.
  const umbrellaColors = [0xf27d98, 0x17a2ab, 0xf27d98, 0xf2b34c];
  const umbrellas: THREE.Mesh[] = [];
  if (budget.tier !== "low") {
    for (let i = 0; i < 4; i += 1) {
      const along = (i - 1.5) * 9 + rand() * 3;
      const sea = -30 - rand() * 14;
      const [x, z] = at(along, sea);
      if (tooWorn(x, z)) continue;
      const g = groundAt(x, z);
      const tilt = 0.14 + rand() * 0.16;
      const yaw = rand() * Math.PI * 2;
      // Pole (static, merged) — leans with the canopy.
      add(
        woodMat,
        new THREE.CylinderGeometry(0.045, 0.05, 2.6, 6),
        x + Math.sin(yaw) * Math.sin(tilt) * 1.28,
        g + 1.28,
        z + Math.cos(yaw) * Math.sin(tilt) * 1.28,
        0,
        false,
      );
      // Canopy (animated).
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 0.62, 8, 1, true),
        new THREE.MeshStandardMaterial({ color: umbrellaColors[i], roughness: 0.75, side: THREE.DoubleSide }),
      );
      canopy.position.set(
        x + Math.sin(yaw) * Math.sin(tilt) * 2.5,
        g + 2.5,
        z + Math.cos(yaw) * Math.sin(tilt) * 2.5,
      );
      canopy.rotation.y = yaw;
      canopy.rotation.z = Math.sin(yaw) * tilt;
      canopy.rotation.x = Math.cos(yaw) * tilt;
      group.add(canopy);
      umbrellas.push(canopy);
    }
  }
  // Benches in the hamlet, not on the empty bay.
  for (const [x, z] of [[58, -90], [70, -96]] as const) {
    const g = groundAt(x, z);
    const ry = HAMLET_YAW;
    add(woodMat, box(1.8, 0.09, 0.5), x, g + 0.45, z, ry);
    add(woodMat, box(1.8, 0.5, 0.08), x, g + 0.68, z + 0.24, ry, false);
    for (const side of [-0.7, 0.7]) {
      add(woodMat, box(0.09, 0.45, 0.42), x + Math.cos(ry) * side, g + 0.22, z - Math.sin(ry) * side, ry, false);
    }
  }
  // Driftwood sign at the hamlet entrance, and one still at the jetty.
  {
    const [jx, jz] = at(-4, -18);
    const spots: Array<[number, number, number, number]> = [
      [60, -68, 1, HAMLET_YAW],
      [jx, jz, 0, BAY_AZIMUTH + Math.PI / 2],
    ];
    for (const [x, z, text, ry] of spots) {
      const g = groundAt(x, z);
      add(woodMat, new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), x, g + 1.1, z, 0, false);
      const board = box(1.35, 0.5, 0.07);
      board.rotateZ(text ? 0.05 : -0.04);
      add(woodMat, board, x, g + 1.85, z, ry + (text ? 0.5 : 0.2), false);
    }
  }
  // A short fence on the hamlet's near side, so the clearing reads as a place.
  {
    for (let i = 0; i < 8; i += 1) {
      const x = 48 + i * 1.35;
      const z = -76;
      const g = groundAt(x, z);
      add(woodMat, box(0.08, 1.0, 0.08), x, g + 0.5, z, 0, false);
      if (i < 7) {
        add(woodMat, box(1.4, 0.07, 0.05), x + 0.67, g + 0.82, z, HAMLET_YAW, false);
        add(woodMat, box(1.4, 0.07, 0.05), x + 0.67, g + 0.42, z, HAMLET_YAW, false);
      }
    }
  }

  // ── 3. THE MOORED BOAT (original, bobbing on the swell) ──────────────
  // ONE merged mesh with baked vertex colour: teal hull, cream gunwale,
  // wood bench — a rowboat is 1 draw call, not 3.
  const boat = new THREE.Mesh(new THREE.BufferGeometry(), hullMat);
  {
    const hullGeo = new THREE.SphereGeometry(1.35, 12, 8);
    hullGeo.scale(1.15, 0.42, 0.5);
    const innerGeo = box(1.7, 0.34, 0.62);
    innerGeo.translate(0, 0.32, 0);
    const benchGeo = box(0.95, 0.07, 0.6);
    benchGeo.translate(0, 0.5, 0);
    // Paint each part into the shared vertex-colour buffer.
    const paint = (geo: THREE.BufferGeometry, hex: number) => {
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
    const merged = mergeGeometries(
      [paint(hullGeo, 0x2e86a8), paint(innerGeo, 0xb08a58), paint(benchGeo, 0x6a4a2c)],
      false,
    );
    if (merged) boat.geometry.dispose(), (boat.geometry = merged);
    const [bx, bz] = at(6, 34);
    boat.position.set(bx, OCEAN_LEVEL + 0.18, bz);
    boat.rotation.y = BAY_AZIMUTH + Math.PI / 2 + 0.35;
    boat.castShadow = shadows;
    group.add(boat);
  }

  // ── 4. DISTANT ISLANDS (Phase 11/22 — depth beyond the coast) ────────
  //
  // Original silhouette ranges out in the haze: cheap merged cones with a
  // ridged displacement, no shadows, atmosphere-registered so the aerial
  // perspective fades them exactly like the far ridge of the home island.
  // They are what makes the sea read as a SEA (an archipelago), not a lagoon.
  const ISLANDS: Array<{ phi: number; r: number; size: number; h: number }> = [
    { phi: 1.32, r: 2150, size: 190, h: 74 },
    { phi: 0.42, r: 2600, size: 260, h: 96 },
    { phi: 2.05, r: 1950, size: 130, h: 52 },
    { phi: Math.PI - 0.5, r: 2400, size: 300, h: 88 },
  ];
  const islandParts: THREE.BufferGeometry[] = [];
  for (const spec of ISLANDS) {
    const cx = Math.cos(spec.phi) * spec.r;
    const cz = Math.sin(spec.phi) * spec.r;
    const lobes = 3;
    for (let l = 0; l < lobes; l += 1) {
      const off = (l - (lobes - 1) / 2) * spec.size * 0.55;
      const rr = spec.size * (0.4 + rand() * 0.3);
      const hh = spec.h * (0.55 + rand() * 0.5);
      const cone = new THREE.ConeGeometry(rr, hh, 9, 3);
      const pos = cone.attributes.position as THREE.BufferAttribute;
      for (let vi = 0; vi < pos.count; vi += 1) {
        const vx = pos.getX(vi);
        const vy = pos.getY(vi);
        const vz = pos.getZ(vi);
        if (vy > hh * 0.49 - 0.01) continue; // keep the tip
        // Ridged noise on the flanks — same trick the home mountains use.
        const ridge = 1 - Math.abs(noise.noise2D(vx * 0.045 + l * 7.7, vz * 0.045 - l * 3.1));
        const s = 1 + (ridge - 0.5) * 0.34;
        pos.setX(vi, vx * s);
        pos.setZ(vi, vz * s);
      }
      cone.computeVertexNormals();
      cone.translate(cx + Math.sin(spec.phi) * off, hh / 2 - 4, cz - Math.cos(spec.phi) * off);
      islandParts.push(cone);
    }
  }
  if (islandParts.length) {
    const merged = mergeGeometries(islandParts, false);
    if (merged) {
      const islands = new THREE.Mesh(merged, islandMat);
      islands.name = "distant-islands";
      islands.castShadow = false;
      islands.receiveShadow = false;
      group.add(islands);
    }
    islandParts.forEach((g) => g.dispose());
  }

  // ── Flush the buckets: one merged mesh per material ──────────────────
  for (const { mat, list } of parts) {
    if (list.length === 0) continue;
    const merged = mergeGeometries(list, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    list.forEach((g) => g.dispose());
  }
  // The district never moves: freeze the group's matrix too. Only the boat
  // and the umbrella canopies animate, and those are their own meshes with
  // auto matrices — everything else skips the per-frame matrix pass.
  group.matrixAutoUpdate = false;
  group.updateMatrixWorld(true);

  return {
    group,
    update(time) {
      // The boat rides the swell: position + a slow roll. One mesh, one
      // compose — cheaper than a second thought.
      boat.position.y = OCEAN_LEVEL + 0.18 + Math.sin(time * 0.7) * 0.06;
      boat.rotation.z = Math.sin(time * 0.55 + 1.2) * 0.035;
      boat.rotation.x = Math.cos(time * 0.43) * 0.028;
      // Umbrella canopies flutter the tiniest bit — the trade wind is always on.
      for (let i = 0; i < umbrellas.length; i += 1) {
        umbrellas[i].rotation.z = Math.sin(time * 1.3 + i * 2.1) * 0.02;
      }
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose?.();
      });
      group.clear();
    },
  };
}
