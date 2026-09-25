// src/nature3d/engine/board.ts
//
// THE STUDY BOARD — landscape (16:9), hyper-legible, and fully placeable.
//
// Two things live here:
//
//   1. `createBoard()` — the granite plinth, the concealed rear chassis and
//      the glass board itself. The board is drawn into a 2048×1152 canvas
//      (true 16:9 landscape, as requested) with a high-contrast frosted
//      backdrop so every word stays readable from any camera angle.
//
//   2. `BoardController` — ONE-FINGER placement. Grab the board anywhere and
//      drag: it slides on a plane parallel to the screen, so it follows the
//      finger 1:1 with no gesture modes to learn. Pinch (or wheel, or the
//      depth slider) pushes it away / pulls it closer. It can be lifted and
//      lowered freely, and two hard constraints are enforced every frame:
//
//        • the bottom edge can never sink below the ground (terrain sampled
//          under the board's four corners, so a slope cannot swallow it);
//        • it can never be pushed so far, so close or so far off-axis that it
//          leaves the view — the depth and lateral ranges are clamped.
//
//      The whole interaction is pointer-events based (mouse + touch + pen,
//      one code path) and is entirely allocation-free during a drag.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { terrainHeight } from "./terrain";

/** Board size in world units — 16:9 landscape. */
export const BOARD_WIDTH = 4.8;
export const BOARD_HEIGHT = 2.7;
const BOARD_THICKNESS = 0.09;

