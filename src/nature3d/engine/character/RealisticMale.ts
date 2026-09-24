// src/nature3d/engine/character/RealisticMale.ts
//
// ONE high-quality realistic male player character, built procedurally.
//
// Why procedural instead of a GLB: the Sanctuary ships offline-first inside
// a Capacitor shell — a multi-megabyte character download with an uncertain
// licence is the wrong trade. So the body is authored here as original
// geometry in the reference animset's athletic design language (fitted
// heather-grey crew tee, dark navy joggers, white-sole sneakers, short
// faded crop, clean shave): athletic adult-male proportions (~1.8 m), a
// full joint rig with Mixamo-conventional bone names, PBR materials (skin /
// fabric / rubber / hair / eyes) and vertex-baked fabric folds and joint
// shading.
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
  shoulderX: 0.225,
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

// ── Palette: athletic male (animset design language) ───────────────────

const SKIN = new THREE.Color(0xb97f52);
const SKIN_SHADE = new THREE.Color(0x8a5a36);
const SKIN_DEEP = new THREE.Color(0x6e4527);
const TEE = new THREE.Color(0x8a8f94); // heather grey
const TEE_SHADE = new THREE.Color(0x5f6469);
const TEE_DARK = new THREE.Color(0x4a4e53); // collar / cuffs
const JOGGER = new THREE.Color(0x232a38); // dark navy
const JOGGER_SHADE = new THREE.Color(0x151a26);
const STRIPE = new THREE.Color(0xd8dce2); // side stripe / drawstrings
const WAIST = new THREE.Color(0x191e2a); // waistband / ankle cuffs
const SHOE = new THREE.Color(0x9aa0a8); // sneaker upper
const SHOE_SHADE = new THREE.Color(0x6e737b);
const SOLE = new THREE.Color(0xf2f3f5); // white sole / toe cap
const LACE = new THREE.Color(0xe4e7eb);
const HAIR = new THREE.Color(0x1c1410);
const HAIR_HI = new THREE.Color(0x352820);
const BROW = new THREE.Color(0x1d130c);
const EYE_WHITE = new THREE.Color(0xe8e4da);
const IRIS = new THREE.Color(0x3a2417);

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

