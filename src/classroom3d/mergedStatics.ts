// src/classroom3d/mergedStatics.ts
//
// One mesh per material instead of dozens (Part 13).
//
// The room's repeated static props — student desks, window frames, ceiling
// lamps, bookshelf books — used to be ~110 individual <mesh> elements, each
// a draw call with the same few materials. They never move, so their
// geometry is merged ONCE (module-level lazy singleton: computed on first
// use, reused for the app's lifetime, never per frame or per mount) with
// baked world transforms, leaving ~11 meshes that look identical.
//
// Animated things (classmates, fan, clock) are deliberately NOT merged:
// merging them would trade cheap scene-graph transforms for per-frame
// matrix composition — slower, not faster.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ROOM } from "./roomGeometry";

/**
 * The wall x-positions are DERIVED from the shared room width, never typed
 * twice: the room was widened to fit the three-board triptych (see
 * roomGeometry.ts) and a hardcoded `5.94` here would have left the windows
 * hanging in mid-air six metres inside the new right wall.
 */
const RIGHT_WALL_X = ROOM.width / 2 - 0.06;
const LEFT_WALL_X = -ROOM.width / 2 + 0.37;

const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BoxGeometry => {
  const geo = new THREE.BoxGeometry(w, h, d);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  matrix.setPosition(x, y, z);
  geo.applyMatrix4(matrix);
  return geo;
};

const cylinder = (
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  x: number,
  y: number,
  z: number,
): THREE.CylinderGeometry => {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geo.translate(x, y, z);
  return geo;
};

/** All student-desk slots except the learner's own (built by DeskConsole). */
export const STUDENT_DESK_POSITIONS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (const z of [2.1, 4.6, 6.9]) {
    for (const x of [-3.1, 0.15, 3.3]) {
      if (Math.abs(x - 0.15) < 0.01 && Math.abs(z - 2.1) < 0.01) continue;
      out.push([x, z]);
    }
  }
  return out;
})();

/** Window bay centres on the right wall (must match Room.tsx). */
export const WINDOW_BAY_Z = [-1.4, 1.6, 4.6];
/** Ceiling lamp centres (must match Room.tsx). */
export const LAMP_POSITIONS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  // Three across instead of two: the room is nearly twice as wide now, and two
  // lamps at ±3 m would leave both ends of the board row unlit. They are still
  // ONE merged emissive mesh, so the extra boxes cost no draw calls.
  for (const z of [-2.4, 1.4, 5.2]) {
    for (const x of [-7, 0, 7]) out.push([x, z]);
  }
  return out;
})();

export interface MergedRoomStatics {
  deskTops: THREE.BufferGeometry;
  deskBodies: THREE.BufferGeometry;
  deskLegs: THREE.BufferGeometry;
  chairParts: THREE.BufferGeometry;
  windowFrames: THREE.BufferGeometry;
  windowGlass: THREE.BufferGeometry;
  windowLedges: THREE.BufferGeometry;
  lampBoxes: THREE.BufferGeometry;
  /** Books merged per shelf colour (5 colours). */
  books: THREE.BufferGeometry[];
}

let cache: MergedRoomStatics | null = null;

/** Merged static room geometry — built once, reused forever. */
export function getMergedRoomStatics(): MergedRoomStatics {
  if (cache) return cache;

  // ── Student desks (8 desks × 8 parts → 4 meshes) ────────────────────────
  const tops: THREE.BufferGeometry[] = [];
  const bodies: THREE.BufferGeometry[] = [];
  const legs: THREE.BufferGeometry[] = [];
  const chairs: THREE.BufferGeometry[] = [];
  for (const [dx, dz] of STUDENT_DESK_POSITIONS) {
    tops.push(box(1.35, 0.05, 0.62, dx, 0.74, dz));
    bodies.push(box(1.3, 0.4, 0.04, dx, 0.52, dz - 0.28));
    for (const [lx, lz] of [[-0.6, -0.26], [0.6, -0.26], [-0.6, 0.26], [0.6, 0.26]] as const) {
      legs.push(cylinder(0.026, 0.026, 0.74, 8, dx + lx, 0.37, dz + lz));
    }
    chairs.push(box(0.46, 0.05, 0.44, dx, 0.45, dz + 0.72));
    chairs.push(box(0.46, 0.5, 0.05, dx, 0.72, dz + 0.92));
  }

  // ── Window bays (3 bays × 7 parts → 3 meshes) ───────────────────────────
  // Bay frame: on the right wall, rotated -90° about Y. Parts are authored in
  // bay-local space, then transformed by the bay matrix.
  const frames: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const ledges: THREE.BufferGeometry[] = [];
  for (const z of WINDOW_BAY_Z) {
    const bay = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    bay.setPosition(RIGHT_WALL_X, 1.85, z);
    const place = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
      geo.applyMatrix4(bay);
      return geo;
    };
    const pane = new THREE.PlaneGeometry(2.5, 1.9);
    glass.push(place(pane));
    frames.push(place(box(2.7, 0.12, 0.1, 0, 0.98, 0.03)));
    frames.push(place(box(2.7, 0.12, 0.1, 0, -0.98, 0.03)));
    for (const px of [-1.28, 0, 1.28]) frames.push(place(box(0.1, 2.05, 0.1, px, 0, 0.03)));
    ledges.push(place(box(2.6, 0.1, 0.34, 0, -1.02, -0.22, -0.12, 0, 0)));
  }

  // ── Ceiling lamps (6 emissive boxes → 1 mesh) ───────────────────────────
  const lamps: THREE.BufferGeometry[] = [];
  for (const [x, z] of LAMP_POSITIONS) lamps.push(box(1.5, 0.08, 0.28, x, 3.4, z));

  // ── Bookshelf books (21 books → 5 meshes, one per colour) ───────────────
  const BOOK_COLORS = ["#c2554a", "#3f7fb5", "#e0a33a", "#4a9070", "#8a5bb8"];
  const bookBins: THREE.BufferGeometry[][] = BOOK_COLORS.map(() => []);
  for (const y of [0.45, 0.95, 1.45]) {
    for (let i = 0; i < 7; i += 1) {
      bookBins[i % 5].push(
        box(0.26, 0.34, 0.07 + (i % 3) * 0.02, LEFT_WALL_X, y, 7.2 - 0.9 + i * 0.28 + (i % 2) * 0.03),
      );
    }
  }

  cache = {
    deskTops: mergeGeometries(tops),
    deskBodies: mergeGeometries(bodies),
    deskLegs: mergeGeometries(legs),
    chairParts: mergeGeometries(chairs),
    windowFrames: mergeGeometries(frames),
    windowGlass: mergeGeometries(glass),
    windowLedges: mergeGeometries(ledges),
    lampBoxes: mergeGeometries(lamps),
    books: bookBins.map((bin) => mergeGeometries(bin)),
  };
  return cache;
}

/** Shelf book colours in bin order (must match the bins above). */
export const BOOK_BIN_COLORS = ["#c2554a", "#3f7fb5", "#e0a33a", "#4a9070", "#8a5bb8"];
