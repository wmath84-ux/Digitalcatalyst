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
  Compass, Eye, EyeOff, Footprints,
  Maximize2, Minimize2, PawPrint, RotateCw,
  LogOut, Rows3, Sparkles, Waves, Wind, X, Globe2, Mountain, Rabbit,
  BookOpen, PenLine, Network, Users, Sunrise, Sun, Sunset, Clock,
  ChevronsUp,
} from "lucide-react";
import Joystick from "./components/Joystick";
import { Sanctuary, type CameraMode, type ViewPreset } from "./engine/scene";
import { webglSupported } from "./engine/quality";
import BoardPortals, { type BoardHosts } from "./boards/StudyBoards";
import { useAuth } from "../context/AuthContext";
import useOwnedCourses from "./boards/useOwnedCourses";
import { hourForMode, type DaylightMode } from "./engine/daylight";

const WIND_STEPS = [
  { label: "Calm", mult: 0.45 },
  { label: "Breeze", mult: 1 },
  { label: "Gusty", mult: 2.2 },
];

const PRESETS: Array<{ key: ViewPreset; label: string; Icon: typeof Compass }> = [
  // The whole connected world first, then the three districts, then the
  // points of interest inside the home district.
  { key: "world", label: "World", Icon: Globe2 },
  { key: "trek", label: "Highlands", Icon: Mountain },
  { key: "sanctuary", label: "Sanctuary", Icon: Compass },
  { key: "safari", label: "Safari", Icon: Rabbit },
  { key: "board", label: "Board", Icon: Rows3 },
  { key: "waterfall", label: "Waterfall", Icon: Waves },
  { key: "wildlife", label: "Wildlife", Icon: PawPrint },
];

/**
 * The study-board tray.
 *
 * These are the three boards standing around the chair. Clicking one flies the
 * camera square onto that board so it fills the view (with the half-metre of
 * world still showing at the edges), which is what makes a 30 m board usable:
 * you read ONE board at a time. "Desk" pulls back to the seat so all three are
 * in frame together.
 */
/**
 * Lighting modes for the top tray.
 *
 * "Auto" leads because it is the default: the sanctuary follows the device
 * clock, so a learner opening it at 5 pm gets evening light without touching
 * anything. The other three pin the sun to a representative hour. Night is
 * deliberately absent — after sunset the scene holds the evening look, since
 * a dark study space would make the boards unreadable.
 */
const DAYLIGHT_MODES: { key: DaylightMode; label: string; Icon: typeof Sun }[] = [
  { key: "auto", label: "Auto", Icon: Clock },
  { key: "morning", label: "Morning", Icon: Sunrise },
  { key: "midday", label: "Midday", Icon: Sun },
  { key: "evening", label: "Evening", Icon: Sunset },
];

const BOARD_VIEWS: Array<{ key: ViewPreset; label: string; Icon: typeof Compass }> = [
  { key: "mindmap", label: "Mind map", Icon: Network },
  { key: "reading", label: "Reading", Icon: BookOpen },
  { key: "notes", label: "Note taking", Icon: PenLine },
  { key: "student", label: "Desk", Icon: Users },
];

