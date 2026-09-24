// src/nature3d/engine/character/RealisticMale.ts
//
// ONE high-quality realistic male player character, built procedurally.
//
// Why procedural instead of a GLB: the Sanctuary ships offline-first inside
// a Capacitor shell — a multi-megabyte character download with an uncertain
// licence is the wrong trade. So the body is authored here as original
// geometry: athletic adult-male proportions (~1.8 m), a full joint rig with
// Mixamo-conventional bone names, PBR materials (skin / fabric / leather /
// hair / eyes), vertex-baked fabric folds and joint shading, and tactical
// outdoor gear (plate carrier, cargo pants, boots, gloves, pack).
//
// THE SKELETON CONTRACT (for a future GLB swap): joints are Groups named
// exactly Hips, Spine, Spine1, Neck, Head, LeftShoulder, LeftArm,
// LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase (+ Right
// mirrors). A replacement model binds by looking these names up —
// `PlayerRig.joints` — and the animation layer never touches meshes, only
// the joint map. Any humanoid GLB/FBX retargeted to these names drops in.
//
// The model faces local −Z (Sanctuary travel convention). All materials are
// opaque; there is no transparency anywhere on the character.

import * as THREE from "three";
import { CHARACTER_SCALE } from "./CharacterConfig";

/** Bone names of the skeleton contract (Mixamo-conventional). */
export const BONE_NAMES = [
  "Hips",
  "Spine",
  "Spine1",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "LeftToeBase",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
  "RightToeBase",
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

/** Segment lengths in metres (× CHARACTER_SCALE at build). */
export const RIG_SEGMENTS = {
  hipsHeight: 0.98,
  spineLen: 0.14,
  chestLen: 0.2,
  neckLen: 0.09,
  headLen: 0.12,
  shoulderX: 0.21,
  shoulderY: 0.17,
  upperArmLen: 0.3,
  foreArmLen: 0.27,
  handLen: 0.18,
  hipX: 0.105,
  hipDrop: 0.03,
  thighLen: 0.45,
  calfLen: 0.43,
  ankleHeight: 0.1,
  footLen: 0.26,
};

export interface PlayerRig {
  group: THREE.Group;
  joints: Record<BoneName, THREE.Group>;
  /** Every material (for atmosphere/winter registration + disposal). */
  materials: THREE.Material[];
  /** Triangle count (for the debug overlay + budget checks). */
  triangles: number;
  setVisible(v: boolean): void;
  dispose(): void;
}

// ── Palette: tactical-outdoor male ─────────────────────────────────────

const SKIN = new THREE.Color(0xb97f52);
const SKIN_SHADE = new THREE.Color(0x8a5a36);
const SKIN_DEEP = new THREE.Color(0x6e4527);
const SHIRT = new THREE.Color(0x4a5b3f); // ranger green combat shirt
const SHIRT_SHADE = new THREE.Color(0x35422e);
const SLEEVE = new THREE.Color(0x5c6b4c);
const PANTS = new THREE.Color(0x6b6248); // coyote-tan cargo
const PANTS_SHADE = new THREE.Color(0x4c452f);
const VEST = new THREE.Color(0x3d3a2e); // plate carrier
const VEST_SHADE = new THREE.Color(0x2a2921);
const STRAP = new THREE.Color(0x24231d);
const BELT = new THREE.Color(0x1f1e19);
const BOOT = new THREE.Color(0x4a3420); // leather
const BOOT_SHADE = new THREE.Color(0x2e2012);
const SOLE = new THREE.Color(0x171310);
const GLOVE = new THREE.Color(0x2e2c26);
const PACK = new THREE.Color(0x51563c);
const PACK_SHADE = new THREE.Color(0x383c29);
const HAIR = new THREE.Color(0x241811);
const HAIR_HI = new THREE.Color(0x3a2818);
const BROW = new THREE.Color(0x1d130c);
const EYE_WHITE = new THREE.Color(0xe8e4da);
const IRIS = new THREE.Color(0x2b1d12);
const KNEE = new THREE.Color(0x23221d);
const WATCH = new THREE.Color(0x14161a);

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrainTexture(): THREE.DataTexture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd = seededRandom(0xB17A5);
  const coarse = new Float32Array(16 * 16);
  for (let i = 0; i < coarse.length; i += 1) coarse[i] = rnd();
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const cx = (x / S) * 16;
      const cy = (y / S) * 16;
      const x0 = Math.floor(cx) % 16;
      const y0 = Math.floor(cy) % 16;
      const x1 = (x0 + 1) % 16;
      const y1 = (y0 + 1) % 16;
      const fx = cx - Math.floor(cx);
      const fy = cy - Math.floor(cy);
      const smooth =
        coarse[y0 * 16 + x0] * (1 - fx) * (1 - fy) +
        coarse[y0 * 16 + x1] * fx * (1 - fy) +
        coarse[y1 * 16 + x0] * (1 - fx) * fy +
        coarse[y1 * 16 + x1] * fx * fy;
      const v = 228 + Math.round(smooth * 15 + rnd() * 12);
      const o = (y * S + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bake per-vertex colour: clothing bands, fabric-fold stripes, joint
 * shading. `foldFreq` adds sinusoidal fold darkening along the part height
 * (cheap cloth realism that survives every pose, since it rides the mesh).
 */
function paint(
  geo: THREE.BufferGeometry,
  fn: (y01: number, ny: number, nx: number, nz: number, out: THREE.Color) => void,
): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = Math.max(bb.max.y - bb.min.y, 1e-5);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const y01 = (pos.getY(i) - bb.min.y) / span;
    fn(y01, nor ? nor.getY(i) : 1, nor ? nor.getX(i) : 0, nor ? nor.getZ(i) : 0, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Multiply subtle horizontal folds into `out` (mutates in place). */
function folds(y01: number, freq: number, amp: number, out: THREE.Color, shade: THREE.Color): void {
  const f = 0.5 + 0.5 * Math.sin(y01 * Math.PI * freq);
  out.lerp(shade, f * f * amp);
}

export function createRealisticMale(shadows: boolean): PlayerRig {
  const S = RIG_SEGMENTS;
  const group = new THREE.Group();
  group.name = "player-character";

  const body = new THREE.Group();
  body.name = "character-body";
  body.scale.setScalar(CHARACTER_SCALE);
  group.add(body);

  const grain = makeGrainTexture();
  const skinMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grain,
    roughness: 0.58,
    metalness: 0,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grain,
    roughness: 0.94,
    metalness: 0,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grain,
    roughness: 0.62,
    metalness: 0.08,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.1,
  });

  let triangles = 0;
  function part(
    geo: THREE.BufferGeometry,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = clothMat,
    shadow = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadows && shadow;
    m.receiveShadow = false;
    parent.add(m);
    const idx = geo.index;
    triangles += idx ? idx.count / 3 : (geo.attributes.position as THREE.BufferAttribute).count / 3;
    return m;
  }
  function joint(parent: THREE.Object3D, name: BoneName, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  // ── Hips / pelvis: cargo pants + belt ────────────────────────────────
  const hips = joint(body, "Hips", 0, S.hipsHeight, 0);
  {
    const g = new THREE.BoxGeometry(0.32, 0.21, 0.22);
    paint(g, (y01, _ny, _nx, _nz, out) => {
      if (y01 > 0.8) out.copy(BELT);
      else {
        out.copy(PANTS);
        folds(y01, 5, 0.25, out, PANTS_SHADE);
        if (y01 < 0.22) out.lerp(PANTS_SHADE, 0.5);
      }
    });
    part(g, hips, 0, 0, 0);
    // Belt buckle.
    const buckle = new THREE.BoxGeometry(0.07, 0.045, 0.02);
    paint(buckle, (_y, _ny, _nx, _nz, out) => out.copy(STRAP));
    part(buckle, hips, 0, 0.075, -0.115, gearMat);
  }

  // ── Spine: shirt, tucked ─────────────────────────────────────────────
  const spine = joint(hips, "Spine", 0, 0.11, 0);
  {
    const g = new THREE.CapsuleGeometry(0.145, 0.09, 3, 12);
    paint(g, (y01, _ny, _nx, _nz, out) => {
      if (y01 < 0.14) out.copy(BELT);
      else {
        out.copy(SHIRT);
        folds(y01, 6, 0.3, out, SHIRT_SHADE);
      }
    });
    part(g, spine, 0, 0.07, 0);
  }

  // ── Chest: shirt + plate carrier + pack ──────────────────────────────
  const chest = joint(spine, "Spine1", 0, S.spineLen + 0.02, 0);
  {
    const g = new THREE.CapsuleGeometry(0.165, 0.17, 3, 14);
    paint(g, (y01, ny, _nx, _nz, out) => {
      out.copy(SHIRT);
      folds(y01, 7, 0.28, out, SHIRT_SHADE);
      if (y01 > 0.88) out.lerp(SHIRT_SHADE, 0.65); // collar
      if (y01 < 0.2) out.lerp(SHIRT_SHADE, 0.5);
      if (ny < -0.2) out.lerp(SHIRT_SHADE, 0.25);
    });
    part(g, chest, 0, 0.1, 0);
    // Plate carrier front + back (tactical vest).
    const vestF = new THREE.BoxGeometry(0.28, 0.3, 0.07);
    paint(vestF, (y01, _ny, _nx, _nz, out) => {
      out.copy(VEST);
      folds(y01, 4, 0.35, out, VEST_SHADE);
      if (y01 > 0.3 && y01 < 0.7) out.lerp(STRAP, 0.35); // MOLLE rows
    });
    part(vestF, chest, 0, 0.1, -0.15);
    const vestB = new THREE.BoxGeometry(0.28, 0.3, 0.06);
    paint(vestB, (y01, _ny, _nx, _nz, out) => {
      out.copy(VEST);
      folds(y01, 4, 0.3, out, VEST_SHADE);
    });
    part(vestB, chest, 0, 0.1, 0.155);
    // Shoulder straps over the traps.
    for (const sx of [-0.11, 0.11]) {
      const strap = new THREE.BoxGeometry(0.07, 0.05, 0.3);
      paint(strap, (_y, _ny, _nx, _nz, out) => out.copy(STRAP));
      part(strap, chest, sx, 0.26, 0.0, gearMat);
    }
    // Backpack: shell + lid + side pouches.
    const pack = new THREE.BoxGeometry(0.3, 0.38, 0.17);
    paint(pack, (y01, _ny, _nx, _nz, out) => {
      out.copy(PACK).lerp(PACK_SHADE, (1 - y01) * 0.55);
      if (y01 > 0.44 && y01 < 0.56) out.lerp(STRAP, 0.8);
      folds(y01, 5, 0.2, out, PACK_SHADE);
    });
    part(pack, chest, 0, 0.1, 0.27, gearMat);
    const lid = new THREE.BoxGeometry(0.26, 0.09, 0.15);
    paint(lid, (_y, _ny, _nx, _nz, out) => out.copy(PACK_SHADE));
    part(lid, chest, 0, 0.32, 0.27, gearMat);
    for (const sx of [-0.17, 0.17]) {
      const pouch = new THREE.BoxGeometry(0.07, 0.2, 0.12);
      paint(pouch, (y01, _ny, _nx, _nz, out) => {
        out.copy(PACK);
        if (y01 > 0.75) out.lerp(STRAP, 0.7);
      });
      part(pouch, chest, sx, 0.02, 0.27, gearMat);
    }
  }

  // ── Neck + head: face, eyes, hair ────────────────────────────────────
  const neck = joint(chest, "Neck", 0, 0.22, 0);
  {
    const g = new THREE.CapsuleGeometry(0.055, 0.05, 2, 10);
    paint(g, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
    part(g, neck, 0, 0.03, 0, skinMat);
  }
  const head = joint(neck, "Head", 0, S.neckLen, 0);
  {
    // Skull: skin with jaw + brow shading; slightly squared (male).
    const g = new THREE.SphereGeometry(0.118, 20, 16);
    g.scale(0.92, 1.08, 0.98);
    paint(g, (y01, ny, _nx, nz, out) => {
      out.copy(SKIN);
      if (y01 < 0.32) out.lerp(SKIN_SHADE, 0.55 * (1 - y01 / 0.32)); // jaw
      if (y01 > 0.62 && y01 < 0.78 && nz < -0.4) out.lerp(SKIN_DEEP, 0.25); // brow band
      if (ny < -0.3) out.lerp(SKIN_SHADE, 0.3);
    });
    part(g, head, 0, 0.11, -0.005, skinMat);
    // Nose: a small masculine wedge.
    const nose = new THREE.ConeGeometry(0.022, 0.055, 6);
    paint(nose, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
    const noseMesh = part(nose, head, 0, 0.095, -0.115, skinMat, false);
    noseMesh.rotation.x = -Math.PI / 2 + 0.25;
    // Ears.
    for (const sx of [-0.108, 0.108]) {
      const ear = new THREE.SphereGeometry(0.028, 8, 6);
      ear.scale(0.6, 1.1, 0.8);
      paint(ear, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
      part(ear, head, sx, 0.1, 0.005, skinMat, false);
    }
    // Eyes: sclera + iris + catchlight-less pupil (gameplay distance).
    for (const sx of [-0.045, 0.045]) {
      const white = new THREE.SphereGeometry(0.021, 10, 8);
      white.scale(1.15, 0.8, 0.6);
      paint(white, (_y, _ny, _nx, _nz, out) => out.copy(EYE_WHITE));
      part(white, head, sx, 0.125, -0.098, eyeMat, false);
      const iris = new THREE.SphereGeometry(0.0095, 8, 6);
      iris.scale(1, 1, 0.5);
      paint(iris, (_y, _ny, _nx, _nz, out) => out.copy(IRIS));
      part(iris, head, sx, 0.125, -0.109, eyeMat, false);
    }
    // Eyebrows: thick straight bars.
    for (const sx of [-0.045, 0.045]) {
      const brow = new THREE.BoxGeometry(0.045, 0.011, 0.014);
      paint(brow, (_y, _ny, _nx, _nz, out) => out.copy(BROW));
      const browMesh = part(brow, head, sx, 0.155, -0.1, hairMat, false);
      browMesh.rotation.z = sx < 0 ? 0.08 : -0.08;
    }
    // Hair: short textured crop — shell + crown volume + fade sides.
    const shell = new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    shell.scale(0.94, 1.04, 1.0);
    paint(shell, (y01, _ny, _nx, _nz, out) => {
      out.copy(HAIR).lerp(HAIR_HI, 0.35 * Math.sin(y01 * 21) * 0.5 + 0.18);
    });
    const shellMesh = part(shell, head, 0, 0.118, 0.014, hairMat);
    shellMesh.rotation.x = -0.3;
    const crown = new THREE.SphereGeometry(0.085, 12, 8);
    crown.scale(1.0, 0.55, 1.05);
    paint(crown, (y01, _ny, _nx, _nz, out) => {
      out.copy(HAIR_HI).lerp(HAIR, y01 * 0.6);
    });
    part(crown, head, 0, 0.225, 0.01, hairMat);
    // Light stubble jaw (darkens the lower face shell already painted).
    const beard = new THREE.SphereGeometry(0.119, 16, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.2);
    beard.scale(0.92, 1.06, 0.97);
    paint(beard, (_y, _ny, _nx, nz, out) => {
      if (nz < -0.15) out.copy(SKIN_DEEP);
      else out.copy(SKIN).lerp(SKIN_SHADE, 0.4);
    });
    part(beard, head, 0, 0.108, -0.004, skinMat, false);
  }

  // ── Arms ─────────────────────────────────────────────────────────────
  function buildArm(side: -1 | 1): { shoulder: THREE.Group; arm: THREE.Group; foreArm: THREE.Group; hand: THREE.Group } {
    const shoulder = joint(chest, side < 0 ? "LeftShoulder" : "RightShoulder", side * S.shoulderX, S.shoulderY, 0);
    const arm = joint(shoulder, side < 0 ? "LeftArm" : "RightArm", side * 0.02, -0.02, 0);
    {
      // Sleeve with shoulder-cap shading + fold stripes.
      const g = new THREE.CapsuleGeometry(0.062, 0.2, 3, 10);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        out.copy(SLEEVE);
        folds(y01, 6, 0.3, out, SHIRT_SHADE);
        if (y01 > 0.85) out.lerp(SHIRT_SHADE, 0.5);
        if (y01 < 0.18) out.lerp(SHIRT_SHADE, 0.55); // cuff shadow
      });
      part(g, arm, 0, -0.15, 0);
      // Elbow pad.
      const pad = new THREE.SphereGeometry(0.055, 10, 8);
      pad.scale(1, 0.9, 0.9);
      paint(pad, (_y, _ny, _nx, _nz, out) => out.copy(KNEE));
      part(pad, arm, 0, -0.28, 0.035, gearMat);
    }
    const foreArm = joint(arm, side < 0 ? "LeftForeArm" : "RightForeArm", 0, -S.upperArmLen, 0);
    {
      // Rolled sleeve → forearm skin.
      const g = new THREE.CapsuleGeometry(0.05, 0.17, 3, 10);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        if (y01 > 0.62) {
          out.copy(SLEEVE);
          folds(y01, 5, 0.3, out, SHIRT_SHADE);
        } else {
          out.copy(SKIN).lerp(SKIN_SHADE, (0.62 - y01) * 0.5);
        }
      });
      part(g, foreArm, 0, -0.125, 0, skinMat);
      if (side < 0) {
        // Field watch on the left wrist.
        const watch = new THREE.CylinderGeometry(0.052, 0.052, 0.035, 12);
        paint(watch, (_y, _ny, _nx, _nz, out) => out.copy(WATCH));
        part(watch, foreArm, 0, -0.22, 0, gearMat, false);
      }
    }
    const hand = joint(foreArm, side < 0 ? "LeftHand" : "RightHand", 0, -S.foreArmLen, 0);
    {
      // Tactical glove: palm + 4 curled fingers + thumb.
      const palm = new THREE.BoxGeometry(0.075, 0.1, 0.05);
      paint(palm, (y01, _ny, _nx, _nz, out) => {
        out.copy(GLOVE);
        folds(y01, 3, 0.4, out, STRAP);
      });
      part(palm, hand, 0, -0.05, -0.008, gearMat, false);
      for (let f = 0; f < 4; f += 1) {
        const fx = -0.027 + f * 0.018;
        const finger = new THREE.CapsuleGeometry(0.0115, 0.05, 2, 6);
        paint(finger, (_y, _ny, _nx, _nz, out) => out.copy(GLOVE));
        const fm = part(finger, hand, fx, -0.125, -0.014, gearMat, false);
        fm.rotation.x = 0.5; // relaxed curl
      }
      const thumb = new THREE.CapsuleGeometry(0.012, 0.04, 2, 6);
      paint(thumb, (_y, _ny, _nx, _nz, out) => out.copy(GLOVE));
      const tm = part(thumb, hand, side * -0.045, -0.06, -0.012, gearMat, false);
      tm.rotation.z = side * 0.7;
      tm.rotation.x = 0.35;
    }
    return { shoulder, arm, foreArm, hand };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // ── Legs ─────────────────────────────────────────────────────────────
  function buildLeg(side: -1 | 1): { upLeg: THREE.Group; leg: THREE.Group; foot: THREE.Group; toe: THREE.Group } {
    const upLeg = joint(hips, side < 0 ? "LeftUpLeg" : "RightUpLeg", side * S.hipX, -S.hipDrop, 0);
    {
      // Cargo thigh with fold stripes + hip-joint shade.
      const g = new THREE.CapsuleGeometry(0.085, 0.27, 3, 12);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        out.copy(PANTS);
        folds(y01, 7, 0.3, out, PANTS_SHADE);
        if (y01 > 0.82) out.lerp(PANTS_SHADE, 0.5);
      });
      part(g, upLeg, 0, -0.2, 0);
      // Cargo pocket on the outer thigh.
      const pocket = new THREE.BoxGeometry(0.03, 0.13, 0.13);
      paint(pocket, (y01, _ny, _nx, _nz, out) => {
        out.copy(PANTS_SHADE);
        if (y01 > 0.7) out.lerp(STRAP, 0.5);
      });
      part(pocket, upLeg, side * 0.09, -0.22, 0, clothMat, false);
      // Knee pad.
      const pad = new THREE.SphereGeometry(0.075, 10, 8);
      pad.scale(0.95, 1.0, 0.7);
      paint(pad, (_y, _ny, _nx, _nz, out) => out.copy(KNEE));
      part(pad, upLeg, 0, -0.4, -0.045, gearMat);
    }
    const leg = joint(upLeg, side < 0 ? "LeftLeg" : "RightLeg", 0, -S.thighLen, 0);
    {
      // Calf bloused into the boot.
      const g = new THREE.CapsuleGeometry(0.064, 0.26, 3, 10);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        if (y01 < 0.3) out.copy(BOOT).lerp(BOOT_SHADE, (0.3 - y01) * 1.6);
        else {
          out.copy(PANTS);
          folds(y01, 6, 0.32, out, PANTS_SHADE);
        }
      });
      part(g, leg, 0, -0.18, 0);
    }
    const foot = joint(leg, side < 0 ? "LeftFoot" : "RightFoot", 0, -S.calfLen, 0);
    {
      // Leather boot: vamp + sole.
      const boot = new THREE.BoxGeometry(0.11, 0.1, 0.2);
      paint(boot, (y01, _ny, _nx, _nz, out) => {
        if (y01 < 0.2) out.copy(SOLE);
        else out.copy(BOOT).lerp(BOOT_SHADE, (1 - y01) * 0.4);
      });
      part(boot, foot, 0, -0.04, -0.035, gearMat);
      // Lace stay.
      const laces = new THREE.BoxGeometry(0.05, 0.05, 0.1);
      paint(laces, (_y, _ny, _nx, _nz, out) => out.copy(BOOT_SHADE));
      part(laces, foot, 0, -0.005, -0.075, gearMat, false);
    }
    const toe = joint(foot, side < 0 ? "LeftToeBase" : "RightToeBase", 0, -0.075, -0.13);
    {
      // Toe cap + lug sole front.
      const cap = new THREE.BoxGeometry(0.105, 0.065, 0.1);
      paint(cap, (y01, _ny, _nx, _nz, out) => {
        if (y01 < 0.3) out.copy(SOLE);
        else out.copy(BOOT);
      });
      part(cap, toe, 0, -0.01, -0.03, gearMat, false);
    }
    return { upLeg, leg, foot, toe };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  const joints: Record<BoneName, THREE.Group> = {
    Hips: hips,
    Spine: spine,
    Spine1: chest,
    Neck: neck,
    Head: head,
    LeftShoulder: armL.shoulder,
    LeftArm: armL.arm,
    LeftForeArm: armL.foreArm,
    LeftHand: armL.hand,
    RightShoulder: armR.shoulder,
    RightArm: armR.arm,
    RightForeArm: armR.foreArm,
    RightHand: armR.hand,
    LeftUpLeg: legL.upLeg,
    LeftLeg: legL.leg,
    LeftFoot: legL.foot,
    LeftToeBase: legL.toe,
    RightUpLeg: legR.upLeg,
    RightLeg: legR.leg,
    RightFoot: legR.foot,
    RightToeBase: legR.toe,
  };

  // Relaxed A-pose base.
  armL.arm.rotation.z = 0.1;
  armR.arm.rotation.z = -0.1;
  armL.foreArm.rotation.x = 0.18;
  armR.foreArm.rotation.x = 0.18;

  const materials: THREE.Material[] = [skinMat, clothMat, gearMat, hairMat, eyeMat];

  return {
    group,
    joints,
    materials,
    triangles: Math.round(triangles),
    setVisible(v: boolean): void {
      body.visible = v;
    },
    dispose(): void {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      for (const m of materials) m.dispose();
      grain.dispose();
      group.clear();
    },
  };
}
