// src/nature3d/engine/chunking.ts
//
// CHUNKED GPU INSTANCING — one reusable builder, used by every scattered
// field in the sanctuary.
//
// ── The problem this solves ───────────────────────────────────────────────
//
// `THREE.InstancedMesh` is the right tool for a field of thousands of
// identical things: one geometry, one material, ONE draw call. But it has a
// cost that is invisible until you profile — an InstancedMesh is culled as a
// SINGLE object, using ONE bounding sphere. Give it 17 000 blades scattered
// across a 340 m meadow and that sphere encloses the whole meadow, so it
// intersects the camera frustum from every possible angle and three.js can
// never reject it.
//
// The result is that instancing quietly defeats frustum culling: the CPU saves
// 16 999 draw calls and the GPU still runs 17 000 blades through the vertex
// shader every frame, including the ~2/3 of them behind the camera. This was
// measured in the open, on exactly this class of scene — the VR Me Up devlog
// found instanced rendering *slower* than per-object meshes on a Quest 2 for
// this reason, and the Codrops grass write-up states the rule plainly:
//
//   "The number of draw calls is not the only factor that determines
//    performance. I had to reduce the poly count in the scene at the expense
//    of a few additional draw calls."
//
// ── The fix ───────────────────────────────────────────────────────────────
//
// Split the field into a GRID OF CELLS and give each occupied cell its own
// InstancedMesh with a TIGHT bounding sphere derived from the instances it
// actually holds. Now three.js' automatic per-object frustum test does the
// work for free on the CPU, and the GPU never sees a cell behind the camera.
//
// The trade is deliberate and worth it: instead of 1 draw call that always
// runs, you get ~10–20 draw calls that mostly don't. Draw calls are the cheap
// resource here; vertex throughput is the expensive one.
//
// ── Why one shared module ─────────────────────────────────────────────────
//
// Every field in this engine (grass rings, hill sward, rocks, rock decals,
// canopy leaves, fronds, impostors, sorrel, grass tufts, moss, tropical flora)
// had independently reinvented "one InstancedMesh for everything", and several
// had gone further and set `frustumCulled = false` outright, reasoning that
// "the instances span the whole meadow" — true, and exactly the thing the grid
// fixes. One builder means the bounds maths, the instanceColor allocation and
// the shed ladder are written once and cannot drift between fields.

import * as THREE from "three";

/** One instance, in the form the builder consumes. */
export interface PlacedInstance {
  /** Object-to-world transform. Read, never retained. */
  matrix: THREE.Matrix4;
  /** World position, used only to choose a cell and measure the bounds. */
  x: number;
  y: number;
  z: number;
  /** Optional per-instance tint. Omit to leave the instance white. */
  r?: number;
  g?: number;
  b?: number;
}

export interface ChunkBuilderOptions {
  geometry: THREE.BufferGeometry;
  /**
   * Shared by EVERY cell mesh on purpose. Distinct materials would each compile
   * their own program, and program switches are a pipeline flush on a tile GPU
   * — the whole point is to trade draw calls, not shader state.
   */
  material: THREE.Material | THREE.Material[];
  /** World-space edge of one cell, in metres. */
  cellSize: number;
  /**
   * Bounds padding in metres. An instance's ORIGIN is a point, but what it
   * draws is not: a grass card can be ~18 m tall at the island rim and the
   * wind shader displaces vertices on top of that. Under-sizing this culls
   * geometry that is still on screen, which reads as grass popping out at the
   * screen edge — a much worse bug than a slightly generous sphere.
   */
  pad?: number;
  /** Prefix for the cell meshes' names, for debugging in the inspector. */
  name?: string;
  /**
   * Whether cell meshes receive shadows. Off by default — for foliage the
   * shadow cost is pure loss and the baked AO gradient sells the contact —
   * but a field sitting on shadowed ground can opt back in.
   */
  receiveShadow?: boolean;
  /**
   * Upper bound on instances, when known. Lets the scratch buffers be sized
   * exactly; when omitted they grow on demand.
   */
  capacity?: number;
}

