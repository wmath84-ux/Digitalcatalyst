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

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Compass, Eye, EyeOff, Minimize2,
  PawPrint, Trees, Sparkles, Waves, X, Globe2, Mountain, Home,
  BookOpen, PenLine, Network, Users, Rows3, Settings, Layers3,
} from "lucide-react";
import "./winter.css";
import { Sanctuary, type ViewPreset } from "./engine/scene";
import { webglSupported } from "./engine/quality";
import BoardPortals, { type BoardHosts } from "./boards/StudyBoards";
import SanctuaryModuleMenu from "./boards/SanctuaryModuleMenu";
import SanctuarySettings, { type SettingsPage } from "./SanctuarySettings";
import { sanctuaryModulePlayHash } from "./boards/sanctuaryModules";
import GlassDock, { type GlassDockItem } from "../components/glass-dock/GlassDock";
import { useAuth } from "../context/AuthContext";
import useOwnedCourses from "./boards/useOwnedCourses";
import { useMyCourses } from "../hooks/useMyCourses";
import { myCourseToProduct } from "../lib/myCourseAdapter";
import { myCourseStorageId, type MyCourse } from "../types/myCourse";
import { hourForMode, type DaylightMode } from "./engine/daylight";
import {
  enterNatureStudioRotation,
  exitNatureStudioRotation,
} from "../utils/appOrientation";
import {
  exitFullscreen as exitAppFullscreen,
  getFullscreenSnapshot,
  isFullscreenActive,
  subscribeFullscreen,
  toggleFullscreen as toggleAppFullscreen,
  type FullscreenSnapshot,
} from "../utils/fullscreen";

const WIND_STEPS = [
  { label: "Calm", mult: 0.45 },
  { label: "Breeze", mult: 1 },
  { label: "Gusty", mult: 2.2 },
];

const PRESETS: Array<{ key: ViewPreset; label: string; short: string; Icon: typeof Compass }> = [
  // Live on the bottom tray (no longer buried in the ⋮ menu). Short labels
  // keep the row compact; the full name is the button title.
  { key: "world", label: "World", short: "World", Icon: Globe2 },
  { key: "trek", label: "Highlands", short: "Hills", Icon: Mountain },
  { key: "sanctuary", label: "Sanctuary", short: "Isle", Icon: Compass },
  { key: "warehouse", label: "Villa", short: "Villa", Icon: Home },
  { key: "houses", label: "Beach Houses", short: "Beach", Icon: Trees },
  { key: "board", label: "Board", short: "Board", Icon: Rows3 },
  { key: "waterfall", label: "Waterfall", short: "Fall", Icon: Waves },
  { key: "wildlife", label: "Wildlife", short: "Wild", Icon: PawPrint },
];

/**
 * The bottom-tray buttons: one per study board. Clicking one flies the camera
 * square onto that board so it fills the view (with the half-metre of world
 * still showing at the edges), which is what makes a 30 m board usable — you
 * read ONE board at a time. "Desk" pulls back to the seat so all three are in
 * frame together. The fifth tray button is the ⋮ menu itself.
 */
const BOARD_VIEWS: Array<{ key: ViewPreset; label: string; short: string; Icon: typeof Compass }> = [
  { key: "mindmap", label: "Mind map", short: "Mind", Icon: Network },
  { key: "reading", label: "Reading", short: "Read", Icon: BookOpen },
  { key: "notes", label: "Note taking", short: "Notes", Icon: PenLine },
  { key: "student", label: "Desk", short: "Desk", Icon: Users },
];

/** The tray instruction is visible on open, then must leave within this cap. */
const TRAY_INSTRUCTION_MS = 3000;

