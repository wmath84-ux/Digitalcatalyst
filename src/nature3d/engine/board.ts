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
  const rim = new THREE.MeshStandardMaterial({ color: 0x14243c, roughness: 0.3, metalness: 0.5 });
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
      })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.28, metalness: 0.05 });

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
  const gripMat = new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.72 });
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
//  Placement controller
// ─────────────────────────────────────────────────────────────────────────

const MIN_DEPTH = 2.2;   // closest the board may come to the camera
const MAX_DEPTH = 26;    // furthest it may be pushed
const MAX_RADIUS = 400;  // never leaves the meadow
/**
 * Ceiling for the board, measured ABOVE THE GROUND UNDER IT — not as an
 * absolute world Y. The hills now reach ~93 m, so a fixed 16 m ceiling would
 * clamp the board straight down inside a hillside the moment you carried it
 * uphill. Relative keeps "as high as I can reach" meaningful everywhere.
 */
const MAX_HEIGHT_ABOVE_GROUND = 14;
/** Resize limits, as a multiple of the default 4.8 × 2.7 m board. */
const MIN_SCALE = 0.35;
// 60 m of board width. BOARD_WIDTH is 4.8 m, so 60 / 4.8 = 12.5.
const MAX_SCALE = 60 / BOARD_WIDTH;

export interface BoardControllerOptions {
  board: THREE.Group;
  panel: THREE.Mesh;
  camera: THREE.Camera;
  dom: HTMLElement;
  /** Called when the board is picked up / put down (for HUD state). */
  onGrabChange?: (grabbed: boolean) => void;
  /** Returns false to ignore pointer input (e.g. while the joystick is used). */
  enabled: () => boolean;
}

export class BoardController {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPlane = new THREE.Plane();
  private planeNormal = new THREE.Vector3();
  private hitPoint = new THREE.Vector3();
  private grabOffset = new THREE.Vector3();
  private camForward = new THREE.Vector3();
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private depthAtPinch = 0;
  private scaleAtPinch = 1;
  private dragging = false;
  private moved = false;
  /** Board keeps facing the viewer while carried, then locks on release. */
  private faceCamera = true;

  // ── Edge resize ──────────────────────────────────────────────────────
  /** Which edge/corner was grabbed, or null for a body drag. */
  private resizeEdge: { u: -1 | 0 | 1; v: -1 | 0 | 1 } | null = null;
  private resizeStart = { w: 1, h: 1, x: 0, y: 0 };
  private scale = new THREE.Vector2(1, 1);