/** A finished chunked field. */
export interface ChunkedField {
  /** One InstancedMesh per OCCUPIED cell. Add these to a Group. */
  meshes: THREE.InstancedMesh[];
  /** Total instances placed across all cells. */
  count: number;
  /**
   * Each cell's full instance count, parallel to `meshes`. Kept so the thermal
   * shed ladder can trim every cell by the same proportion — thinning evenly,
   * instead of emptying whole compass directions one cell at a time.
   */
  fullCounts: number[];
  /**
   * World XZ centre of each cell, parallel to `meshes` (interleaved x,z).
   * Stored at build time so streaming never has to recompute bounds.
   */
  centres: Float32Array;
  /**
   * Trim every cell to a fraction of its full count. Allocation-free: the
   * instance buffers stay put, the GPU simply draws fewer.
   */
  setShed(fraction: number): void;
  /**
   * WORLD STREAMING — the "load only the grids around you" half of spatial
   * partitioning. Hides every cell further than `radius` metres from (x, z).
   *
   * This is strictly cheaper than frustum culling, not a substitute for it:
   * three.js tests `object.visible` FIRST in `projectObject`, so an invisible
   * cell is skipped before its bounding sphere is ever built or tested, and
   * the whole subtree is walked past. Frustum culling then handles whatever
   * streaming leaves resident.
   *
   * It is also what stops map SIZE from mattering. Frustum culling alone still
   * submits everything inside the view cone out to the far edge of the field —
   * for a 2.3 km sward that is most of it. Streaming caps resident work at a
   * fixed radius regardless of how large the world is, which is exactly the
   * property that lets an 8 km map cost the same as a 1 km one.
   *
   * Cheap to call every frame; there is no allocation and no GPU upload, only
   * a boolean flip on the cells that crossed the boundary.
   */
  stream(x: number, z: number, radius: number): void;
  /** Undo streaming: make every cell visible again. */
  streamAll(): void;
  /** Mark every instance buffer dirty after an in-place matrix edit. */
  touch(): void;
  dispose(): void;
}

export interface ChunkBuilder {
  push(instance: PlacedInstance): void;
  /** Convenience wrapper: decompose-free path for the common case. */
  pushMatrix(
    matrix: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    color?: THREE.Color,
  ): void;
  build(): ChunkedField;
  readonly placed: number;
}

const DEFAULT_PAD = 2;

/**
 * Create a builder. Push every instance, then call `build()` once — the cells
 * are not known until the scatter is finished, so meshes cannot be allocated
 * as instances arrive.
 */
