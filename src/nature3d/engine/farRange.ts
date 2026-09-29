// src/nature3d/engine/farRange.ts
//
// THE FAR RANGE — a ring of real distant mountains standing on the open sea,
// WAY out beyond the world's edge.
//
// OWNER DIRECTIVE (2026-09-29): "out of the world bhi expand karo jisse …
// dur pahad bhi dikhte hain bahut dur out of the world — to vah aur bhi
// real lagenge."
//
// The island ends at ~1440 m and the sea runs on to 5400 m. Until now
// everything past the fog line was empty haze, so the world read as an
// island floating alone in nothing. This ring plants a RIDGED mountain chain
// on that open sea, far outside the fly limit — blue silhouettes on the
// horizon exactly like the range behind a real coastal town (and like the
// painted peaks in the anime panorama above them).
//
// ── How it stays cheap ─────────────────────────────────────────────────
//
//   * ONE merged geometry, ONE draw call: a radial band (rows × segments)
//     displaced by two octaves of the SAME deterministic simplex the terrain
//     uses, so the range never repeats and never has to be re-generated.
//   * NO gameplay: it sits far past `FLY_LIMIT_RADIUS`, so nothing walks,
//     lands, culled or updated here — the mesh is built once and never
//     touched again. The renderer's own frustum cull handles the rest.
//   * LIT LIKE THE WORLD: a Lambert material registered with the atmosphere
//     pass, so the day/night light, the aerial perspective and the
//     height-weighted smoke hit the range exactly as they hit the island —
//     dawn haze buries it, midday clears it, night silhouettes it against
//     the stars.
//   * VERTEX-COLOURED: slate rock with a noisy snow line baked per vertex.
//     No texture fetch, and the caps catch the moon at night for free.

import * as THREE from "three";
import { noise } from "./simplex";
import type { QualityBudget } from "./quality";
import { OCEAN_LEVEL } from "./terrain";

export interface FarRange {
  group: THREE.Group;
  dispose(): void;
}

/** Angular segments around the ring. 200 ≈ 70–90 m per vertex at ~2500 m. */
const SEGMENTS = 200;
/** Radial rows across the band — enough for a layered, overlapping silhouette. */
const ROWS = 7;

/**
 * Where the band sits, as a fraction of `budget.farPlane`.
 *
 * farPlane is 6200–7800 per tier and the sky dome is 0.48 × that, so 0.36
 * puts the range at ~2230–2810 m — always well inside the dome, always far
 * past the island edge (1440) and the fly limit (1180), and never clipped.
 */
const RADIUS_FRAC = 0.36;
/** The band's half-width, in metres — the range is a chain, not a wall. */
const BAND = 340;
/** Peak heights: the tall crests clear the horizon; the low ridges melt. */
const PEAK_MIN = 130;
const PEAK_MAX = 470;

export function createFarRange(budget: QualityBudget): FarRange {
  const group = new THREE.Group();
  group.name = "far-range";

  const base = budget.farPlane * RADIUS_FRAC;

  // ── The height field ─────────────────────────────────────────────────
  // Ridged simplex on (angle × radius), two octaves + a slow angular mass
  // term — the same recipe the terrain's outer arc wears, so the near hills
  // and the far range read as ONE mountain system at two distances. Angles
  // are fed through sin/cos so the seam at ±π vanishes (the noise is
  // continuous around the ring).
  const heightAt = (ang: number, r: number): number => {
    const cx = Math.cos(ang);
    const sz = Math.sin(ang);
    const mass =
      0.45 +
      0.55 *
        (0.5 + 0.5 * noise.noise2D(cx * 2.6 + 41.2, sz * 2.6 - 9.7));
    const a = noise.noise2D(cx * r * 0.0016 + 71.3, sz * r * 0.0016 - 17.9);
    const b = noise.noise2D(cx * r * 0.0041 - 45.2, sz * r * 0.0041 + 63.8);
    const ridged = (1 - Math.abs(a)) * 0.66 + (1 - Math.abs(b)) * 0.34;
    // Gentle sharpen, like the outer arc: height lands on the crests.
    const h = Math.min(1, Math.pow(ridged * mass, 1.2) * 1.3);
    return PEAK_MIN + h * (PEAK_MAX - PEAK_MIN);
  };

  // ── The mesh ─────────────────────────────────────────────────────────
  const vertCount = SEGMENTS * ROWS;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  const rock = new THREE.Color(0x55688a);
  const rockDeep = new THREE.Color(0x3c4f70);
  const snow = new THREE.Color(0xe8f0fa);
  const tmp = new THREE.Color();

  let v = 0;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const ang = (s / SEGMENTS) * Math.PI * 2;
    const cx = Math.cos(ang);
    const sz = Math.sin(ang);
    for (let r = 0; r < ROWS; r += 1) {
      // Rows run from the band's inner edge to its outer edge; the ridge
      // crests live in the middle of the band so the front ridges overlap
      // the ones behind them (depth without a second mesh). The profile
      // falls to ZERO at both edges of the band, so the chain rises straight
      // out of the sea — a distant island range, seated, never floating.
      const f = r / (ROWS - 1);
      const radius = base + (f - 0.5) * 2 * BAND;
      const crest = Math.max(0, 1 - Math.abs(f - 0.5) * 2);
      const h = heightAt(ang, radius) * crest;
      const x = cx * radius;
      const z = sz * radius;
      positions[v * 3] = x;
      // Sink the base well under the sea surface so no seam with the water.
      positions[v * 3 + 1] = OCEAN_LEVEL - 26 + h;
      positions[v * 3 + 2] = z;

      // Per-vertex paint: darker at the foot of the range, a noisy snow line
      // over the upper third. Jitter breaks the band into ridges and couloirs.
      const snowNoise = 0.5 + 0.5 * noise.noise2D(x * 0.02 + 5.1, z * 0.02 - 3.3);
      const snowLine = 0.52 + snowNoise * 0.24;
      const t = THREE.MathUtils.clamp((h / PEAK_MAX - snowLine) / 0.3, 0, 1);
      tmp.copy(rockDeep).lerp(rock, THREE.MathUtils.clamp(h / PEAK_MAX, 0, 1)).lerp(snow, t * 0.92);
      colors[v * 3] = tmp.r;
      colors[v * 3 + 1] = tmp.g;
      colors[v * 3 + 2] = tmp.b;
      v += 1;
    }
  }
  for (let s = 0; s < SEGMENTS; s += 1) {
    const sNext = (s + 1) % SEGMENTS;
    for (let r = 0; r < ROWS - 1; r += 1) {
      const a = s * ROWS + r;
      const b = sNext * ROWS + r;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    fog: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "far-range-mesh";
  // Beyond the fly limit and behind everything — shadows off, no per-frame
  // work, the renderer's frustum cull is the only thing that ever touches it.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  group.add(mesh);

  return {
    group,
    dispose() {
      group.removeFromParent();
      geo.dispose();
      mat.dispose();
      group.clear();
    },
  };
}
