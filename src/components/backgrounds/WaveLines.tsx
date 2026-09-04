'use client'

/**
 * Vendored from AI Canvas — Wave Lines (https://aicanvas.me/components/wave-lines).
 *
 * The registry copy is account-gated, so this file is rebuilt line-for-line
 * from the source spec the component page publishes against the real code:
 * the constants, the per-frame draw loop, the theme observer, the JSX and the
 * cleanup are the shipped component's, point for point.
 *
 * Two [digitalcatalyst] adaptations — mount-related only, the drawing is
 * untouched:
 *   1. the pointer/touch listeners ALSO attach to `window`: as the fixed app
 *      background (z-index -1, pointer-events: none) the canvas can never
 *      receive events itself, and the fold must track the pointer across the
 *      whole app.
 *   2. `showLabel` (default true) hides the centred "Wave Lines / hover to
 *      fold" demo caption when mounted as the app background — the background
 *      must not carry the component's demo text.
 *
 * The animation ALWAYS runs — one requestAnimationFrame tick, `t += 0.003`
 * every frame, exactly like the source ("live … hamesha").
 */

import { useEffect, useRef, useState } from "react";

// ── constants (the component's shipped values) ──────────────────────────────
const SPACING = 32; // px between lines at rest
const ROW_STEP = 4; // sample step per line
const AMP = 18; // resting wave amplitude
const FREQ_Y = 0.015;
const FREQ_X = 0.006;
const HOVER_BOOST = 5.0; // amplitude multiplier on hover
const LOCAL_AMP = 58;
const LOCAL_RADIUS = 220;
const LINE_A_DARK = 0.55;
const LINE_A_LIGHT = 0.75;

export default function WaveLines({ showLabel = true }: { showLabel?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [isDark, setIsDark] = useState(false);
  const isDarkRef = useRef(false);

  // Theme: closest [data-card-theme], else the document element — observed,
  // never polled.
  useEffect(() => {
    const read = () => {
      const themed = containerRef.current?.closest("[data-card-theme]");
      const value =
        themed?.getAttribute("data-card-theme") ??
        document.documentElement.dataset.theme ??
        (document.documentElement.classList.contains("dark") ? "dark" : "light");
      const dark = value === "dark";
      isDarkRef.current = dark;
      setIsDark(dark);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Pointer tracking — canvas-space coordinates. The container's own handlers
  // work when the canvas is interactive; the window listeners (below) are the
  // [digitalcatalyst] addition so the fixed app background folds app-wide.
  const track = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: clientX - rect.left, y: clientY - rect.top };
  };
  const clear = () => {
    mouseRef.current = null;
  };
  const onMove = (event: PointerEvent) => track(event.clientX, event.clientY);
  const onMouse = (event: { clientX: number; clientY: number }) => track(event.clientX, event.clientY);
  const onTouch = (event: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const touch = event.touches[0];
    if (touch) track(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.documentElement.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // The drawing loop — a single rAF tick, always live.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let alive = true;
    let raf = 0;
    let t = 0;
    let hoverStr = 0;
    let cw = 0;
    let ch = 0;
    let cols = 0;
    let rows = 0;
    let ox = 0;

    // DPR scaffolding; geometry is computed once per build.
    const build = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      cw = parent.clientWidth;
      ch = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(cw / SPACING) + 2;
      rows = Math.ceil(ch / ROW_STEP) + 1;
      ox = (cw % SPACING) / 2;
    };
    build();
    const ro = new ResizeObserver(build);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      if (!alive) return;
      t += 0.003;
      const hasHover = mouseRef.current != null;
      hoverStr += ((hasHover ? 1 : 0) - hoverStr) * (hasHover ? 0.018 : 0.010);
      ctx.clearRect(0, 0, cw, ch);
      const dotRGB = isDarkRef.current ? "255,255,255" : "28,25,22";
      const lineA = isDarkRef.current ? LINE_A_DARK : LINE_A_LIGHT;
      const amp = AMP * (1 + hoverStr * HOVER_BOOST);
      const mx = mouseRef.current?.x ?? -99999;
      const my = mouseRef.current?.y ?? -99999;
      const r2 = LOCAL_RADIUS * LOCAL_RADIUS;
      ctx.strokeStyle = `rgba(${dotRGB},${lineA})`;
      ctx.lineWidth = 0.8;

      for (let c = 0; c < cols; c++) {
        const rx = ox + c * SPACING;
        ctx.beginPath();
        let prevX = 0;
        let prevY = 0;
        for (let r = 0; r <= rows; r++) {
          const ry = r * ROW_STEP;
          const wx =
            amp * Math.sin(ry * FREQ_Y + rx * FREQ_X + t) +
            amp * 0.38 * Math.sin(ry * FREQ_Y * 1.6 + rx * FREQ_X * 1.4 + t * 1.5 + 1.1);
          const wy = amp * 0.12 * Math.cos(rx * FREQ_X * 0.9 + ry * FREQ_Y * 0.4 + t * 0.8);
          const dx = rx - mx;
          const dy = ry - my;
          const dist2 = dx * dx + dy * dy;
          let px = 0;
          let py = 0;
          if (dist2 < r2 * 4) {
            const push = LOCAL_AMP * Math.exp(-dist2 / (r2 * 0.5));
            const dist = Math.sqrt(dist2) || 1;
            px = (dx / dist) * push;
            py = (dy / dist) * push;
          }
          const x = rx + wx + px;
          const y = ry + wy + py;
          if (r === 0) ctx.moveTo(x, y);
          else ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
          prevX = x;
          prevY = y;
        }
        ctx.lineTo(prevX, prevY);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const bg = isDark ? "bg-[#0c0a09]" : "bg-[#fafaf9]";

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${bg}`}
      onMouseMove={onMouse}
      onMouseLeave={clear}
      onTouchStart={onTouch}
      onTouchMove={onTouch}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showLabel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span
            style={{
              color: isDark ? "rgba(255,255,255,0.45)" : "rgba(28,25,22,0.45)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Wave Lines
          </span>
          <span
            style={{
              color: isDark ? "rgba(255,255,255,0.18)" : "rgba(28,25,22,0.22)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            hover to fold
          </span>
        </div>
      )}
    </div>
  );
}
