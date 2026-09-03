import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Minimize } from "lucide-react";
import { GlassButton } from "./components/ui/glass-button";
import { applyGlassScheme } from "./lib/glassScheme";
import { TagaToggle } from "./components/ui/taga-toggle";
import { GlassPrefToggle } from "./components/ui/glass-pref-toggle";
import { toast } from "./components/ui/glass-toast";
import { Popover, PopoverContent, PopoverSeparator, PopoverTrigger } from "./components/ui/glass-popover";
import ShimmerProgress from "./components/ui/ShimmerProgress";
import ChargingCompleteButton from "./course/ChargingCompleteButton";
import { playSfxAdd, playSfxComplete, playSfxRemove } from "./utils/sfx";
import { db } from "../firebase";
import ResourceViewer from "./course/ResourceViewer";
import CourseOverlay, { STUDY_TAB_ORDER, dockTabRecord, type DockTab, type OverlayVariant } from "./course/CourseOverlay";
import { SplitDeck, captureDockRect, flipDockFrom, type SplitDeckHandle } from "./course/studyPanels";
import { loadSplitEnabled, saveSplitEnabled } from "./course/splitMotion";
import SnowOverlay from "./course/SnowOverlay";
import MindMapPanel from "./course/MindMapPanel";
import useCourseMindMap from "./course/useCourseMindMap";
import { combineHtml, loadLocalNotes, persistLocalNotes } from "./course/notesStore";
import { getCoursePanelSession, resetCoursePanelSession } from "./course/coursePanelSession";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";
import { useBranding } from "./context/BrandingContext";
import { useCourseAccess } from "./hooks/useCourseAccess";
import { useHomeHold } from "./hooks/useHomeHold";
import { isEmptyRichText, richTextToPlain, sanitizeRichText } from "./utils/richText";
import {
  enterCoursePlayerFullscreen,
  exitCoursePlayerFullscreen,
  isCoursePlayerFullscreen,
  isIOSDevice,
  isMobileDevice,
  onCourseFullscreenChange,
  restoreStatusBarFromCoursePlayer,
  syncCourseLandscapeChromeColor,
} from "./utils/courseStatusBar";
import { enterCoursePlayerRotation, exitCoursePlayerRotation } from "./utils/appOrientation";
import { getCourseEmbed, VIEWPORT_AWARE_KINDS } from "./utils/courseEmbed";
import { applyDocumentViewportMode, isBrowserDesktopSiteMode, resetDocumentViewportMode } from "./utils/documentViewportMode";
import {
  loadPlaybackStore,
  mergePlaybackEntry,
  persistPlaybackStore,
  type CoursePlaybackPatch,
  type CoursePlaybackStore,
} from "./course/playbackState";

interface CoursePlayerProps {
  product: Product;
  onBack: () => void;
  onPurchaseUpdate: (update: PaidCourseUpdate) => void;
  /**
   * Deep-link target module (e.g. `#/course/<id>?module=<moduleId>` —
   * used by admin-linked home hero slides). When the player opens, it
   * starts at the first file of THAT module the learner can actually
   * access. If the module is unknown, hidden or locked for this
   * learner, the normal first-lesson / resume behaviour applies.
   */
  initialModuleId?: string;
}

const numericPrice = (value?: string) => { const number = Number(String(value || "0").replace(/[^0-9.-]/g, "")); return Number.isFinite(number) ? Math.max(0, number) : 0; };
const accessId = (item: { id: string; paidUpdateId?: string }) => String(item.paidUpdateId || item.id);

const filesInModule = (module: CourseModule): CourseFile[] => [
  ...(module.embedContentUrl ? [{
    id: `${module.id}__embedded-page`,
    name: module.embedContentTypeLabel || (module.embedContentTypeId === "github_page" ? "Interactive GitHub Page" : "Embedded resource"),
    type: module.embedContentTypeId === "google_doc" ? "doc" as const : module.embedContentTypeId === "whimsical_mindmap" ? "mindmap" as const : "embed" as const,
    url: module.embedContentUrl,
    embedUrl: module.embedContentUrl,
    provider: module.embedContentTypeId || "external",
    accessLevel: module.accessLevel,
    paidUpdateId: module.paidUpdateId,
    paidUpdateTitle: module.paidUpdateTitle,
    paidUpdatePrice: module.paidUpdatePrice,
    paidUpdateCoinPrice: module.paidUpdateCoinPrice,
  }] : []),
  ...(module.files || []),
];
const allFiles = (modules: CourseModule[]): CourseFile[] => modules.flatMap((module) => [...filesInModule(module), ...allFiles(module.modules || [])]);

/**
 * Find the first file the user can actually open. The access source
 * is determined by the resolver (`useCourseAccess`) so per-module
 * ownership, paid updates, subscription grants, and preview flags
 * all participate. `inheritedLocked` is set when a parent module was
 * already locked.
 */
const firstAccessibleFile = (
  modules: CourseModule[],
  accessible: Set<string>,
  inheritedLocked = false,
): CourseFile | null => {
  for (const module of modules) {
    if (module.accessLevel === "hidden") continue;
    const moduleLocked = inheritedLocked || !accessible.has(String(module.id));
    const file = filesInModule(module).find((item) =>
      item.accessLevel !== "hidden" &&
      Boolean(item.url || item.embedUrl || item.youtubeUrl || item.youtubeVideoId) &&
      !moduleLocked &&
      (item.accessLevel !== "paidUpdate" || accessible.has(String(accessId(item)))),
    );
    if (file) return file;
    const nested = firstAccessibleFile(module.modules || [], accessible, moduleLocked);
    if (nested) return nested;
  }
  return null;
};

/**
 * Locate a module (by id) anywhere inside the nested course tree.
 * Returns the node itself or null.
 */
const findModuleById = (modules: CourseModule[], id: string): CourseModule | null => {
  if (!id) return null;
  for (const module of modules) {
    if (String(module.id) === id) return module;
    const nested = findModuleById(module.modules || [], id);
    if (nested) return nested;
  }
  return null;
};

/**
 * First openable file inside ONE module subtree (recursing into child
 * modules), honouring the same access rules as `firstAccessibleFile`.
 * A locked/hidden module contributes nothing.
 */
const firstAccessibleFileInModule = (
  module: CourseModule,
  accessible: Set<string>,
  inheritedLocked = false,
): CourseFile | null => {
  if (module.accessLevel === "hidden") return null;
  const moduleLocked = inheritedLocked || !accessible.has(String(module.id));
  const file = filesInModule(module).find((item) =>
    item.accessLevel !== "hidden" &&
    Boolean(item.url || item.embedUrl || item.youtubeUrl || item.youtubeVideoId) &&
    !moduleLocked &&
    (item.accessLevel !== "paidUpdate" || accessible.has(String(accessId(item)))),
  );
  if (file) return file;
  for (const child of module.modules || []) {
    const nested = firstAccessibleFileInModule(child, accessible, moduleLocked);
    if (nested) return nested;
  }
  return null;
};

/**
 * Find the module that DIRECTLY owns a file (by file id), recursing through
 * the nested tree. Hidden modules are skipped so a file that lives under a
 * now-hidden branch never reports a stale owner. Returns null when the file
 * is not present in any visible module — used by the resume path to decide
 * whether reopening it is still legitimate for this learner.
 */