export default function NatureStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Sanctuary | null>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  // The HUD trays, measured so the engine can frame boards around them.
  const hudTopRef = useRef<HTMLElement | null>(null);
  const hudTrayRef = useRef<HTMLDivElement | null>(null);
  const hudPresetRef = useRef<HTMLDivElement | null>(null);
  const hudFppRef = useRef<HTMLDivElement | null>(null);

  const [supported] = useState(() => webglSupported());
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<CameraMode>("orbit");
  const [windIdx, setWindIdx] = useState(1);
  const [daylight, setDaylight] = useState<DaylightMode>("auto");
  // Shown next to the buttons so "Auto" is legible — otherwise the learner
  // cannot tell which hour the scene decided on. Ticks once a minute.
  const [clockHour, setClockHour] = useState(() => hourForMode("auto"));
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The board faces are DOM elements the engine creates. They only exist once
  // the engine has booted, so React portals into them on a second pass.
  const [boardHosts, setBoardHosts] = useState<BoardHosts>({ mindmap: null, reading: null, notes: null });
  const [activeBoard, setActiveBoard] = useState<ViewPreset>("student");
  // True when the learner has hidden every HUD button (bottom-right toggle).
  // Only the toggle itself stays on screen.
  const [hudHidden, setHudHidden] = useState(false);

  const { user } = useAuth();
  // Ownership is resolved from ALL five sources the app recognises —
  // canonical entitlements, the active subscription's product unlocks and
  // both legacy purchase records — not just `purchasedIds`, which is only
  // the legacy subcollection and left subscribers with an empty library.
  const { courses: ownedCourses, loading: coursesLoading } = useOwnedCourses();

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
    setBoardHosts(engine.boardHosts());

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

  useEffect(() => {
    if (daylight !== "auto") return undefined;
    const id = window.setInterval(() => setClockHour(hourForMode("auto")), 60_000);
    setClockHour(hourForMode("auto"));
    return () => window.clearInterval(id);
  }, [daylight]);

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

  // ── Board click safety ──────────────────────────────────────────────
  //
  // Measure the HUD trays and hand their screen insets to the engine. The
  // engine then frames each study board inside the FREE rect only, which is
  // what keeps the board's buttons out from under the trays — the reason the
  // buttons used to "click kabhi-kabhi" at the default full-screen framing
  // and only worked once the learner pinched out.
  const refreshInsets = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (hudHidden) {
      eng.setHudInsets({ top: 10, bottom: 10, left: 10, right: 10 });
      return;
    }
    const ih = window.innerHeight;
    const top = hudTopRef.current
      ? hudTopRef.current.getBoundingClientRect().bottom + 14
      : 84;
    const trayTop = hudTrayRef.current
      ? ih - hudTrayRef.current.getBoundingClientRect().top
      : 112;
    const presetTop = hudPresetRef.current
      ? ih - hudPresetRef.current.getBoundingClientRect().top
      : 58;
    const bottom = Math.max(trayTop, presetTop) + 16;
    const left = hudFppRef.current
      ? hudFppRef.current.getBoundingClientRect().right + 16
      : 80;
    eng.setHudInsets({ top, bottom, left, right: 18 });
  }, [hudHidden]);

  // Re-measure whenever the HUD set changes or the window resizes.
  useEffect(() => {
    refreshInsets();
    const onResize = () => refreshInsets();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refreshInsets]);

  // Hiding the HUD frees the whole screen: if a board is framed, re-frame it
  // to the new (full-screen) rect so the learner gets a true full-bleed board.
  const reframeActiveBoard = useCallback(() => {
    if (
      activeBoard === "reading" ||
      activeBoard === "notes" ||
      activeBoard === "mindmap" ||
      activeBoard === "student"
    ) {
      engineRef.current?.focus(activeBoard);
    }
  }, [activeBoard]);

  const toggleHud = useCallback(() => {
    setHudHidden((v) => !v);
  }, []);

  useEffect(() => {
    refreshInsets();
    reframeActiveBoard();
  }, [hudHidden]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none", cursor: "grab" }}>
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

        {/* ── Top bar (hidden with the rest of the HUD by the bottom-right
            toggle — the boards gain the full screen back) ── */}
        {!hudHidden ? (
        <header
          ref={hudTopRef}
          className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2"
        >
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
                1 km valley · Waterfall · Grazing herds
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
            <div className="flex items-center gap-1 rounded-xl border border-white/18 bg-slate-950/45 p-1 backdrop-blur-xl">
              {DAYLIGHT_MODES.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    engineRef.current?.setDaylightMode(key);
                    setDaylight(key);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                    daylight === key
                      ? "bg-amber-400/25 text-white shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                      : "text-white/70 hover:bg-white/12"
                  }`}
                  title={
                    key === "auto"
                      ? "Follow the real time of day"
                      : `Light the sanctuary as ${label.toLowerCase()}`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{label}</span>
                </button>
              ))}
              {daylight === "auto" ? (
                <span className="px-1 font-mono text-[10px] font-bold text-amber-200/80">
                  {String(Math.floor(clockHour)).padStart(2, "0")}:
                  {String(Math.floor((clockHour % 1) * 60)).padStart(2, "0")}
                </span>
              ) : null}
            </div>

            <HudButton onClick={cycleWind} title="Wind strength">
              <Wind className="h-3.5 w-3.5 text-sky-200" />
              <span className="hidden sm:inline">{WIND_STEPS[windIdx].label}</span>
            </HudButton>
            <HudButton onClick={toggleOrbit} active={autoOrbit} title="Auto 360° orbit">
              <RotateCw className="h-3.5 w-3.5" />
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
        ) : null}

        {/* ── FPP / camera-mode button ── */}
        {!hudHidden ? (
        <div ref={hudFppRef} className="pointer-events-auto absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
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
        ) : null}

        {/* ── The live board surfaces ───────────────────────────────────
            React owns these trees; the browser's 3D compositor decides where
            their pixels land on the boards. */}
        <BoardPortals
          hosts={boardHosts}
          courses={ownedCourses}
          loading={coursesLoading}
          uid={user?.id ?? null}
        />

        {/* ── Study-board tray ── */}
        {!hudHidden ? (
        <div ref={hudTrayRef} className="pointer-events-auto absolute bottom-16 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/20 bg-slate-950/60 p-1.5 backdrop-blur-xl">
          {BOARD_VIEWS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                // The board fills the view in its own 3D screen — the learner
                // looks at the board itself. Its taps are guaranteed by the
                // engine's input bridge (scene.ts), no 2D detour.
                engineRef.current?.focus(key);
                setActiveBoard(key);
              }}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-bold transition ${
                activeBoard === key
                  ? "bg-emerald-400/25 text-white shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                  : "text-white/80 hover:bg-white/15"
              }`}
              title={`Look at the ${label.toLowerCase()} board`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        ) : null}

        {/* ── Viewpoint presets ── */}
        {!hudHidden ? (
        <div ref={hudPresetRef} className="pointer-events-auto absolute bottom-3 left-1/2 flex max-w-[calc(100vw-6rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/20 bg-slate-950/50 p-1.5 backdrop-blur-xl">
          {PRESETS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                engineRef.current?.focus(key);
              }}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold text-white/85 transition hover:bg-white/20"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
        ) : null}

        {/* ── HUD hide toggle — bottom-right corner. Clicking it hides every
            other tray button (top bar, both bottom trays, the FPP pad) so
            only this button and the world remain; clicking again brings the
            full HUD back. ── */}
        <div className="pointer-events-auto absolute bottom-3 right-3 z-30">
          <button
            type="button"
            onClick={toggleHud}
            className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur-xl transition ${
              hudHidden
                ? "border-emerald-300/60 bg-emerald-500/30 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)]"
                : "border-white/20 bg-slate-950/55 text-white/85 hover:bg-white/15"
            }`}
            title={hudHidden ? "Show all buttons" : "Hide all buttons"}
          >
            {hudHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>

        {/* ── Twin sticks (FPP only) ─────────────────────────────────────
            Left = walk, right = look. Both are pointer-capture driven, so a
            finger can leave the pad without dropping the input. */}
        {mode === "fpp" ? (
          hudHidden ? null : (
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
              {/* Tap to jump — edge-triggered, same as Space on desktop. */}
              <button
                type="button"
                onPointerDown={() => engineRef.current?.queueJump()}
                className="mb-7 grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-slate-950/45 text-white/85 backdrop-blur-xl transition active:scale-95 active:bg-sky-500/35"
                title="Jump"
              >
                <ChevronsUp className="h-5 w-5" />
              </button>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="h-5 w-5 rounded-full border border-white/45 shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
              </div>
            </div>
            <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 translate-y-12 text-[10px] font-semibold text-white/45 lg:block">
              WASD or the stick to walk · Shift to run · Space to jump · swipe anywhere to look around
            </p>
          </>
          )
        ) : null}

        {/* ── Board placement pad ── */}

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
