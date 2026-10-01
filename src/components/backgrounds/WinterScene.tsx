'use client'

/**
 * WinterScene — optional snowfall background mode.
 *
 * Ported from the owner's pinned reference pen
 * (https://codepen.io/Raed-Ennab/pen/PwNdKZj — "Winter Wonderland: Snowfall &
 * Frozen Lake Scene"): the aurora sky, mountains, snow ground, frozen lake and
 * snowman are the pen's CSS art (src/winter-background.css), and the snowfall
 * is the pen's canvas loop. The shared GlassBackdrop mounts this scene only
 * while the learner's universal Snowfall switch is enabled; the clean gradient
 * is the default and remains the lightweight option.
 *
 * While mounted, the animation runs continuously for the lifetime of the
 * scene. It is not gated on hover, focus, visibility or reduced-motion
 * preferences, so choosing snowfall keeps the original uninterrupted effect.
 *
 * The pen's demo copy (badge, heading, chips and buttons) is not part of the
 * background and is intentionally not ported.
 */

import { useEffect, useRef } from "react";

// ── the pen's snowfall constants ────────────────────────────────────────────
const FLAKE_COUNT = 220;

interface Flake {
  x: number;
  y: number;
  r: number;
  speedY: number;
  speedX: number;
  phase: number;
  drift: number;
}

export default function WinterScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = () => window.devicePixelRatio || 1;
    let flakes: Flake[] = [];
    let alive = true;
    let raf = 0;

    function resizeCanvas() {
      if (!canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const r = ratio();

      canvas.width = Math.max(1, Math.round(w * r));
      canvas.height = Math.max(1, Math.round(h * r));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";

      ctx.setTransform(r, 0, 0, r, 0, 0);
    }

    function createFlakes() {
      if (!canvas) return;
      flakes = [];
      const w = canvas.width / ratio();
      const h = canvas.height / ratio();

      for (let i = 0; i < FLAKE_COUNT; i++) {
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.8 + Math.random() * 2.4,
          speedY: 0.4 + Math.random() * 1.6,
          speedX: -0.35 + Math.random() * 0.7,
          phase: Math.random() * Math.PI * 2,
          drift: 0.2 + Math.random() * 0.35,
        });
      }
    }

    function draw() {
      if (!alive || !canvas || !ctx) return;
      const w = canvas.width / ratio();
      const h = canvas.height / ratio();

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";

      for (const f of flakes) {
        f.phase += 0.01;
        f.x += f.speedX + Math.sin(f.phase) * f.drift;
        f.y += f.speedY;

        // Wrap vertically and horizontally
        if (f.y > h + 5) {
          f.y = -10;
          f.x = Math.random() * w;
        }
        if (f.x > w + 5) f.x = -5;
        if (f.x < -5) f.x = w + 5;

        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      // Never stops — no visibility, focus or motion-preference gate.
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resizeCanvas();
      createFlakes();
    };

    resizeCanvas();
    createFlakes();
    draw();

    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="dc-winter" data-dc-winter aria-hidden="true">
      <div className="dc-winter__scene">
        <canvas ref={canvasRef} className="dc-winter__snow" />

        <div className="dc-winter__mountains">
          <div className="dc-winter__mountain dc-winter__mountain--m1" />
          <div className="dc-winter__mountain dc-winter__mountain--m2" />
          <div className="dc-winter__mountain dc-winter__mountain--m3" />
        </div>

        <div className="dc-winter__ground" />
        <div className="dc-winter__lake" />

        <div className="dc-winter__snowman">
          <div className="dc-winter__snowman-body">
            <div className="dc-winter__snowman-bottom" />
            <div className="dc-winter__snowman-middle">
              <div className="dc-winter__snowman-buttons">
                <div className="dc-winter__snowman-button" />
                <div className="dc-winter__snowman-button" />
                <div className="dc-winter__snowman-button" />
              </div>
            </div>
            <div className="dc-winter__snowman-head">
              <div className="dc-winter__snowman-face">
                <div className="dc-winter__snowman-eye dc-winter__snowman-eye--left" />
                <div className="dc-winter__snowman-eye dc-winter__snowman-eye--right" />
                <div className="dc-winter__snowman-nose" />
              </div>
            </div>
            <div className="dc-winter__snowman-hat">
              <div className="dc-winter__snowman-hat-rim" />
              <div className="dc-winter__snowman-hat-top">
                <div className="dc-winter__snowman-hat-band" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
