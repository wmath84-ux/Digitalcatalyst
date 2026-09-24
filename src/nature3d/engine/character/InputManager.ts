// src/nature3d/engine/character/InputManager.ts
//
// The ONLY thing the movement controller reads. Desktop keys and the touch
// HUD both write here; the controller never touches the DOM.
//
// Normalised outputs:
//
//   moveX  −1 (left) … +1 (right), camera-relative strafe
//   moveY  −1 (back)  … +1 (forward)
//   sprint / crouchHeld — held buttons
//   jumpQueued — edge-triggered, consumed by the controller
//   crouchToggle / proneToggle — edge-triggered stance requests
//   lookX / lookY — accumulated look deltas (radians), consumed per frame
//
// Jump is buffered AND stance-aware at the consumption site; this class only
// records the press with a timestamp.

export interface NormalisedInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jumpQueued: boolean;
  crouchToggle: boolean;
  proneToggle: boolean;
  lookX: number;
  lookY: number;
}

const DEAD_ZONE = 0.12;

export class CharacterInputManager {
  private moveX = 0;
  private moveY = 0;
  private stickX = 0;
  private stickY = 0;
  private stickActive = false;
  private sprintHeld = false;
  private sprintToggle = false;
  private jumpQueued = false;
  private crouchToggle = false;
  private proneToggle = false;
  private lookX = 0;
  private lookY = 0;
  private keys = new Set<string>();
  private keyboardAttached = false;

  /** Touch joystick vector. x = strafe, y = forward (already −1…1). */
  setMoveVector(x: number, y: number, active: boolean): void {
    this.stickX = x;
    this.stickY = y;
    this.stickActive = active;
  }

  /** Touch sprint toggle button. */
  setSprintToggle(on: boolean): void {
    this.sprintToggle = on;
  }

  /** Momentary sprint hold (HUD hold-to-sprint). */
  setSprintHeld(held: boolean): void {
    this.sprintHeld = held;
  }

  /** Jump button / Space — edge-triggered. */
  queueJump(): void {
    this.jumpQueued = true;
  }

  /** Crouch button / C — edge-triggered stance toggle. */
  toggleCrouch(): void {
    this.crouchToggle = true;
  }

  /** Prone button / Z — edge-triggered stance toggle. */
  toggleProne(): void {
    this.proneToggle = true;
  }

  /** Camera-look drag, in CSS px (scaled by sensitivity at read time). */
  addLook(dxPx: number, dyPx: number): void {
    this.lookX += dxPx;
    this.lookY += dyPx;
  }

  /** Zoom gesture scale factor (>1 zooms in). */
  zoomBy = 1;

  addZoom(factor: number): void {
    this.zoomBy *= factor;
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeZoom(): number {
    const z = this.zoomBy;
    this.zoomBy = 1;
    return z;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeCrouchToggle(): boolean {
    const c = this.crouchToggle;
    this.crouchToggle = false;
    return c;
  }

  consumeProneToggle(): boolean {
    const p = this.proneToggle;
    this.proneToggle = false;
    return p;
  }

  /** Snapshot for the controller. Edge triggers stay until consumed. */
  read(): NormalisedInput {
    let x = 0;
    let y = 0;
    if (this.stickActive) {
      x = this.stickX;
      y = this.stickY;
    }
    // Keyboard adds (WASD/arrows). Either source can drive alone.
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    } else if (mag < DEAD_ZONE) {
      x = 0;
      y = 0;
    }
    this.moveX = x;
    this.moveY = y;
    const sprintKey = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    return {
      moveX: x,
      moveY: y,
      sprint: sprintKey || this.sprintHeld || this.sprintToggle,
      jumpQueued: this.jumpQueued,
      crouchToggle: this.crouchToggle,
      proneToggle: this.proneToggle,
      lookX: this.lookX,
      lookY: this.lookY,
    };
  }

  get planarX(): number {
    return this.moveX;
  }

  get planarY(): number {
    return this.moveY;
  }

  // ── Desktop keyboard ──────────────────────────────────────────────

  attachKeyboard(): void {
    if (this.keyboardAttached) return;
    this.keyboardAttached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detachKeyboard(): void {
    if (!this.keyboardAttached) return;
    this.keyboardAttached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.keys.clear();
    this.stickActive = false;
    this.stickX = 0;
    this.stickY = 0;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
      return;
    }
    if (
      e.code === "Space" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight"
    ) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space") this.queueJump();
    if (e.code === "KeyC") this.toggleCrouch();
    if (e.code === "KeyZ") this.toggleProne();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };
}
