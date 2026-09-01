import { useEffect, useRef } from "react";

/**
 * SnowOverlay — the course player's "snow mode".
 *
 * A full-viewport, pointer-transparent canvas that renders a continuous,
 * WEATHER-LIKE snowfall over the whole player (content, buttons, empty
 * space — everything), tuned separately for the dark and light course
 * themes.
 *
 * Realism model
 * ─────────────
 * • True 3D particles: every flake lives at (x, y, z) with z ∈ [0.12, 1].
 *   z drives the projected size, fall speed, opacity and blur-less glow —
 *   near flakes are big/fast, far flakes small/slow (parallax). Flakes
 *   also DRIFT along z (toward or away from the viewer), so the fall has
 *   a real z-axis component, not just x/y.
 * • Wind regimes: exactly 10 hand-tuned regimes (angle + strength + z-push
 *   + gustiness — calm powder, steady diagonals, hard blizzards, a slow
 *   "toward the screen" drift…). A new regime is picked every fixed
 *   REGIME_SECONDS; the active wind then EASES toward it over several
 *   seconds (smoothstep), so the change is never perceptible as a jump —
 *   the weather just… shifts. Speed therefore keeps varying too: some
 *   regimes are slow and dreamy, others fast and stormy.
 * • Gusts: two incommensurate sine bands modulate the wind continuously,
 *   so even inside one regime the air breathes instead of blowing evenly.
 * • Interaction: pressing / dragging a finger (or moving the mouse)
 *   ANYWHERE over the player — buttons included, the listeners are
 *   window-level capture and the canvas itself is pointer-events: none —
 *   creates a repulsion field: nearby flakes accelerate away from the
 *   touch point. Scrolling / wheeling kicks a burst of turbulence at the
 *   last pointer position. Each flake tracks its displacement from its
 *   natural path in a spring, so the moment the finger lifts the field
 *   collapses and the flakes glide slowly back onto their fall line.
 */

const REGIME_SECONDS = 7; // fixed interval between weather changes
const REGIME_BLEND_SECONDS = 4; // eased transition → imperceptible
const REPEL_RADIUS = 150; // px — how far the touch field reaches
const REPEL_FORCE = 2600; // field strength at the very center
const SPRING_BACK = 1.6; // how eagerly displaced flakes return (per s)
const SPRING_DAMP = 2.4; // damping so the return is a glide, not a boing

/** The 10 wind regimes: angleX = horizontal push (px/s at z=1),
 *  fall = vertical speed multiplier, zPush = drift along the z axis
 *  (per s; + = toward the viewer), gust = how much the sine bands bite. */
type WindRegime = { angleX: number; fall: number; zPush: number; gust: number };
const REGIMES: readonly WindRegime[] = [
  { angleX: 0, fall: 0.42, zPush: 0.0, gust: 0.15 }, // windless powder, slow
  { angleX: 26, fall: 0.75, zPush: 0.02, gust: 0.35 }, // light breeze →
  { angleX: -30, fall: 0.8, zPush: -0.02, gust: 0.35 }, // light breeze ←
  { angleX: 70, fall: 1.15, zPush: 0.04, gust: 0.55 }, // steady diagonal →
  { angleX: -75, fall: 1.2, zPush: 0.05, gust: 0.55 }, // steady diagonal ←
  { angleX: 150, fall: 1.9, zPush: 0.08, gust: 0.9 }, // hard blizzard →
  { angleX: -160, fall: 2.05, zPush: -0.07, gust: 0.9 }, // hard blizzard ←
  { angleX: 12, fall: 0.55, zPush: 0.14, gust: 0.3 }, // falling INTO the screen face
  { angleX: -14, fall: 0.6, zPush: -0.13, gust: 0.3 }, // receding away on z
  { angleX: 48, fall: 1.5, zPush: 0.1, gust: 0.75 }, // gusty squall
];

interface Flake {
  x: number; // css px
  y: number;
  z: number; // depth 0.12 (far) … 1 (near)
  vzBias: number; // personal z drift so depth motion is per-flake too
  phase: number; // sway phase
  swayFreq: number;
  swayAmp: number;
  spin: number;
  // displacement spring (interaction)
  ox: number;
  oy: number;
  ovx: number;
  ovy: number;
}

