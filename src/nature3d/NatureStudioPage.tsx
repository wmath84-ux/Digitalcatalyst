// src/nature3d/NatureStudioPage.tsx
//
// THE 3D STUDY SANCTUARY PAGE.
//
// Rendered inside the normal desktop shell, so the persistent left side panel
// stays exactly where it is on every other page and the environment opens
// beside it — no full-screen takeover, no separate window.
//
// React's only jobs here are:
//   1. mount a canvas and hand it to `Sanctuary` (the imperative engine),
//   2. draw the glass HUD,
//   3. forward joystick vectors into the engine via refs.
//
// It deliberately never re-renders while the scene animates — the FPS badge
// updates through a direct DOM write, and the joysticks talk to the engine
// through a ref. That is what keeps the panel at a locked frame rate.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Compass, Eye, Footprints,
  Maximize2, Minimize2, MousePointer2, Move3d, PawPrint, RotateCw,
  LogOut, Rows3, Sparkles, Waves, Wind, X,
} from "lucide-react";
import Joystick from "./components/Joystick";
import { Sanctuary, type CameraMode, type ViewPreset } from "./engine/scene";
import { webglSupported } from "./engine/quality";

const WIND_STEPS = [
  { label: "Calm", mult: 0.45 },
  { label: "Breeze", mult: 1 },
  { label: "Gusty", mult: 2.2 },
];

const PRESETS: Array<{ key: ViewPreset; label: string; Icon: typeof Compass }> = [
  { key: "sanctuary", label: "Sanctuary", Icon: Compass },
  { key: "board", label: "Board", Icon: Rows3 },
  { key: "student", label: "Student", Icon: Eye },
  { key: "waterfall", label: "Waterfall", Icon: Waves },
  { key: "wildlife", label: "Wildlife", Icon: PawPrint },
];

