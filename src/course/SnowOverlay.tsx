import { useEffect, useRef } from "react";

/**
 * SnowOverlay — the course player's "snow mode".
 *
 * A full-viewport, pointer-transparent canvas that renders GUSTY, wind-
 * driven snow over the whole player (content, buttons, empty space),
 * tuned separately for the dark and light course themes.
 *
 * Weather model — snow rides the wind, and the wind is INTERMITTENT
 * ────────────────────────────────────────────────────────────────────
 * Real snow squalls don't pour continuously: the air is calm, then a
 * gust picks up, carries a flurry across, dies down, and the sky clears
 * until the next gust. The overlay reproduces exactly that with a phase
 * machine:
 *
 *   LULL  (1.2–4.5s, random) — the wind is nearly still. Nothing new
 *         spawns; the flakes already on screen drift out or settle away
 *         and the screen empties. Between gusts you mostly see nothing.
 *   GUST  (3–8s, random)     — a "jhonka". One of 10 wind regimes is
 *         picked (fresh direction + strength + z-push each time) and an
 *         intensity envelope ramps 0 → 1 → 0 (eased attack / release),
 *         so the gust breathes in, sweeps a burst of flakes through the
 *         screen — biased to ENTER FROM THE WINDWARD EDGE, like snow
 *         blown in from the side — and breathes out again. Because the
 *         envelope starts and ends at zero, no change is ever a jump.
 *
 *   Occasionally (~30%) a gust is followed by a very short lull and a
 *   second gust, so the rhythm itself stays irregular — sometimes back-
 *   to-back squalls, sometimes long quiet spells.
 *
 * • True 3D particles: every flake lives at (x, y, z) with z ∈ [0.12, 1].
 *   z drives projected size, speed, opacity and glow (parallax), and
 *   flakes drift ALONG z (toward/away from the viewer) as the regime's
 *   zPush dictates — the fall has a real z-axis component.
 * • 10 wind regimes: calm powder, breezes, steady diagonals, hard
 *   blizzards, into-the-screen drift, gusty squall. Each gust picks a
 *   different one, so direction, axis and speed keep changing.
 * • Micro-gusts: two incommensurate sine bands modulate the wind inside
 *   a single gust, so even one jhonka never blows evenly.
 * • Interaction: pressing / dragging a finger (or moving the mouse)
 *   anywhere — buttons included; listeners are window-level capture and
 *   the canvas is pointer-events: none — repels nearby flakes. A
 *   per-flake displacement spring glides them back the moment the
 *   finger lifts. Scroll/wheel kicks the field at the last pointer spot.
 */

const REPEL_RADIUS = 150; // px — how far the touch field reaches
const REPEL_FORCE = 2600; // field strength at the very center
const SPRING_BACK = 1.6; // how eagerly displaced flakes return (per s)
const SPRING_DAMP = 2.4; // damping so the return is a glide, not a boing

// ── gust rhythm (seconds) ────────────────────────────────────────────
const GUST_MIN = 3.0;
const GUST_MAX = 8.0;
const LULL_MIN = 1.2;
const LULL_MAX = 4.5;
const SHORT_LULL_MAX = 1.6; // the pause inside a double-squall
const ATTACK_FRACTION = 0.3; // first 30% of a gust ramps up…
const RELEASE_FRACTION = 0.35; // …last 35% dies away

/** The 10 wind regimes: angleX = horizontal push (px/s at z=1),
 *  fall = vertical speed multiplier, zPush = drift along the z axis
 *  (per s; + = toward the viewer), gust = how much the sine bands bite. */
