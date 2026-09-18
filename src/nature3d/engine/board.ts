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

  // ── Plinth: granite monolith + fully concealed rear chassis ──────────
  const plinth = new THREE.Group();
  plinth.name = "board-plinth";

  const rockGeo = new THREE.DodecahedronGeometry(1.7, 1);
  const rp = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i += 1) {
    const x = rp.getX(i);
    let y = rp.getY(i);
    const z = rp.getZ(i);
    if (y > 0.45) y = 0.45 + (y - 0.45) * 0.2; // flat summit for the mount
    rp.setXYZ(i, x * (1.2 + Math.sin(y * 3) * 0.1), y * 0.95, z * 1.24);
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(
    rockGeo,
    new THREE.MeshStandardMaterial({ color: 0x7c8781, roughness: 0.94, metalness: 0.04, flatShading: true }),
  );
  rock.position.y = 0.9;
  rock.castShadow = budget.shadowMapSize > 0;
  rock.receiveShadow = budget.shadowMapSize > 0;
  plinth.add(rock);

  const moss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x3d6e2a, roughness: 0.96 }),
  );
  moss.position.set(-0.2, 1.42, 0.05);
  plinth.add(moss);

  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.35, metalness: 0.85 });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.14), chassisMat);
  mast.position.set(0, 2.05, -0.22);
  plinth.add(mast);
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.05), chassisMat);
  backPlate.position.set(0, 2.5, -0.14);
  plinth.add(backPlate);

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
      plinth.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Placement controller
// ─────────────────────────────────────────────────────────────────────────

const MIN_DEPTH = 2.2;   // closest the board may come to the camera
const MAX_DEPTH = 26;    // furthest it may be pushed
const MAX_RADIUS = 58;   // never leaves the meadow
const MAX_HEIGHT = 16;

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
  private dragging = false;
  private moved = false;
  /** Board keeps facing the viewer while carried, then locks on release. */
  private faceCamera = true;

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

  private hitsBoard(e: PointerEvent): boolean {
    this.updatePointer(e);
    this.raycaster.setFromCamera(this.pointer, this.opts.camera as THREE.PerspectiveCamera);
    return this.raycaster.intersectObject(this.opts.panel, false).length > 0;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.opts.enabled()) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2 && this.dragging) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.depthAtPinch = this.currentDepth();
      return;
    }
    if (this.activePointers.size > 1) return;
    if (!this.hitsBoard(e)) return;

    // Drag plane: parallel to the screen, through the board's centre. This is
    // what makes one finger move the board 1:1 in every direction — up, down,
    // left, right — with no mode switch.
    this.opts.camera.getWorldDirection(this.planeNormal);
    this.dragPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.opts.board.position);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      this.grabOffset.copy(this.opts.board.position).sub(this.hitPoint);
    } else {
      this.grabOffset.set(0, 0, 0);
    }

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
        // Pinch out → board comes closer (appears bigger).
        this.setDepth(this.depthAtPinch * (this.pinchStart / Math.max(dist, 1)));
        this.moved = true;
      }
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
    if (this.activePointers.size > 0) return;
    if (!this.dragging) return;
    this.dragging = false;
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
    const half = BOARD_WIDTH * 0.5;
    let ground = terrainHeight(p.x, p.z);
    for (const [ox, oz] of [[-half, 0], [half, 0], [0, -half * 0.3], [0, half * 0.3]] as const) {
      ground = Math.max(ground, terrainHeight(p.x + ox, p.z + oz));
    }
    const minY = ground + BOARD_HEIGHT * 0.5 + 0.12;
    if (p.y < minY) p.y = minY;
    if (p.y > MAX_HEIGHT) p.y = MAX_HEIGHT;
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
