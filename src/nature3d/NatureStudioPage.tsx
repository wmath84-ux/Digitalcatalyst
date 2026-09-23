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
  Compass, Eye, EyeOff,
  Maximize2, Minimize2, PawPrint, RotateCw,
  LogOut, Rows3, Sparkles, Waves, Wind, X, Globe2, Mountain, Snowflake, Home,
  BookOpen, PenLine, Network, Users, Sunrise, Sun, Sunset, Clock,
  MoreVertical,
} from "lucide-react";
import "./winter.css";
import { Sanctuary, type ViewPreset } from "./engine/scene";
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
  // The whole connected world first, then the two districts, then the
  // points of interest inside the home district.
  { key: "world", label: "World", Icon: Globe2 },
  { key: "trek", label: "Highlands", Icon: Mountain },
  { key: "sanctuary", label: "Sanctuary", Icon: Compass },
  { key: "warehouse", label: "Villa", Icon: Home },
  { key: "board", label: "Board", Icon: Rows3 },
  { key: "waterfall", label: "Waterfall", Icon: Waves },
  { key: "wildlife", label: "Wildlife", Icon: PawPrint },
];

/**
 * The bottom-tray buttons: one per study board. Clicking one flies the camera
 * square onto that board so it fills the view (with the half-metre of world
 * still showing at the edges), which is what makes a 30 m board usable — you
 * read ONE board at a time. "Desk" pulls back to the seat so all three are in
 * frame together. The fifth tray button is the ⋮ menu itself.
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

const BOARD_VIEWS: Array<{ key: ViewPreset; label: string; short: string; Icon: typeof Compass }> = [
  { key: "mindmap", label: "Mind map", short: "Mind", Icon: Network },
  { key: "reading", label: "Reading", short: "Read", Icon: BookOpen },
  { key: "notes", label: "Note taking", short: "Notes", Icon: PenLine },
  { key: "student", label: "Desk", short: "Desk", Icon: Users },
];

export default function NatureStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Sanctuary | null>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  // Measured chrome so the engine can frame boards clear of it: the slim top
  // row (stats chip only — the menu moved into the tray) and the bottom tray.
  const hudTopRef = useRef<HTMLElement | null>(null);
  const hudTrayRef = useRef<HTMLElement | null>(null);

  const [supported] = useState(() => webglSupported());
  const [booting, setBooting] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  // Low-tier UI diet: the engine's budget decides once at boot. When true,
  // the root gets `sanctuary-lite` and the wallpaper-grade backdrop blurs
  // are downgraded (see winter.css) — backdrop-filter is a fullscreen
  // sample+blur per chrome element per frame, the costliest UI effect on a
  // tile GPU (the research's UI-overdraw rule applied to the HUD itself).
  const [liteFx, setLiteFx] = useState(false);
  const [windIdx, setWindIdx] = useState(1);
  const [iceAge, setIceAge] = useState(false);
  const [animeSky, setAnimeSky] = useState(false);
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
  // Which study board the camera is fitted to — null once the learner jumps
  // to a scenery view instead, so "no board enabled" is a real state (the eye
  // button only fit-zooms when a board IS in focus).
  const [activeBoard, setActiveBoard] = useState<ViewPreset | null>("student");
  // The bottom tray (4 board buttons + the ⋮ menu) is ON by default; it hides
  // from inside the ⋮ menu and comes back with the bottom-right eye button.
  const [trayVisible, setTrayVisible] = useState(true);
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
      // The tier is fixed for the session, so this fires once (not per frame).
      setLiteFx(engine.budget.tier === "low");
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
  // Measure the HUD chrome and hand its screen insets to the engine. The
  // engine then frames each study board inside the FREE rect only, which is
  // what keeps the board's buttons out from under the trays — the reason the
  // buttons used to "click kabhi-kabhi" at the default full-screen framing
  // and only worked once the learner pinched out.
  //
  // The chrome is now: ONE slim top row (stats chip only) + the bottom tray.
  // Both are measured, so a framed board still gets nearly the whole screen
  // while its own buttons stay clear of the tray.
  const refreshInsets = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (hudHidden) {
      eng.setHudInsets({ top: 10, bottom: 10, left: 10, right: 10 });
      return;
    }
    const top = hudTopRef.current
      ? hudTopRef.current.getBoundingClientRect().bottom + 14
      : 76;
    let bottom = 24;
    const tray = hudTrayRef.current;
    if (trayVisible && tray) {
      // The tray is centred at the bottom; its top edge is the floor a
      // framed board must not slide under (viewport coords — the canvas is
      // a fixed full-viewport surface).
      bottom = Math.max(bottom, window.innerHeight - tray.getBoundingClientRect().top + 12);
    }
    eng.setHudInsets({ top, bottom, left: 16, right: 16 });
  }, [hudHidden, trayVisible]);

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

  // The bottom-right eye: one tap hides EVERY button (tray + stats chip) —
  // only the eye remains. If a study board is in focus it re-frames
  // full-bleed at the freed rect (the effect below reframes); if no board is
  // enabled, the camera simply stays where it is, as before. Tapping again
  // brings every button back — including the tray if it was hidden from the
  // ⋮ menu.
  const toggleHud = useCallback(() => {
    setMenuOpen(false);
    if (hudHidden) setTrayVisible(true);
    setHudHidden((v) => !v);
  }, [hudHidden]);

  useEffect(() => {
    refreshInsets();
    reframeActiveBoard();
  }, [hudHidden, trayVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <main className={liteFx ? "sanctuary-lite fixed inset-0 z-[90] bg-[#0b1620]" : "fixed inset-0 z-[90] bg-[#0b1620]"}>
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

        {/* ── Top stats chip — the only chrome left up here. The ⋮ menu
            and the board buttons have moved DOWN into the bottom tray, so
            the top-left corner belongs to the world again. ── */}
        {!hudHidden ? (
        <header
          ref={hudTopRef}
          className="pointer-events-none absolute inset-x-3 top-3 z-40 flex items-start justify-end gap-2"
        >

          <span
            ref={statsRef}
            className="pointer-events-auto rounded-xl border border-white/18 bg-slate-950/45 px-2.5 py-2 font-mono text-[10px] font-bold text-emerald-300 backdrop-blur-xl"
          >
            — fps
          </span>
        </header>
        ) : null}

        {/* ── Bottom tray — ON by default. Exactly five controls: the four
            study boards (Mind / Reading / Notes / Desk) plus the ⋮ menu as
            the fifth button; every other control lives inside that menu.
            The tray can be hidden from inside the menu itself, and one tap
            on the bottom-right eye brings every button back. ── */}
        {!hudHidden && trayVisible ? (
        <p className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/50 px-3 py-1 text-[10px] font-medium text-white/75 backdrop-blur-md">
          Two fingers fly · double-tap to go
        </p>
        ) : null}
        {!hudHidden && trayVisible ? (
        <nav
          ref={hudTrayRef}
          aria-label="Study boards and all controls"
          className="pointer-events-auto absolute bottom-3 left-1/2 z-40 -translate-x-1/2"
        >
          <div className="flex items-center gap-1 rounded-2xl border border-white/22 bg-slate-950/55 p-1.5 shadow-2xl backdrop-blur-xl">
            {BOARD_VIEWS.map(({ key, label, short, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={activeBoard === key}
                aria-label={label}
                title={label}
                onClick={() => {
                  engineRef.current?.focus(key);
                  setActiveBoard(key);
                }}
                className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition ${
                  activeBoard === key
                    ? "bg-emerald-400/25 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]"
                    : "text-white/85 hover:bg-white/15"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[8px] font-bold leading-none tracking-wide">{short}</span>
              </button>
            ))}

            <div aria-hidden className="mx-0.5 h-8 w-px bg-white/15" />

            {/* Fifth tray button: the ⋮ menu itself (moved down from the
                top-left corner). The dropdown opens UPWARDS from the tray. */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-label={menuOpen ? "Close the controls menu" : "Open all controls"}
                onClick={() => setMenuOpen((v) => !v)}
                title={menuOpen ? "Close the menu" : "All controls — boards, views, light, camera"}
                className={`grid h-12 w-12 place-items-center rounded-xl border transition ${
                  menuOpen
                    ? "border-emerald-300/60 bg-emerald-500/30 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)]"
                    : "border-white/22 bg-slate-950/55 text-white/85 hover:bg-white/15"
                }`}
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {menuOpen ? (
                <>
                  {/* Tap-anywhere-else closes the menu. */}
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/22 bg-slate-950/85 shadow-2xl backdrop-blur-xl">
                    {/* The title card that used to sit loose in the top bar. */}
                    <div className="flex items-center gap-3 border-b border-white/10 px-3.5 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-amber-400 via-orange-400 to-emerald-500 text-white shadow-lg shadow-amber-500/25">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h1 className="flex flex-wrap items-center gap-2 text-[13px] font-black tracking-tight text-white">
                          Morning Nature Sanctuary
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/25 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                            {iceAge ? "Ice Age" : "Living biome"}
                          </span>
                        </h1>
                        <p className="truncate text-[11px] text-white/55">
                          {iceAge
                            ? "Frozen world · Drifting snow · Frosted study space"
                            : "Highlands · Waterfall · Living forest"}
                        </p>
                      </div>
                    </div>

                    <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-1.5">
                      {/* ── Study boards (mirrors the tray's first four) ── */}
                      <MenuSection label="Study boards">
                        {BOARD_VIEWS.map(({ key, label, Icon }) => (
                          <MenuItem
                            key={key}
                            Icon={Icon}
                            label={label}
                            active={activeBoard === key}
                            onClick={() => {
                              engineRef.current?.focus(key);
                              setActiveBoard(key);
                              setMenuOpen(false);
                            }}
                          />
                        ))}
                      </MenuSection>

                      {/* ── Viewpoints (the old presets row) ── */}
                      <MenuSection label="Views">
                        {PRESETS.map(({ key, label, Icon }) => (
                          <MenuItem
                            key={key}
                            Icon={Icon}
                            label={label}
                            onClick={() => {
                              engineRef.current?.focus(key);
                              setActiveBoard(null);
                              setMenuOpen(false);
                            }}
                          />
                        ))}
                      </MenuSection>

                      {/* ── Light (the old segmented daylight switch) ── */}
                      <MenuSection label="Light">
                        <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">
                          {DAYLIGHT_MODES.map(({ key, label, Icon }) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                engineRef.current?.setDaylightMode(key);
                                setDaylight(key);
                              }}
                              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[9px] font-bold transition ${
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
                              {label}
                            </button>
                          ))}
                        </div>
                        {daylight === "auto" ? (
                          <p className="px-3 pt-1 font-mono text-[10px] font-bold text-amber-200/80">
                            {String(Math.floor(clockHour)).padStart(2, "0")}:
                            {String(Math.floor((clockHour % 1) * 60)).padStart(2, "0")} · following your clock
                          </p>
                        ) : null}
                      </MenuSection>

                      {/* ── Scene toggles (the old top-bar cluster) ── */}
                      <MenuSection label="Scene">
                        <MenuItem
                          Icon={Snowflake}
                          label="Ice Age"
                          active={iceAge}
                          right={iceAge ? "On" : "Off"}
                          onClick={() => {
                            const next = !iceAge;
                            engineRef.current?.setIceAge(next);
                            setIceAge(next);
                          }}
                        />
                        <MenuItem
                          Icon={Sparkles}
                          label="Anime sky"
                          active={animeSky}
                          right={animeSky ? "On" : "Off"}
                          onClick={() => {
                            const next = !animeSky;
                            engineRef.current?.setAnimeSky(next);
                            setAnimeSky(next);
                          }}
                        />
                        <MenuItem
                          Icon={Wind}
                          label="Wind strength"
                          right={WIND_STEPS[windIdx].label}
                          onClick={cycleWind}
                        />
                        <MenuItem
                          Icon={RotateCw}
                          label="Auto 360° orbit"
                          active={autoOrbit}
                          right={autoOrbit ? "On" : "Off"}
                          onClick={toggleOrbit}
                        />
                        <MenuItem
                          Icon={immersive ? Minimize2 : Maximize2}
                          label={immersive ? "Exit fullscreen" : "Fullscreen"}
                          active={immersive}
                          onClick={() => {
                            toggleFullscreen();
                            setMenuOpen(false);
                          }}
                        />
                        {/* Hides this tray; the bottom-right eye button is
                            what brings every button back. */}
                        <MenuItem
                          Icon={Rows3}
                          label="Bottom tray"
                          right="Hide"
                          onClick={() => {
                            setTrayVisible(false);
                            setMenuOpen(false);
                          }}
                        />
                      </MenuSection>

                      <div className="mt-1 border-t border-white/10 p-1.5">
                        <MenuItem
                          Icon={LogOut}
                          label="Back to Digital Catalyst"
                          onClick={exitSanctuary}
                          danger
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </nav>
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

        {/* ── HUD hide toggle — bottom-right corner. One tap hides EVERY
            button (bottom tray + stats chip) so only this button and the
            world remain; if a study board is in focus it re-frames
            full-bleed, otherwise the camera simply stays. Tapping again
            brings every button back (including a menu-hidden tray). ── */}
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

/** One labelled group inside the kebab dropdown. */
function MenuSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-0.5 pb-1 pt-2 first:pt-0.5">
      <p className="px-2.5 pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * One row in the kebab dropdown: icon + label + optional right-side state
 * readout (e.g. "On", "Breeze"). Rows that navigate close the menu; toggles
 * stay open (their handler decides).
 */
function MenuItem({
  Icon,
  label,
  right,
  active,
  danger,
  onClick,
}: {
  Icon: typeof Compass;
  label: string;
  right?: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-bold transition ${
        danger
          ? "text-rose-200 hover:bg-rose-500/20"
          : active
            ? "bg-emerald-400/25 text-white shadow-[0_0_16px_rgba(16,185,129,0.25)]"
            : "text-white/85 hover:bg-white/12"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${danger ? "text-rose-300" : "text-white/70"}`} />
      <span className="flex-1 truncate">{label}</span>
      {right ? <span className="text-[10px] font-bold text-white/50">{right}</span> : null}
    </button>
  );
}

/** A D-pad button that repeats while held (pointer capture, rAF driven). */