/** Heather mix: fine two-tone knit for the tee. */
function heather(y01: number, out: THREE.Color): void {
  const h = 0.5 + 0.5 * Math.sin(y01 * 90 + Math.sin(y01 * 31) * 2);
  out.lerp(TEE_SHADE, h * 0.22);
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
    roughness: 0.55,
    metalness: 0.05,
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

  // ── Hips / pelvis: jogger seat + waistband + drawstrings ─────────────
  const hips = joint(body, "Hips", 0, S.hipsHeight, 0);
  {
    const g = new THREE.BoxGeometry(0.3, 0.2, 0.21);
    paint(g, (y01, _ny, _nx, _nz, out) => {
      if (y01 > 0.78) out.copy(WAIST);
      else {
        out.copy(JOGGER);
        folds(y01, 5, 0.25, out, JOGGER_SHADE);
        if (y01 < 0.22) out.lerp(JOGGER_SHADE, 0.5);
      }
    });
    part(g, hips, 0, 0, 0);
    // Drawstring tips.
    for (const sx of [-0.03, 0.03]) {
      const tip = new THREE.BoxGeometry(0.016, 0.07, 0.014);
      paint(tip, (_y, _ny, _nx, _nz, out) => out.copy(STRIPE));
      part(tip, hips, sx, 0.03, -0.108, gearMat, false);
    }
  }

  // ── Spine: tapered waist, tee tucked ──────────────────────────────────
  const spine = joint(hips, "Spine", 0, 0.11, 0);
  {
    const g = new THREE.CapsuleGeometry(0.135, 0.09, 3, 12);
    paint(g, (y01, _ny, _nx, _nz, out) => {
      if (y01 < 0.14) out.copy(WAIST);
      else {
        out.copy(TEE);
        heather(y01, out);
        folds(y01, 6, 0.22, out, TEE_SHADE);
      }
    });
    part(g, spine, 0, 0.07, 0);
  }

  // ── Chest: athletic chest + crew collar ───────────────────────────────
  const chest = joint(spine, "Spine1", 0, S.spineLen + 0.02, 0);
  {
    const g = new THREE.CapsuleGeometry(0.16, 0.17, 3, 14);
    paint(g, (y01, ny, nx, _nz, out) => {
      out.copy(TEE);
      heather(y01, out);
      folds(y01, 7, 0.2, out, TEE_SHADE);
      // Pecs read: a soft shade band across the upper chest.
      if (y01 > 0.52 && y01 < 0.72 && Math.abs(nx) < 0.55) out.lerp(TEE_SHADE, 0.18);
      if (y01 > 0.9) out.lerp(TEE_DARK, 0.6); // collar seat
      if (y01 < 0.18) out.lerp(TEE_SHADE, 0.45);
      if (ny < -0.2) out.lerp(TEE_SHADE, 0.25);
    });
    part(g, chest, 0, 0.1, 0);
    // Ribbed crew collar.
    const collar = new THREE.TorusGeometry(0.068, 0.02, 8, 18);
    paint(collar, (_y, _ny, _nx, _nz, out) => out.copy(TEE_DARK));
    const collarMesh = part(collar, chest, 0, 0.245, 0.005, clothMat, false);
    collarMesh.rotation.x = Math.PI / 2 - 0.12;
  }

  // ── Neck + head: clean-shaven face, faded crop ────────────────────────
  const neck = joint(chest, "Neck", 0, 0.22, 0);
  {
    const g = new THREE.CapsuleGeometry(0.055, 0.05, 2, 10);
    paint(g, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
    part(g, neck, 0, 0.03, 0, skinMat);
  }
  const head = joint(neck, "Head", 0, S.neckLen, 0);
  {
    // Skull: skin with a light jaw shade; slimmer than the tactical build.
    const g = new THREE.SphereGeometry(0.118, 20, 16);
    g.scale(0.94, 1.06, 0.98);
    paint(g, (y01, ny, _nx, nz, out) => {
      out.copy(SKIN);
      if (y01 < 0.3) out.lerp(SKIN_SHADE, 0.4 * (1 - y01 / 0.3)); // jaw
      if (y01 > 0.62 && y01 < 0.78 && nz < -0.4) out.lerp(SKIN_DEEP, 0.22); // brow band
      if (ny < -0.3) out.lerp(SKIN_SHADE, 0.3);
    });
    part(g, head, 0, 0.11, -0.005, skinMat);
    // Nose: small straight bridge.
    const nose = new THREE.ConeGeometry(0.018, 0.045, 6);
    paint(nose, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
    const noseMesh = part(nose, head, 0, 0.098, -0.112, skinMat, false);
    noseMesh.rotation.x = -Math.PI / 2 + 0.25;
    // Mouth: a quiet closed line (reads at conversation distance).
    const mouth = new THREE.BoxGeometry(0.042, 0.008, 0.01);
    paint(mouth, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_DEEP));
    part(mouth, head, 0, 0.062, -0.104, skinMat, false);
    // Ears.
    for (const sx of [-0.108, 0.108]) {
      const ear = new THREE.SphereGeometry(0.028, 8, 6);
      ear.scale(0.6, 1.1, 0.8);
      paint(ear, (_y, _ny, _nx, _nz, out) => out.copy(SKIN_SHADE));
      part(ear, head, sx, 0.1, 0.005, skinMat, false);
    }
    // Eyes: sclera + warm brown iris.
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
    // Eyebrows: neat tapered bars.
    for (const sx of [-0.045, 0.045]) {
      const brow = new THREE.BoxGeometry(0.04, 0.009, 0.012);
      paint(brow, (_y, _ny, _nx, _nz, out) => out.copy(BROW));
      const browMesh = part(brow, head, sx, 0.155, -0.1, hairMat, false);
      browMesh.rotation.z = sx < 0 ? 0.08 : -0.08;
    }
    // Hair: short faded crop — tight shell, flat textured top, clean sides.
    const shell = new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    shell.scale(0.95, 1.0, 1.0);
    paint(shell, (y01, _ny, _nx, _nz, out) => {
      out.copy(HAIR).lerp(HAIR_HI, 0.3 * Math.sin(y01 * 24) * 0.5 + 0.15);
    });
    const shellMesh = part(shell, head, 0, 0.122, 0.016, hairMat);
    shellMesh.rotation.x = -0.22;
    const top = new THREE.SphereGeometry(0.08, 12, 8);
    top.scale(1.0, 0.42, 1.05);
    paint(top, (y01, _ny, _nx, _nz, out) => {
      out.copy(HAIR_HI).lerp(HAIR, y01 * 0.55);
    });
    part(top, head, 0, 0.218, 0.012, hairMat);
  }

  // ── Arms: short sleeves, bare athletic forearms, bare hands ───────────
  function buildArm(side: -1 | 1): { shoulder: THREE.Group; arm: THREE.Group; foreArm: THREE.Group; hand: THREE.Group } {
    const shoulder = joint(chest, side < 0 ? "LeftShoulder" : "RightShoulder", side * S.shoulderX, S.shoulderY, 0);
    const arm = joint(shoulder, side < 0 ? "LeftArm" : "RightArm", side * 0.02, -0.02, 0);
    {
      // Short sleeve over the bicep + bare skin below the cuff.
      const g = new THREE.CapsuleGeometry(0.06, 0.2, 3, 10);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        if (y01 > 0.42) {
          out.copy(TEE);
          heather(y01, out);
          folds(y01, 5, 0.22, out, TEE_SHADE);
          if (y01 > 0.85) out.lerp(TEE_SHADE, 0.45); // shoulder cap
        } else if (y01 > 0.32) {
          out.copy(TEE_DARK); // cuff band
        } else {
          out.copy(SKIN).lerp(SKIN_SHADE, (0.32 - y01) * 0.6);
        }
      });
      part(g, arm, 0, -0.15, 0, skinMat);
    }
    const foreArm = joint(arm, side < 0 ? "LeftForeArm" : "RightForeArm", 0, -S.upperArmLen, 0);
    {
      // Bare forearm with muscle shading.
      const g = new THREE.CapsuleGeometry(0.048, 0.17, 3, 10);
      paint(g, (y01, _ny, _nx, _nz, out) => {
        out.copy(SKIN).lerp(SKIN_SHADE, 0.25 + (0.5 - Math.abs(y01 - 0.5)) * 0.3);
      });
      part(g, foreArm, 0, -0.125, 0, skinMat);
    }
    const hand = joint(foreArm, side < 0 ? "LeftHand" : "RightHand", 0, -S.foreArmLen, 0);
    {
      // Bare hand: palm + 4 relaxed fingers + thumb.
      const palm = new THREE.BoxGeometry(0.07, 0.095, 0.045);
      paint(palm, (y01, _ny, _nx, _nz, out) => {
        out.copy(SKIN).lerp(SKIN_SHADE, y01 * 0.3);
      });
      part(palm, hand, 0, -0.048, -0.006, skinMat, false);
      for (let f = 0; f < 4; f += 1) {
        const fx = -0.025 + f * 0.017;
        const finger = new THREE.CapsuleGeometry(0.0105, 0.048, 2, 6);
        paint(finger, (_y, _ny, _nx, _nz, out) => out.copy(SKIN).lerp(SKIN_SHADE, 0.15));
        const fm = part(finger, hand, fx, -0.12, -0.012, skinMat, false);
        fm.rotation.x = 0.45; // relaxed curl
      }
      const thumb = new THREE.CapsuleGeometry(0.011, 0.038, 2, 6);
      paint(thumb, (_y, _ny, _nx, _nz, out) => out.copy(SKIN));
      const tm = part(thumb, hand, side * -0.042, -0.055, -0.01, skinMat, false);
      tm.rotation.z = side * 0.7;
      tm.rotation.x = 0.35;
    }
    return { shoulder, arm, foreArm, hand };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // ── Legs: navy joggers, side stripe, cuffed ankles, sneakers ──────────
  function buildLeg(side: -1 | 1): { upLeg: THREE.Group; leg: THREE.Group; foot: THREE.Group; toe: THREE.Group } {
    const upLeg = joint(hips, side < 0 ? "LeftUpLeg" : "RightUpLeg", side * S.hipX, -S.hipDrop, 0);
    {
      // Athletic thigh + light side stripe down the outer seam.
      const g = new THREE.CapsuleGeometry(0.088, 0.27, 3, 12);
      paint(g, (y01, _ny, nx, _nz, out) => {
        const outer = side < 0 ? nx < -0.72 : nx > 0.72;
        if (outer && y01 > 0.12 && y01 < 0.9) out.copy(STRIPE);
        else {
          out.copy(JOGGER);
          folds(y01, 7, 0.28, out, JOGGER_SHADE);
          if (y01 > 0.85) out.lerp(JOGGER_SHADE, 0.5); // hip shade
          if (y01 < 0.16) out.lerp(JOGGER_SHADE, 0.55); // knee seat
        }
      });
      part(g, upLeg, 0, -0.2, 0);
    }
    const leg = joint(upLeg, side < 0 ? "LeftLeg" : "RightLeg", 0, -S.thighLen, 0);
    {
      // Tapered calf + ankle cuff.
      const g = new THREE.CapsuleGeometry(0.058, 0.26, 3, 10);
      paint(g, (y01, _ny, nx, _nz, out) => {
        const outer = side < 0 ? nx < -0.7 : nx > 0.7;
        if (y01 < 0.16) out.copy(WAIST); // ankle cuff
        else if (outer && y01 < 0.9) out.copy(STRIPE);
        else {
          out.copy(JOGGER);
          folds(y01, 6, 0.3, out, JOGGER_SHADE);
        }
      });
      part(g, leg, 0, -0.18, 0);
    }
    const foot = joint(leg, side < 0 ? "LeftFoot" : "RightFoot", 0, -S.calfLen, 0);
    {
      // Sneaker: white midsole + grey upper + lace strip.
      const sole = new THREE.BoxGeometry(0.11, 0.035, 0.24);
      paint(sole, (_y, _ny, _nx, _nz, out) => out.copy(SOLE));
      part(sole, foot, 0, -0.075, -0.045, gearMat, false);
      const upper = new THREE.BoxGeometry(0.105, 0.07, 0.19);
      paint(upper, (y01, _ny, _nx, _nz, out) => {
        out.copy(SHOE).lerp(SHOE_SHADE, (1 - y01) * 0.5);
      });
      part(upper, foot, 0, -0.028, -0.035, gearMat);
      const laces = new THREE.BoxGeometry(0.05, 0.018, 0.1);
      paint(laces, (_y, _ny, _nx, _nz, out) => out.copy(LACE));
      part(laces, foot, 0, 0.012, -0.06, gearMat, false);
      const heel = new THREE.BoxGeometry(0.05, 0.05, 0.02);
      paint(heel, (_y, _ny, _nx, _nz, out) => out.copy(SHOE_SHADE));
      part(heel, foot, 0, 0.0, 0.062, gearMat, false);
    }
    const toe = joint(foot, side < 0 ? "LeftToeBase" : "RightToeBase", 0, -0.075, -0.13);
    {
      // Toe cap + front sole.
      const cap = new THREE.BoxGeometry(0.105, 0.05, 0.09);
      paint(cap, (y01, _ny, _nx, _nz, out) => {
        if (y01 < 0.35) out.copy(SOLE);
        else out.copy(SHOE);
      });
      part(cap, toe, 0, -0.012, -0.03, gearMat, false);
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
