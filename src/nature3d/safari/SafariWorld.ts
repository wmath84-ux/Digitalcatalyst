// src/nature3d/safari/SafariWorld.ts
//
// THE CLAY SAFARI WORLD — a second, separate 3D area.
//
// This is NOT a replacement for the Sanctuary. It is an additional world,
// reached from its own button, and the two never share a scene.
//
// The terrain, river, bridge, trees, rocks, clouds, sun, animals, birds and
// props all come from the open-source Clay Safari project (MIT licensed,
// github.com/cclank/clay-safari) and are installed here exactly as they are
// authored there — same models, same layout, same colours, same animation.
//
// What was deliberately left out, per the brief:
//   • the robot AI guide character and its auto-tour,
//   • every floating word card / vocabulary label over the animals,
//   • all on-screen written instructions and the bilingual UI,
//   • the text-to-speech narration.
// Those were stripped inside the vendored modules themselves (see data.js
// and animals.js), so nothing here has to hide them at runtime.
//
// What is OURS and deliberately NOT taken from that project: the movable
// character and the joystick. The brief is explicit that the existing
// character controller and its joystick sensitivity stay. So Clay Safari's
// own Player class (with its own orbit rig, its own drag scaling and its own
// click-to-walk pathfinding) is never constructed. We drive the world with
// the same FirstPersonRig, the same VirtualStick and the same 0.005 / 0.9
// look scaling the Sanctuary uses, so both worlds feel identical to steer.

import * as THREE from "three";
import { FirstPersonRig, KeyboardInput, type VirtualStick } from "../engine/controls";
// @ts-expect-error — vendored JS from the Clay Safari project, no typings.
import { buildWorld, surfaceHeight } from "./world.js";
// @ts-expect-error — vendored JS.
import { loadModel } from "./clay.js";
// @ts-expect-error — vendored JS.
import { Creature } from "./animals.js";
// @ts-expect-error — vendored JS.
import { ITEMS, PLAYER_START, WALK } from "./data.js";
// @ts-expect-error — vendored JS.
import { updateTweens } from "./tween.js";

export interface SafariOptions {
  canvas: HTMLCanvasElement;
  onReady?: () => void;
  onProgress?: (fraction: number) => void;
}

/** Same eye height as the Sanctuary, so the two worlds read at one scale. */
const EYE_HEIGHT = 1.68;

export class SafariWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: {
    updaters: ((dt: number, t: number) => void)[];
    obstacles: unknown[];
  };
  private creatures: InstanceType<typeof Creature>[] = [];
  private fpp = new FirstPersonRig();
  private keyboard = new KeyboardInput();

  private moveStick: VirtualStick = { x: 0, y: 0, active: false };
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private elapsed = 0;

  // Pointer look — identical handling to the Sanctuary's swipe look.
  private pointerPrev = { id: -1, x: 0, y: 0, down: false };

  constructor(private opts: SafariOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0xdff3ff);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

    // Build the Clay Safari world exactly as that project builds it.
    this.world = buildWorld(this.scene, { isMobile: false });

    this.fpp.reset(PLAYER_START.x, PLAYER_START.z, PLAYER_START.rot);
    // This world is always walked, so the keyboard capture is on from the
    // start (in the Sanctuary it toggles with the orbit/walk mode).
    this.keyboard.enabled = true;

    const dom = opts.canvas;
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("pointerleave", this.onPointerUp);

    void this.loadCreatures();
  }

  /**
   * Load every animal and prop GLB and drop it into the world at the exact
   * position, rotation and scale the source project uses.
   */
  private async loadCreatures() {
    Creature.camera = this.camera;
    const defs = ITEMS as { id: string }[];
    let done = 0;
    await Promise.all(
      defs.map(async (def, i) => {
        try {
          const model = await loadModel(def.id);
          if (this.disposed) return;
          const c = new Creature(def, model, this.world, i);
          this.scene.add(c.group);
          this.creatures.push(c);
        } catch {
          // A single missing GLB must not take the whole world down; the
          // rest of the safari still loads and is perfectly usable.
        } finally {
          done += 1;
          this.opts.onProgress?.(done / defs.length);
        }
      }),
    );
    if (this.disposed) return;
    this.opts.onReady?.();
    this.start();
  }

  /** Feed the movement joystick. Same contract as the Sanctuary's. */
  setMoveStick(x: number, y: number, active: boolean) {
    this.moveStick.x = x;
    this.moveStick.y = y;
    this.moveStick.active = active;
  }

  resize(width: number, height: number) {
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerPrev.down) return;
    this.pointerPrev = { id: e.pointerId, x: e.clientX, y: e.clientY, down: true };
    this.opts.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerPrev.down || e.pointerId !== this.pointerPrev.id) return;
    // EXACTLY the Sanctuary's numbers: 0.005 per pixel, then 0.9 on the rig.
    const dx = (e.clientX - this.pointerPrev.x) * 0.005;
    const dy = (e.clientY - this.pointerPrev.y) * 0.005;
    this.pointerPrev.x = e.clientX;
    this.pointerPrev.y = e.clientY;
    this.fpp.look(dx * 0.9, dy * 0.9);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerPrev.id) return;
    this.pointerPrev.down = false;
    this.opts.canvas.releasePointerCapture?.(e.pointerId);
  };

  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      // dt is clamped for the same reason the Sanctuary clamps it: a
      // backgrounded tab returns one enormous delta and everything explodes.
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.elapsed += dt;
      this.tick(dt, this.elapsed);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(dt: number, t: number) {
    // Walk with our own rig and our own keyboard, not Clay Safari's Player.
    const kb = this.keyboard.stick;
    const mx = THREE.MathUtils.clamp(this.moveStick.x + kb.x, -1, 1);
    const my = THREE.MathUtils.clamp(this.moveStick.y + kb.y, -1, 1);
    const stick: VirtualStick = {
      x: mx,
      y: my,
      active: this.moveStick.active || kb.active,
    };
    this.fpp.update(dt, stick, this.camera);

    // Keep the walker on this map's ground and inside its walkable extent.
    // Clay Safari's terrain is its own function, so the rig's Sanctuary
    // terrain height has to be overridden with this world's surface.
    const p = this.fpp.position;
    p.x = THREE.MathUtils.clamp(p.x, -WALK.x, WALK.x);
    p.z = THREE.MathUtils.clamp(p.z, -WALK.z, WALK.z);
    const ground = surfaceHeight(p.x, p.z) as number;
    this.camera.position.set(p.x, ground + EYE_HEIGHT, p.z);

    for (const u of this.world.updaters) u(dt, t);
    for (const c of this.creatures) c.update(dt, t);
    updateTweens(dt);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const dom = this.opts.canvas;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointercancel", this.onPointerUp);
    dom.removeEventListener("pointerleave", this.onPointerUp);
    this.keyboard.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.scene.clear();
    this.renderer.dispose();
  }
}