export default function NatureStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Sanctuary | null>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  // Measured chrome so the engine can frame boards clear of it: the slim top
  // row (stats chip only — the menu moved into the tray) and the bottom tray.
  const hudTopRef = useRef<HTMLElement | null>(null);
  const hudTrayRef = useRef<HTMLDivElement | null>(null);

  const [supported] = useState(() => webglSupported());
  const [booting, setBooting] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("light");
  // Low-tier UI diet: the engine's budget decides once at boot. When true,
  // the root gets `sanctuary-lite` and the wallpaper-grade backdrop blurs
  // are downgraded (see winter.css) — backdrop-filter is a fullscreen
  // sample+blur per chrome element per frame, the costliest UI effect on a
  // tile GPU (the research's UI-overdraw rule applied to the HUD itself).
  const [liteFx, setLiteFx] = useState(false);
  const [windIdx, setWindIdx] = useState(1);
  const [iceAge, setIceAge] = useState(false);
  // Anime sky is OFF by default — procedural dome is the opening sky.
  // Toggle still lives in the Scene menu for turning the panorama on.
  const [animeSky, setAnimeSky] = useState(false);
  const [daylight, setDaylight] = useState<DaylightMode>("auto");
  // Shown next to the buttons so "Auto" is legible — otherwise the learner
  // cannot tell which hour the scene decided on. Ticks once a minute.
  const [clockHour, setClockHour] = useState(() => hourForMode("auto"));
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  // Live fullscreen state for the Scene → Fullscreen row. It tracks EVERY
  // layer the shared controller can use: the native Android immersive bridge
  // (the layer that makes the button work inside the APK), the browser's own
  // Fullscreen API, and the in-page fallback for platforms that expose
  // neither (iOS Safari). See src/utils/fullscreen.ts.
  const [fullscreen, setFullscreen] = useState<FullscreenSnapshot>(() => getFullscreenSnapshot());
  const immersive = fullscreen.active;
  /**
   * The page-level fallback is on when the platform cannot hide the OS chrome
   * at all. The HUD chrome then steps aside (CSS keys off
   * `html[data-app-fullscreen="true"]`) so the world keeps the whole viewport.
   */
  const appImmersive = fullscreen.mode === "app";
  const [error, setError] = useState<string | null>(null);
  // The board faces are DOM elements the engine creates. They only exist once
  // the engine has booted, so React portals into them on a second pass.
  const [boardHosts, setBoardHosts] = useState<BoardHosts>({ mindmap: null, reading: null, notes: null });
  // Which study board the camera is fitted to — null once the learner jumps
  // to a scenery view instead, so "no board enabled" is a real state (the eye
  // button only fit-zooms when a board IS in focus).
  // The engine opens on the whole-world establishing shot, so no study fit is
  // selected until the learner actually chooses one (showing Desk as active
  // here used to advertise a zoom the camera had never applied).
  const [activeBoard, setActiveBoard] = useState<ViewPreset | null>(null);
  // The bottom tray (4 board buttons + the ⋮ menu) is ON by default; it hides
  // from inside the ⋮ menu and comes back with the bottom-right eye button.
  const [trayVisible, setTrayVisible] = useState(true);
  // True when the learner has hidden every HUD button (bottom-right toggle).
  // Only the toggle itself stays on screen.
  const [hudHidden, setHudHidden] = useState(false);
  // The written tray instruction ("Two fingers fly…") is ON when the
  // sanctuary world opens, then hideTrayInstruction() takes it off — at
  // the latest 3 s after the meadow is up. It does not come back.
  const [trayInstructionVisible, setTrayInstructionVisible] = useState(true);
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewPreset | null>(null);
  // The bottom DOCK is hidden behind a slim drag handle by default so the 3D
  // world keeps the whole screen (this is what makes every icon fit in mobile
  // landscape). Swiping up / tapping the handle reveals the dock — the same
  // peek behaviour the desktop shell's footer dock uses. Selecting a view
  // closes it again to free the screen.
  const [dockOpen, setDockOpen] = useState(false);
  // Drag tracking for the handle: distinguishes a tap (toggle) from a
  // swipe (open on up, close on down) without a library.
  const dockDrag = useRef<{ startY: number; moved: boolean } | null>(null);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [focusMine, setFocusMine] = useState(false);

  const { user } = useAuth();
  // Ownership is resolved from ALL five sources the app recognises —
  // canonical entitlements, the active subscription's product unlocks and
  // both legacy purchase records — not just `purchasedIds`, which is only
  // the legacy subcollection and left subscribers with an empty library.
  const { courses: ownedCourses, loading: coursesLoading } = useOwnedCourses();
  const myCourses = useMyCourses();
  const myProducts = useMemo(
    () => myCourses.courses.map(myCourseToProduct),
    [myCourses.courses],
  );

  // Keep the Fullscreen row honest — whoever leaves fullscreen (our button,
  // Esc / F11, the Android swipe-down, the system bars coming back) the label
  // flips back to "Fullscreen". The controller already listens to the browser
  // events; this only mirrors its snapshot into React.
  useEffect(() => {
    setFullscreen(getFullscreenSnapshot());
    return subscribeFullscreen(() => setFullscreen(getFullscreenSnapshot()));
  }, []);

  // HARD LANDSCAPE (PUBG / BGMI): phones open the world already rotated,
  // whether auto-rotate is ON or OFF. Tablets/desktops are left alone.
  // Back to the portrait lock on exit.
  useEffect(() => {
    enterNatureStudioRotation();
    return () => exitNatureStudioRotation();
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
      // clientWidth/Height are the laid-out box. After the CSS landscape
      // fallback rotates [data-sanctuary-root], that box is already the
      // landscape size — getBoundingClientRect would return the AABB of
      // the rotated element (portrait), which would squash the world.
      engine?.resize(host.clientWidth, host.clientHeight);
    };
    resize();
    engine.start();
    // Procedural sky is the default. Anime panorama stays opt-in via menu.
    engine.setAnimeSky(false);
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

  /** Hide the bottom-tray instruction. Called by the 3 s open-world timer. */
  const hideTrayInstruction = useCallback(() => {
    setTrayInstructionVisible(false);
  }, []);

  useEffect(() => {
    // Wait for the boot veil to drop so the learner actually sees the world
    // (and the hint) before the clock starts. Cap is 3 s from that moment.
    if (booting || !trayInstructionVisible) return undefined;
    const id = window.setTimeout(hideTrayInstruction, TRAY_INSTRUCTION_MS);
    return () => window.clearTimeout(id);
  }, [booting, trayInstructionVisible, hideTrayInstruction]);

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
    // Leaving the world must never strand the learner in immersive fullscreen
    // (the APK hides the system bars natively), so release every layer first.
    if (isFullscreenActive()) void exitAppFullscreen();
    window.location.hash = "#/home";
  }, []);

  // Unmounting the world releases its fullscreen as well — the system bars
  // come straight back for whatever screen opens next.
  useEffect(() => () => {
    if (isFullscreenActive()) void exitAppFullscreen();
  }, []);

  /**
   * Scene → Fullscreen.
   *
   * Called straight from the tap (never after an `await` we control) so the
   * browser layers still ride the real user gesture. The shared controller
   * picks the layer: the NATIVE Android immersive bridge inside the APK — the
   * only thing that can hide the system bars from a WebView, which is why this
   * button used to do nothing there — then the real Fullscreen API, then the
   * in-page fallback (iOS Safari).
   */
  const toggleFullscreen = useCallback(() => {
    void toggleAppFullscreen();
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
    const host = hostRef.current;
    if (!eng || !host) return;
    // `appImmersive` = the platform gave us no OS fullscreen, so the page hid
    // its own chrome (CSS): the free rect is the whole viewport again.
    if (hudHidden || appImmersive) {
      eng.setHudInsets({ top: 8, bottom: 8, left: 8, right: 8 });
      return;
    }
    // Layout-box metrics (client/offset), never getBoundingClientRect.
    // When the CSS landscape fallback rotates [data-sanctuary-root], the
    // AABB of the rotated stage is the PORTRAIT box — mixing that with the
    // landscape clientWidth/Height is what shrunk the floating board.
    const frameH = host.clientHeight || window.innerHeight;
    const topEl = hudTopRef.current;
    const top = topEl ? Math.max(36, topEl.offsetHeight + 16) : 48;
    let bottom = 16;
    const tray = hudTrayRef.current;
    if (trayVisible && tray) {
      // `hudTrayRef` is the whole bottom-dock column: when the dock is
      // collapsed it is just the slim handle (small inset → more world),
      // when it is open it also holds the GlassDock (larger inset). Reading
      // its live offsetTop keeps the board framing correct in both states.
      const trayTop = tray.offsetTop;
      bottom = Math.max(bottom, frameH - trayTop + 8);
    }
    eng.setHudInsets({ top, bottom, left: 10, right: 10 });
  }, [appImmersive, hudHidden, trayVisible, dockOpen]);

  // Re-measure whenever the HUD set changes or the window resizes.
  useEffect(() => {
    refreshInsets();
    const onResize = () => refreshInsets();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    // iOS/Android can resize or offset only the visual viewport while the
    // layout viewport stays unchanged (URL bar, fullscreen, soft keyboard).
    // Listen to both so the fit camera always sees the live free rectangle.
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
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

  const focusStudyView = useCallback((preset: ViewPreset) => {
    // Measure first: a phone may have just rotated or collapsed its browser
    // chrome without a layout-viewport resize. The engine then computes this
    // specific camera's fit from fresh insets and its content profile.
    refreshInsets();
    engineRef.current?.focus(preset);
    setActiveBoard(preset);
    setActiveView(null);
  }, [refreshInsets]);

  const focusSceneryView = useCallback((preset: ViewPreset) => {
    engineRef.current?.focus(preset);
    setActiveBoard(null);
    setActiveView(preset);
    setModuleMenuOpen(false);
    setMenuOpen(false);
  }, []);

  // Dynamic play: inside Sanctuary (3D env) always play ON THE BOARD,
  // not via external Course Player. From My Study Library (StudyLibraryPage)
  // the same course opens via Course Player (myCoursePlayHash) — that route
  // is unchanged. This satisfies: "my study library se open -> course player,
  // sanctuary se open -> board per play".
  const playMyCourse = useCallback((course: MyCourse) => {
    // Inside sanctuary, play on the reading board (3D)
    setFocusMine(true);
    setOpenCourseId(myCourseStorageId(course.id));
    setModuleMenuOpen(false);
    focusStudyView("reading");
  }, [focusStudyView]);

  const playMyCourseByProductId = useCallback((productId: string) => {
    // Product id from board is already "mine-<id>" — open on board, not course player
    setFocusMine(true);
    setOpenCourseId(productId);
    setModuleMenuOpen(false);
    focusStudyView("reading");
  }, [focusStudyView]);

  const openMyCourseOnBoard = useCallback((course: MyCourse) => {
    setFocusMine(true);
    setOpenCourseId(myCourseStorageId(course.id));
    setModuleMenuOpen(false);
    focusStudyView("reading");
  }, [focusStudyView]);

  const onSanctuaryModuleCreated = useCallback((course: MyCourse) => {
    void myCourses.save(course);
    setFocusMine(true);
    setOpenCourseId(myCourseStorageId(course.id));
    focusStudyView("reading");
  }, [focusStudyView, myCourses.save]);

  const consumeOpenCourse = useCallback(() => setOpenCourseId(null), []);

  // ── Bottom dock (peek) ───────────────────────────────────────────────
  // One handler for every dock button. Picking a board / scenery view also
  // collapses the dock so the world gets the whole screen back; opening the
  // module panel keeps it up (the panel anchors to the dock), and Settings
  // opens its own full overlay.
  const handleDockSelect = useCallback((id: string) => {
    if (id === "module") {
      setMenuOpen(false);
      setModuleMenuOpen((v) => {
        const next = !v;
        if (next) {
          setFocusMine(true);
          focusStudyView("reading");
        }
        return next;
      });
      return;
    }
    if (id === "settings") {
      setModuleMenuOpen(false);
      setMenuOpen((v) => !v);
      setDockOpen(false);
      return;
    }
    if (BOARD_VIEWS.some((b) => b.key === id)) {
      focusStudyView(id as ViewPreset);
      setDockOpen(false);
      return;
    }
    if (PRESETS.some((p) => p.key === id)) {
      focusSceneryView(id as ViewPreset);
      setDockOpen(false);
    }
  }, [focusStudyView, focusSceneryView]);

  // Drag handle: swipe up reveals the dock, swipe down hides it, a plain tap
  // toggles. Pointer capture keeps the gesture alive if the finger slides off.
  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    dockDrag.current = { startY: e.clientY, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not captured */ }
  }, []);
  const onHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dockDrag.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 10) drag.moved = true;
    if (dy < -24) {
      setDockOpen(true);
      dockDrag.current = null;
    } else if (dy > 24) {
      setDockOpen(false);
      dockDrag.current = null;
    }
  }, []);
  const onHandlePointerUp = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dockDrag.current;
    dockDrag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    // A tap (no meaningful drag) toggles the dock.
    if (drag && !drag.moved) setDockOpen((v) => !v);
  }, []);

  // Which dock button reads as active — used to tint the current view.
  const activeDockId = moduleMenuOpen
    ? "module"
    : menuOpen
      ? "settings"
      : (activeBoard ?? activeView ?? "world");

  const dockItems: GlassDockItem[] = useMemo(() => [
    ...BOARD_VIEWS.map(({ key, label, Icon }) => ({ id: key, label, icon: Icon as any, color: "#10B981", active: activeDockId === key })),
    ...PRESETS.map(({ key, label, Icon }) => ({ id: key, label, icon: Icon as any, color: "#38BDF8", active: activeDockId === key })),
    { id: "module", label: "My modules", icon: Layers3 as any, color: "#8B5CF6", active: activeDockId === "module" },
    { id: "settings", label: "Settings", icon: Settings as any, color: "#F59E0B", active: activeDockId === "settings" },
  ], [activeDockId]);

  // The bottom-right eye: one tap hides EVERY button (tray + stats chip) —
  // only the eye remains. If a study board is in focus it re-frames
  // full-bleed at the freed rect (the effect below reframes); if no board is
  // enabled, the camera simply stays where it is, as before. Tapping again
  // brings every button back — including the tray if it was hidden from the
  // ⋮ menu.
  const toggleHud = useCallback(() => {
    // In the in-page fallback the tray (and the gear inside it) is off-screen
    // — this corner button is then the ONE way back out of fullscreen, so it
    // becomes the exit control instead of the HUD toggle.
    if (appImmersive) {
      setMenuOpen(false);
      setModuleMenuOpen(false);
      void exitAppFullscreen();
      return;
    }
    setMenuOpen(false);
    setModuleMenuOpen(false);
    if (hudHidden) setTrayVisible(true);
    setHudHidden((v) => !v);
  }, [appImmersive, hudHidden]);

  useEffect(() => {
    refreshInsets();
    reframeActiveBoard();
  }, [appImmersive, hudHidden, trayVisible, dockOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <main
      data-sanctuary-root
      className={liteFx ? "sanctuary-lite fixed inset-0 z-[90] bg-[#0b1620]" : "fixed inset-0 z-[90] bg-[#0b1620]"}
    >
      <div
        className="absolute overflow-hidden bg-[#0b1620]"
        style={{ inset: 0 }}
      >
        {/* ── WebGL host. `touch-action:none` so a drag never scrolls the page ── */}
        <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none", cursor: "grab" }}>
          <canvas ref={canvasRef} className="block h-full w-full outline-none" />
        </div>

        {/* ── Natural animated loading overlay — shown when sanctuary opens from home until fully loaded ── */}
        {booting ? (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#0b1620] transition-opacity duration-700">
            {/* Soft nature gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/60 via-teal-900/30 to-sky-950/40" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(16,185,129,0.18),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(56,189,248,0.15),transparent_50%)]" />
            {/* Floating blurred orbs — natural breathing */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-[20%] top-[25%] h-32 w-32 animate-[float_6s_ease-in-out_infinite] rounded-full bg-emerald-400/10 blur-2xl" />
              <div className="absolute right-[18%] top-[35%] h-40 w-40 animate-[float_8s_ease-in-out_infinite_1s] rounded-full bg-teal-300/10 blur-2xl" />
              <div className="absolute left-[35%] bottom-[20%] h-24 w-24 animate-[float_7s_ease-in-out_infinite_0.5s] rounded-full bg-sky-300/10 blur-xl" />
            </div>
            {/* Center glass card — same material as home footer GlassDock */}
            <div className="relative mx-4 w-full max-w-[320px] rounded-[24px] border border-white/[0.12] bg-white/[0.06] px-6 py-8 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-[24px] backdrop-saturate-[1.8]">
              <div className="flex flex-col items-center text-center">
                {/* Animated nature icon stack */}
                <div className="relative mb-5">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 ring-1 ring-white/15">
                    <Trees className="h-7 w-7 text-emerald-200 animate-[pulse_2s_ease-in-out_infinite]" />
                  </div>
                  <div className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur">
                    <Sparkles className="h-3 w-3 text-amber-200 animate-[spin_3s_linear_infinite]" />
                  </div>
                </div>
                <h2 className="text-[15px] font-black tracking-tight text-white">Entering Sanctuary</h2>
                <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-white/60">Growing the meadow, planting the forest,<br />warming the light…</p>
                {/* Progress dots — natural breathing */}
                <div className="mt-5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-[bounce_1s_ease-in-out_infinite] rounded-full bg-emerald-300" />
                  <span className="h-1.5 w-1.5 animate-[bounce_1s_ease-in-out_infinite_0.15s] rounded-full bg-teal-300" />
                  <span className="h-1.5 w-1.5 animate-[bounce_1s_ease-in-out_infinite_0.3s] rounded-full bg-sky-300" />
                </div>
                {/* Subtle progress bar */}
                <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/2 animate-[shimmer_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-emerald-400/60 via-teal-300/60 to-sky-300/60" />
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Natural world loading</p>
              </div>
            </div>
            <style>{`
              @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
              @keyframes shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }
            `}</style>
          </div>
        ) : null}

        {/* ── Top stats chip — the only chrome left up here. The ⋮ menu
            and the board buttons have moved DOWN into the bottom tray, so
            the top-left corner belongs to the world again. ── */}
        {!hudHidden ? (
        <header
          ref={hudTopRef}
          data-sanctuary-chrome
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

        {/* ── Bottom dock — study boards, scenery views, Module, Settings.
            Hidden behind a slim drag handle by default so the 3D world owns
            the whole screen (this is what lets every icon fit in mobile
            landscape). Swipe up / tap the handle to reveal the dock, the same
            peek behaviour the desktop shell's footer dock uses. All buttons
            live together in ONE GlassDock. ── */}
        {!hudHidden && trayVisible && trayInstructionVisible && !dockOpen ? (
        <p
          data-tray-instruction
          data-sanctuary-chrome
          className="pointer-events-none absolute bottom-14 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/50 px-3 py-1 text-[10px] font-medium text-white/75 backdrop-blur-md"
        >
          Swipe up for the dock · two fingers fly
        </p>
        ) : null}
        {!hudHidden && trayVisible ? (
        <div
          ref={hudTrayRef}
          data-sanctuary-chrome
          data-sanctuary-bottom-dock
          data-open={dockOpen ? "true" : "false"}
          className="pointer-events-none absolute inset-x-0 bottom-2 z-40 flex flex-col items-center"
        >
          {/* The revealed dock — mounted only while open so it takes no screen
              space (and adds no board inset) when collapsed. */}
          {dockOpen ? (
            <nav
              aria-label="Study boards, views and modules"
              className="pointer-events-auto mb-1.5 w-full max-w-[min(100vw-1.5rem,60rem)] px-3"
            >
              <div className="relative w-full">
                <div
                  data-sanctuary-tray-scroll
                  className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <div className="w-max mx-auto">
                    {/* `dense` = 34px plates so the whole row of boards + scenery
                        + module + settings fits on a phone in landscape. */}
                    <GlassDock dense items={dockItems} onSelect={handleDockSelect} />
                  </div>
                </div>
                {/* Module menu panel — anchored to the dock, trigger hidden. */}
                <div className="absolute bottom-full right-0 mb-2">
                  <SanctuaryModuleMenu
                    uid={user?.id ?? null}
                    courses={myCourses.courses}
                    loading={myCourses.state === "loading"}
                    open={moduleMenuOpen}
                    onToggle={() => {
                      setMenuOpen(false);
                      setModuleMenuOpen((v) => {
                        const next = !v;
                        if (next) {
                          setFocusMine(true);
                          focusStudyView("reading");
                        }
                        return next;
                      });
                    }}
                    onClose={() => setModuleMenuOpen(false)}
                    onOpenOnBoard={openMyCourseOnBoard}
                    onPlay={playMyCourse}
                    onCreated={onSanctuaryModuleCreated}
                    hideTrigger
                  />
                </div>
              </div>
            </nav>
          ) : null}

          {/* The drag handle — always shown (unless HUD is hidden). Swipe up
              to reveal, swipe down / tap to hide. */}
          <button
            type="button"
            aria-label={dockOpen ? "Hide bottom dock" : "Show bottom dock"}
            aria-expanded={dockOpen}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            className="pointer-events-auto flex h-8 w-28 touch-none items-center justify-center"
          >
            <span
              className={`rounded-full bg-white/45 shadow-[0_1px_5px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all ${
                dockOpen ? "h-1.5 w-10 bg-white/60" : "h-1.5 w-16"
              }`}
            />
          </button>
        </div>
        ) : null}

        {/* ── The live board surfaces ───────────────────────────────────
            React owns these trees; the browser's 3D compositor decides where
            their pixels land on the boards. */}
        <BoardPortals
          hosts={boardHosts}
          courses={ownedCourses}
          myCourses={myProducts}
          onPlayMyCourse={playMyCourseByProductId}
          openCourseId={openCourseId}
          onOpenCourseConsumed={consumeOpenCourse}
          focusMine={focusMine}
          loading={coursesLoading}
          uid={user?.id ?? null}
        />

        {/* ── HUD hide toggle — bottom-right corner. One tap hides EVERY
            button (bottom tray + stats chip) so only this button and the
            world remain; if a study board is in focus it re-frames
            full-bleed, otherwise the camera simply stays. Tapping again
            brings every button back (including a menu-hidden tray). ── */}
        <SanctuarySettings
          open={menuOpen}
          page={settingsPage}
          onPage={setSettingsPage}
          onClose={() => setMenuOpen(false)}
          daylight={daylight}
          clockHour={clockHour}
          onDaylight={(mode) => {
            engineRef.current?.setDaylightMode(mode);
            setDaylight(mode);
          }}
          iceAge={iceAge}
          onIceAge={() => {
            const next = !iceAge;
            engineRef.current?.setIceAge(next);
            setIceAge(next);
          }}
          animeSky={animeSky}
          onAnimeSky={() => {
            const next = !animeSky;
            engineRef.current?.setAnimeSky(next);
            setAnimeSky(next);
          }}
          windLabel={WIND_STEPS[windIdx].label}
          onWind={cycleWind}
          autoOrbit={autoOrbit}
          onOrbit={toggleOrbit}
          immersive={immersive}
          onFullscreen={() => {
            toggleFullscreen();
            setMenuOpen(false);
          }}
          onHideTray={() => {
            setTrayVisible(false);
            setMenuOpen(false);
          }}
          onExit={exitSanctuary}
        />

        <div className="pointer-events-auto absolute bottom-3 right-3 z-30">
          <button
            type="button"
            onClick={toggleHud}
            aria-label={appImmersive ? "Exit fullscreen" : undefined}
            className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur-xl transition ${
              appImmersive || hudHidden
                ? "border-emerald-300/60 bg-emerald-500/30 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)]"
                : "border-white/20 bg-slate-950/55 text-white/85 hover:bg-white/15"
            }`}
            title={
              appImmersive
                ? "Exit fullscreen"
                : hudHidden
                  ? "Show all buttons"
                  : "Hide all buttons"
            }
          >
            {appImmersive
              ? <Minimize2 className="h-5 w-5" />
              : hudHidden
                ? <Eye className="h-5 w-5" />
                : <EyeOff className="h-5 w-5" />}
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

/** A D-pad button that repeats while held (pointer capture, rAF driven). */