export function createChunkBuilder(opts: ChunkBuilderOptions): ChunkBuilder {
  const pad = opts.pad ?? DEFAULT_PAD;
  const cell = Math.max(1, opts.cellSize);

  let capacity = Math.max(16, opts.capacity ?? 0);
  let mat = new Float32Array(capacity * 16);
  let col = new Float32Array(capacity * 3);
  let px = new Float32Array(capacity);
  let py = new Float32Array(capacity);
  let pz = new Float32Array(capacity);
  let placed = 0;

  const grow = (): void => {
    capacity *= 2;
    const nextMat = new Float32Array(capacity * 16);
    nextMat.set(mat.subarray(0, placed * 16));
    mat = nextMat;
    const nextCol = new Float32Array(capacity * 3);
    nextCol.set(col.subarray(0, placed * 3));
    col = nextCol;
    const nx = new Float32Array(capacity);
    nx.set(px.subarray(0, placed));
    px = nx;
    const ny = new Float32Array(capacity);
    ny.set(py.subarray(0, placed));
    py = ny;
    const nz = new Float32Array(capacity);
    nz.set(pz.subarray(0, placed));
    pz = nz;
  };

  return {
    get placed(): number {
      return placed;
    },

    pushMatrix(matrix, x, y, z, color) {
      if (placed >= capacity) grow();
      mat.set(matrix.elements, placed * 16);
      const o3 = placed * 3;
      // Default to white so an un-tinted field still reads correctly; three.js
      // multiplies instanceColor into the diffuse, so 1,1,1 is a no-op.
      col[o3] = color ? color.r : 1;
      col[o3 + 1] = color ? color.g : 1;
      col[o3 + 2] = color ? color.b : 1;
      px[placed] = x;
      py[placed] = y;
      pz[placed] = z;
      placed += 1;
    },

    push(inst) {
      this.pushMatrix(inst.matrix, inst.x, inst.y, inst.z, undefined);
      if (inst.r !== undefined) {
        const o3 = (placed - 1) * 3;
        col[o3] = inst.r;
        col[o3 + 1] = inst.g ?? 1;
        col[o3 + 2] = inst.b ?? 1;
      }
    },

    build(): ChunkedField {
      const meshes: THREE.InstancedMesh[] = [];
      const fullCounts: number[] = [];

      if (placed === 0) {
        return {
          meshes,
          count: 0,
          fullCounts,
          centres: new Float32Array(0),
          setShed() {},
          stream() {},
          streamAll() {},
          touch() {},
          dispose() {},
        };
      }

      // ── Bucket by grid cell ────────────────────────────────────────────
      // A Map keyed on a packed integer, not a 2-D array: the fields are
      // sparse (a meadow cell grid over a 340 m disc is mostly empty at the
      // corners) and their origin is not (0,0)-aligned, so indices go negative.
      const keyOf = (x: number, z: number): number => {
        const gx = Math.floor(x / cell);
        const gz = Math.floor(z / cell);
        // 2^15 bias keeps both halves positive for any world this engine has.
        return (gx + 32768) * 65536 + (gz + 32768);
      };

      const perCell = new Map<number, number>();
      const cellKey = new Int32Array(placed);
      const keys: number[] = [];

      for (let i = 0; i < placed; i += 1) {
        const k = keyOf(px[i], pz[i]);
        cellKey[i] = k;
        const seen = perCell.get(k);
        if (seen === undefined) {
          perCell.set(k, 1);
          keys.push(k);
        } else {
          perCell.set(k, seen + 1);
        }
      }

      const box = new THREE.Box3();
      const sphere = new THREE.Sphere();
      const point = new THREE.Vector3();
      const centreList: number[] = [];

      for (const key of keys) {
        const n = perCell.get(key) as number;
        const mesh = new THREE.InstancedMesh(opts.geometry, opts.material, n);
        // The whole point: cull per cell, with bounds that mean something.
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = opts.receiveShadow === true;
        mesh.name = `${opts.name ?? "chunk"}-${meshes.length}`;

        // `InstancedMesh.instanceColor` is NULL until the first `setColorAt`
        // call. Writing the buffer directly would leave it null and render the
        // field untinted, so allocate it white-filled exactly as three.js does.
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(n * 3).fill(1),
          3,
        );

        box.makeEmpty();
        let w = 0;
        let sumX = 0;
        let sumZ = 0;
        for (let i = 0; i < placed; i += 1) {
          if (cellKey[i] !== key) continue;
          sumX += px[i];
          sumZ += pz[i];
          mesh.instanceMatrix.array.set(mat.subarray(i * 16, i * 16 + 16), w * 16);
          mesh.instanceColor.array.set(col.subarray(i * 3, i * 3 + 3), w * 3);
          box.expandByPoint(point.set(px[i], py[i], pz[i]));
          w += 1;
        }

        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.instanceColor.needsUpdate = true;

        box.expandByScalar(pad);
        box.getBoundingSphere(sphere);
        mesh.boundingSphere = sphere.clone();
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;

        meshes.push(mesh);
        fullCounts.push(n);
        centreList.push(sumX / n, sumZ / n);
      }

      const total = placed;
      const centres = new Float32Array(centreList);
      const radius2 = { value: Infinity };

      return {
        meshes,
        count: total,
        fullCounts,
        centres,
        stream(x, z, radius) {
          const r2 = radius * radius;
          radius2.value = r2;
          for (let i = 0; i < meshes.length; i += 1) {
            const dx = centres[i * 2] - x;
            const dz = centres[i * 2 + 1] - z;
            // Half a cell of slack so a cell straddling the boundary does not
            // blink in and out as the camera drifts a metre or two.
            const slack = cell * 0.5;
            const want = dx * dx + dz * dz <= (radius + slack) * (radius + slack);
            if (meshes[i].visible !== want) meshes[i].visible = want;
          }
        },
        streamAll() {
          radius2.value = Infinity;
          for (const mesh of meshes) mesh.visible = true;
        },
        setShed(fraction) {
          const k = Math.max(0, Math.min(1, fraction));
          for (let i = 0; i < meshes.length; i += 1) {
            meshes[i].count = Math.floor(fullCounts[i] * k);
          }
        },
        touch() {
          for (const mesh of meshes) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }
        },
        dispose() {
          for (const mesh of meshes) mesh.dispose();
          meshes.length = 0;
          fullCounts.length = 0;
        },
      };
    },
  };
}

/**
 * Pick a cell size for a radial field of the given outer radius, targeting
 * roughly `target` cells across the diameter.
 *
 * Too small and the cell count (and with it the draw-call count) explodes;
 * too large and culling gets coarse enough to be worthless. Empirically a
 * 60° field of view spanning ~3 cells across culls around 60–70% of a
 * uniformly scattered field, which is the sweet spot.
 */
export function cellSizeForRadius(outerRadius: number, target = 6): number {
  return Math.max(8, (outerRadius * 2) / Math.max(2, target));
}