const owningModuleForFile = (modules: CourseModule[], fileId: string): CourseModule | null => {
  for (const module of modules) {
    if (module.accessLevel === "hidden") continue;
    if (filesInModule(module).some((file) => file.id === fileId)) return module;
    const nested = owningModuleForFile(module.modules || [], fileId);
    if (nested) return nested;
  }
  return null;
};

const collectUpdates = (modules: CourseModule[]) => {
  const map = new Map<string, PaidCourseUpdate>();
  const add = (item: CourseModule | CourseFile, contentName: string) => {
    const id = accessId(item);
    const current = map.get(id) || { id, title: item.paidUpdateTitle || "Course update", price: numericPrice(item.paidUpdatePrice), coinPrice: Number(item.paidUpdateCoinPrice || 0), contentNames: [] };
    current.contentNames.push(contentName);
    current.price = Math.max(current.price, numericPrice(item.paidUpdatePrice));
    current.coinPrice = Math.max(current.coinPrice, Number(item.paidUpdateCoinPrice || 0));
    map.set(id, current);
  };
  const visit = (module: CourseModule) => {
    if (module.accessLevel === "paidUpdate") add(module, module.title);
    (module.files || []).forEach((file) => { if (file.accessLevel === "paidUpdate") add(file, file.name); });
    (module.modules || []).forEach(visit);
  };
  modules.forEach(visit);
  return Array.from(map.values());
};

const collectModuleTitleById = (modules: CourseModule[]): Record<string, string> => {
  const map: Record<string, string> = {};
  const visit = (node: CourseModule) => {
    if (node.id) map[String(node.id)] = String(node.title || node.id);
    (node.modules || []).forEach(visit);
  };
  modules.forEach(visit);
  return map;
};

/**
 * File id → the id of the module that owns it, at any nesting depth.
 *
 * The mind map is scoped per module ("kisi bhi active module ke saath"), but
 * the player only ever tracks the selected FILE. This map bridges the two so
 * the learner's diagram follows them from lesson to lesson within a module
 * and switches to a different diagram when they change modules.
 */
const collectModuleIdByFileId = (modules: CourseModule[]): Record<string, string> => {
  const map: Record<string, string> = {};
  const visit = (node: CourseModule) => {
    filesInModule(node).forEach((file) => {
      if (file?.id != null && node.id != null) map[String(file.id)] = String(node.id);
    });
    (node.modules || []).forEach(visit);
  };
  modules.forEach(visit);
  return map;
};

// Notes are kept in the user's localStorage (per user + product) so they stay
// on the device and never collide with Firestore course progress. The store
// helpers live in src/course/notesStore.ts, shared with the NotesPanel.

