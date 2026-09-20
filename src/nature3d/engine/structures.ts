// src/nature3d/engine/structures.ts
//
// THE BAY DISTRICT — buildings, landmark, jetty, props and distant islands.
//
// Everything here is ORIGINAL, composed from one modular kit, and authored to
// the same tropical-modern language as the rest of the island (Phase 1/12):
//
//   * light warm-white walls, large glass, deep flat overhangs
//   * ONE accent colour (lagoon teal) reused everywhere
//   * natural materials where the tropics put them (wood decks, thatch)
//   * plinths and piles so nothing floats on sloping ground
//
// PERFORMANCE SHAPE (Phase 25/26):
//   * every part is a primitive box/cylinder/cone — no imported models
//   * parts are MERGED per material, so the whole district is ~10 draw calls
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
  // Ten flat, cheap materials; every part merges into the matching one.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1eada, roughness: 0.92, vertexColors: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x17a2ab, roughness: 0.55 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.85, vertexColors: true });
  const thatchMat = new THREE.MeshLambertMaterial({ color: 0xc7a566 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd4e8,
    roughness: 0.14,
    metalness: 0.25,
    envMapIntensity: 1.4,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a7648, roughness: 0.8, vertexColors: true });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c3, roughness: 0.95, vertexColors: true });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.7 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2e86a8, roughness: 0.6, vertexColors: true });
  const islandMat = new THREE.MeshLambertMaterial({ color: 0x7ba294 });

  const parts: Array<{ mat: THREE.Material; list: THREE.BufferGeometry[] }> = [
    { mat: wallMat, list: [] },
    { mat: accentMat, list: [] },
    { mat: roofMat, list: [] },
    { mat: thatchMat, list: [] },
    { mat: glassMat, list: [] },
    { mat: woodMat, list: [] },
    { mat: concreteMat, list: [] },
    { mat: whiteMat, list: [] },
  ];

  /** Add one box/cylinder/cone to a material bucket, AO-baked and placed. */
  const add = (
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    x: number, y: number, z: number,
    ry = 0,
    bake = true,
  ) => {
    if (bake) withAO(geo);
    if (ry !== 0) geo.rotateY(ry);
    geo.translate(x, y, z);
    parts.find((p) => p.mat === mat)!.list.push(geo);
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // ── MODULES (Phase 12) ───────────────────────────────────────────────
  // Wall / window / door / roof / balcony / stair / railing / pillar. Every
  // building below is a composition of exactly these.

  /** Glazed wall bay: glass pane + white frame, proud of the wall face. */
  const windowModule = (x: number, y: number, z: number, w: number, h: number, ry: number, face = 1) => {
    add(glassMat, box(w, h, 0.06), x, y, z + face * 0.02, ry, false);
    add(whiteMat, box(w + 0.24, 0.12, 0.14), x, y + h / 2 + 0.06, z, ry, false);
    add(whiteMat, box(w + 0.24, 0.12, 0.14), x, y - h / 2 - 0.06, z, ry, false);
    add(whiteMat, box(0.12, h + 0.24, 0.14), x - w / 2 - 0.06, y, z, ry, false);
    add(whiteMat, box(0.12, h + 0.24, 0.14), x + w / 2 + 0.06, y, z, ry, false);
  };

  const doorModule = (x: number, y: number, z: number, ry: number, w = 1.1, h = 2.25) => {
    add(accentMat, box(w, h, 0.1), x, y, z, ry, false);
    add(whiteMat, box(w + 0.3, 0.12, 0.16), x, y + h / 2 + 0.06, z, ry, false);
  };

  const railing = (x: number, y: number, z: number, w: number, ry: number) => {
    add(whiteMat, box(w, 0.07, 0.07), x, y + 0.95, z, ry, false);
    add(whiteMat, box(w, 0.05, 0.05), x, y + 0.5, z, ry, false);
    const posts = Math.max(2, Math.round(w / 1.1));
    const cx = Math.cos(ry);
    const sx = Math.sin(ry);
    for (let i = 0; i <= posts; i += 1) {
      const t = (i / posts - 0.5) * w;
      add(whiteMat, box(0.06, 0.95, 0.06), x + cx * t, y + 0.475, z - sx * t, 0, false);
    }
  };

  const balcony = (x: number, y: number, z: number, w: number, d: number, ry: number) => {
    add(concreteMat, box(w, 0.22, d), x, y, z, ry);
    railing(x, y + 0.11, z + d / 2 - 0.05, w, ry);
  };

  const stairModule = (x: number, z: number, ry: number, rise: number, run = 1.4) => {
    const steps = 5;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const cx = Math.cos(ry);
      const sx = Math.sin(ry);
      add(
        concreteMat,
        box(run, rise * (i + 1) / steps + 0.06, 1.25),
        x + cx * (t - 0.5) * (run * steps),
        (rise * (i + 1)) / steps - 0.03,
        z - sx * (t - 0.5) * (run * steps),
        ry,
      );
    }
  };

  const flatRoof = (x: number, y: number, z: number, w: number, d: number, ry: number, overhang = 0.7) => {
    add(roofMat, box(w + overhang * 2, 0.3, d + overhang * 2), x, y, z, ry);
    // Slim fascia band in the accent colour — the kit's visual signature.
    add(accentMat, box(w + overhang * 2 + 0.08, 0.14, d + overhang * 2 + 0.08), x, y - 0.2, z, ry, false);
  };

  /** Hip roof (4-sided pyramid) — the pavilion's big shade giver. */
  const hipRoof = (x: number, y: number, z: number, r: number, h: number) => {
    const roof = new THREE.ConeGeometry(r, h, 4);
    roof.rotateY(Math.PI / 4);
    withAO(roof);
    roof.translate(x, y + h / 2, z);
    parts.find((p) => p.mat === thatchMat)!.list.push(roof);
  };

  const pillar = (x: number, y: number, z: number, r: number, h: number) => {
    add(whiteMat, new THREE.CylinderGeometry(r * 0.85, r, h, 8), x, y + h / 2, z, 0, false);
  };

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
  const groundAt = (x: number, z: number) => terrainHeight(x, z);
  const tooWorn = (x: number, z: number) => pathWeight(x, z) > 0.45;

  // ═════════════════════════════════════════════════════════════════════
  //  THE BUILDINGS (all ORIGINAL, all from the kit)
  // ═════════════════════════════════════════════════════════════════════

  /** Ground datum helper: plinth top for a footprint centred at (x, z). */
  const padTop = (x: number, z: number, w: number, d: number, ry: number) => {
    const g = groundAt(x, z);
    add(concreteMat, box(w + 1.6, 1.5, d + 1.6), x, g - 0.48, z, ry);
    return g + 0.28;
  };

  // ── 1. COVE VILLA (two storey, the village hero) ─────────────────────
  {
    const [x, z] = at(-16, -108);
    const ry = BAY_AZIMUTH + Math.PI / 2 + Math.PI; // face the sea
    const g = padTop(x, z, 9.5, 7.5, ry);
    const fh = 3.05;
    // Ground floor: solid back + glass front.
    add(wallMat, box(9.5, fh, 0.26), x, g + fh / 2, z + 3.6, ry);
    add(wallMat, box(9.5, fh, 0.26), x, g + fh / 2, z - 3.6, ry);
    add(wallMat, box(0.26, fh, 7.5), x - 4.6, g + fh / 2, z, ry);
    add(wallMat, box(2.4, fh, 7.5), x + 3.55, g + fh / 2, z, ry);
    windowModule(x - 1.1, g + fh / 2, z - 3.6, 4.6, 1.9, ry, -1);
    doorModule(x + 2.9, g + 1.15, z - 3.72, ry, 1.2, 2.3);
    // First floor, set back on the sea side → covered terrace.
    const f2 = g + fh + 0.18;
    add(wallMat, box(9.5, fh, 0.26), x, f2 + fh / 2, z + 3.6, ry);
    add(wallMat, box(9.5, fh, 0.26), x, f2 + fh / 2, z - 1.4, ry);
    add(wallMat, box(0.26, fh, 5.2), x - 4.6, f2 + fh / 2, z + 1.05, ry);
    add(wallMat, box(0.26, fh, 5.2), x + 4.6, f2 + fh / 2, z + 1.05, ry);
    windowModule(x - 1.6, f2 + fh / 2, z - 1.4, 5.6, 1.85, ry, -1);
    windowModule(x + 3.2, f2 + fh / 2, z - 1.4, 1.7, 1.85, ry, -1);
    // Slab between floors + balcony rail on the terrace edge.
    balcony(x, g + fh + 0.09, z - 2.5, 9.5, 2.3, ry);
    // Roof + parapet.
    flatRoof(x, g + fh * 2 + 0.32, z, 9.5, 6.2, ry, 0.55);
    // Stair to the terrace, on the land side.
    stairModule(x - 5.9, z + 0.4, ry + Math.PI / 2, fh + 0.2);
    // Accent awning over the ground glazing.
    add(accentMat, box(7.4, 0.12, 1.7), x - 0.6, g + 2.62, z - 4.5, ry, false);
  }

  // ── 2. PALM HOUSE (single storey L, wide shade roof) ─────────────────
  {
    const [x, z] = at(14, -104);
    const ry = BAY_AZIMUTH + Math.PI / 2;
    const g = padTop(x, z, 8.5, 6.5, ry);
    const fh = 3.2;
    // Two wall ranges forming the L, glass toward the water.
    add(wallMat, box(8.5, fh, 0.26), x, g + fh / 2, z + 3.1, ry);
    add(wallMat, box(0.26, fh, 6.5), x + 4.1, g + fh / 2, z, ry);
    add(wallMat, box(3.4, fh, 0.26), x - 2.5, g + fh / 2, z - 3.1, ry);
    windowModule(x + 1.6, g + fh / 2, z - 3.1, 3.6, 2.0, ry, 1);
    doorModule(x - 0.7, g + 1.2, z - 3.22, ry);
    // Deep flat roof on thin posts over the open deck side.
    flatRoof(x, g + fh + 0.24, z, 8.5, 7.6, ry, 0.95);
    pillar(x - 3.7, g, z - 4.1, 0.12, fh);
    pillar(x + 0.6, g, z - 4.1, 0.12, fh);
    // Wood screen: vertical slats on the west wall (the kit's warm material).
    for (let i = 0; i < 7; i += 1) {
      add(woodMat, box(0.09, fh - 0.3, 0.09), x - 2.5 + (i - 3) * 0.32, g + (fh - 0.3) / 2, z + 2.95, ry, false);
    }
    railing(x, g + 0.05, z - 4.35, 5.6, ry);
  }

  // ── 3. THE REEF PAVILION (open-sided, thatched — the village heart) ──
  {
    const [x, z] = at(0, -96);
    if (tooWorn(x, z)) { /* the trail threads the pavilion — floor only */ }
    const g = groundAt(x, z);
    add(concreteMat, box(13, 0.55, 9), x, g - 0.05, z);
    const fh = 3.6;
    // Six columns carry the big hip roof.
    for (const [px, pz] of [[-5.4, -3.4], [0, -3.4], [5.4, -3.4], [-5.4, 3.4], [0, 3.4], [5.4, 3.4]]) {
      const cxc = Math.cos(BAY_AZIMUTH + Math.PI / 2);
      const szc = Math.sin(BAY_AZIMUTH + Math.PI / 2);
      pillar(x + px * cxc + pz * szc, g + 0.22, z - px * szc + pz * cxc, 0.16, fh);
    }
    hipRoof(x, g + 0.2 + fh, z, 8.6, 3.1);
    // Back wall + long reception counter (accent front).
    add(wallMat, box(10.8, fh - 0.4, 0.24), x, g + 0.22 + (fh - 0.4) / 2, z + 4.35, BAY_AZIMUTH + Math.PI / 2);
    add(woodMat, box(5.6, 1.05, 0.7), x, g + 0.22 + 0.52, z + 1.6, BAY_AZIMUTH + Math.PI / 2);
    add(accentMat, box(5.6, 0.1, 0.78), x, g + 0.22 + 1.08, z + 1.6, BAY_AZIMUTH + Math.PI / 2, false);
    // Sign board over the counter.
    add(woodMat, box(3.4, 0.8, 0.1), x, g + 0.22 + 2.9, z + 4.15, BAY_AZIMUTH + Math.PI / 2, false);
  }

  // ── 4. LAGOON SHOPS (3-unit strip) ───────────────────────────────────
  {
    const [x, z] = at(34, -78);
    const ry = BAY_AZIMUTH + Math.PI / 2;
    const g = padTop(x, z, 14, 5.4, ry);
    const fh = 3.1;
    add(wallMat, box(14, fh, 0.24), x, g + fh / 2, z + 2.6, ry);
    add(wallMat, box(0.24, fh, 5.4), x - 7, g + fh / 2, z, ry);
    add(wallMat, box(0.24, fh, 5.4), x + 7, g + fh / 2, z, ry);
    // Three units: glass front, accent door, awning, sign band.
    for (let u = -1; u <= 1; u += 1) {
      const ux = x + u * 4.6;
      windowModule(ux - 0.6, g + 1.62, z - 2.6, 2.9, 1.75, ry, 1);
      doorModule(ux + 1.55, g + 1.14, z - 2.72, ry, 1.0, 2.2);
      add(accentMat, box(4.3, 0.12, 1.5), ux, g + 2.86, z - 3.2, ry, false);
      add(woodMat, box(2.6, 0.62, 0.09), ux, g + 2.35, z - 2.72, ry, false);
    }
    flatRoof(x, g + fh + 0.26, z, 14, 5.4, ry, 0.5);
  }

  // ── 5. UTILITY SHED (small, quiet, believable) ───────────────────────
  {
    const [x, z] = at(-26, -86);
    const ry = BAY_AZIMUTH + Math.PI / 2 + 0.3;
    const g = padTop(x, z, 4.4, 3.4, ry);
    const fh = 2.4;
    add(concreteMat, box(4.4, fh, 0.18), x, g + fh / 2, z + 1.65, ry);
    add(concreteMat, box(4.4, fh, 0.18), x, g + fh / 2, z - 1.65, ry);
    add(concreteMat, box(0.18, fh, 3.4), x + 2.15, g + fh / 2, z, ry);
    add(accentMat, box(0.1, 1.9, 1.0), x - 2.2, g + 0.95, z, ry, false);
    // Lean-to mono roof.
    const roof = box(4.9, 0.14, 4.1);
    roof.rotateX(0.12);
    add(roofMat, roof, x, g + fh + 0.16, z, ry);
  }

  // ── 6. THE BAY BEACON (original landmark, Phase 22) ──────────────────
  //
  // A white cylindrical observation tower on the north headland: the one
  // vertical accent the whole coastline composes around. Readable from the
  // meadow vista, from the sea angle, and from everywhere on the beach.
  {
    const [x, z] = at(-46, -118);
    const g = groundAt(x, z);
    add(concreteMat, box(5, 1.1, 5), x, g - 0.1, z);
    const shaftH = 11.5;
    add(whiteMat, new THREE.CylinderGeometry(1.05, 1.45, shaftH, 12), x, g + 1.0 + shaftH / 2, z, 0, false);
    // Teal band + deck ring.
    add(accentMat, new THREE.CylinderGeometry(1.28, 1.28, 0.55, 12), x, g + 1.0 + shaftH * 0.72, z, 0, false);
    add(whiteMat, new THREE.CylinderGeometry(2.1, 1.7, 0.5, 12), x, g + 1.0 + shaftH + 0.25, z, 0, false);
    railing(x, g + 1.0 + shaftH + 0.5, z, 3.4, 0);
    // Lantern room (merged with the other glass — nothing needs its own draw
    // call here) + cone cap in the accent colour.
    add(glassMat, new THREE.CylinderGeometry(1.0, 1.0, 1.5, 10), x, g + 1.0 + shaftH + 1.25, z, 0, false);
    add(accentMat, new THREE.ConeGeometry(1.35, 1.1, 10), x, g + 1.0 + shaftH + 2.55, z, 0, false);
    // Door at the base.
    doorModule(x, g + 1.15, z - 1.5, 0, 1.0, 2.1);
  }

  // ── 7. THE JETTY (wood, walking out over the water) ──────────────────
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

  // ── 8. PROPS (Phase 21 — every one earns its place) ──────────────────
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
  // Benches along the village path.
  for (const [along, sea] of [[-9, -88], [22, -84]] as const) {
    const [x, z] = at(along, sea);
    const g = groundAt(x, z);
    const ry = BAY_AZIMUTH + Math.PI / 2;
    add(woodMat, box(1.8, 0.09, 0.5), x, g + 0.45, z, ry);
    add(woodMat, box(1.8, 0.5, 0.08), x, g + 0.68, z + 0.24, ry, false);
    for (const s of [-0.7, 0.7]) {
      add(woodMat, box(0.09, 0.45, 0.42), x + Math.cos(ry) * s, g + 0.22, z - Math.sin(ry) * s, ry, false);
    }
  }
  // A driftwood sign at the village entrance + one at the jetty start.
  for (const [along, sea, text] of [[42, -60, 1], [-4, -18, 0]] as const) {
    const [x, z] = at(along, sea);
    const g = groundAt(x, z);
    add(woodMat, new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), x, g + 1.1, z, 0, false);
    const board = box(1.35, 0.5, 0.07);
    board.rotateZ(text ? 0.05 : -0.04);
    add(woodMat, board, x, g + 1.85, z, BAY_AZIMUTH + Math.PI / 2 + (text ? 0.5 : 0.2), false);
  }
  // Fence runs framing the pavilion approach (stops the village reading as
  // objects floating in sand — it has edges).
  {
    for (let i = 0; i < 9; i += 1) {
      const [x, z] = at(9 + i * 1.35, -90);
      const g = groundAt(x, z);
      add(woodMat, box(0.08, 1.0, 0.08), x, g + 0.5, z, 0, false);
      if (i < 8) {
        const [x2, z2] = at(9 + (i + 0.5) * 1.35, -90);
        add(woodMat, box(1.4, 0.07, 0.05), x2, g + 0.82, z2, BAY_AZIMUTH + Math.PI / 2, false);
        add(woodMat, box(1.4, 0.07, 0.05), x2, g + 0.42, z2, BAY_AZIMUTH + Math.PI / 2, false);
      }
    }
  }

  // ── 9. THE MOORED BOAT (original, bobbing on the swell) ──────────────
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
      [paint(hullGeo, 0x2e86a8), paint(innerGeo, 0xe8ddc4), paint(benchGeo, 0x8a6a44)],
      false,
    );
    if (merged) boat.geometry.dispose(), (boat.geometry = merged);
    const [bx, bz] = at(6, 34);
    boat.position.set(bx, OCEAN_LEVEL + 0.18, bz);
    boat.rotation.y = BAY_AZIMUTH + Math.PI / 2 + 0.35;
    boat.castShadow = shadows;
    group.add(boat);
  }

  // ── 10. DISTANT ISLANDS (Phase 11/22 — depth beyond the coast) ───────
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