type WindRegime = { angleX: number; fall: number; zPush: number; gust: number };
const REGIMES: readonly WindRegime[] = [
  { angleX: 18, fall: 0.5, zPush: 0.0, gust: 0.2 }, // soft powder puff
  { angleX: 70, fall: 0.8, zPush: 0.02, gust: 0.35 }, // light breeze →
  { angleX: -75, fall: 0.85, zPush: -0.02, gust: 0.35 }, // light breeze ←
  { angleX: 150, fall: 1.15, zPush: 0.04, gust: 0.55 }, // steady diagonal →
  { angleX: -160, fall: 1.2, zPush: 0.05, gust: 0.55 }, // steady diagonal ←
  { angleX: 300, fall: 1.9, zPush: 0.08, gust: 0.9 }, // hard blizzard →
  { angleX: -320, fall: 2.0, zPush: -0.07, gust: 0.9 }, // hard blizzard ←
  { angleX: 35, fall: 0.6, zPush: 0.16, gust: 0.3 }, // flurry INTO the screen face
  { angleX: -40, fall: 0.65, zPush: -0.15, gust: 0.3 }, // flurry receding on z
  { angleX: 120, fall: 1.5, zPush: 0.1, gust: 0.75 }, // gusty squall
];

interface Flake {
  x: number; // css px
  y: number;
  z: number; // depth 0.12 (far) … 1 (near)
  vzBias: number; // personal z drift so depth motion is per-flake too
  phase: number; // sway phase
  swayFreq: number;
  swayAmp: number;
  life: number; // 0 → 1 fade-in on spawn (no popping)
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
    let elapsed = 0;

    // ── gust phase machine ─────────────────────────────────────────
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    let phase: "gust" | "lull" = "lull";
    let phaseDuration = rand(0.4, 1.2); // start almost immediately with a jhonka
    let phaseClock = 0;
    let regimeIndex = Math.floor(Math.random() * REGIMES.length);
    let regime = REGIMES[regimeIndex];
    let doubleSquall = false;

    const nextPhase = () => {
      phaseClock = 0;
      if (phase === "lull") {
        // a fresh jhonka: new duration AND a new regime every time, so
        // each gust arrives from its own direction at its own strength
        phase = "gust";
        phaseDuration = rand(GUST_MIN, GUST_MAX);
        let idx = regimeIndex;
        while (idx === regimeIndex) idx = Math.floor(Math.random() * REGIMES.length);
        regimeIndex = idx;
        regime = REGIMES[idx];
        doubleSquall = Math.random() < 0.3;
      } else {
        phase = "lull";
        phaseDuration = doubleSquall ? rand(0.5, SHORT_LULL_MAX) : rand(LULL_MIN, LULL_MAX);
        doubleSquall = false;
      }
    };

    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    /** Gust intensity 0→1→0 — eased attack, full middle, eased release.
     *  Zero through every lull, so wind + snowfall truly stop between
     *  jhonkas and no regime change is ever visible as a jump. */
    const envelope = () => {
      if (phase === "lull") return 0;
      const p = Math.min(1, phaseClock / phaseDuration);
      if (p < ATTACK_FRACTION) return smoothstep(p / ATTACK_FRACTION);
      if (p > 1 - RELEASE_FRACTION) return smoothstep((1 - p) / RELEASE_FRACTION);
      return 1;
    };