export default function SnowOverlay({ theme }: { theme: "dark" | "light" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let flakes: Flake[] = [];
    let raf = 0;
    let running = true;
    let last = performance.now();

    // ── wind state ──────────────────────────────────────────────────
    let regimeIndex = 0;
    let prevRegime = REGIMES[0];
    let nextRegime = REGIMES[0];
    let regimeClock = 0; // seconds since the current regime was picked
    let elapsed = 0;

    // ── pointer field ──────────────────────────────────────────────
    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };

    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    const sizeFor = (area: number) => Math.min(200, Math.max(90, Math.round(area / 9000)));

    const spawn = (randomY: boolean): Flake => ({
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -12,
      z: 0.12 + Math.random() * 0.88,
      vzBias: (Math.random() - 0.5) * 0.05,
      phase: Math.random() * Math.PI * 2,
      swayFreq: 0.5 + Math.random() * 1.1,
      swayAmp: 8 + Math.random() * 22,
      spin: Math.random() * Math.PI * 2,
      ox: 0,
      oy: 0,
      ovx: 0,
      ovy: 0,
    });

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = sizeFor(width * height);
      while (flakes.length < target) flakes.push(spawn(true));
      if (flakes.length > target) flakes.length = target;
    };
    resize();

    const pickNextRegime = () => {
      prevRegime = nextRegime;
      let idx = regimeIndex;
      while (idx === regimeIndex) idx = Math.floor(Math.random() * REGIMES.length);
      regimeIndex = idx;
      nextRegime = REGIMES[idx];
      regimeClock = 0;
    };
    // start on a random calm-ish regime so every session opens differently
    regimeIndex = Math.floor(Math.random() * 3);
    prevRegime = REGIMES[regimeIndex];
    nextRegime = prevRegime;

    const step = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      regimeClock += dt;
      if (regimeClock >= REGIME_SECONDS) pickNextRegime();

      // blended wind: ease prev → next over REGIME_BLEND_SECONDS
      const blend = smoothstep(Math.min(1, regimeClock / REGIME_BLEND_SECONDS));
      const windX = prevRegime.angleX + (nextRegime.angleX - prevRegime.angleX) * blend;
      const fall = prevRegime.fall + (nextRegime.fall - prevRegime.fall) * blend;
      const zPush = prevRegime.zPush + (nextRegime.zPush - prevRegime.zPush) * blend;
      const gustAmp = prevRegime.gust + (nextRegime.gust - prevRegime.gust) * blend;
      // two incommensurate sine bands = breathing gusts
      const gust = 1 + gustAmp * (0.55 * Math.sin(elapsed * 0.9) + 0.45 * Math.sin(elapsed * 0.23 + 1.7));

      // pointer field strength eases toward its target (press = 1, lift = 0)
      pointer.strength += (pointer.target - pointer.strength) * Math.min(1, dt * 6);

      ctx.clearRect(0, 0, width, height);
      const dark = themeRef.current === "dark";
      // Dark theme: pure white flakes with a soft glow.
      // Light theme: cool slate flakes with white cores — clearly visible
      // on the pale background without smearing the page.
      const bodyColor = dark ? "255, 255, 255" : "100, 116, 139";
      const coreColor = dark ? "255, 255, 255" : "148, 163, 184";

      for (const f of flakes) {
        // ── natural motion (3D) ────────────────────────────────────
        const depthSpeed = 0.35 + f.z * 0.85;
        f.y += (28 + 62 * fall * gust) * depthSpeed * dt;
        f.x += windX * gust * depthSpeed * dt + Math.sin(elapsed * f.swayFreq + f.phase) * f.swayAmp * dt;
        f.z += (zPush * gust + f.vzBias) * dt;
        f.spin += dt * (0.4 + f.z);

        // z wrap-around: a flake drifting past the camera respawns far
        // away, one receding beyond the fog line comes back near.
        if (f.z > 1) f.z = 0.12 + Math.random() * 0.1;
        else if (f.z < 0.12) f.z = 0.95;

        // ── interaction: repel from the touch, spring back after ──
        if (pointer.strength > 0.01) {
          const dx = f.x + f.ox - pointer.x;
          const dy = f.y + f.oy - pointer.y;
          const d2 = dx * dx + dy * dy;
          const r = REPEL_RADIUS * (0.7 + f.z * 0.5);
          if (d2 < r * r && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / r) * REPEL_FORCE * pointer.strength * dt;
            f.ovx += (dx / d) * push;
            f.ovy += (dy / d) * push;
          }
        }
        // spring the displacement back to zero → flakes glide home
        f.ovx += (-f.ox * SPRING_BACK - f.ovx * SPRING_DAMP) * dt * 2;
        f.ovy += (-f.oy * SPRING_BACK - f.ovy * SPRING_DAMP) * dt * 2;
        f.ox += f.ovx * dt;
        f.oy += f.ovy * dt;

        // recycle flakes that leave the stage
        if (f.y > height + 16) {
          Object.assign(f, spawn(false));
        } else if (f.x < -30) f.x = width + 20;
        else if (f.x > width + 30) f.x = -20;

        // ── draw ───────────────────────────────────────────────────
        const px = f.x + f.ox;
        const py = f.y + f.oy;
        const size = (0.9 + f.z * 2.6) * (dark ? 1 : 1.05);
        const alpha = (dark ? 0.35 : 0.4) + f.z * (dark ? 0.55 : 0.45);
        // soft glow disc under the core sells depth on both themes
        const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 2.6);
        glow.addColorStop(0, `rgba(${coreColor}, ${alpha * 0.5})`);
        glow.addColorStop(1, `rgba(${coreColor}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, size * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${bodyColor}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(step);

    // ── window-level interaction (capture: buttons, empty space, all) ──
    let moveDecay: ReturnType<typeof setTimeout> | null = null;
    const setPointer = (x: number, y: number, hold: boolean) => {
      pointer.x = x;
      pointer.y = y;
      pointer.target = 1;
      if (!hold) {
        // hover / wheel: a short-lived disturbance that fades on its own
        if (moveDecay) clearTimeout(moveDecay);
        moveDecay = setTimeout(() => {
          pointer.target = 0;
        }, 160);
      }
    };
    let pressed = false;
    const onPointerDown = (e: PointerEvent) => {
      pressed = true;
      setPointer(e.clientX, e.clientY, true);
    };
    const onPointerMove = (e: PointerEvent) => {
      setPointer(e.clientX, e.clientY, pressed);
    };
    const onPointerEnd = () => {
      pressed = false;
      pointer.target = 0; // finger lifted → field collapses, flakes glide back
    };
    const onWheel = () => {
      if (pointer.x > -999) setPointer(pointer.x, pointer.y, false);
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    window.addEventListener("pointerup", onPointerEnd, { capture: true, passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { capture: true, passive: true });
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("scroll", onWheel, { capture: true, passive: true });

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (moveDecay) clearTimeout(moveDecay);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointermove", onPointerMove, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointerup", onPointerEnd, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointercancel", onPointerEnd, { capture: true } as EventListenerOptions);
      window.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener("scroll", onWheel, { capture: true } as EventListenerOptions);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-course-snow-overlay
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  );
}
