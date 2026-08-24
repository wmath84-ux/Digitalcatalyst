import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { CheckCircle2, ChevronsDownUp, ChevronsUpDown, Circle, Maximize, Maximize2, Minimize, Minimize2, Monitor, Moon, PanelBottomClose, PanelBottomOpen, Smartphone, Sun } from "lucide-react";
import { playSfxAdd, playSfxComplete, playSfxRemove } from "./utils/sfx";
import { db } from "../firebase";
import ResourceViewer from "./course/ResourceViewer";
import CourseOverlay, { type DockTab } from "./course/CourseOverlay";
import MindMapPanel from "./course/MindMapPanel";
import useCourseMindMap from "./course/useCourseMindMap";
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
    (node.files || []).forEach((file) => {
      if (file?.id != null && node.id != null) map[String(file.id)] = String(node.id);
    });
    (node.modules || []).forEach(visit);
  };
  modules.forEach(visit);
  return map;
};

// Notes are kept in the user's localStorage (per user + product) so they stay
// on the device and never collide with Firestore course progress.
const notesStorageKey = (uid: string, productId: string) => `dc.courseNotes.${uid}.${productId}`;
const loadLocalNotes = (uid: string, productId: string): CoursePlayerNote[] => {
  try {
    const raw = localStorage.getItem(notesStorageKey(uid, productId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const persistLocalNotes = (uid: string, productId: string, notes: CoursePlayerNote[]) => {
  try {
    localStorage.setItem(notesStorageKey(uid, productId), JSON.stringify(notes));
  } catch {
    /* storage full / private mode — ignore */
  }
};

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
  const [isLandscape, setIsLandscape] = useState(false);
  // True while the document is actually in fullscreen — i.e. the Android
  // status bar is really hidden. Mirrors the live document state so the rail
  // button stays correct even when the learner swipes out of fullscreen.
  const [courseFullscreen, setCourseFullscreen] = useState<boolean>(() => isCoursePlayerFullscreen());
  const [theme, setTheme] = useState<CoursePlayerTheme>(loadCourseTheme);
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
  // The secondary header strip (the slim row that holds the file-bars, player-
  // chrome, viewport and theme toggles) can be hidden to give the lesson a few
  // extra pixels. The toggle button itself follows the visibility state — it
  // lives on the strip when the strip is visible, and migrates to the main
  // header row when the strip is hidden — so the learner is never stuck
  // without a way to bring the controls back.
  const [secondaryStripHidden, setSecondaryStripHidden] = useState(false);
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
  const courseBackgroundForStatusBar = theme === "dark" ? "#090912" : "#f1f5f9";
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
  useEffect(() => {
    try {
      localStorage.setItem(courseThemeStorageKey, theme);
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [theme]);

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
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
    playSfxRemove();
  };

  const selectFile = (file: CourseFile) => {
    // Switching modules must PAUSE the outgoing lesson rather than let it keep
    // playing in the background. `ResourceViewer` does that itself the moment
    // it stops being the active file (see its `active` prop).
    userSelectedRef.current = true;
    setSelectedFile(file);
    // Close the overlay so the user sees the freshly opened content.
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
  // toggle keeps the SAME sheet open and swaps its content in place.
  const handleDockTabChange = (next: DockTab) => {
    if (next === dockTab) {
      setDockOpen((open) => !open);
    } else {
      setDockTab(next);
      setDockOpen(true);
    }
  };

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
  // Two deliberate states: dark ⇄ light. Every tap simply flips between the
  // two, so a third tap cycles straight back to the first state.
  const nextTheme: CoursePlayerTheme = theme === "dark" ? "light" : "dark";
  const browserColorScheme = theme === "dark" ? "dark" : "light";

  // The desktop/mobile switch only means something for embedded documents —
  // a video or an image renders identically either way.
  const selectedEmbedKind = selectedFile ? getCourseEmbed(selectedFile).kind : "none";
  const showViewportToggle = VIEWPORT_AWARE_KINDS.includes(selectedEmbedKind);

  // ── Notes split mode (landscape) ────────────────────────────────────────
  // CourseOverlay reports when the notes editor is open in landscape — that
  // is the moment the lesson can be split into a 60/40 layout: course on
  // the left, the editor + soft keyboard on the right. Tracking it here
  // lets the content area shrink to 60vw instead of staying hidden behind
  // the editor sheet.
  const [notesSplitMode, setNotesSplitMode] = useState(false);
  const handleSplitModeChange = useCallback((active: boolean) => setNotesSplitMode(active), []);
  // Reset split state when the notes tab closes, so the lesson smoothly
  // expands back to full width without an awkward half-rendered state.
  useEffect(() => {
    if (dockTab !== "notes" && notesSplitMode) setNotesSplitMode(false);
  }, [dockTab, notesSplitMode]);

  // ── Mind map split mode (landscape) ─────────────────────────────────────
  // Tracked separately from `notesSplitMode` because the two sheets claim
  // DIFFERENT widths: the notes editor takes 40% of the landscape screen and
  // the mind map takes 50%. The lesson has to shrink to the matching
  // complement, so the parent needs to know which sheet is the open one.
  const [mindMapSplitMode, setMindMapSplitMode] = useState(false);
  const handleMindMapSplitChange = useCallback((active: boolean) => setMindMapSplitMode(active), []);
  useEffect(() => {
    if (dockTab !== "mindmap" && mindMapSplitMode) setMindMapSplitMode(false);
  }, [dockTab, mindMapSplitMode]);
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
    <button
      type="button"
      onClick={() => setPlayerChromeHidden(false)}
      className="absolute right-3 top-3 z-40 flex items-center gap-1.5 rounded-full border border-[var(--course-border)] bg-[var(--course-surface-translucent)] px-3 py-2 text-[10px] font-black text-[var(--course-text)] shadow-2xl backdrop-blur transition hover:bg-[var(--course-soft-hover)]"
      style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      aria-label="Show player bars"
      title="Show player bars"
      data-course-chrome-restore
    >
      <Minimize size={13} /> Show bars
    </button>
  ) : null;

  // ── Direct chrome toggles ───────────────────────────────────────────────
  // These behave like the light/dark button: one tap flips the state and the
  // icon immediately reflects what the next tap will do.
  const fileBarsToggle = (
    <button
      type="button"
      onClick={() => setFileBarsHidden((hidden) => !hidden)}
      className={`course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
        fileBarsHidden
          ? "bg-violet-500 text-white"
          : "bg-[var(--course-soft)] text-[var(--course-muted)] hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
      }`}
      aria-label={fileBarsHidden ? "Show file bars" : "Hide file bars"}
      title={fileBarsHidden ? "Show file bars" : "Hide file bars"}
      aria-pressed={fileBarsHidden}
      data-course-toggle-file-bars
      data-hidden={fileBarsHidden ? "true" : "false"}
    >
      {fileBarsHidden ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />}
    </button>
  );

  const playerChromeToggle = (
    <button
      type="button"
      onClick={() => setPlayerChromeHidden((hidden) => !hidden)}
      className={`course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
        playerChromeHidden
          ? "bg-violet-500 text-white"
          : "bg-[var(--course-soft)] text-[var(--course-muted)] hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
      }`}
      aria-label={playerChromeHidden ? "Show player bars" : "Hide player bars"}
      title={playerChromeHidden ? "Show player bars" : "Hide player bars"}
      aria-pressed={playerChromeHidden}
      data-course-toggle-player-chrome
      data-hidden={playerChromeHidden ? "true" : "false"}
    >
      {playerChromeHidden ? <Maximize size={17} /> : <Minimize size={17} />}
    </button>
  );

  // Android-only: the one reliable way to hide the phone's status bar is the
  // Fullscreen API called from a real tap. This lives in the landscape rail
  // so a physical rotation can always be followed by one tap to hide it.
  const fullscreenToggle = canFullscreen ? (
    <button
      type="button"
      onClick={() => {
        if (isCoursePlayerFullscreen()) exitCoursePlayerFullscreen();
        else enterCoursePlayerFullscreen();
      }}
      className={`course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
        courseFullscreen
          ? "bg-emerald-500 text-white"
          : "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/40 hover:bg-violet-500/25"
      }`}
      aria-label={courseFullscreen ? "Show status bar" : "Hide status bar"}
      title={courseFullscreen ? "Show status bar (exit fullscreen)" : "Hide status bar (fullscreen)"}
      aria-pressed={courseFullscreen}
      data-course-toggle-fullscreen
      data-active={courseFullscreen ? "true" : "false"}
    >
      {courseFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
    </button>
  ) : null;

  // Flip an embedded document between its desktop and mobile rendering.
  const viewportToggle = (
    <button
      type="button"
      onClick={() => setDesktopView((value) => !value)}
      className={`course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
        desktopView
          ? "bg-[var(--course-soft)] text-[var(--course-muted)] hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
          : "bg-violet-500 text-white"
      }`}
      aria-label={desktopView ? "Switch document to mobile view" : "Switch document to desktop view"}
      title={desktopView ? "Switch to mobile view" : "Switch to desktop view"}
      aria-pressed={!desktopView}
      data-course-viewport-toggle
      data-mode={desktopView ? "desktop" : "mobile"}
    >
      {/* The icon announces what the next tap will do, matching the
          aria-label/title: a phone means "switch to the mobile rendering", a
          monitor means "switch to the desktop rendering". */}
      {desktopView ? <Smartphone size={17} /> : <Monitor size={17} />}
    </button>
  );

  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      aria-pressed={theme !== "dark"}
      data-course-theme-toggle
      data-theme={theme}
      data-next-theme={nextTheme}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  // The toggle that hides / shows the secondary header strip. The icon always
  // previews the action the next tap will take, the label matches, and a soft
  // ring lights up in its active state so the learner can find it again from
  // a busy header.
  const secondaryStripToggle = (
    <button
      type="button"
      onClick={() => setSecondaryStripHidden((hidden) => !hidden)}
      className={`course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
        secondaryStripHidden
          ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
          : "bg-[var(--course-soft)] text-[var(--course-muted)] ring-1 ring-inset ring-violet-400/40 hover:bg-violet-500/20 hover:text-violet-200"
      }`}
      aria-label={secondaryStripHidden ? "Show toolbar strip" : "Hide toolbar strip"}
      title={secondaryStripHidden ? "Show toolbar strip" : "Hide toolbar strip"}
      aria-pressed={secondaryStripHidden}
      data-course-toggle-secondary-strip
      data-hidden={secondaryStripHidden ? "true" : "false"}
    >
      {secondaryStripHidden ? <PanelBottomOpen size={17} /> : <PanelBottomClose size={17} />}
    </button>
  );

  // Website logo sits in the old back-button slot and reuses the same
  // `onBack` handler so a tap still returns the learner to Purchases.
  const logoBackButton = (
    <button
      type="button"
      {...logoHold.handlers}
      onClick={() => {
        // A completed long-press already opened Home; don't also go to Purchases.
        if (logoHold.consumeSuppressedClick()) return;
        onBack();
      }}
      className={`course-icon-button grid h-10 w-10 shrink-0 select-none place-items-center overflow-hidden rounded-xl bg-transparent transition hover:opacity-90 ${
        logoHold.holding ? "[touch-action:none]" : ""
      }`}
      aria-label="Back to purchases"
      title="Back to purchases"
      data-course-back
      data-course-logo-back
    >
      <img src={logoUrl} alt={appName} className="h-10 w-10 object-cover select-none" draggable={false} data-course-logo />
    </button>
  );

  // ── Header action: mark complete ────────────────────────────────────────
  // The toggle, not a one-way action: an accidental tap is fully reversible
  // so the tracked progress always matches reality. `compact` renders the
  // square icon variant used by the 56px landscape rail.
  const markCompleteButton = (compact: boolean) => (selectedFile ? (
    <button
      type="button"
      onClick={() => void toggleComplete()}
      aria-pressed={isDone}
      aria-label={isDone ? "Mark this lesson as not complete" : "Mark this lesson complete"}
      title={isDone ? "Tap to mark as not complete" : "Mark this lesson complete"}
      className={`course-icon-button flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-black transition ${
        compact ? "h-10 w-10 p-0" : "h-10 px-3 text-[11px]"
      } ${
        isDone
          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/40 hover:bg-emerald-500/25"
          : "bg-gradient-to-br from-emerald-400 to-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-emerald-400"
      }`}
      data-course-mark-complete
      data-completed={isDone ? "true" : "false"}
    >
      {isDone ? <CheckCircle2 size={compact ? 18 : 15} /> : <Circle size={compact ? 18 : 15} />}
      {compact ? null : <span className="hidden whitespace-nowrap sm:inline">{isDone ? "Completed" : "Mark complete"}</span>}
    </button>
  ) : null);

  // The old footer is now a slim lesson strip inside the header: it names the
  // lesson that is playing and mirrors its completion state. It follows the
  // same "file bars" toggle the resource header does, so hiding the file
  // chrome still gives the content every pixel — while the mark-complete
  // button stays permanently in the header row above it.
  const markCompleteBar = selectedFile && !fileBarsHidden ? (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-course-mark-complete-bar>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDone ? "bg-emerald-400" : "bg-violet-400"}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[11px] font-black text-[var(--course-text)]" data-course-selected-name>{selectedFile.name}</p>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
        isDone ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--course-soft)] text-[var(--course-muted)]"
      }`}>
        {isDone ? "Completed" : "In progress"}
      </span>
    </div>
  ) : null;

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

  const overlay = (
    <CourseOverlay
      orientation={useLandscapeRails ? "landscape" : "portrait"}
      tab={dockTab}
      onTabChange={handleDockTabChange}
      open={dockOpen}
      onToggle={() => setDockOpen((open) => !open)}
      onClose={() => setDockOpen(false)}
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
      onSplitModeChange={handleSplitModeChange}
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
          landscape={useLandscapeRails}
        />
      )}
      onMindMapSplitChange={handleMindMapSplitChange}
    />
  );

  // The landscape layout keeps the header rail on the left and the dock
  // navigation on the right instead of dropping all navigation in fullscreen.
  const landscapeLayout = () => (
    <>
      {playerChromeHidden ? null : (
      <header
        className="sticky left-0 top-0 z-50 flex h-full min-h-0 w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto no-scrollbar overscroll-contain border-r border-[var(--course-border)] bg-[var(--course-surface)] py-2"
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
        {fullscreenToggle}
        {fileBarsToggle}
        {playerChromeToggle}
        {showViewportToggle ? viewportToggle : null}
        {themeToggle}
        {/* Secondary strip toggle is always reachable in the rail — landscape
            does not have a separate "Row 2" so the rail itself is the only
            home this control can live in. */}
        {secondaryStripToggle}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <span className="line-clamp-1 max-h-full text-xs font-black [writing-mode:vertical-rl] rotate-180" data-course-product-title>{product.title}</span>
        </div>
        {hasActiveSubscription ? (
          <span data-course-subscription-badge="active" className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30 [writing-mode:vertical-rl] rotate-180">Active subscription</span>
        ) : null}
        {resolution.previewModuleIds.size > 0 ? (
          <span data-course-preview-badge className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20 [writing-mode:vertical-rl] rotate-180">Preview mode</span>
        ) : null}
        <div className="flex shrink-0 flex-col items-center gap-1.5" data-course-progress-summary>
          <div className="relative w-1.5 h-24 overflow-hidden rounded-full bg-[var(--course-soft-hover)]" data-course-progress-bar>
            <div className="absolute bottom-0 w-full bg-gradient-to-t from-violet-500 to-cyan-400" style={{ height: `${progress}%` }} data-course-progress-fill data-progress-value={progress} />
          </div>
          <span className="text-[9px] font-bold text-[var(--course-muted)]" data-course-progress-label>{progress}%</span>
        </div>
      </header>
      )}

      {/* Content is strictly bounded between both rails, preventing embedded
          players from extending underneath the right-side navigation.
          When notes-split mode is on, the content area shrinks to the
          left 60% of the available landscape section so the editor (40%)
          and the lesson (60%) sit side-by-side — exactly like a notepad
          next to a video. The dock still rides along the far right at
          its own 4rem slot, and the editor overlays the right portion
          absolutely so the dock stays where the user expects it.

          Implementation note: the overlay is `position: absolute`, so it
          does not consume flex space. The content's `basis` is set to
          `calc(60% - 4rem)` so it stops exactly where the overlay's
          left edge begins; otherwise the overlay would overlap the
          content by 4rem (the dock's width). */}
      <section
        id="course-viewer"
        className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
        data-course-landscape-content
        data-split-mode={notesSplitMode || mindMapSplitMode ? "true" : "false"}
        data-split-kind={mindMapSplitMode ? "mindmap" : notesSplitMode ? "notes" : "none"}
      >
        <div
          className={`flex min-h-0 flex-col overflow-hidden transition-[flex-basis,max-width] duration-300 ${
            notesSplitMode
              ? "basis-[calc(60%-4rem)] max-w-[calc(60%-4rem)] shrink-0 grow-0"
              // The mind map claims a wider half of the screen than the notes
              // editor, so the lesson shrinks to 50% instead of 60%.
              : mindMapSplitMode
                ? "basis-[calc(50%-4rem)] max-w-[calc(50%-4rem)] shrink-0 grow-0"
                : "basis-full max-w-full flex-1"
          }`}
          data-course-landscape-content-inner
        >
          <div className="min-h-0 flex-1 overflow-hidden">{viewerStack}</div>
        </div>
        {/* Split-mode spacer. The dock (rendered by the overlay as this
            section's last in-flow child) sits in normal flex flow, so when
            the lesson shrinks to 60% for the notes editor the rail used to
            slide with it toward the middle of the screen. The spacer eats
            the gap under the 40% notes sheet and pins the dock back to the
            far-right edge — exactly where it sits when the sheet is closed.
            The sheet (absolute, z-40) covers the spacer completely. */}
        {notesSplitMode ? <div className="min-h-0 flex-1" aria-hidden="true" data-course-dock-spacer /> : null}
        {/* Same dock-pinning spacer for the mind map's own 50% sheet. Only
            ever one of the two is mounted, since only one tab is open. */}
        {mindMapSplitMode ? <div className="min-h-0 flex-1" aria-hidden="true" data-course-mindmap-dock-spacer /> : null}
        {playerChromeHidden ? null : overlay}
        {chromeRestoreButton}
      </section>
    </>
  );

  // ── Landscape: header rail left, content centre, toggle rail right ──
  if (isLandscape) {
    return (
      <div className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-row overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="landscape" data-course-landscape-scroll="vertical" data-course-statusbar-hidden={courseFullscreen ? "true" : "false"} style={{ colorScheme: browserColorScheme }}>
        {landscapeLayout()}
      </div>
    );
  }

  // ── Portrait: sticky header top, content full-bleed, sticky dock bottom ──
  return (
    <div className="course-player-shell fixed inset-0 flex h-[100dvh] flex-col overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="portrait" style={{ colorScheme: browserColorScheme }}>
      {playerChromeHidden ? null : (
      <header
        className="sticky top-0 z-50 flex shrink-0 flex-col overflow-hidden border-b border-[var(--course-border)] bg-[var(--course-surface)] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.9)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        data-course-header
      >
        {/* Brand glow — a soft violet→cyan wash that lifts the bar off the
            viewer without ever competing with the content itself. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/12 via-transparent to-cyan-400/10" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" aria-hidden="true" />

        {/* Row 1 — identity, live progress and the primary lesson actions. */}
        <div className="relative flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-5">
          <div className="relative shrink-0 rounded-xl ring-1 ring-inset ring-[var(--course-border)]">
            {logoBackButton}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black leading-tight tracking-tight sm:text-base" data-course-product-title>{product.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" data-course-progress-summary>
              <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[var(--course-soft-hover)] sm:w-28" data-course-progress-bar>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400 shadow-[0_0_10px_-2px_rgba(139,92,246,0.9)] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                  data-course-progress-fill
                  data-progress-value={progress}
                />
              </div>
              <span className="rounded-full bg-[var(--course-soft)] px-1.5 py-0.5 text-[10px] font-black text-[var(--course-muted)]" data-course-progress-label>{progress}% complete</span>
              {hasActiveSubscription ? (
                <span data-course-subscription-badge="active" className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">Active subscription</span>
              ) : null}
              {resolution.previewModuleIds.size > 0 ? (
                <span data-course-preview-badge className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20">Preview mode</span>
              ) : null}
            </div>
          </div>
          {/* Primary actions, promoted out of the old resource footer. */}
          <div className="flex shrink-0 items-center gap-1.5" data-course-header-actions>
            {markCompleteButton(false)}
            {/* When the secondary strip is hidden the toggle migrates up here,
                so the learner can always bring the toolbar back without
                hunting for it. */}
            {secondaryStripHidden ? secondaryStripToggle : null}
          </div>
        </div>

        {/* Row 2 — the lesson currently open plus the secondary view toggles.
            When this row is hidden the toggle above keeps the controls one tap
            away, so a learner never has to remember a long-press gesture. */}
        {secondaryStripHidden ? null : (
        <div className="relative flex items-center gap-2 border-t border-[var(--course-border)] bg-[var(--course-soft)]/40 px-3 py-1.5 sm:px-5" data-course-secondary-strip>
          {markCompleteBar || <div className="min-w-0 flex-1" />}
          <div className="flex shrink-0 items-center gap-1">
            {fileBarsToggle}
            {playerChromeToggle}
            {showViewportToggle ? viewportToggle : null}
            {themeToggle}
            {secondaryStripToggle}
          </div>
        </div>
        )}
      </header>
      )}

      {/* Everything between the pinned header and the pinned dock. */}
      <section id="course-viewer" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">{viewerStack}</div>
        {playerChromeHidden ? null : overlay}
        {chromeRestoreButton}
      </section>
    </div>
  );
}