type CoursePlayerTheme = "dark" | "light";
const courseThemeStorageKey = "dc.coursePlayerTheme";
const loadCourseTheme = (): CoursePlayerTheme => {
  try {
    const stored = localStorage.getItem(courseThemeStorageKey);
    // The old third "white" theme was removed — anyone who had picked it
    // simply lands on the light palette instead of jumping back to dark.
    return stored === "light" || stored === "white" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

// Snow mode — a purely cosmetic, interactive snowfall over the whole player
// (see src/course/SnowOverlay.tsx). Remembered per device like the theme.
const courseSnowStorageKey = "dc.coursePlayerSnow";
const loadCourseSnow = (): boolean => {
  try {
    return localStorage.getItem(courseSnowStorageKey) === "1";
  } catch {
    return false;
  }
};

// ── Desktop site switch ─────────────────────────────────────────────────
// This is the in-app equivalent of the browser's own "Desktop site" toggle.
// It matters most for the case it was added for: a learner whose phone
// browser has desktop-site turned ON gets a ~980px layout viewport, so an
// embedded Google Doc renders its desktop page and the text becomes tiny.
// Turning this OFF forces real device-width layout AND loads the host's
// mobile rendering, which is what makes the text readable again.
//
// The choice is remembered across lessons and visits. A first-time visitor
// on a phone that IS in desktop-site mode starts in the readable mobile
// rendering, because that is the whole point of the control.
const desktopViewStorageKey = "dc.coursePlayerDesktopView";
const loadDesktopViewPreference = (): boolean => {
  try {
    const stored = localStorage.getItem(desktopViewStorageKey);
    if (stored === "mobile") return false;
    if (stored === "desktop") return true;
  } catch {
    /* private mode — fall through to the detected default */
  }
  return !isBrowserDesktopSiteMode();
};

export default function CoursePlayer({ product, onBack, onPurchaseUpdate, initialModuleId }: CoursePlayerProps) {
  const { user } = useAuth();
  const { logoUrl, appName } = useBranding();
  // Holding the header logo opens the main app (Home). A normal tap still
  // returns the learner to Purchases via `onBack`.
  const logoHold = useHomeHold(() => {
    window.location.hash = "#/home";
  });
  const modules = product.courseContent || [];
  const files = useMemo(() => allFiles(modules).filter((file) => file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId)), [modules]);
  const { resolution, hasActiveSubscription } = useCourseAccess({ product });
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  // Tracks whether the LEARNER has manually picked a file this session. The
  // first-lesson auto-selection and the saved-position resume both set
  // `selectedFile` directly (not through `selectFile`), so this flag is the
  // only way to tell "the app chose this for me" from "I chose this myself".
  // The resume path uses it so a saved position can still take over from the
  // default first lesson, but never clobbers a deliberate navigation.
  const userSelectedRef = useRef(false);

  // ── Deep-link module (admin hero slide → specific product module) ──
  // Resolved once per module/access change. A missing, hidden or
  // locked target yields null, so the normal first-lesson / resume
  // behaviour below simply takes over.
  const deepLinkFileId = useMemo(() => {
    if (!initialModuleId) return null;
    const target = findModuleById(modules, initialModuleId);
    if (!target) return null;
    return firstAccessibleFileInModule(target, resolution.accessibleModuleIds)?.id ?? null;
  }, [initialModuleId, modules, resolution.accessibleModuleIds]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [lastOpenedFileId, setLastOpenedFileId] = useState<string | null>(null);
  // Every file the user has opened this session stays mounted behind the
  // active one, so switching modules never tears a player down.
  const [visitedFiles, setVisitedFiles] = useState<CourseFile[]>([]);
  // Per-file resume state (video/audio seconds, image zoom, document scroll).
  const playbackRef = useRef<CoursePlaybackStore>({});
  const [playbackReady, setPlaybackReady] = useState(false);
  // Bottom dock state — the single overlay is reused across the four toggles.
  const [dockTab, setDockTab] = useState<DockTab>("modules");
  const [dockOpen, setDockOpen] = useState(false);
  // ── Split Deck ──────────────────────────────────────────────────────────
  // ONE global player preference (⚙ Player settings → "Split mode"): the whole
  // player reorganises into two glass panes with a draggable divider between
  // them, and the footer navigation moves INSIDE the study pane — module panel,
  // footer and content all live in the split. Off, the player is exactly the
  // home-footer + right-side-sheet contract it was before.
  const [splitMode, setSplitMode] = useState<boolean>(loadSplitEnabled);
  // The deck stays mounted while it plays its reverse (shrink-away) animation,
  // so the sheet only takes over once the study pane is actually gone.
  const [splitRendered, setSplitRendered] = useState<boolean>(splitMode);
  const splitDeckRef = useRef<SplitDeckHandle | null>(null);
  // The dock's rect from BEFORE a mode flip — the FLIP's "first" measurement.
  const dockFlipFromRef = useRef<DOMRect | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  // True while the document is actually in fullscreen — i.e. the Android
  // status bar is really hidden. Mirrors the live document state so the rail
  // button stays correct even when the learner swipes out of fullscreen.
  const [courseFullscreen, setCourseFullscreen] = useState<boolean>(() => isCoursePlayerFullscreen());
  const [theme, setTheme] = useState<CoursePlayerTheme>(loadCourseTheme);
  // Snow mode — cosmetic interactive snowfall over the whole player.
  const [snowMode, setSnowMode] = useState<boolean>(loadCourseSnow);
  // ── Chrome visibility ───────────────────────────────────────────────────
  // Two independent direct toggles live in the header, just like the theme
  // button. One hides the resource header/footer; the other hides the Course
  // Player's own header + bottom dock. No dropdown is needed.
  // The resource header (Download) and footer (Mark complete) start HIDDEN
  // on mobile devices (both portrait and landscape) so the content gets the
  // full screen real estate; desktop keeps them visible. One tap on the
  // "file bars" toggle shows them again, and the same toggle (or Escape)
  // flips the state back at any time.
  const [fileBarsHidden, setFileBarsHidden] = useState<boolean>(() => isMobileDevice());
  const [playerChromeHidden, setPlayerChromeHidden] = useState(false);
  // ⚙ Player settings popover open state — controlled so the Taga Toggle
  // trigger (glass pill with the expressive face) mirrors it: dead face when
  // closed, happy face when open.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The old secondary header strip (file-bars / viewport / theme / snow quick
  // toggles) is gone — every one of those preferences now lives in the ⚙
  // Player settings popover, so the header stays a single clean row.
  // Desktop request mode for embedded documents — a Google Doc / Sheet /
  // Slides deck rendered at desktop width is unreadable on a phone, so the
  // learner can flip the same embed to its mobile rendering.
  const [desktopView, setDesktopView] = useState<boolean>(loadDesktopViewPreference);
  // Android-only capability: iOS can never hide its status bar and desktop
  // browsers don't need to. Gates the "Hide status bar" rail button.
  const canFullscreen = useMemo(() => isMobileDevice() && !isIOSDevice(), []);
  const ownedUpdateIds = resolution.ownedUpdateIds;
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);
  const moduleTitleById = useMemo(() => collectModuleTitleById(modules), [modules]);

  // ── Per-module mind map ─────────────────────────────────────────────────
  // The player tracks the selected FILE, but the mind map is scoped per
  // MODULE, so switching lessons inside one module keeps the same diagram
  // while switching modules swaps to that module's own map. The hook is
  // called unconditionally (React's rules of hooks) and treats a missing
  // module id as "nothing to load yet".
  const moduleIdByFileId = useMemo(() => collectModuleIdByFileId(modules), [modules]);
  const activeMindMapModuleId = selectedFile ? moduleIdByFileId[String(selectedFile.id)] : undefined;
  const activeMindMapModuleTitle = activeMindMapModuleId ? moduleTitleById[activeMindMapModuleId] || "" : "";
  const mindMap = useCourseMindMap({
    uid: user?.id,
    productId: product.id,
    moduleId: activeMindMapModuleId,
    rootTopic: activeMindMapModuleTitle || product.title,
  });

  // Detect orientation for the landscape layout (header left, toggles right,
  // content filling the space between the two rails). Comparing the live
  // viewport as well as matchMedia covers mobile/PWA browsers whose media
  // query can lag behind the visual viewport during rotation.
  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(media.matches || window.innerWidth > window.innerHeight);
    update();
    media.addEventListener?.("change", update);
    window.screen.orientation?.addEventListener?.("change", update);
    window.visualViewport?.addEventListener?.("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener?.("change", update);
      window.screen.orientation?.removeEventListener?.("change", update);
      window.visualViewport?.removeEventListener?.("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // ── App-wide orientation lock ───────────────────────────────────────────
  // The Course Player is the ONLY screen where rotating the phone is
  // allowed. Mounting the player unlocks the screen orientation; unmounting
  // it locks the whole app straight back to portrait so no other screen can
  // ever open in landscape.
  useEffect(() => {
    enterCoursePlayerRotation();
    return () => exitCoursePlayerRotation();
  }, []);

  // ── Status bar (phone chrome) ───────────────────────────────────────────
  // The ONLY web API that can truly hide the phone's status bar is the
  // Fullscreen API, and Android honours it ONLY when the request rides a
  // REAL user gesture — a gesture-less request right after rotation is
  // rejected by the browser and the bar stays. Hiding therefore can never
  // be automatic: the learner hides/restores the bar explicitly with the
  // "Hide status bar" rail button (Android only). Whatever the learner did,
  // the chrome is restored the moment the player leaves landscape or
  // unmounts.
  // Wave 7: the shell paints nothing of its own any more — both course themes
  // sit on the one Black Ice backdrop (--dc-bd-base), so the status bar
  // matches that base instead of an opaque per-theme plate.
  const courseBackgroundForStatusBar = "#0a0c12";
  useEffect(() => {
    if (isLandscape) {
      return () => restoreStatusBarFromCoursePlayer();
    }
    restoreStatusBarFromCoursePlayer();
    return undefined;
  }, [isLandscape]);

  // Theme flips while already in landscape only re-blend the bar colour —
  // a fresh fullscreen request here would be gesture-less and get blocked.
  useEffect(() => {
    if (isLandscape) syncCourseLandscapeChromeColor(courseBackgroundForStatusBar);
  }, [courseBackgroundForStatusBar, isLandscape]);

  // Whatever happens, unmounting the player puts the phone chrome back.
  useEffect(() => () => restoreStatusBarFromCoursePlayer(), []);

  // Keep the rail button icon in lock-step with the real document fullscreen
  // state (covers the Android swipe-down / Escape exits too).
  useEffect(() => {
    const sync = () => setCourseFullscreen(isCoursePlayerFullscreen());
    sync();
    const unsubscribe = onCourseFullscreenChange(sync);
    return unsubscribe;
  }, []);

  // The preference is scoped to the Course Player and restored on the next
  // visit without changing the theme of the rest of the application.
  //
  // Wave 7: while the player is mounted its theme also drives the pack's
  // own light / dark material (websiteglass.com reads `html.dark|light`), so
  // every GlassSurface / GlassButton / GlassTile inside the player flips with
  // the sun/moon button. The site-wide preference is NOT overwritten — the
  // stored scheme is re-applied the moment the player unmounts.
  useEffect(() => {
    applyGlassScheme(theme);
    return () => applyGlassScheme();
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem(courseThemeStorageKey, theme);
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [theme]);

  // Split Deck is remembered the same way the theme and the snow are.
  useEffect(() => { saveSplitEnabled(splitMode); }, [splitMode]);

  // The footer dock changes home when the mode flips (shell bottom ⇄ study
  // pane), so it FLIPs: the rect captured before the reflow plays back to zero
  // on the new element — portrait rises into the pane, landscape glides in
  // from the right. Transform only, the pack's own 380ms ease.
  useLayoutEffect(() => {
    flipDockFrom(dockFlipFromRef.current);
    dockFlipFromRef.current = null;
  }, [splitRendered]);

  // Snow mode is remembered the same way the theme is.
  useEffect(() => {
    try {
      localStorage.setItem(courseSnowStorageKey, snowMode ? "1" : "0");
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [snowMode]);

  // Applying the mode does what the browser's own "Desktop site" switch
  // would have done: it rewrites the layout viewport, so the app and every
  // document it embeds stop inheriting a forced ~980px desktop width. The
  // override is dropped when the player unmounts, leaving the rest of the
  // site exactly as it was.
  useEffect(() => {
    applyDocumentViewportMode(desktopView ? "desktop" : "mobile");
    try {
      localStorage.setItem(desktopViewStorageKey, desktopView ? "desktop" : "mobile");
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [desktopView]);

  useEffect(() => () => resetDocumentViewportMode(), []);

  // Escape restores any hidden chrome so the learner can never get stuck in a
  // bare screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (playerChromeHidden || fileBarsHidden) { setPlayerChromeHidden(false); setFileBarsHidden(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerChromeHidden, fileBarsHidden]);

  const progressRef = useMemo(() => (user ? doc(db, "users", user.id, "courseProgress", product.id) : null), [product.id, user]);

  useEffect(() => {
    if (!user || !progressRef) return undefined;
    const unsubscribeProgress = onSnapshot(progressRef, (snapshot) => {
      const data = snapshot.data() || {};
      setCompletedIds(new Set(Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : []));
      setLastOpenedFileId(typeof data.lastOpenedFileId === "string" ? data.lastOpenedFileId : null);
    });
    return () => { unsubscribeProgress(); };
  }, [progressRef, user]);

  // Notes live in localStorage (per user + product), not Firestore.
  useEffect(() => {
    setNotes(user?.id ? loadLocalNotes(user.id, product.id) : []);
  }, [user, product.id]);

  // ── Panel session reset on exit ─────────────────────────────────────────
  // While the player is open, the Notes and Mind Map panels keep their place
  // across tab / module switches via the panel session (notes editor vs
  // list, map library vs canvas, the map's own theme pick). Leaving the
  // player resets ALL of it so the next entry starts at the defaults — the
  // notes list and the mind map library, with the map following the player's
  // theme again. One thing is never thrown away: an open notes draft is
  // preserved as a saved note first.
  useEffect(() => {
    return () => {
      if (user?.id) {
        const sessionNotes = getCoursePanelSession().notes;
        if (sessionNotes.view !== "list") {
          const safeHtml = sanitizeRichText(combineHtml(sessionNotes.title, sessionNotes.draft));
          if (!isEmptyRichText(safeHtml)) {
            const plain = richTextToPlain(safeHtml);
            if (sessionNotes.view === "compose") {
              const next: CoursePlayerNote[] = [
                {
                  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  text: plain,
                  html: safeHtml,
                  createdAt: Date.now(),
                },
                ...loadLocalNotes(user.id, product.id),
              ];
              persistLocalNotes(user.id, product.id, next);
            } else {
              const next = loadLocalNotes(user.id, product.id).map((note) =>
                note.id === sessionNotes.noteId
                  ? { ...note, text: plain, html: safeHtml, updatedAt: Date.now() }
                  : note,
              );
              persistLocalNotes(user.id, product.id, next);
            }
          }
        }
      }
      resetCoursePanelSession();
    };
  }, [user, product.id]);

  // Restore the saved "where did I leave off" snapshot for this course. It
  // covers every file type, so a YouTube lesson, an MP4, a podcast, a PDF and
  // a zoomed diagram all reopen exactly where the learner stopped.
  useEffect(() => {
    playbackRef.current = user?.id ? loadPlaybackStore(user.id, product.id) : {};
    setPlaybackReady(true);
    return () => { setPlaybackReady(false); };
  }, [user, product.id]);

  /**
   * Record the live position of a file. Called continuously by the viewers
   * (timeupdate / pause / zoom / scroll) and, crucially, right before the
   * player switches away from a module — that is what makes "come back and
   * continue from the same second" work.
   */
  const reportPlayback = useCallback((fileId: string, patch: CoursePlaybackPatch) => {
    if (!fileId) return;
    mergePlaybackEntry(playbackRef.current, fileId, patch);
    if (user?.id) persistPlaybackStore(user.id, product.id, playbackRef.current);
  }, [product.id, user]);

  // Flush the snapshot when the tab is hidden / closed so nothing is lost.
  useEffect(() => {
    if (!user?.id) return undefined;
    const flush = () => persistPlaybackStore(user.id, product.id, playbackRef.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [product.id, user]);

  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    // A deep-linked module (hero slide tap) wins over "first lesson".
    const deep = deepLinkFileId ? files.find((file) => file.id === deepLinkFileId) : null;
    const first = deep || firstAccessibleFile(modules, resolution.accessibleModuleIds);
    if (first) setSelectedFile(first);
  }, [files, deepLinkFileId, resolution.accessibleModuleIds, selectedFile, modules]);

  // Resume the last opened file when the Firestore listener delivers the id.
  // A deep-link open is the learner's explicit "take me to THIS module" intent,
  // so it is never clobbered by the saved resume position, and a deliberate
  // navigation (userSelectedRef) always wins too. The default first-lesson
  // auto-selection does NOT set that flag, so the saved position is still
  // allowed to take over from it the moment it arrives — that is what makes
  // "reopen the course and land on the module I left off in" actually work.
  //
  // The owning module + paid-update ownership are re-checked so a position
  // saved before a refund / lock change never reopens content the learner can
  // no longer reach.
  useEffect(() => {
    if (!lastOpenedFileId || deepLinkFileId || userSelectedRef.current) return;
    const match = files.find((file) => file.id === lastOpenedFileId);
    if (!match) return;
    const owner = owningModuleForFile(modules, match.id);
    const moduleAccessible = owner ? resolution.accessibleModuleIds.has(String(owner.id)) : true;
    const filePaidLocked = match.accessLevel === "paidUpdate"
      && Boolean(match.paidUpdateId)
      && !resolution.ownedUpdateIds.has(String(accessId(match)));
    if (moduleAccessible && !filePaidLocked) setSelectedFile(match);
  }, [files, lastOpenedFileId, deepLinkFileId, resolution.accessibleModuleIds, resolution.ownedUpdateIds, modules]);

  /**
   * "Mark complete" is a TOGGLE, never a one-way door. Tapping it by mistake
   * (or while testing) can always be undone by tapping it again, which
   * removes the file from `completedFileIds` so the progress percentage
   * stays an honest reflection of what has actually been finished.
   */
  const toggleComplete = async () => {
    if (!user || !selectedFile || !progressRef) return;
    const completing = !completedIds.has(selectedFile.id);
    // Optimistic flip — the Firestore listener confirms it a moment later.
    setCompletedIds((current) => {
      const next = new Set(current);
      if (completing) next.add(selectedFile.id);
      else next.delete(selectedFile.id);
      return next;
    });
    if (completing) playSfxComplete();
    else playSfxRemove();
    await setDoc(progressRef, {
      productId: product.id,
      completedFileIds: completing ? arrayUnion(selectedFile.id) : arrayRemove(selectedFile.id),
      lastOpenedFileId: selectedFile.id,
      lastOpenedAt: serverTimestamp(),
      accessSource: resolution.hasFullProductAccess ? "full_product" : (resolution.ownedModuleIds.size > 0 ? "module_purchase" : (resolution.subscriptionGrantedModuleIds.size > 0 ? "subscription" : "locked")),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  // Notes are rich text. The HTML is sanitised on the way in (so a paste from
  // any site is safe) while keeping the exact formatting, and a plain-text
  // projection is stored alongside it for the thin saved-note strip.
  const saveNote = (html: string) => {
    if (!user) return;
    const safeHtml = sanitizeRichText(html);
    if (isEmptyRichText(safeHtml)) return;
    const next: CoursePlayerNote[] = [
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: richTextToPlain(safeHtml),
        html: safeHtml,
        createdAt: Date.now(),
      },
      ...notes,
    ];
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
    playSfxAdd();
  };

  const editNote = (id: string, nextHtml: string) => {
    if (!user) return;
    const safeHtml = sanitizeRichText(nextHtml);
    if (isEmptyRichText(safeHtml)) return;
    const next = notes.map((note) => note.id === id
      ? { ...note, text: richTextToPlain(safeHtml), html: safeHtml, updatedAt: Date.now() }
      : note);
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
  };

  const deleteNote = (id: string) => {
    if (!user) return;
    // Deleting a note must also drop any incoming wires from other notes,
    // so the wire layer in `NotesPanel` never tries to draw a line to a
    // card that no longer exists. The outbound side is gone with the note
    // itself; the inbound side is pruned in this pass.
    const next = notes
      .filter((note) => note.id !== id)
      .map((note) => note.links && note.links.includes(id)
        ? { ...note, links: note.links.filter((linkId) => linkId !== id) }
        : note);
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
    playSfxRemove();
  };

  /**
   * Symmetric link update. The panel reports the new `links` list of one
   * note (e.g. "wire A to B, drop wire to C"). We:
   *   1. Write the new list into the source note.
   *   2. Add the source's id to the `links` list of every newly-linked
   *      target so the wire shows up in both directions.
   *   3. Remove the source's id from the `links` list of every previously-
   *      linked target that the new list drops.
   * The wires are symmetric on purpose — that way the picker on either
   * side shows the same "linked" state, and the wire layer can draw a
   * single line for each pair instead of two.
   */
  const linkNote = (sourceId: string, nextLinks: string[]) => {
    if (!user) return;
    const allowed = new Set(notes.map((note) => note.id));
    allowed.delete(sourceId);
    const cleanNext = Array.from(new Set(nextLinks.filter((id) => allowed.has(id))));
    const before = new Set((notes.find((note) => note.id === sourceId)?.links) || []);
    const after = new Set(cleanNext);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    const next = notes.map((note) => {
      if (note.id === sourceId) return { ...note, links: cleanNext };
      const current = new Set(note.links || []);
      let changed = false;
      if (added.includes(note.id) && !current.has(sourceId)) { current.add(sourceId); changed = true; }
      if (removed.includes(note.id) && current.has(sourceId)) { current.delete(sourceId); changed = true; }
      return changed ? { ...note, links: [...current] } : note;
    });
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
  };

  const selectFile = (file: CourseFile) => {
    // Switching modules must PAUSE the outgoing lesson rather than let it keep
    // playing in the background. `ResourceViewer` does that itself the moment
    // it stops being the active file (see its `active` prop).
    userSelectedRef.current = true;
    setSelectedFile(file);
    // Close the overlay so the user sees the freshly opened content. The
    // notes editor keeps its place in the panel session, so coming back
    // later resumes the same editor + draft.
    setDockOpen(false);
    if (window.innerWidth < 768) document.getElementById("course-viewer")?.scrollIntoView({ behavior: "smooth" });
    if (user && progressRef) {
      void setDoc(progressRef, { productId: product.id, lastOpenedFileId: file.id, lastOpenedAt: serverTimestamp() }, { merge: true });
    }
  };

  // Keep every opened file mounted. The active one is visible; the others are
  // hidden but alive, so a Google Doc keeps its scroll position, a mind map
  // keeps its pan, and an <iframe> is never reloaded on the way back.
  useEffect(() => {
    if (!selectedFile) return;
    setVisitedFiles((current) => (current.some((file) => file.id === selectedFile.id)
      ? current.map((file) => (file.id === selectedFile.id ? selectedFile : file))
      : [...current, selectedFile]));
  }, [selectedFile]);

  // A different course resets the stack.
  useEffect(() => { setVisitedFiles([]); userSelectedRef.current = false; }, [product.id]);

  const handleBuyModule = (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => {
    if (!module.paidUpdateId) return;
    const update = updates.find((u) => u.id === module.paidUpdateId) || { id: module.paidUpdateId, title: module.paidUpdateTitle || "Course update", price: numericPrice(module.paidUpdatePrice), coinPrice: 0, contentNames: [] } as PaidCourseUpdate;
    onPurchaseUpdate(update);
  };

  // Tapping the active toggle collapses the sheet; tapping a different
  // toggle keeps the SAME sheet open and swaps its content in place. Both
  // panels keep their place in the panel session, so a notes editor (or a
  // mind map canvas) is still exactly where the learner left it on return.
  const handleDockTabChange = (next: DockTab) => {
    if (next === dockTab) {
      // Tapping the active tab closes the sheet — a debounced mind map write
      // left pending must be flushed on this close path too (X / scrim /
      // Escape already flush through onClose).
      if (dockOpen && dockTab === "mindmap") mindMap.flush();
      setDockOpen((open) => !open);
    } else {
      setDockTab(next);
      setDockOpen(true);
    }
  };

  /**
   * Flip Split Deck mode. The dock is measured BEFORE React reflows so it can
   * FLIP into (or out of) the study pane; enabling mounts the deck at once and
   * the deck plays its own entry spring, disabling lets the deck shrink away
   * first and unmounts it through `onExited`.
   */
  const requestSplitMode = (next: boolean) => {
    dockFlipFromRef.current = captureDockRect();
    setSplitMode(next);
    if (next) {
      setSplitRendered(true);
      // The sheet has no business being "open" behind the study pane; when the
      // mode is switched off again the learner starts from a closed sheet.
      setDockOpen(false);
      return;
    }
    // Leaving split mode unmounts the study pane, so a debounced mind map
    // write is flushed on the way out — the same rule as every sheet close.
    if (dockTab === "mindmap") mindMap.flush();
  };

  /**
   * Split Deck's dock: a DIFFERENT tab swaps the study pane's content in place
   * (the pane never closes — it is the layout now), while the tab you are
   * already on peek-collapses the study pane, so the footer stays reachable
   * even when it has become a 28px rail.
   */
  const handleSplitDockTabChange = (next: DockTab) => {
    if (next === dockTab) {
      // Same flush rule as every sheet close path: a debounced mind map write
      // left pending is never dropped on the way out.
      if (dockTab === "mindmap") mindMap.flush();
      splitDeckRef.current?.toggleStudy();
      return;
    }
    setDockTab(next);
  };

  // ⌘/Ctrl+1…5 walks the study tabs while the Split Deck is up — a desktop
  // shortcut, so it stays out of the way of any text field and of anything
  // outside the player.
  useEffect(() => {
    if (!splitRendered) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const index = Number.parseInt(event.key, 10);
      if (!Number.isFinite(index) || index < 1 || index > STUDY_TAB_ORDER.length) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      const shell = playerShellRef.current;
      if (shell && target && target !== document.body && !shell.contains(target)) return;
      event.preventDefault();
      const next = STUDY_TAB_ORDER[index - 1];
      if (next !== dockTab) setDockTab(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dockTab, splitRendered]);

  const totalEligibleFiles = useMemo(() => {
    const inaccessibleModuleIds = resolution.lockedModuleIds;
    return files.filter((file) => {
      const visit = (node: CourseModule): boolean => {
        const fileIds = filesInModule(node).map((f) => f.id);
        if (fileIds.includes(file.id)) return !inaccessibleModuleIds.has(String(node.id));
        for (const child of node.modules || []) {
          if (visit(child)) return true;
        }
        return false;
      };
      for (const module of modules) {
        if (visit(module)) return true;
      }
      return false;
    });
  }, [files, modules, resolution.lockedModuleIds]);

  const progress = totalEligibleFiles.length ? Math.round((completedIds.size / totalEligibleFiles.length) * 100) : 0;
  const isDone = Boolean(selectedFile && completedIds.has(selectedFile.id));
  // A physically rotated phone uses the same left header + right dock rail
  // layout in landscape. Portrait keeps the sticky header / dock layout.
  const useLandscapeRails = isLandscape;
  const browserColorScheme = theme === "dark" ? "dark" : "light";

  // The desktop/mobile switch only means something for embedded documents —
  // a video or an image renders identically either way.
  const selectedEmbedKind = selectedFile ? getCourseEmbed(selectedFile).kind : "none";
  const showViewportToggle = VIEWPORT_AWARE_KINDS.includes(selectedEmbedKind);

  // Leaving the Mind map tab flushes any pending debounced write immediately,
  // so a branch added a moment before switching away is never left unsaved.
  // Guarded by the previous tab: flushing on mount (the player opens on
  // "modules") would write an empty map doc for every course ever opened.
  const previousDockTab = useRef<DockTab>(dockTab);
  useEffect(() => {
    const previous = previousDockTab.current;
    previousDockTab.current = dockTab;
    if (previous === "mindmap" && dockTab !== "mindmap") mindMap.flush();
    // `mindMap.flush` is a stable callback, so only the tab is watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockTab]);

  // While the player's own header + dock are hidden there has to be a way
  // back, so a small floating pill sits over the content.
  const chromeRestoreButton = playerChromeHidden ? (
    <GlassButton
      variant="capsule"
      onClick={() => setPlayerChromeHidden(false)}
      className="absolute right-3 top-3 z-40 text-[10px] font-black [&>span>div]:h-9 [&>span>div]:px-3"
      style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      aria-label="Show player bars"
      title="Show player bars"
      data-course-chrome-restore
    >
      <span className="flex items-center gap-1.5"><Minimize size={13} /> Show bars</span>
    </GlassButton>
  ) : null;

  // ── Header controls ─────────────────────────────────────────────────────
  // Every former quick-toggle (file bars, player bars, viewport, theme,
  // snowfall, status bar, toolbar strip) now lives ONLY inside the ⚙ Player
  // settings popover. The header keeps just: logo/back · title · the
  // charging-widget "Mark complete" button · the shimmer progress bar · ⚙.

  // Website logo sits in the old back-button slot and reuses the same
  // `onBack` handler so a tap still returns the learner to Purchases.
  const logoBackButton = (
    <GlassButton
      {...logoHold.handlers}
      onClick={() => {
        // A completed long-press already opened Home; don't also go to Purchases.
        if (logoHold.consumeSuppressedClick()) return;
        onBack();
      }}
      className={`shrink-0 select-none [&_.size-12]:size-10 [&_.size-12]:overflow-hidden ${
        logoHold.holding ? "[touch-action:none]" : ""
      }`}
      aria-label="Back to purchases"
      title="Back to purchases"
      data-course-back
      data-course-logo-back
    >
      <img src={logoUrl} alt={appName} className="h-10 w-10 rounded-full object-cover select-none" draggable={false} data-course-logo />
    </GlassButton>
  );

  // ── Mark complete — the charging-widget button ──────────────────────────
  // (https://aicanvas.me/components/charging-widget) A circular liquid-wave
  // battery: violet waves + a bolt while the lesson is open, emerald waves
  // rising to a full ring + check once it is marked complete. Still a toggle —
  // an accidental tap is always reversible.
  const markCompleteButton = (compact: boolean) => (selectedFile ? (
    <ChargingCompleteButton
      done={isDone}
      onToggle={() => void toggleComplete()}
      size={compact ? 40 : 42}
    />
  ) : null);

  // ── Shimmer progress (upload-progress bar) ──────────────────────────────
  // (https://aicanvas.me/components/upload-progress) The course progress is
  // the reference widget's shimmer bar: the indigo fill only grows when a
  // module is marked complete, while the white shimmer sweep runs
  // continuously so the bar always feels alive. It sits immediately LEFT of
  // the ⚙ Player settings button.
  const progressCluster = (
    <div className="flex shrink-0 flex-col items-center gap-1" data-course-progress-summary>
      <ShimmerProgress
        value={progress}
        orientation="horizontal"
        thickness={6}
        className="w-16 sm:w-24"
        data-course-progress-bar=""
        data-progress-value={progress}
      />
      <span className="text-[9px] font-black leading-none text-[var(--course-muted)]" data-course-progress-label>{progress}%</span>
    </div>
  );

  const progressRail = (
    <div className="flex shrink-0 flex-col items-center gap-1.5" data-course-progress-summary>
      <ShimmerProgress
        value={progress}
        orientation="vertical"
        thickness={6}
        className="h-24"
        data-course-progress-bar=""
        data-progress-value={progress}
      />
      <span className="text-[9px] font-bold text-[var(--course-muted)]" data-course-progress-label>{progress}%</span>
    </div>
  );

  // ── ⚙ Settings popover ──────────────────────────────────────────────────
  // The ONE home for every player preference. The trigger is the AI Canvas
  // Taga Toggle (glass edition) — dead face while the panel is closed, happy
  // face once it opens. The rows inside are AI Canvas Glass Toggles: one
  // spring-driven progress value animates track colour, border, thumb and
  // glow, with a staggered entrance on every open. Accent colour, stagger
  // delay and the thin divider are looked up per row key so every call site
  // keeps the original 4-argument shape.
  const settingsInkSoft = theme === "light" ? "text-slate-900/55" : "text-white/55";
  const SETTING_ACCENTS: Record<string, { color: string; delay: number; divider: boolean }> = {
    theme: { color: "#FF6BF5", delay: 0.1, divider: false },
    snow: { color: "#3A86FF", delay: 0.15, divider: true },
    split: { color: "#22D3EE", delay: 0.15, divider: true },
    viewport: { color: "#06D6A0", delay: 0.2, divider: true },
    "file-bars": { color: "#FFBE0B", delay: 0.25, divider: false },
    "player-chrome": { color: "#FF7B54", delay: 0.3, divider: true },
    fullscreen: { color: "#B388FF", delay: 0.35, divider: true },
  };
  const notifySetting = (label: string, next: boolean) => {
    toast({ title: `${label} ${next ? "on" : "off"}`, variant: next ? "success" : "info", duration: 2200 });
  };
  const settingsRow = (label: string, checked: boolean, onChange: (next: boolean) => void, attr: string) => {
    const accent = SETTING_ACCENTS[attr] ?? { color: "#3A86FF", delay: 0.1, divider: true };
    return (
      <GlassPrefToggle
        label={label}
        on={checked}
        onChange={(next) => {
          onChange(next);
          notifySetting(label, next);
        }}
        color={accent.color}
        delay={accent.delay}
        divider={accent.divider}
        open={settingsOpen}
        light={theme === "light"}
        data-course-setting={attr}
      />
    );
  };
  const settingsPopover = (side: "bottom" | "right") => (
    <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
      <PopoverTrigger
        className="shrink-0 rounded-full"
        aria-label="Player settings"
        title="Player settings"
        data-course-settings-trigger
      >
        <TagaToggle on={settingsOpen} width={side === "right" ? 48 : 60} />
      </PopoverTrigger>
      <PopoverContent side={side} align={side === "bottom" ? "end" : "start"} className="min-w-[260px]" data-course-settings-menu data-course-theme={theme}>
        <p className={`px-4 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.14em] ${settingsInkSoft}`}>Player settings</p>
        {settingsRow("Light theme", theme === "light", (next) => setTheme(next ? "light" : "dark"), "theme")}
        {settingsRow("Snowfall", snowMode, (next) => setSnowMode(next), "snow")}
        {settingsRow("Split mode", splitMode, (next) => requestSplitMode(next), "split")}
        {showViewportToggle ? settingsRow("Desktop view", desktopView, (next) => setDesktopView(next), "viewport") : null}
        <PopoverSeparator />
        {settingsRow("File bars", !fileBarsHidden, (next) => setFileBarsHidden(!next), "file-bars")}
        {settingsRow("Player bars", !playerChromeHidden, (next) => setPlayerChromeHidden(!next), "player-chrome")}
        {canFullscreen ? settingsRow("Hide status bar", courseFullscreen, (next) => {
          if (next) enterCoursePlayerFullscreen();
          else exitCoursePlayerFullscreen();
        }, "fullscreen") : null}
      </PopoverContent>
    </Popover>
  );

  // ── Viewer stack ───────────────────────────────────────────────────────
  // Every file the learner has opened stays mounted. Only the selected one is
  // visible; the rest are hidden AND paused. That combination is what makes
  // module switching lossless for every file type:
  //   · YouTube / video / audio → paused at the exact second, resumed there.
  //   · PDF / Doc / Sheet / Slides / Form / mind map / embed → the same live
  //     iframe comes back, so its page, scroll and zoom are untouched.
  //   · Images → zoom + pan are restored from the snapshot.
  const viewerStack = (
    <div className="relative h-full min-h-0 w-full min-w-0" data-course-viewer-stack>
      {visitedFiles.length === 0 ? (
        <ResourceViewer file={null} active playback={playbackRef.current} onPlaybackChange={reportPlayback} chromeHidden={fileBarsHidden} desktopView={desktopView} />
      ) : (
        visitedFiles.map((file) => {
          const active = file.id === selectedFile?.id;
          return (
            <div
              key={file.id}
              className={`absolute inset-0 min-h-0 min-w-0 overflow-hidden ${active ? "" : "pointer-events-none invisible opacity-0"}`}
              aria-hidden={!active}
              data-course-viewer-slot
              data-file-id={file.id}
              data-active={active ? "true" : "false"}
            >
              <ResourceViewer
                file={file}
                active={active}
                playback={playbackReady ? playbackRef.current : undefined}
                onPlaybackChange={reportPlayback}
                chromeHidden={fileBarsHidden}
                desktopView={desktopView}
              />
            </div>
          );
        })
      )}
    </div>
  );

  /**
   * The study tabs — ONE element builder for both homes. `variant="sheet"` is
   * the right-side Glass Sheet + the shell's footer dock; `variant="pane"` is
   * the very same content rendered in-flow inside the Split Deck's study pane,
   * footer dock included (so the dock lives INSIDE the split).
   */
  const renderStudyOverlay = (variant: OverlayVariant) => (
    <CourseOverlay
      variant={variant}
      orientation={useLandscapeRails ? "landscape" : "portrait"}
      tab={dockTab}
      chromeHidden={variant === "pane" ? playerChromeHidden : false}
      onExitSplitMode={() => requestSplitMode(false)}
      onTabChange={variant === "pane" ? handleSplitDockTabChange : handleDockTabChange}
      open={dockOpen}
      onToggle={() => {
        // Flush the mind map's pending debounced write when closing, so a
        // dock-tap close never leaves a fresh branch waiting to save. The
        // notes editor needs no flush — its draft lives in the panel session
        // and is still right there when the sheet reopens.
        if (dockOpen && dockTab === "mindmap") mindMap.flush();
        setDockOpen((open) => !open);
      }}
      onClose={() => {
        // Outside-click / Escape / header-X close: flush the mind map's
        // pending write. The notes editor keeps its session state untouched.
        if (dockTab === "mindmap") mindMap.flush();
        setDockOpen(false);
      }}
      modules={modules}
      selectedFileId={selectedFile?.id}
      ownedUpdateIds={ownedUpdateIds}
      accessibleModuleIds={resolution.accessibleModuleIds}
      previewModuleIds={resolution.previewModuleIds}
      updates={updates}
      moduleTitleById={moduleTitleById}
      onSelectFile={selectFile}
      onBuyModule={handleBuyModule}
      onBuyUpdate={onPurchaseUpdate}
      notes={notes}
      onAddNote={(text) => saveNote(text)}
      onEditNote={(id, text) => editNote(id, text)}
      onDeleteNote={(id) => deleteNote(id)}
      onLinkNote={(id, links) => linkNote(id, links)}
      // The mind map editor is owned here (not inside the overlay) so its
      // Firestore hook and canvas state survive the sheet being closed and
      // reopened — the learner never loses an unsaved branch to a tab switch.
      mindMapPanel={(
        <MindMapPanel
          mind={mindMap.mind}
          onMindChange={mindMap.setMind}
          status={mindMap.status}
          errorMessage={mindMap.errorMessage}
          onFlush={mindMap.flush}
          // A module holds a LIST of maps (exactly like notes): the library
          // inside the panel creates, opens, renames and deletes them, while
          // the hook keeps each one in its own Firestore document.
          maps={mindMap.maps}
          activeMapKey={mindMap.activeMapKey}
          onSelectMap={mindMap.selectMap}
          onCreateMap={mindMap.createMap}
          onRenameMap={mindMap.renameMap}
          onDeleteMap={mindMap.deleteMap}
          mapsLoading={mindMap.mapsLoading}
          atMapLimit={mindMap.atMapLimit}
          // The map renders in the player's current theme (dark or white)
          // until the learner flips the map's own sun/moon toolbar button.
          playerTheme={theme}
          landscape={useLandscapeRails}
          // True only while the mind map surface is actually on screen (the
          // sheet in sheet mode, the study pane in Split Deck mode). Within one
          // player visit the panel restores the learner's last view
          // (library or canvas) from the panel session; leaving the player
          // resets it back to the library home screen.
          open={variant === "pane" ? dockTab === "mindmap" : dockOpen && dockTab === "mindmap"}
          onClose={() => {
            mindMap.flush();
            setDockOpen(false);
          }}
        />
      )}
    />
  );

  const overlay = renderStudyOverlay("sheet");
  // The active tab drives the divider's colour, its glow and the study peek
  // rail's icon — the deck never keeps its own copy of the tab list.
  const activeStudyTab = dockTabRecord(dockTab);
  const studyPane = renderStudyOverlay("pane");

  /**
   * The Split Deck region: lesson pane + draggable glass divider + study pane
   * (tabs AND footer dock inside). `active` false plays the reverse animation
   * and reports back through `onExited`, which is when the sheet takes over.
   */
  const splitDeck = (axis: "row" | "column", deckOrientation: "portrait" | "landscape") => (
    <SplitDeck
      axis={axis}
      orientation={deckOrientation}
      courseId={product.id}
      accent={activeStudyTab.color}
      studyIcon={activeStudyTab.icon}
      lesson={viewerStack}
      study={studyPane}
      solid={dockTab === "notes" || dockTab === "mindmap"}
      active={splitMode}
      onExited={() => setSplitRendered(false)}
      handleRef={splitDeckRef}
    />
  );

  // The landscape layout keeps the header rail on the left. The footer
  // navigation is the SAME home-style dock the portrait layout uses (bottom
  // of the section in both orientations); the sheet opens between the header
  // and the dock from the right and never overlaps either.
  const landscapeLayout = () => (
    <>
      {playerChromeHidden ? null : (
      <header
        className="sticky left-0 top-0 z-50 flex h-full min-h-0 w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto no-scrollbar overscroll-contain border-r border-[var(--course-border)] bg-[var(--dc-chrome-glass)] py-2 [backdrop-filter:var(--dc-chrome-glass-blur)]"
        style={{
          // Fullscreen (status bar / navigation bar hidden) exposes the
          // display cutout, and Chrome starts reporting a non-zero
          // env(safe-area-inset-left). If that inset were only padding
          // inside the fixed w-14 rail, the 40px shrink-0 buttons would
          // overflow the shrunken content box and get clipped on the
          // rail's right edge. Growing the rail by the inset keeps the
          // full 56px content area, so every button stays fully visible.
          width: "calc(3.5rem + env(safe-area-inset-left, 0px))",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
        }}
        data-course-landscape-header
      >
        {logoBackButton}
        {/* Mark complete lives in the header rail now (it used to sit in the
            resource footer) so it is one tap away in every orientation. */}
        {markCompleteButton(true)}
        <span className="h-px w-7 shrink-0 rounded-full bg-[var(--course-border)]" aria-hidden="true" />
        {/* The shimmer progress bar rides directly LEFT of (above, in this
            vertical rail) the ⚙ settings button — every other control lives
            inside the popover now. */}
        {progressRail}
        {settingsPopover("right")}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <span className="line-clamp-1 max-h-full text-xs font-black [writing-mode:vertical-rl] rotate-180" data-course-product-title>{product.title}</span>
        </div>
        {hasActiveSubscription ? (
          <span data-course-subscription-badge="active" className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30 [writing-mode:vertical-rl] rotate-180">Active subscription</span>
        ) : null}
        {resolution.previewModuleIds.size > 0 ? (
          <span data-course-preview-badge className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20 [writing-mode:vertical-rl] rotate-180">Preview mode</span>
        ) : null}
      </header>
      )}

      {/* Content fills everything between the header rail (left) and the
          footer dock (bottom of this column). The sheet portals to <body>
          with measured bounds, so it sits in exactly this window without
          overlapping the header or the dock. */}
      <section
        id="course-viewer"
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-course-landscape-content
        data-course-split={splitRendered ? "on" : "off"}
      >
        {splitRendered ? (
          // Split Deck in landscape: the header rail stays on the left, the
          // split region is everything right of it, and the divider is
          // VERTICAL (lesson left, study right).
          splitDeck("row", "landscape")
        ) : (
          <>
            <div className="relative min-h-0 flex-1 overflow-hidden">{viewerStack}</div>
            {playerChromeHidden ? null : overlay}
          </>
        )}
        {chromeRestoreButton}
      </section>
    </>
  );

  // ── Landscape: header rail left, content centre, toggle rail right ──
  if (isLandscape) {
    return (
      <div ref={playerShellRef} className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-row overflow-hidden text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="landscape" data-course-landscape-scroll="vertical" data-course-statusbar-hidden={courseFullscreen ? "true" : "false"} style={{ colorScheme: browserColorScheme }}>
        {landscapeLayout()}
        {snowMode ? <SnowOverlay theme={theme} /> : null}
      </div>
    );
  }

  // ── Portrait: sticky header top, content full-bleed, sticky dock bottom ──
  return (
    <div ref={playerShellRef} className="course-player-shell fixed inset-0 flex h-[100dvh] flex-col overflow-hidden text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="portrait" style={{ colorScheme: browserColorScheme }}>
      {playerChromeHidden ? null : (
      <header
        className="sticky top-0 z-50 flex shrink-0 flex-col overflow-hidden border-b border-[var(--course-border)] bg-[var(--dc-chrome-glass)] [backdrop-filter:var(--dc-chrome-glass-blur)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        data-course-header
      >
        {/* One clean row — identity on the left, then: Mark complete
            (charging widget) · shimmer progress bar · ⚙ Player settings.
            Every other control lives inside the settings popover. */}
        <div className="relative flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-5">
          {logoBackButton}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black leading-tight tracking-tight sm:text-base" data-course-product-title>{product.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {hasActiveSubscription ? (
                <span data-course-subscription-badge="active" className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">Active subscription</span>
              ) : null}
              {resolution.previewModuleIds.size > 0 ? (
                <span data-course-preview-badge className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20">Preview mode</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2" data-course-header-actions>
            {markCompleteButton(false)}
            {progressCluster}
            {settingsPopover("bottom")}
          </div>
        </div>
      </header>
      )}

      {/* Everything between the pinned header and the pinned dock. */}
      <section
        id="course-viewer"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        data-course-split={splitRendered ? "on" : "off"}
      >
        {splitRendered ? (
          // Split Deck in portrait: a HORIZONTAL divider, lesson on top and
          // the study pane (tabs + footer dock) below.
          splitDeck("column", "portrait")
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-hidden">{viewerStack}</div>
            {playerChromeHidden ? null : overlay}
          </>
        )}
        {chromeRestoreButton}
      </section>
      {snowMode ? <SnowOverlay theme={theme} /> : null}
    </div>
  );
}