  constructor(private opts: BoardControllerOptions) {
    const dom = opts.dom;
    dom.addEventListener("pointerdown", this.onDown);
    dom.addEventListener("pointermove", this.onMove);
    dom.addEventListener("pointerup", this.onUp);
    dom.addEventListener("pointercancel", this.onUp);
    dom.addEventListener("pointerleave", this.onUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Did the last gesture move the board (vs. a tap that should open the modal)? */
  get gestureMoved(): boolean {
    return this.moved;
  }

  setFaceCamera(v: boolean) {
    this.faceCamera = v;
  }

  dispose() {
    const dom = this.opts.dom;
    dom.removeEventListener("pointerdown", this.onDown);
    dom.removeEventListener("pointermove", this.onMove);
    dom.removeEventListener("pointerup", this.onUp);
    dom.removeEventListener("pointercancel", this.onUp);
    dom.removeEventListener("pointerleave", this.onUp);
    dom.removeEventListener("wheel", this.onWheel);
  }

  private updatePointer(e: PointerEvent) {
    const rect = this.opts.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /**
   * Hit-test the panel and, if hit, work out WHERE on it — body or edge.
   *
   * The intersection carries a UV in 0..1 across the front face, so an
   * 18 % margin on each side becomes the resize gutter. Grabbing the left or
   * right gutter resizes width, top/bottom resizes height, and a corner does
   * both at once — the standard "drag any edge to resize" affordance.
   */
  private hitsBoard(e: PointerEvent): boolean {
    this.updatePointer(e);
    this.raycaster.setFromCamera(this.pointer, this.opts.camera as THREE.PerspectiveCamera);
    const hits = this.raycaster.intersectObject(this.opts.panel, false);
    if (hits.length === 0) {
      this.resizeEdge = null;
      return false;
    }
    const uv = hits[0].uv;
    if (!uv) {
      this.resizeEdge = null;
      return true;
    }
    const M = 0.18;
    const u: -1 | 0 | 1 = uv.x < M ? -1 : uv.x > 1 - M ? 1 : 0;
    const v: -1 | 0 | 1 = uv.y < M ? -1 : uv.y > 1 - M ? 1 : 0;
    this.resizeEdge = u === 0 && v === 0 ? null : { u, v };
    return true;
  }

  /**
   * Re-anchor the one-finger drag to wherever the board is RIGHT NOW.
   *
   * This is the fix for the "board snaps back when I lift a finger" bug. The
   * drag plane and grab offset are captured once at pointerdown. A pinch then
   * moves the board along the view ray — but the stale plane still sits at the
   * OLD depth, so the instant the second finger came up, the surviving finger's
   * next move re-projected the board onto that old plane and it jumped back.
   * Re-anchoring on every pointer-count change means a pinch is committed:
   * zoom in, the board stays near; zoom out, it stays far.
   */
  private reanchor(clientX: number, clientY: number) {
    const rect = this.opts.dom.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.opts.camera as THREE.PerspectiveCamera);
    this.opts.camera.getWorldDirection(this.planeNormal);
    this.dragPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.opts.board.position);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      this.grabOffset.copy(this.opts.board.position).sub(this.hitPoint);
    } else {
      this.grabOffset.set(0, 0, 0);
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.opts.enabled()) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2 && this.dragging) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.depthAtPinch = this.currentDepth();
      this.scaleAtPinch = this.scale.x;
      return;
    }
    if (this.activePointers.size > 1) return;
    if (!this.hitsBoard(e)) return;

    if (this.resizeEdge) {
      // Start a resize: remember the size and the pointer origin.
      this.resizeStart = { w: this.scale.x, h: this.scale.y, x: e.clientX, y: e.clientY };
    }

    // Drag plane: parallel to the screen, through the board's centre. This is
    // what makes one finger move the board 1:1 in every direction — up, down,
    // left, right — with no mode switch.
    this.reanchor(e.clientX, e.clientY);

    this.dragging = true;
    this.moved = false;
    this.opts.dom.setPointerCapture?.(e.pointerId);
    this.opts.onGrabChange?.(true);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.dragging) return;

    if (this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0) {
        const ratio = this.pinchStart / Math.max(dist, 1);
        if (this.resizeEdge) {
          // Pinching while holding an edge scales the board itself.
          this.setScale(this.scaleAtPinch / ratio, this.scaleAtPinch / ratio);
        } else {
          // Pinch out → board comes closer (appears bigger).
          this.setDepth(this.depthAtPinch * ratio);
        }
        this.moved = true;
      }
      e.preventDefault();
      return;
    }

    if (this.resizeEdge) {
      // ── Edge resize ──────────────────────────────────────────────────
      // Convert the pointer travel to a fraction of the viewport, then to a
      // size multiplier. Pulling outwards (away from the board centre) grows
      // it, pushing inwards shrinks it — for every edge and every corner.
      const rect = this.opts.dom.getBoundingClientRect();
      const dx = (e.clientX - this.resizeStart.x) / rect.width;
      const dy = (e.clientY - this.resizeStart.y) / rect.height;
      const { u, v } = this.resizeEdge;
      // Screen +y is down, board +v is up, hence the negation on dy.
      const w = u === 0 ? this.resizeStart.w : this.resizeStart.w + u * dx * 4.5;
      const h = v === 0 ? this.resizeStart.h : this.resizeStart.h + v * -dy * 4.5;
      this.setScale(w, h);
      this.moved = true;
      e.preventDefault();
      return;
    }

    this.updatePointer(e);
    this.raycaster.setFromCamera(this.pointer, this.opts.camera as THREE.PerspectiveCamera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      this.opts.board.position.copy(this.hitPoint).add(this.grabOffset);
      this.clamp();
      this.moved = true;
    }
    e.preventDefault();
  };

  private onUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) this.pinchStart = 0;
    if (this.activePointers.size > 0) {
      // A finger came up but one is still down: COMMIT whatever the pinch did
      // and re-anchor the drag to the board's new position. Without this the
      // surviving finger would yank the board back to the pre-pinch depth.
      const survivor = [...this.activePointers.values()][0];
      this.reanchor(survivor.x, survivor.y);
      if (this.resizeEdge) {
        this.resizeStart = { w: this.scale.x, h: this.scale.y, x: survivor.x, y: survivor.y };
      }
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    this.resizeEdge = null;
    this.opts.onGrabChange?.(false);
    this.opts.dom.releasePointerCapture?.(e.pointerId);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.opts.enabled()) return;
    // Wheel only affects the board while the pointer is over it, so the
    // orbit camera keeps its own zoom everywhere else.
    const rect = this.opts.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.opts.camera as THREE.PerspectiveCamera);
    if (this.raycaster.intersectObject(this.opts.panel, false).length === 0) return;
    e.preventDefault();
    // stopImmediatePropagation, not stopPropagation: the camera's own wheel
    // handler is bound to the SAME element, and only the "immediate" form
    // stops a sibling listener on that element. Without it, scrolling over the
    // board would push the board AND zoom the camera at once.
    e.stopImmediatePropagation();
    this.setDepth(this.currentDepth() * (1 + Math.sign(e.deltaY) * 0.1));
    this.moved = true;
  };

  private currentDepth(): number {
    return this.opts.board.position.distanceTo(this.opts.camera.position);
  }

  /** Push/pull the board along the camera ray it currently sits on. */
  setDepth(depth: number) {
    const clamped = THREE.MathUtils.clamp(depth, MIN_DEPTH, MAX_DEPTH);
    const dir = this.camForward
      .copy(this.opts.board.position)
      .sub(this.opts.camera.position)
      .normalize();
    this.opts.board.position.copy(this.opts.camera.position).addScaledVector(dir, clamped);
    this.clamp();
  }

  /**
   * Resize the board. Aspect is free — drag a side to make it a wide strip,
   * a corner to scale both axes — within sane limits so it can never become
   * a sliver or swallow the sky.
   */
  setScale(w: number, h: number) {
    this.scale.set(
      THREE.MathUtils.clamp(w, MIN_SCALE, MAX_SCALE),
      THREE.MathUtils.clamp(h, MIN_SCALE, MAX_SCALE),
    );
    this.opts.board.scale.set(this.scale.x, this.scale.y, 1);
    this.clamp();
  }

  getScale(): { w: number; h: number } {
    return { w: this.scale.x, h: this.scale.y };
  }

  /** Reset the board to its original 16:9 size. */
  resetScale() {
    this.setScale(1, 1);
  }

  /** Nudge the board by a world delta (used by the HUD arrows). */
  nudge(dx: number, dy: number, dz: number) {
    this.opts.board.position.x += dx;
    this.opts.board.position.y += dy;
    this.opts.board.position.z += dz;
    this.clamp();
  }

  /**
   * The safety net. Runs after every move AND once per frame:
   *   • the board's lowest corner stays above the terrain under it;
   *   • it stays inside the meadow and under the sky ceiling;
   *   • it never ends up behind the camera.
   */
  clamp() {
    const p = this.opts.board.position;

    const radius = Math.hypot(p.x, p.z);
    if (radius > MAX_RADIUS) {
      p.x = (p.x / radius) * MAX_RADIUS;
      p.z = (p.z / radius) * MAX_RADIUS;
    }

    // Sample the ground under the board's footprint, not just its centre, so a
    // slope on either side cannot clip a corner through the hill.
    // Footprint and clearance both scale with the board, so a board grown to
    // 4× still keeps its bottom edge above the grass.
    const half = BOARD_WIDTH * 0.5 * this.scale.x;
    let ground = terrainHeight(p.x, p.z);
    for (const [ox, oz] of [[-half, 0], [half, 0], [0, -half * 0.3], [0, half * 0.3]] as const) {
      ground = Math.max(ground, terrainHeight(p.x + ox, p.z + oz));
    }
    const minY = ground + BOARD_HEIGHT * 0.5 * this.scale.y + 0.12;
    const maxY = minY + MAX_HEIGHT_ABOVE_GROUND;
    if (p.y < minY) p.y = minY;
    else if (p.y > maxY) p.y = maxY;
  }

  /** Per-frame: keep the board readable (facing the viewer) and legal. */
  update(dt: number) {
    if (this.faceCamera) {
      const board = this.opts.board;
      const cam = this.opts.camera.position;
      const targetYaw = Math.atan2(cam.x - board.position.x, cam.z - board.position.z);
      let diff = targetYaw - board.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      board.rotation.y += diff * Math.min(1, dt * (this.dragging ? 8 : 2.4));
    }
    this.clamp();
  }
}
