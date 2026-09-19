// src/nature3d/engine/simplex.ts
//
// 2D simplex noise — the actual generator TerrainTrek's terrain is built on.
//
// TerrainTrek (sources/Game/Workers/SimplexNoise.js) vendors Jonas Wagner's
// simplex-noise, which is in turn Stefan Gustavson's reference implementation
// with Peter Eastman's optimisations. MIT licensed. This is a compact 2D-only
// port of that same algorithm.
//
// Why this matters and why an approximation would not do: a sum of sin/cos
// terms is SEPARABLE — its ridges line up with the axes and it repeats on a
// visible lattice, so terrain built from it reads as a rolling egg-box. Real
// simplex noise has no preferred direction and no repeat, which is exactly
// what makes fractal terrain look eroded and natural. The octave stack cannot
// rescue the wrong basis function.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// 12 gradient directions, from the reference implementation.
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

/**
 * Build the permutation table from a numeric seed.
 *
 * A fixed seed gives a fixed world: the herds, the trees, the saved board
 * placement and the terrain all have to agree across reloads and across
 * machines, so nothing here may use Math.random().
 */
function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;

  // Mulberry32 — a small, fast, fully deterministic PRNG.
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher-Yates shuffle.
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  return p;
}

export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);

  constructor(seed = 2026) {
    const p = buildPermutation(seed);
    for (let i = 0; i < 512; i += 1) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /** 2D simplex noise in roughly [-1, 1]. */
  noise2D(x: number, y: number): number {
    const perm = this.perm;
    const permMod12 = this.permMod12;

    // Skew the input space to find which simplex cell we are in.
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    // Which of the two triangles of the cell are we in?
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2);
    }

    // 70 scales the result to very nearly [-1, 1].
    return 70 * (n0 + n1 + n2);
  }
}

/** One shared instance: the world is deterministic and built once. */
export const noise = new SimplexNoise(2026);