    // ── pointer field ──────────────────────────────────────────────
    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };

    const maxFlakesFor = (area: number) => Math.min(220, Math.max(100, Math.round(area / 8200)));
    let maxFlakes = 0;

    /** Spawn one flake for the CURRENT wind: mostly along the top edge,
     *  but the stronger the sideways wind, the more flakes enter from
     *  the windward side — that is what makes a gust read as a jhonka
     *  sweeping across the screen instead of rain from above. */
    const spawn = (): Flake => {
      const windX = regime.angleX;
      const sideBias = Math.min(0.75, Math.abs(windX) / 340);
      const fromSide = Math.random() < sideBias;
      let x: number;
      let y: number;
      if (fromSide) {
        x = windX > 0 ? -14 : width + 14;
        y = Math.random() * height * 0.9;
      } else {
        x = Math.random() * width;
        y = -14;
      }
      return {
        x,
        y,
        z: 0.12 + Math.random() * 0.88,
        vzBias: (Math.random() - 0.5) * 0.05,
        phase: Math.random() * Math.PI * 2,
        swayFreq: 0.5 + Math.random() * 1.1,
        swayAmp: 8 + Math.random() * 22,
        life: 0,
        ox: 0,
        oy: 0,
        ovx: 0,
        ovy: 0,
      };
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maxFlakes = maxFlakesFor(width * height);
    };
    resize();

    const step = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      phaseClock += dt;
      if (phaseClock >= phaseDuration) nextPhase();

      const env = envelope();
      // micro-gusts breathe INSIDE a jhonka; a whisper of air (0.06)
      // remains in lulls so leftover flakes settle instead of freezing
      const breathe = 1 + regime.gust * (0.55 * Math.sin(elapsed * 0.9) + 0.45 * Math.sin(elapsed * 0.23 + 1.7));
      const windPower = env * breathe;
      const windX = regime.angleX * windPower;
      // 0.22 baseline: when the wind stops, the flakes still SETTLE
      // downward gently (real snow never hangs mid-air) — together with
      // the lull dissolve this clears the stage between jhonkas.
      const fall = 0.22 + regime.fall * windPower;
      const zPush = regime.zPush * windPower;

      // population follows the gust: flakes pour in while the jhonka
      // blows and stop spawning the moment it fades — the screen then
      // clears on its own as the leftovers drift out.
      const targetCount = Math.round(maxFlakes * env);
      let deficit = targetCount - flakes.length;
      // spawn rate scales with the gust so the flurry builds like a wave
      let spawnBudget = Math.max(0, Math.ceil(dt * maxFlakes * (0.8 + 2.2 * env)));
      while (deficit > 0 && spawnBudget > 0) {
        flakes.push(spawn());
        deficit -= 1;
        spawnBudget -= 1;
      }

      // pointer field strength eases toward its target (press=1, lift=0)
      pointer.strength += (pointer.target - pointer.strength) * Math.min(1, dt * 6);

      ctx.clearRect(0, 0, width, height);
      const dark = themeRef.current === "dark";
      // Dark theme: pure white flakes with a soft glow.
      // Light theme: cool slate flakes with white cores — clearly visible
      // on the pale background without smearing the page.
      const bodyColor = dark ? "255, 255, 255" : "100, 116, 139";
      const coreColor = dark ? "255, 255, 255" : "148, 163, 184";

      for (let i = flakes.length - 1; i >= 0; i -= 1) {
        const f = flakes[i];
        // ── natural motion (3D), all of it riding the gust envelope ──
        const depthSpeed = 0.35 + f.z * 0.85;
        if (env > 0.08) {
          f.life = Math.min(1, f.life + dt * 2.2); // fade in with the gust
        } else {
          // the jhonka has died: leftover flakes settle and DISSOLVE so
          // the screen truly empties before the next gust arrives
          f.life -= dt * 0.5;
          if (f.life <= 0) {
            flakes.splice(i, 1);
            continue;
          }
        }
        f.y += (16 + 68 * fall) * depthSpeed * dt;
        f.x += windX * depthSpeed * dt + Math.sin(elapsed * f.swayFreq + f.phase) * f.swayAmp * dt * (0.3 + windPower * 0.7);
        f.z += (zPush + f.vzBias * (0.3 + env)) * dt;

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

        // flakes that leave the stage are simply REMOVED — during a
        // lull nothing replaces them, which is what empties the screen
        // between jhonkas. (The spawner above refills during gusts.)
        if (f.y > height + 20 || f.x < -40 || f.x > width + 40) {
          flakes.splice(i, 1);
          continue;
        }

        // ── draw ───────────────────────────────────────────────────
        const px = f.x + f.ox;
        const py = f.y + f.oy;
        const size = (0.9 + f.z * 2.6) * (dark ? 1 : 1.05);
        const alpha = ((dark ? 0.35 : 0.4) + f.z * (dark ? 0.55 : 0.45)) * f.life;
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