export interface BoardHandle {
  group: THREE.Group;
  /** The clickable glass panel (raycast target). */
  panel: THREE.Mesh;
  /** The stone + chassis, hidden while the board is being carried. */
  plinth: THREE.Group;
  texture: THREE.CanvasTexture;
  dispose(): void;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paint the lesson board. 2048×1152 = 16:9, mipmapped, anisotropic. */
export function createBoardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1152;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Frosted deep-blue glass backdrop — opaque enough that text never washes
  // out against a bright sky or a dark treeline.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(13,44,96,0.95)");
  grad.addColorStop(0.45, "rgba(20,66,134,0.93)");
  grad.addColorStop(1, "rgba(9,34,76,0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Specular perimeter
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 12;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = "rgba(147,197,253,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  // Dot matrix
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  for (let x = 60; x < W - 40; x += 42) {
    for (let y = 60; y < H - 40; y += 42) {
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 16;
  ctx.font = "bold 82px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Morning Nature Study", 96, 190);
  ctx.shadowBlur = 8;
  ctx.font = "700 40px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "#ffd166";
  ctx.fillText("Alpine Meadow Biome · Sunlight, Photosynthesis & Grazing Ecology", 98, 252);
  ctx.shadowBlur = 0;

  // "Instructions" pill, top-right of the landscape canvas
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 4;
  roundRect(ctx, W - 470, 120, 370, 80, 40);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Instructions", W - 285, 172);
  ctx.textAlign = "left";

  // Two-column lesson outline — landscape gives us the room for it.
  const lessons = [
    "01 · Solar energy absorption & leaf chlorophyll",
    "02 · Stomatal gas exchange in cool morning air",
    "03 · Dew formation and meadow humidity",
    "04 · Grazing herds and nutrient cycling",
    "05 · Birdsong as a territorial signal",
    "06 · Riverbank erosion and sediment fans",
  ];
  ctx.font = "600 38px -apple-system, Segoe UI, Roboto, sans-serif";
  lessons.forEach((line, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 110 + col * 960;
    const y = 400 + row * 108;
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    roundRect(ctx, x - 26, y - 52, 900, 78, 20);
    ctx.fill();
    ctx.fillStyle = "rgba(147,214,255,0.95)";
    ctx.fillRect(x - 12, y - 40, 7, 52);
    ctx.fillStyle = "#eef6ff";
    ctx.fillText(line, x + 16, y);
  });

  // Stat strip along the bottom
  const stats: Array<[string, string]> = [
    ["Sunrise", "05:42"],
    ["Air", "18°C"],
    ["Humidity", "72%"],
    ["Wind", "6 km/h"],
    ["Species seen", "14"],
  ];
  stats.forEach(([label, value], i) => {
    const x = 110 + i * 372;
    const y = H - 230;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, x, y, 330, 150, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(186,220,255,0.86)";
    ctx.font = "600 30px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(label.toUpperCase(), x + 26, y + 54);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(value, x + 26, y + 116);
  });

  // Corner sparkles
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  for (const [sx, sy, r] of [[1900, 320, 16], [120, 980, 13], [1960, 960, 11]] as const) {
    ctx.beginPath();
    ctx.moveTo(sx - r, sy);
    ctx.lineTo(sx + r, sy);
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx, sy + r);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBoard(budget: QualityBudget): BoardHandle {
  const group = new THREE.Group();
  group.name = "study-board";

  const texture = createBoardTexture();
  const geo = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_THICKNESS);

  // Only the front face carries the lesson texture; the rim is dark glass.
  const rim = new THREE.MeshStandardMaterial({ color: 0x14243c, roughness: 0.3, metalness: 0.5, fog: true });
  const face = budget.richBoardMaterial
    ? new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.12,
        metalness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        reflectivity: 0.85,
        transmission: 0.14,
        thickness: 0.2,
        transparent: true,
        opacity: 0.985,
        fog: true,
      })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.28, metalness: 0.05, fog: true });

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z → index 4 is the front.
  const panel = new THREE.Mesh(geo, [rim, rim, rim, rim, face, rim]);
  panel.castShadow = budget.shadowMapSize > 0;
  panel.name = "board-panel";
  group.add(panel);

  // Glowing edge outline
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.85 }),
  );
  panel.add(edges);

  // ── Resize grips ─────────────────────────────────────────────────────
  // Eight small pucks on the edges and corners. They are pure affordance —
  // the hit-test is done against the panel UV, not against these — but
  // without them nobody discovers that the board can be stretched.
  const gripMat = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.72, fog: true });
  const gripGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const hw = BOARD_WIDTH * 0.5;
  const hh = BOARD_HEIGHT * 0.5;
  for (const [gx, gy] of [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const) {
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(gx * hw, gy * hh, BOARD_THICKNESS * 0.5 + 0.01);
    grip.name = "board-grip";
    panel.add(grip);
  }

  // ── No plinth ────────────────────────────────────────────────────────
  //
  // There used to be a granite monolith with a black steel mast and backplate
  // bolted to it. Because the board itself is free-floating and placeable, the
  // moment you dragged the board away the chassis stayed behind — a black slab
  // standing in the meadow with nothing on it. The board is the only board now:
  // it hovers where you put it and nothing is left behind.
  //
  // `plinth` is kept as an empty group so the rest of the engine (visibility
  // toggles, disposal) needs no special-casing.
  const plinth = new THREE.Group();
  plinth.name = "board-plinth";
  plinth.visible = false;

  return {
    group,
    panel,
    plinth,
    texture,
    dispose() {
      geo.dispose();
      texture.dispose();
      rim.dispose();
      face.dispose();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Where the board stands
// ─────────────────────────────────────────────────────────────────────────

/**
 * The board's fixed home: on the hill crest ahead-left of the chair.
 *
 * Every number here was measured against the real terrain and the real
 * lectern rather than eyeballed, because three constraints have to hold at
 * once and they nearly conflict:
 *
 *   1. It must not hide behind a study board. From the chair the three 30 m
 *      boards occupy -41.3 deg .. +41.3 deg of azimuth, in one continuous fan
 *      (mindmap -41.3..-30.7, reading -30.0..+30.0, notes +30.7..+41.3).
 *      Anything inside that is invisible from the seat. -45 deg is the first
 *      clear bearing, and it happens to be the highest ground available
 *      outside the fan.
 *   2. It must be ABOVE the boards in the picture, not beside them. The crest
 *      at that bearing is 380 m out and 38.3 m high — about 5.5 deg above eye
 *      level, where the study boards top out at roughly 3.8 deg. So it reads
 *      as "on the mountain behind", which is what was asked for.
 *   3. It must still be readable. At 380 m the default 4.8 m board subtends
 *      0.72 deg — far too small. Scaled 8x it spans 38 m and subtends 5.7 deg,
 *      comparable to a study board seen from the desk, and the texture is
 *      2048 px wide so it stays sharp.
 */
export const BOARD_HILL = {
  position: new THREE.Vector3(-268.7, 38.3 + 15.5, -266.1),
  /** Yaw so the face turns back towards the chair at the origin. */
  yaw: Math.atan2(-268.7 - 0, -266.1 - 2.6) + Math.PI,
  scale: 8,
} as const;

/**
 * Two posts and a cross-brace holding the board up on the hillside, so it
 * reads as a planted signboard rather than something floating in the air.
 * Built from the board's own scaled footprint and sunk into the slope.
 */
export function createBoardStand(
  hill: { position: THREE.Vector3; yaw: number; scale: number },
  shadows: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "board-stand";
  group.position.copy(hill.position);
  group.rotation.y = hill.yaw;

  const halfW = BOARD_WIDTH * hill.scale * 0.5;
  const halfH = BOARD_HEIGHT * hill.scale * 0.5;
  // Reach from the board's bottom edge down to the ground beneath it, plus a
  // little extra so the feet are buried rather than resting on the surface.
  const groundY = terrainHeight(hill.position.x, hill.position.z);
  const legLength = hill.position.y - halfH - groundY + 3;

  const mat = new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.72, metalness: 0.3, fog: true });
  const legGeo = new THREE.CylinderGeometry(0.62, 0.92, legLength, 10);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(sx * halfW * 0.62, -halfH - legLength * 0.5 + 0.4, 0);
    leg.castShadow = shadows;
    group.add(leg);
  }

  const braceGeo = new THREE.BoxGeometry(halfW * 1.3, 0.7, 0.7);
  const brace = new THREE.Mesh(braceGeo, mat);
  brace.position.set(0, -halfH - legLength * 0.42, 0);
  brace.castShadow = shadows;
  group.add(brace);

  group.userData.dispose = () => {
    legGeo.dispose();
    braceGeo.dispose();
    mat.dispose();
  };
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
//  No placement controller
// ─────────────────────────────────────────────────────────────────────────
//
// There used to be ~470 lines here: BoardController (pointer drag, edge/corner
// resize, pinch depth, ground clamp, billboarding) plus localStorage
// persistence of the board's position, rotation and size.
//
// All of it is deleted rather than merely unwired. The board is scenery now —
// bolted to the hillside at BOARD_HILL where the seated learner can read it
// between the study boards — so there is no gesture to interpret and nothing
// to remember. Keeping a dead controller around would be a standing invitation
// to re-enable half of it by accident, and its pointer handlers competed with
// the orbit camera for the same events.
//
// The saved placements of past sessions are deliberately NOT migrated: there
// is nowhere to put them, and a stale key cannot move a board that no longer
// listens.