export default function NatureStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Sanctuary | null>(null);
  const statsRef = useRef<HTMLSpanElement>(null);

  const [supported] = useState(() => webglSupported());
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<CameraMode>("orbit");
  const [windIdx, setWindIdx] = useState(1);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const [showPlacer, setShowPlacer] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the fullscreen flag honest when the user leaves via Esc / F11.
  useEffect(() => {
    const sync = () => setImmersive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // ── Boot the engine once ────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return undefined;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;

    let engine: Sanctuary | null = null;
    try {
      engine = new Sanctuary({
        canvas,
        dom: host,
        onBoardTap: () => setShowLesson(true),
        onBoardGrab: setCarrying,
        onStats: (s) => {
          // Direct DOM write — no setState, so the loop never triggers React.
          const el = statsRef.current;
          if (el) el.textContent = `${Math.round(s.fps)} fps · ${s.tier} · ${s.draws} draws`;
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The 3D scene could not start on this device.");
      return undefined;
    }
    engineRef.current = engine;

    const resize = () => {
      const r = host.getBoundingClientRect();
      engine?.resize(r.width, r.height);
    };
    resize();
    engine.start();
    // Two frames in, the first render has landed — drop the boot veil.
    const revealTimer = window.setTimeout(() => setBooting(false), 240);

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Pause completely when scrolled away or the tab is hidden: 0 % CPU.
    const io = new IntersectionObserver(
      ([entry]) => engine?.setVisible(entry.isIntersecting && !document.hidden),
      { threshold: 0.01 },
    );
    io.observe(host);
    const onVisibility = () => engine?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(revealTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [supported]);

  // ── HUD actions ─────────────────────────────────────────────────────
  const toggleMode = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next: CameraMode = engine.getMode() === "fpp" ? "orbit" : "fpp";
    engine.setMode(next);
    setMode(next);
    if (next === "fpp") setAutoOrbit(false);
  }, []);

  const cycleWind = useCallback(() => {
    setWindIdx((i) => {
      const next = (i + 1) % WIND_STEPS.length;
      engineRef.current?.setWind(WIND_STEPS[next].mult);
      return next;
    });
  }, []);

  const toggleOrbit = useCallback(() => {
    setAutoOrbit((v) => {
      engineRef.current?.setAutoOrbit(!v);
      return !v;
    });
  }, []);

  // The shell (rail + top bar) is gone on this route, so the HUD owns the
  // only way back out.
  const exitSanctuary = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    window.location.hash = "#/home";
  }, []);

  // The page already fills the viewport, so this button escalates to real
  // browser fullscreen (hides the OS/browser chrome too).
  const toggleFullscreen = useCallback(() => {
    const root = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.requestFullscreen?.().catch(() => {});
  }, []);

  const onMoveStick = useCallback((x: number, y: number, active: boolean) => {
    engineRef.current?.setMoveStick(x, y, active);
  }, []);

  if (!supported || error) {
    return (
      <main className="grid min-h-[60vh] place-items-center px-6 py-10">
        <div className="max-w-md rounded-3xl border border-white/12 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <h1 className="text-lg font-black text-white">3D Sanctuary unavailable</h1>
          <p className="mt-2 text-sm text-white/60">
            {error ?? "This browser or device does not expose WebGL, so the interactive environment cannot run here. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[90] bg-[#0b1620]">
      <div
        className="absolute overflow-hidden bg-[#0b1620]"
        style={{ inset: 0 }}
      >
        {/* ── WebGL host. `touch-action:none` so a drag never scrolls the page ── */}
        <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none", cursor: carrying ? "grabbing" : "grab" }}>
          <canvas ref={canvasRef} className="block h-full w-full outline-none" />
        </div>

        {/* ── Boot veil ── */}
        {booting ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b1620] transition-opacity duration-500">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-emerald-300" />
              <p className="mt-3 text-[12px] font-bold tracking-wide text-white/70">Growing the meadow…</p>
            </div>
          </div>
        ) : null}

        {/* ── Top bar ── */}
        <header className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/22 bg-slate-950/45 px-3.5 py-2.5 backdrop-blur-xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-tr from-amber-400 via-orange-400 to-emerald-500 text-white shadow-lg shadow-amber-500/25">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-[13px] font-black tracking-tight text-white">
                Morning Nature Sanctuary
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/25 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                  Living biome
                </span>
              </h1>
              <p className="text-[11px] text-white/55">
                1 km valley · Waterfall · Grazing herds · Drag or resize the board
              </p>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span
              ref={statsRef}
              className="rounded-xl border border-white/18 bg-slate-950/45 px-2.5 py-2 font-mono text-[10px] font-bold text-emerald-300 backdrop-blur-xl"
            >
              — fps
            </span>
            <HudButton onClick={cycleWind} title="Wind strength">
              <Wind className="h-3.5 w-3.5 text-sky-200" />
              <span className="hidden sm:inline">{WIND_STEPS[windIdx].label}</span>
            </HudButton>
            <HudButton onClick={toggleOrbit} active={autoOrbit} title="Auto 360° orbit">
              <RotateCw className="h-3.5 w-3.5" />
            </HudButton>
            <HudButton onClick={() => setShowPlacer((v) => !v)} active={showPlacer} title="Board placement tools">
              <Move3d className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Board</span>
            </HudButton>
            <HudButton onClick={toggleFullscreen} active={immersive} title={immersive ? "Exit fullscreen" : "Fullscreen"}>
              {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </HudButton>
            <HudButton onClick={exitSanctuary} title="Back to Digital Catalyst">
              <LogOut className="h-3.5 w-3.5 text-rose-200" />
              <span className="hidden sm:inline">Exit</span>
            </HudButton>
          </div>
        </header>

        {/* ── FPP / camera-mode button ── */}
        <div className="pointer-events-auto absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
          <button
            type="button"
            onClick={toggleMode}
            className={`group flex w-[52px] flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[9px] font-black uppercase tracking-wide backdrop-blur-xl transition ${
              mode === "fpp"
                ? "border-emerald-300/60 bg-emerald-500/30 text-white shadow-[0_0_24px_rgba(16,185,129,0.4)]"
                : "border-white/20 bg-slate-950/45 text-white/80 hover:bg-white/15"
            }`}
            title="Toggle first-person walk mode"
          >
            {mode === "fpp" ? <Footprints className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            FPP
          </button>
          <div className="rounded-2xl border border-white/18 bg-slate-950/40 px-2 py-2 text-center text-[8px] font-bold uppercase tracking-wide text-white/45 backdrop-blur-xl">
            {mode === "fpp" ? "Walking" : "Orbit"}
          </div>
        </div>

        {/* ── Viewpoint presets ── */}
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-slate-950/50 p-1.5 backdrop-blur-xl">
          {PRESETS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => engineRef.current?.focus(key)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold text-white/85 transition hover:bg-white/20"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Twin sticks (FPP only) ─────────────────────────────────────
            Left = walk, right = look. Both are pointer-capture driven, so a
            finger can leave the pad without dropping the input. */}
        {mode === "fpp" ? (
          <>
            <div className="pointer-events-auto absolute bottom-16 left-4 sm:bottom-20 sm:left-8">
              <Joystick onChange={onMoveStick} label="Move" accent="#34d399" size={128} />
            </div>
            <div className="pointer-events-auto absolute bottom-16 right-4 flex items-end gap-3 sm:bottom-20 sm:right-8">
              {/* Hold-to-run — the touch equivalent of Shift. */}
              <button
                type="button"
                onPointerDown={() => engineRef.current?.setSprint(true)}
                onPointerUp={() => engineRef.current?.setSprint(false)}
                onPointerLeave={() => engineRef.current?.setSprint(false)}
                onPointerCancel={() => engineRef.current?.setSprint(false)}
                className="mb-7 grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-slate-950/45 text-white/85 backdrop-blur-xl transition active:scale-95 active:bg-emerald-500/35"
                title="Hold to run"
              >
                <Footprints className="h-5 w-5" />
              </button>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="h-5 w-5 rounded-full border border-white/45 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
              </div>
            </div>
            <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 translate-y-12 text-[10px] font-semibold text-white/45 lg:block">
              WASD or the stick to walk · Shift to run · swipe anywhere to look around
            </p>
          </>
        ) : null}

        {/* ── Board placement pad ── */}
        {showPlacer ? (
          <div className="pointer-events-auto absolute right-3 top-24 w-[196px] rounded-2xl border border-white/20 bg-slate-950/55 p-3 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-black text-white">Place the board</p>
              <button type="button" onClick={() => setShowPlacer(false)} className="text-white/50 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-2.5 text-[10px] leading-relaxed text-white/50">
              Grab the middle with one finger to move it anywhere, or pull any
              edge or corner to resize. Pinch to push it near or far — it stays
              where you leave it and never sinks below the ground.
            </p>
            <div className="mx-auto grid w-[120px] grid-cols-3 gap-1">
              <span />
              <PadBtn onPress={() => engineRef.current?.nudgeBoard(0, 0.25, 0)}><ArrowUp className="h-3.5 w-3.5" /></PadBtn>
              <span />
              <PadBtn onPress={() => engineRef.current?.nudgeBoard(-0.3, 0, 0)}><ArrowLeft className="h-3.5 w-3.5" /></PadBtn>
              <PadBtn onPress={() => engineRef.current?.resetBoard()}><MousePointer2 className="h-3.5 w-3.5" /></PadBtn>
              <PadBtn onPress={() => engineRef.current?.nudgeBoard(0.3, 0, 0)}><ArrowRight className="h-3.5 w-3.5" /></PadBtn>
              <span />
              <PadBtn onPress={() => engineRef.current?.nudgeBoard(0, -0.25, 0)}><ArrowDown className="h-3.5 w-3.5" /></PadBtn>
              <span />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => engineRef.current?.zoomBoard(0.85)}
                className="flex-1 rounded-lg border border-white/18 bg-white/10 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"
              >
                Closer
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.zoomBoard(1.18)}
                className="flex-1 rounded-lg border border-white/18 bg-white/10 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"
              >
                Farther
              </button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => engineRef.current?.scaleBoard(1 / 1.15)}
                className="flex-1 rounded-lg border border-white/18 bg-white/10 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"
              >
                Smaller
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.scaleBoard(1.15)}
                className="flex-1 rounded-lg border border-white/18 bg-white/10 py-1.5 text-[10px] font-bold text-white hover:bg-white/20"
              >
                Bigger
              </button>
            </div>
          </div>
        ) : null}

        {carrying ? (
          <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-emerald-300/50 bg-emerald-500/25 px-3.5 py-1.5 text-[11px] font-bold text-emerald-100 backdrop-blur-xl">
            Carrying board — release to place
          </div>
        ) : null}

        {/* ── Lesson modal ── */}
        {showLesson ? (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4 backdrop-blur-md"
            onClick={() => setShowLesson(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-white/25 bg-slate-950/70 p-6 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black">Botanical field guide</h3>
                  <p className="text-[11px] text-sky-200/75">Morning meadow study &amp; ecology</p>
                </div>
                <button type="button" onClick={() => setShowLesson(false)} className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-white/70">
                The board floats on a concealed cantilever — nothing protrudes from the
                front. Drag it with one finger to reposition it anywhere in the meadow,
                pinch or scroll over it to push it away or pull it closer, and it will
                always stay above the grass line.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ["Sunrise", "05:42"],
                  ["Air", "18 °C"],
                  ["Humidity", "72 %"],
                  ["Species seen", "14"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5">
                    <p className="text-white/50">{k}</p>
                    <p className="text-sm font-bold text-white">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* The old caption strip lived below the viewport. The page is now a
          fixed full-screen surface, so there is no "below" — the same hints
          are surfaced in the HUD and the board panel instead. */}
    </main>
  );
}

function HudButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-bold backdrop-blur-xl transition ${
        active
          ? "border-amber-300/60 bg-amber-400/25 text-amber-100"
          : "border-white/18 bg-slate-950/45 text-white/85 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

/** A D-pad button that repeats while held (pointer capture, rAF driven). */
function PadBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const timer = useRef(0);
  const start = () => {
    onPress();
    const loop = () => {
      onPress();
      timer.current = window.setTimeout(loop, 60);
    };
    timer.current = window.setTimeout(loop, 320);
  };
  const stop = () => window.clearTimeout(timer.current);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="grid h-9 place-items-center rounded-lg border border-white/18 bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
    >
      {children}
    </button>
  );
}
