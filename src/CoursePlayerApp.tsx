import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { playSfxAdd, playSfxComplete, playSfxRemove } from "./utils/sfx";
import { db } from "../firebase";
import ResourceViewer, { type CourseFileActions } from "./course/ResourceViewer";
import CourseOverlay, { STUDY_TAB_ORDER, dockTabRecord, unlockedModuleIds, type DockTab } from "./course/CourseOverlay";
import CourseBrainPanel from "./course/CourseBrainPanel";
import { collectBrainPracticeSets } from "../utils/practiceSet.js";
import { SplitDeck, type SplitDeckHandle } from "./course/studyPanels";
import SnowOverlay from "./course/SnowOverlay";
// The mind map canvas is the single heaviest thing in the player: the panel
// plus `@xyflow/react` is a 221 kB / 73 kB-gzip chunk. `StudyContent` only
// renders this slot when the mind-map tab is the active one, so React.lazy
// keeps that chunk off the wire for every learner who opens a lesson and
// never touches the mind map — while the element below stays byte-identical
// and the panel, once opened, stays mounted exactly as before.
const MindMapPanel = lazy(() => import("./course/MindMapPanel"));
const AddOfficialResourceDialog = lazy(() => import("./personal-library/AddOfficialResourceDialog"));
const LumenChat = lazy(() => import("./lumen/App"));
import PlayerPanel from "./course/PlayerPanel";
import CoursePeekDock from "./course/CoursePeekDock";
// ONE keyboard-visible state for the whole player: the footer navigation (peek
// dock + legacy in-pane dock), the Notes editor, the mind map and the AI chat
// all read this same state — no feature carries its own keyboard detection.
import { CourseKeyboardProvider } from "./course/useCourseKeyboard";
import ChargingCompleteButton from "./course/ChargingCompleteButton";
import ModuleFolderBurst from "./course/ModuleFolderBurst";
import PersonalModulesPanel from "./course/PersonalModulesPanel";
import { toast } from "./components/ui/glass-toast";
import { trackFeatureEvent } from "./utils/featureAnalytics";
import { usePersonalModules } from "./hooks/usePersonalModules";
import type { PersonalCourseOfficialReference } from "./lib/personalCourseClient";
import useCourseMindMap from "./course/useCourseMindMap";
import { combineHtml, loadLocalNotes, persistLocalNotes } from "./course/notesStore";
import { getCoursePanelSession, resetCoursePanelSession } from "./course/coursePanelSession";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";
import { useBranding } from "./context/BrandingContext";
import { useCourseAccess } from "./hooks/useCourseAccess";
import type { CourseAccessResolution } from "../utils/courseAccess";
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
import { getCourseEmbed, VIEWPORT_AWARE_KINDS, getGateSourceFileId, gateResourceKind } from "./utils/courseEmbed";
import { applyDocumentViewportMode, isBrowserDesktopSiteMode, resetDocumentViewportMode } from "./utils/documentViewportMode";
import {
  loadPlaybackStore,
  mergePlaybackEntry,
  persistPlaybackStore,
  playbackPatchChanged,
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
  /**
   * Set when this player is opening a course the learner AUTHORED in My Study
   * Library (route `#/my-course/<courseId>`), not a catalogue product.
   *
   * The player is byte-identical to the official one — same viewer stack,
   * Modules tab, Brain tab, Notes, Mind map, AI chat and Player settings —
   * with exactly three differences, because there is nothing to buy and
   * nothing official to copy:
   *
   *   1. the Paid ("premium") tab is removed from the footer dock,
   *   2. the Player settings drop the "Get personal access", "Add to My
   *      Module" and "Save for later" rows — all three are about official
   *      course resources, and there are none here,
   *   3. everything the learner writes (progress, notes, playback positions,
   *      mind maps) is stored under `mine-<courseId>`, so it can never mix
   *      with an official course's data.
   */
  mine?: { courseId: string } | null;
}

/** Tabs the learner's own course never shows (nothing is purchasable in it). */
const MINE_HIDDEN_TABS: DockTab[] = ["paid"];

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
 * First Brain practice set inside ONE module subtree — the deep-link fallback
 * for a module whose ONLY content is a `brain` resource. A brain resource has
 * no URL, so `firstAccessibleFileInModule` (which is about things you can
 * watch) never returns one; without this, hero-slide links pointed at a
 * "practice" module would silently fall back to the course's first lesson.
 * Same access rules as its siblings: hidden/locked modules contribute nothing.
 */
const firstBrainFileInModule = (
  module: CourseModule,
  accessible: Set<string>,
  inheritedLocked = false,
): CourseFile | null => {
  if (module.accessLevel === "hidden") return null;
  const moduleLocked = inheritedLocked || !accessible.has(String(module.id));
  const file = filesInModule(module).find((item) =>
    item.accessLevel !== "hidden" &&
    item.type === "brain" &&
    (item.practiceQuestions?.length ?? 0) > 0 &&
    !moduleLocked &&
    (item.accessLevel !== "paidUpdate" || accessible.has(String(accessId(item)))),
  );
  if (file) return file;
  for (const child of module.modules || []) {
    const nested = firstBrainFileInModule(child, accessible, moduleLocked);
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

// Snow mode — a purely cosmetic, interactive snowfall over the whole player
// (see src/course/SnowOverlay.tsx). Remembered per device.
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
// ── Footer dock mode ─────────────────────────────────────────────────────
// ON = the always-visible dock inside the study pane (Player settings →
// "Always-visible footer dock"). OFF = the bottom-centre PEEK dock: a thin
// frosted line at the bottom centre of the player; tap/hover opens the footer
// navigation and swiping left/right selects the tab under the finger on
// release — the exact pattern the desktop shell already uses.
//
// DEFAULT IS ON: the owner asked for "Always-visible footer dock" to be the
// out-of-the-box state, so a device that has never touched the toggle gets
// the always-visible dock. The choice is still remembered per device, so a
// learner who explicitly switches it off keeps the peek dock — only the
// "never chose" value changed (missing key → ON, "0" → OFF, "1" → ON).
const legacyFooterDockStorageKey = "dc.coursePlayerLegacyFooterDock";
const loadLegacyFooterDock = (): boolean => {
  try {
    // Absent key = never chosen = ON (the new default). Only an explicit "0"
    // from the player's own setting turns the always-visible dock off.
    return localStorage.getItem(legacyFooterDockStorageKey) !== "0";
  } catch {
    return true;
  }
};

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

/**
 * The signature the file-action registry dedupes on. The active ResourceViewer
 * re-reports its model whenever its own state changes; only a REAL change
 * (another file, another state) may re-render the player, never a fresh-but-
 * identical object identity.
 */
const fileActionsSignature = (actions: CourseFileActions): string =>
  [
    actions.fileId,
    actions.fileName,
    actions.kindLabel,
    actions.externalUrl,
    actions.isYouTube ? "1" : "0",
    actions.isMedia ? "1" : "0",
    actions.download.url,
    actions.download.label,
    actions.download.downloadable ? "1" : "0",
    actions.download.fileName,
    actions.canEditInline ? "1" : "0",
    actions.editMode ? "1" : "0",
  ].join("");

export default function CoursePlayer({ product, onBack, onPurchaseUpdate, initialModuleId, mine = null }: CoursePlayerProps) {
  const { user } = useAuth();
  const { logoUrl, appName } = useBranding();
  const modules = product.courseContent || [];
  const files = useMemo(() => allFiles(modules).filter((file) => file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId)), [modules]);
  /**
   * Is this a course the LEARNER built in My Study Library?
   * Everything below that differs between "a course they bought" and "a
   * course they authored" reads this one flag.
   */
  const isMine = Boolean(mine);
  /**
   * The id every per-course store is keyed on: notes, playback positions,
   * mind maps, progress and the AI chat. For the learner's own course it is
   * namespaced (`mine-<courseId>`) so nothing they write here can ever touch
   * an official course's data (or vice versa).
   */
  const storageProductId = isMine && mine ? `mine-${mine.courseId}` : String(product.id);
  /** Tabs this player shows — a learner-authored course has nothing to sell. */
  const hiddenTabs = useMemo<DockTab[]>(() => (isMine ? MINE_HIDDEN_TABS : []), [isMine]);
  const visibleTabOrder = useMemo(
    () => STUDY_TAB_ORDER.filter((tab) => !hiddenTabs.includes(tab)),
    [hiddenTabs],
  );
  const accessState = useCourseAccess({ product, skip: isMine });
  /**
   * Access resolution. For the learner's OWN course there is nothing to
   * resolve — every module in the tree is theirs — so the player skips the
   * entitlement / purchase / subscription listeners entirely and grants the
   * whole tree.
   */
  const resolution = useMemo<CourseAccessResolution>(() => {
    if (!isMine) return accessState.resolution;
    const ids = new Set<string>();
    const visit = (nodes: CourseModule[]) => nodes.forEach((node) => {
      ids.add(String(node.id));
      visit(node.modules || []);
    });
    visit(modules);
    return {
      hasFullProductAccess: true,
      ownedModuleIds: ids,
      ownedResourceIds: new Set<string>(),
      ownedUpdateIds: new Set<string>(),
      subscriptionGrantedModuleIds: new Set<string>(),
      accessibleModuleIds: ids,
      accessibleResourceIds: new Set<string>(),
      lockedModuleIds: new Set<string>(),
      previewModuleIds: new Set<string>(),
      moduleAccessSources: {},
      resourceAccessSources: {},
      unmetDependencies: {},
    };
  }, [accessState.resolution, isMine, modules]);
  // A personal course is owned outright — there is no subscription badge to
  // show, and no "preview mode" either.
  const hasActiveSubscription = isMine ? false : accessState.hasActiveSubscription;
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
    const watchable = firstAccessibleFileInModule(target, resolution.accessibleModuleIds);
    if (watchable) return watchable.id;
    // A module that holds nothing watchable but DOES hold a Brain set (the
    // "practice" module) is still a real deep-link target: open the set.
    return firstBrainFileInModule(target, resolution.accessibleModuleIds)?.id ?? null;
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
  // Bottom dock state — which of the seven footer tabs the study pane shows.
  const [dockTab, setDockTab] = useState<DockTab>("modules");
  // A hidden tab can never be the open one (a learner-authored course drops
  // the Paid tab): if the tab list ever loses the active tab, the pane falls
  // back to Modules instead of rendering an empty surface.
  useEffect(() => {
    if (hiddenTabs.includes(dockTab)) setDockTab("modules");
  }, [dockTab, hiddenTabs]);
  /**
   * The Brain practice set the learner just tapped in the Modules list (or
   * resumed). The Brain tab opens it once and hands the pin back — the panel
   * owns the rest of the practice session (src/course/CourseBrainPanel).
   */
  const [brainOpenSetId, setBrainOpenSetId] = useState<string | null>(null);
  // ZIP Lumen chat is lazy-loaded on first AI tab open, then stays mounted
  // (hidden) so conversation state survives tab switches.
  const [aiOpened, setAiOpened] = useState(false);
  useEffect(() => {
    if (dockTab === "ai") setAiOpened(true);
  }, [dockTab]);
  // ── Split Deck — the player's ONE layout ────────────────────────────────
  // The old "sheet" home and its Split-mode settings toggle are gone (owner's
  // direction): the player is ALWAYS two glass panes — the lesson on one side
  // and the study pane (tabs + footer dock) on the other. Tapping the active
  // dock tab peek-collapses the study pane; the divider drags it back.
  const splitDeckRef = useRef<SplitDeckHandle | null>(null);
  /**
   * Every Brain practice set this learner may open — the course tree's `brain`
   * resources (the sets the admin imported on the Product / Course-content
   * page), filtered by the SAME access rule the modules list uses, so a paid
   * module's practice never leaks to a learner who has not unlocked it.
   */
  const brainSets = useMemo(
    () => collectBrainPracticeSets(modules, unlockedModuleIds(modules, resolution.accessibleModuleIds, resolution.ownedUpdateIds)),
    [modules, resolution.accessibleModuleIds, resolution.ownedUpdateIds],
  );

  /**
   * Open a Brain practice set: pin it for the panel, switch the study pane to
   * the Brain tab and make sure the split is showing it. Used by the Modules
   * list (a brain resource row), by resume, and by anything else that wants to
   * take the learner straight to their practice.
   */
  const openBrainSet = useCallback((setId: string) => {
    setBrainOpenSetId(setId);
    setDockTab("brain");
    splitDeckRef.current?.activateStudy();
  }, []);
  // Resume-into-practice happens at most once per set per player visit, so a
  // late-arriving course tree can never pull the learner back to the Brain tab
  // after they have navigated away.
  const resumedBrainSetRef = useRef<string | null>(null);

  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  // ── TOP PROGRESS + CENTER COMPLETION ────────────────────────────────────
  // The player's application-level progress line (always at the TOP, every
  // orientation, every mode) is also the tap target for the reversible
  // mark-complete interaction: tapping it reveals the big circular charging
  // control around the CENTER of the screen (the same animated
  // ChargingCompleteButton the Player tab used to carry) and flips the
  // canonical completion state. The control settles away on its own after a
  // short idle window — it never blocks the player while it is up.
  const [centerCompleteVisible, setCenterCompleteVisible] = useState(false);
  const centerCompleteTimerRef = useRef<number | null>(null);
  // True while the document is actually in fullscreen — i.e. the Android
  // status bar is really hidden. Mirrors the live document state so the
  // "Hide status bar" toggle stays correct even when the learner swipes out
  // of fullscreen.
  const [courseFullscreen, setCourseFullscreen] = useState<boolean>(() => isCoursePlayerFullscreen());
  // Snow mode — cosmetic interactive snowfall over the whole player.
  const [snowMode, setSnowMode] = useState<boolean>(loadCourseSnow);
  // Desktop request mode for embedded documents — a Google Doc / Sheet /
  // Slides deck rendered at desktop width is unreadable on a phone, so the
  // learner can flip the same embed to its mobile rendering.
  const [desktopView, setDesktopView] = useState<boolean>(loadDesktopViewPreference);
  // Footer navigation mode: ON = the always-visible in-pane dock (default,
  // Player settings → "Always-visible footer dock"), OFF = the bottom-centre
  // peek dock.
  const [legacyFooterDock, setLegacyFooterDock] = useState<boolean>(loadLegacyFooterDock);
  // Android-only capability: iOS can never hide its status bar and desktop
  // browsers don't need to. Gates the "Hide status bar" player toggle.
  const canFullscreen = useMemo(() => isMobileDevice() && !isIOSDevice(), []);
  // ── Active-file action registry ─────────────────────────────────────────
  // The viewer stack keeps every opened file mounted. Whichever viewer is
  // ACTIVE reports its action model (open / download / fullscreen / editor /
  // personal-access gate — the rows the file's own header used to carry)
  // through this callback, and the footer dock's Player tab renders them. Deduped by
  // signature so reporting an identical model never re-renders the player.
  const [fileActions, setFileActions] = useState<{ signature: string; model: CourseFileActions } | null>(null);
  const handleFileActions = useCallback((fileId: string, model: CourseFileActions | null) => {
    setFileActions((current) => {
      if (!model) return current?.model.fileId === fileId ? null : current;
      const signature = fileActionsSignature(model);
      if (current && current.model.fileId === fileId && current.signature === signature) return current;
      return { signature, model };
    });
  }, []);
  const ownedUpdateIds = resolution.ownedUpdateIds;
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);
  const moduleTitleById = useMemo(() => collectModuleTitleById(modules), [modules]);

  // ── Personal Course Modules ("My Modules") ─────────────────────────────
  // The learner-owned study space for THIS course. The hook keeps the
  // server-derived access snapshot + lists; the overlay's Modules tab hosts
  // the manager panel (same ownership pattern as the mind map / Player
  // panels). Entitlement + limits are enforced by the server API — the hook
  // only reflects its answers.
  const [personalModulesOpen, setPersonalModulesOpen] = useState(false);
  const [addOfficialOpen, setAddOfficialOpen] = useState(false);
  const [officialDialogTarget, setOfficialDialogTarget] = useState<{ reference: PersonalCourseOfficialReference; name: string; type: CourseFile["type"] } | null>(null);
  const [personalLibraryActionBusy, setPersonalLibraryActionBusy] = useState<"save" | null>(null);
  const personalActionRef = useRef(false);
  // Course entry is lazy: ordinary lesson playback performs zero personal
  // library requests. The manager/add dialog calls ensureLoaded on demand.
  const personalModules = usePersonalModules(user?.id, product.id, {
    autoLoad: false,
    scope: "context",
    productDocumentId: product.documentId,
  });
  const activeFileIsPersonal = Boolean(selectedFile && String((selectedFile as CourseFile).source || "") === "personal");
  const selectedOfficialModule = selectedFile && !activeFileIsPersonal
    ? owningModuleForFile(modules, String(selectedFile.id))
    : null;
  const selectedOfficialReference = selectedFile && selectedOfficialModule && !activeFileIsPersonal ? {
    productId: String(product.id),
    productDocumentId: product.documentId,
    moduleId: String(selectedOfficialModule.id),
    resourceId: String(selectedFile.id),
  } : null;

  // The modules-tab entry row subtitle follows the live server snapshot:
  // usage vs the plan's limits when entitled, a clear locked hint otherwise.
  const personalModulesEntry = useMemo(() => {
    if (!user) return null;
    const access = personalModules.access;
    if (!access) {
      return { subtitle: "Your own study content", locked: false };
    }
    if (!access.entitled) {
      return { subtitle: access.disabled ? "Not available on this plan" : "Requires an eligible plan", locked: true };
    }
    const limits = access.limits;
    const moduleText = limits && Number(limits.moduleLimit) >= 0
      ? `${access.moduleCount} of ${limits.moduleLimit} modules`
      : `${access.moduleCount} ${access.moduleCount === 1 ? "module" : "modules"}`;
    const resourceText = limits && Number(limits.resourceLimit) >= 0
      ? `${access.resourceCount} of ${limits.resourceLimit} resources`
      : `${access.resourceCount} ${access.resourceCount === 1 ? "resource" : "resources"}`;
    return { subtitle: `${moduleText} · ${resourceText}`, locked: false };
  }, [user, personalModules.access]);

  /**
   * Open a personal resource through the SAME viewer stack as official
   * content. Course progress is never touched: no completed-id, no resume
   * `lastOpenedFileId` — official progress stays an honest record of the
   * official curriculum only.
   */
  const selectPersonalFile = useCallback((file: CourseFile) => {
    userSelectedRef.current = true;
    setSelectedFile(file);
  }, []);

  const openPersonalModules = () => {
    setPersonalModulesOpen(true);
    void personalModules.ensureLoaded();
    trackFeatureEvent("module_manager_opened", { surface: "course_player" });
  };

  const closeAddOfficialDialog = useCallback(() => {
    setAddOfficialOpen(false);
    setOfficialDialogTarget(null);
  }, []);

  const saveSelectedOfficialForLater = async () => {
    if (!selectedOfficialReference || personalActionRef.current) return;
    personalActionRef.current = true;
    setPersonalLibraryActionBusy("save");
    trackFeatureEvent("save_for_later_submitted", { type: selectedFile?.type || "unknown" });
    const result = await personalModules.addOfficial(selectedOfficialReference, { destination: "saved" });
    personalActionRef.current = false;
    setPersonalLibraryActionBusy(null);
    if (!result.ok) {
      toast({ title: "Couldn't save resource", description: result.message, variant: "error" });
      trackFeatureEvent("save_for_later_failed", { code: result.code || "unknown" });
      return;
    }
    if (result.alreadyExists) {
      toast({
        title: result.data?.existingState === "module" ? "Already in My Modules" : "Already saved",
        description: result.data?.existingState === "module" ? "This resource is already organised in your library." : "This resource is already in Saved for Later.",
        variant: "info",
      });
      trackFeatureEvent("official_already_added", { destination: "saved" });
      return;
    }
    toast({ title: "Saved for later", description: `${selectedFile?.name || "Resource"} is in My Study Library.`, variant: "success" });
    trackFeatureEvent("saved_for_later", { type: selectedFile?.type || "unknown" });
  };

  // ── Per-module mind map ─────────────────────────────────────────────────
  // The player tracks the selected FILE, but the mind map is scoped per
  // MODULE, so switching lessons inside one module keeps the same diagram
  // while switching modules swaps to that module's own map. The hook is
  // called unconditionally (React's rules of hooks) and treats a missing
  // module id as "nothing to load yet".
  const moduleIdByFileId = useMemo(() => collectModuleIdByFileId(modules), [modules]);
  const activeMindMapModuleId = selectedFile ? moduleIdByFileId[String(selectedFile.id)] : undefined;
  // ── Per-module Brain practice ───────────────────────────────────────────
  // The Brain tab follows the module of the lesson being watched, exactly
  // like the mind map above: same module ⇒ same practice sets, and the tab
  // can be re-scoped by hand from its own module chip row.
  const activeBrainModuleId = selectedFile ? moduleIdByFileId[String(selectedFile.id)] ?? null : null;
  const activeMindMapModuleTitle = activeMindMapModuleId ? moduleTitleById[activeMindMapModuleId] || "" : "";
  const mindMap = useCourseMindMap({
    uid: user?.id,
    productId: storageProductId,
    moduleId: activeMindMapModuleId,
    rootTopic: activeMindMapModuleTitle || product.title,
  });

  // Detect orientation for the split axis (portrait = lesson above study,
  // landscape = lesson left of study). Comparing the live viewport as well as
  // matchMedia covers mobile/PWA browsers whose media query can lag behind
  // the visual viewport during rotation.
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
  // "Hide status bar" row of the Player tab (Android only). Whatever the
  // learner did, the chrome is restored the moment the player leaves
  // landscape or unmounts.
  const courseBackgroundForStatusBar = "#0a0c12";
  useEffect(() => {
    if (isLandscape) {
      return () => restoreStatusBarFromCoursePlayer();
    }
    restoreStatusBarFromCoursePlayer();
    return undefined;
  }, [isLandscape]);

  // A status-bar colour change while already in landscape only re-blends the
  // bar — a fresh fullscreen request here would be gesture-less and blocked.
  useEffect(() => {
    if (isLandscape) syncCourseLandscapeChromeColor(courseBackgroundForStatusBar);
  }, [courseBackgroundForStatusBar, isLandscape]);

  // Whatever happens, unmounting the player puts the phone chrome back.
  useEffect(() => () => restoreStatusBarFromCoursePlayer(), []);

  // Keep the Player tab's "Hide status bar" row in lock-step with the real
  // document fullscreen state (covers the Android swipe-down / Escape exits
  // too).
  useEffect(() => {
    const sync = () => setCourseFullscreen(isCoursePlayerFullscreen());
    sync();
    const unsubscribe = onCourseFullscreenChange(sync);
    return unsubscribe;
  }, []);

  // Snow mode is a per-device preference, like the rest of the player's.
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

  // Footer dock mode is a per-device preference, like the rest of the player's.
  useEffect(() => {
    try {
      localStorage.setItem(legacyFooterDockStorageKey, legacyFooterDock ? "1" : "0");
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [legacyFooterDock]);

  useEffect(() => () => resetDocumentViewportMode(), []);

  // Progress lives under the SAME namespaced id: a learner-authored course
  // gets its own progress document, so completing a lesson they wrote can
  // never move an official course's percentage (and vice versa).
  const progressRef = useMemo(() => (user ? doc(db, "users", user.id, "courseProgress", storageProductId) : null), [storageProductId, user]);

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
    setNotes(user?.id ? loadLocalNotes(user.id, storageProductId) : []);
  }, [user, storageProductId]);

  // ── Panel session reset on exit ─────────────────────────────────────────
  // While the player is open, the Notes and Mind Map panels keep their place
  // across tab / module switches via the panel session (notes editor vs
  // list, map library vs canvas). Leaving the player resets ALL of it so the
  // next entry starts at the defaults — the notes list and the mind map
  // library. One thing is never thrown away: an open notes draft is
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
                ...loadLocalNotes(user.id, storageProductId),
              ];
              persistLocalNotes(user.id, storageProductId, next);
            } else {
              const next = loadLocalNotes(user.id, storageProductId).map((note) =>
                note.id === sessionNotes.noteId
                  ? { ...note, text: plain, html: safeHtml, updatedAt: Date.now() }
                  : note,
              );
              persistLocalNotes(user.id, storageProductId, next);
            }
          }
        }
      }
      resetCoursePanelSession();
    };
  }, [user, storageProductId]);

  // Restore the saved "where did I leave off" snapshot for this course. It
  // covers every file type, so a YouTube lesson, an MP4, a podcast, a PDF and
  // a zoomed diagram all reopen exactly where the learner stopped.
  useEffect(() => {
    playbackRef.current = user?.id ? loadPlaybackStore(user.id, storageProductId) : {};
    setPlaybackReady(true);
    return () => { setPlaybackReady(false); };
  }, [user, storageProductId]);

  /**
   * Record the live position of a file. Called continuously by the viewers
   * (timeupdate / pause / zoom / scroll) and, crucially, right before the
   * player switches away from a module — that is what makes "come back and
   * continue from the same second" work.
   */
  const reportPlayback = useCallback((fileId: string, patch: CoursePlaybackPatch) => {
    if (!fileId || !playbackPatchChanged(playbackRef.current[fileId], patch)) return;
    mergePlaybackEntry(playbackRef.current, fileId, patch);
    if (user?.id) persistPlaybackStore(user.id, storageProductId, playbackRef.current);
  }, [storageProductId, user]);

  // Flush the snapshot when the tab is hidden / closed so nothing is lost.
  useEffect(() => {
    if (!user?.id) return undefined;
    const flush = () => persistPlaybackStore(user.id, storageProductId, playbackRef.current);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [storageProductId, user]);

  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    // A deep-linked module (hero slide tap) wins over "first lesson".
    const deep = deepLinkFileId ? files.find((file) => file.id === deepLinkFileId) : null;
    // A deep link that lands on a Brain resource (a module whose content IS the
    // practice set) opens it on the Brain tab — the viewer stack never receives
    // a file type it cannot render. `files` above is URL-only, so the set is
    // matched against the access-filtered `brainSets` the Brain tab itself uses.
    const deepBrain = deepLinkFileId ? brainSets.find((set) => set.id === deepLinkFileId) : null;
    if (deepBrain) {
      openBrainSet(deepBrain.id);
      return;
    }
    const first = deep || firstAccessibleFile(modules, resolution.accessibleModuleIds);
    if (first?.type === "brain") {
      if (brainSets.some((set) => set.id === first.id)) openBrainSet(first.id);
      return;
    }
    if (first) setSelectedFile(first);
  }, [files, deepLinkFileId, resolution.accessibleModuleIds, selectedFile, modules, brainSets, openBrainSet]);

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
    // Resume straight into a practice set the same way tapping it does.
    if (match.type === "brain") {
      if (brainSets.some((set) => set.id === match.id) && resumedBrainSetRef.current !== match.id) {
        resumedBrainSetRef.current = match.id;
        openBrainSet(match.id);
      }
      return;
    }
    const owner = owningModuleForFile(modules, match.id);
    const moduleAccessible = owner ? resolution.accessibleModuleIds.has(String(owner.id)) : true;
    const filePaidLocked = match.accessLevel === "paidUpdate"
      && Boolean(match.paidUpdateId)
      && !resolution.ownedUpdateIds.has(String(accessId(match)));
    if (moduleAccessible && !filePaidLocked) setSelectedFile(match);
  }, [files, lastOpenedFileId, deepLinkFileId, resolution.accessibleModuleIds, resolution.ownedUpdateIds, modules, brainSets, openBrainSet]);

  /**
   * "Mark complete" is a TOGGLE, never a one-way door. Tapping it by mistake
   * (or while testing) can always be undone by tapping it again, which
   * removes the file from `completedFileIds` so the progress percentage
   * stays an honest reflection of what has actually been finished.
   */
  const toggleComplete = async () => {
    if (!user || !selectedFile || !progressRef) return;
    // Personal (My Modules) content never joins official completion.
    if (String(selectedFile.source || "") === "personal") return;
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
      productId: storageProductId,
      completedFileIds: completing ? arrayUnion(selectedFile.id) : arrayRemove(selectedFile.id),
      lastOpenedFileId: selectedFile.id,
      lastOpenedAt: serverTimestamp(),
      accessSource: resolution.hasFullProductAccess ? "full_product" : (resolution.ownedModuleIds.size > 0 ? "module_purchase" : (resolution.subscriptionGrantedModuleIds.size > 0 ? "subscription" : "locked")),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  // Reveal (or keep alive) the center completion control. Purely presentational
  // — the canonical completion state lives in `completedIds` + Firestore and is
  // flipped ONLY by `toggleComplete`, so there is no second progress state to
  // drift. The control auto-settles away after the idle window.
  const revealCenterCompletion = useCallback(() => {
    setCenterCompleteVisible(true);
    if (centerCompleteTimerRef.current != null) window.clearTimeout(centerCompleteTimerRef.current);
    centerCompleteTimerRef.current = window.setTimeout(() => setCenterCompleteVisible(false), 3200);
  }, []);

  useEffect(() => () => {
    if (centerCompleteTimerRef.current != null) window.clearTimeout(centerCompleteTimerRef.current);
  }, []);

  /**
   * The TOP progress interaction: flip the lesson's completion (both
   * directions) and surface the big center control so the change reads as an
   * animation, not a number jump. Personal (My Modules) content never joins
   * official completion — the top bar simply isn't interactive for it.
   */
  const handleTopProgressActivate = () => {
    if (!canMarkCompleteTop) return;
    void toggleComplete();
    revealCenterCompletion();
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
    persistLocalNotes(user.id, storageProductId, next);
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
    persistLocalNotes(user.id, storageProductId, next);
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
    persistLocalNotes(user.id, storageProductId, next);
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
    persistLocalNotes(user.id, storageProductId, next);
  };

  /**
   * Mark a Brain resource complete. Unlike the lesson toggle this is
   * one-directional: passing a practice set completes its module resource and
   * never un-completes it (nothing about the learner's progress should regress
   * because they practised again). `arrayUnion` is idempotent, so a repeat
   * pass cannot duplicate the id.
   */
  const markFileComplete = useCallback(async (fileId: string) => {
    if (!user || !progressRef) return;
    setCompletedIds((current) => (current.has(fileId) ? current : new Set([...current, fileId])));
    await setDoc(progressRef, {
      productId: storageProductId,
      completedFileIds: arrayUnion(fileId),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, [storageProductId, progressRef, user]);

  const selectFile = (file: CourseFile) => {
    // A Brain resource is not a document to open — it is the practice set on
    // the Brain tab, so selecting it takes the learner there instead of
    // handing an un-viewable type to the viewer stack.
    if (file.type === "brain") {
      userSelectedRef.current = true;
      openBrainSet(file.id);
      return;
    }
    // Switching modules must PAUSE the outgoing lesson rather than let it keep
    // playing in the background. `ResourceViewer` does that itself the moment
    // it stops being the active file (see its `active` prop).
    userSelectedRef.current = true;
    setSelectedFile(file);
    // The Split Deck keeps the study pane visible while the freshly opened
    // content loads beside it — side-by-side is the whole point of the
    // layout. The learner can peek-collapse the pane with one more tap on
    // the active dock tab if they want the lesson full-size.
    // Personal content (My Modules) never touches course progress — no
    // lastOpenedFileId, no resume entry, no completion ids.
    if (user && progressRef && String(file.source || "") !== "personal") {
      void setDoc(progressRef, { productId: storageProductId, lastOpenedFileId: file.id, lastOpenedAt: serverTimestamp() }, { merge: true });
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
  useEffect(() => { setVisitedFiles([]); userSelectedRef.current = false; }, [storageProductId]);

  const handleBuyModule = (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => {
    if (!module.paidUpdateId) return;
    const update = updates.find((u) => u.id === module.paidUpdateId) || { id: module.paidUpdateId, title: module.paidUpdateTitle || "Course update", price: numericPrice(module.paidUpdatePrice), coinPrice: 0, contentNames: [] } as PaidCourseUpdate;
    onPurchaseUpdate(update);
  };

  /**
   * The dock's gesture map (Split Deck is the only layout now):
   *
   *   · a DIFFERENT tab swaps the study pane's content in place — the pane
   *     never closes, it is the layout. If the pane is peek-collapsed (its
   *     28px rail), the tap also re-opens it — from the RIGHT side in
   *     landscape (the deck is a row there), from the bottom in portrait —
   *     so selecting a navigation tab always ACTIVATES the split content
   *     instead of leaving the new tab hidden behind the rail;
   *   · the tab you are already on peek-collapses the study pane, so the
   *     footer stays reachable even when the pane has become a 28px rail.
   */
  const handleDockTabChange = (next: DockTab) => {
    if (next === dockTab) {
      // Same flush rule as every panel close path: a debounced mind map write
      // left pending is never dropped on the way out.
      if (dockTab === "mindmap") mindMap.flush();
      splitDeckRef.current?.toggleStudy();
      return;
    }
    setDockTab(next);
    splitDeckRef.current?.activateStudy();
  };

  // ⌘/Ctrl+1…7 walks the study tabs — a desktop shortcut, so it stays out of
  // the way of any text field and of anything outside the player.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const index = Number.parseInt(event.key, 10);
      if (!Number.isFinite(index) || index < 1 || index > visibleTabOrder.length) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      const shell = playerShellRef.current;
      if (shell && target && target !== document.body && !shell.contains(target)) return;
      event.preventDefault();
      const next = visibleTabOrder[index - 1];
      if (next !== dockTab) setDockTab(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dockTab]);

  const totalEligibleFiles = useMemo(() => {
    const inaccessibleModuleIds = resolution.lockedModuleIds;
    // Brain practice sets are completable content: passing one marks its
    // resource complete (markFileComplete), so it must sit in the DENOMINATOR
    // as well — otherwise a passed set would push the progress percentage past
    // 100%. `brainSets` is already the access-filtered list (locked modules and
    // paid modules the learner does not own are not in it), so the denominator
    // and the Brain tab can never disagree about what exists.
    const brainFiles = brainSets.map((set) => ({ id: set.id }) as CourseFile);
    const eligible = files.filter((file) => {
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
    return [...eligible, ...brainFiles];
  }, [files, modules, resolution.lockedModuleIds, brainSets]);

  // Clamped: a completed id that is no longer eligible (content removed, module
  // locked after a refund) can never render more than a full bar.
  const progress = totalEligibleFiles.length ? Math.min(100, Math.round((completedIds.size / totalEligibleFiles.length) * 100)) : 0;
  const isDone = Boolean(selectedFile && completedIds.has(selectedFile.id));
  // The top progress bar's completion interaction is available for exactly the
  // files that can join official completion (never personal My Modules
  // content — that keeps its own rule from the Player tab, unchanged).
  const canMarkCompleteTop = Boolean(selectedFile) && !activeFileIsPersonal;
  const useLandscapeRails = isLandscape;
  // The player is dark only, so the native controls (scrollbars, inputs, the
  // OS file picker) always resolve to the dark rendering.
  const browserColorScheme = "dark" as const;

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
        <ResourceViewer file={null} active playback={playbackRef.current} onPlaybackChange={reportPlayback} onFileActions={handleFileActions} desktopView={desktopView} />
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
                onFileActions={handleFileActions}
                desktopView={desktopView}
              />
            </div>
          );
        })
      )}
    </div>
  );

  // P3-14: CoursePlayer — Gate personal access stays email-only (outside Apps Script via GATE_APPS_SCRIPT_URL), PlayerPanel keeps gateFile prop
  // ── The Player tab's panel ─────────────────────────────────────────────
  // Everything the old player header + ⚙ settings popover carried, rebuilt as
  // ONE list: course identity, progress / mark-complete, the ACTIVE file's
  // own buttons (reported live through the registry above — the list follows
  // the learner from module to module) and every player preference.
  const playerPanel = (
    <PlayerPanel
      logoUrl={logoUrl}
      appName={appName}
      productTitle={product.title}
      hasActiveSubscription={hasActiveSubscription}
      showPreviewBadge={resolution.previewModuleIds.size > 0}
      onBack={onBack}
      progress={progress}
      isDone={isDone}
      activeFilePersonal={activeFileIsPersonal}
      fileActions={fileActions?.model ?? null}
      showPersonalLibraryActions={Boolean(selectedOfficialReference) && !isMine}
      personalLibraryActionBusy={personalLibraryActionBusy}
      onAddToPersonalModule={() => {
        if (!selectedOfficialReference || personalActionRef.current) return;
        setOfficialDialogTarget({ reference: selectedOfficialReference, name: selectedFile?.name || "Course resource", type: selectedFile!.type });
        setAddOfficialOpen(true);
        void personalModules.ensureLoaded();
      }}
      onSaveForLater={() => { void saveSelectedOfficialForLater(); }}
      snowMode={snowMode}
      onSnowModeChange={setSnowMode}
      showViewportToggle={showViewportToggle}
      desktopView={desktopView}
      onDesktopViewChange={setDesktopView}
      canFullscreen={canFullscreen}
      courseFullscreen={courseFullscreen}
      onHideStatusBarChange={(next) => {
        if (next) enterCoursePlayerFullscreen();
        else exitCoursePlayerFullscreen();
      }}
      legacyFooterDock={legacyFooterDock}
      onLegacyFooterDockChange={setLegacyFooterDock}
      /**
       * The learner's OWN course: "Add to My Module", "Save for later" and
       * "Gate personal access" are all about OFFICIAL course resources (copy
       * one into the library, ask the owner for Drive access). There is no
       * official resource here, so those rows are gone — the rest of the
       * settings (snowfall, desktop view, status bar, footer dock) stay.
       */
      mine={isMine}
      gateFile={!isMine && selectedFile && gateResourceKind(selectedFile) ? { id: getGateSourceFileId(selectedFile) || null, url: String(selectedFile.url || selectedFile.embedUrl || ""), name: String(selectedFile.name || "") } : null}
      productId={storageProductId}
      moduleId={selectedFile ? String(owningModuleForFile(modules, String(selectedFile.id))?.id || "") : null}
    />
  );

  /**
   * The study pane's content — the seven tabs (Modules / Brain / Notes /
   * Mind map / AI / Paid / Player) plus the footer dock, rendered in-flow
   * inside the Split Deck's study pane.
   */
  const studyOverlay = (
    <CourseOverlay
      orientation={useLandscapeRails ? "landscape" : "portrait"}
      tab={dockTab}
      onTabChange={handleDockTabChange}
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
      // A learner-authored course has nothing to sell: the Paid ("premium")
      // tab is removed from the footer dock and from the ⌘/Ctrl+1… shortcuts.
      hiddenTabs={hiddenTabs}
      notes={notes}
      onAddNote={(text) => saveNote(text)}
      onEditNote={(id, text) => editNote(id, text)}
      onDeleteNote={(id) => deleteNote(id)}
      onLinkNote={(id, links) => linkNote(id, links)}
      // The mind map editor is owned here (not inside the overlay) so its
      // Firestore hook and canvas state survive the pane being collapsed and
      // reopened — the learner never loses an unsaved branch to a tab switch.
      mindMapPanel={(
        <Suspense
          fallback={(
            <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm font-semibold text-white/60">
              <span className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
            </div>
          )}
        >
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
          landscape={useLandscapeRails}
          // True only while the mind map tab is the one on screen. Within one
          // player visit the panel restores the learner's last view (library
          // or canvas) from the panel session; leaving the player resets it
          // back to the library home screen.
          open={dockTab === "mindmap"}
        />
        </Suspense>
      )}
      playerPanel={playerPanel}
      // My Modules — the Modules tab swaps its official list for the
      // learner-owned manager panel (owned here, hosted by the overlay).
      personalModulesOpen={personalModulesOpen}
      personalModulesPanel={(
        <PersonalModulesPanel
          personal={personalModules}
          productTitle={product.title}
          landscape={useLandscapeRails}
          onOpenPersonalFile={selectPersonalFile}
          onOpenLibrary={() => {
            trackFeatureEvent("library_opened", { surface: "course_player" });
            window.location.hash = "#/study-library";
          }}
          onExit={() => setPersonalModulesOpen(false)}
        />
      )}
      // Their own course IS the content: the "My Modules" manager (which
      // borrows resources OUT of an official course) has no meaning here.
      personalModulesEntry={isMine ? null : personalModulesEntry}
      onOpenPersonalModules={openPersonalModules}
      // PEEK mode: the footer navigation lives at the bottom centre of the
      // whole player (<CoursePeekDock /> below), so the study pane renders no
      // footer of its own. The legacy preference keeps the in-pane dock.
      peekDock={!legacyFooterDock}
      // ── Brain tab: the course's practice sets, rendered with the revision
      // test-taking design. Owned here because it reads the course tree and
      // reports completions into the learner's progress.
      brainPanel={
        <CourseBrainPanel
          productId={storageProductId}
          sets={brainSets}
          activeModuleId={activeBrainModuleId}
          completedFileIds={completedIds}
          openSetId={brainOpenSetId}
          onOpenedSet={() => setBrainOpenSetId(null)}
          onPass={(fileId) => {
            void markFileComplete(fileId);
          }}
        />
      }
      aiPanel={
        user?.id && aiOpened ? (
          <Suspense
            fallback={(
              <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm font-semibold text-white/60">
                <span className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
              </div>
            )}
          >
            <LumenChat
              key={storageProductId}
              uid={user.id}
              productId={storageProductId}
              courseTitle={product.title}
              courseShort={product.title.length > 18 ? `${product.title.slice(0, 18).trimEnd()}…` : product.title}
              moduleId={selectedOfficialModule ? String(selectedOfficialModule.id) : (selectedFile?.personalModuleId || null)}
              moduleTitle={selectedOfficialModule?.title || (activeFileIsPersonal ? "My Modules" : null)}
              resourceName={selectedFile?.name || null}
              resourceType={selectedFile?.type || null}
              selectedFile={selectedFile}
              notes={notes}
              profile={{ name: user.name, photoURL: user.photoURL }}
              // A plan error inside the chat used to be a dead end (no Retry
              // either, because it is not retryable). The card now carries the
              // one action that fixes it.
              onOpenSubscription={() => { window.location.hash = "#/subscription"; }}
            />
          </Suspense>
        ) : undefined
      }
    />
  );

  // The active tab drives the divider's colour, its glow and the study peek
  // rail's icon — the deck never keeps its own copy of the tab list.
  const activeStudyTab = dockTabRecord(dockTab);

  // ── ONE shell for both orientations — progress + content + footer nav ──
  // There is still no header (owner's direction): the ONE chrome row the
  // player carries is the thin TOP PROGRESS line, pinned above the stage in
  // BOTH orientations (portrait and landscape alike — it can never slide to
  // the side, because the shell itself is a column and the stage below it is
  // what flips between row/column). Portrait keeps the lesson above the study
  // pane, landscape keeps it on the left, and the footer dock rides inside
  // the study pane / the bottom-centre peek dock in both.
  //
  // The whole shell sits inside <CourseKeyboardProvider>: one keyboard state
  // for the player, consumed by the footer navigation and by the writing tabs.
  return (
    <CourseKeyboardProvider scopeRef={playerShellRef}>
    <>
    <div
      ref={playerShellRef}
      className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden text-[var(--course-text)]"
      data-course-player
      data-orientation={useLandscapeRails ? "landscape" : "portrait"}
      {...(useLandscapeRails
        ? {
            "data-course-landscape-scroll": "vertical",
            "data-course-statusbar-hidden": courseFullscreen ? "true" : "false",
          }
        : {})}
      style={{ colorScheme: browserColorScheme }}
    >
      {/* ── TOP PROGRESS LINE — the application-level progress indicator ──
          Always visible while the player is open: portrait, landscape, split,
          hidden-footer peek mode, collapsed panes — every state. It renders
          the SAME canonical progress number the Player tab summarises
          (completedIds / totalEligibleFiles — one source of truth), updates
          the moment completion changes, and is the tap target for the
          reversible mark-complete interaction (the big center control
          below). Personal-module files are never completable, so the bar
          stays a plain indicator for them. */}
      <div
        className="relative z-[75] flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0a0c12]/85 px-3 pb-[3px] pt-[max(env(safe-area-inset-top),3px)]"
        data-course-progress-summary
        data-course-top-progress
        data-progress-value={progress}
      >
        <button
          type="button"
          onClick={handleTopProgressActivate}
          disabled={!canMarkCompleteTop}
          aria-label={
            canMarkCompleteTop
              ? `Course progress ${progress}%. ${isDone ? "Lesson completed — tap to mark as not complete" : "Tap to mark this lesson complete"}`
              : `Course progress ${progress}%`
          }
          title={canMarkCompleteTop ? (isDone ? "Tap to mark as not complete" : "Mark this lesson complete") : undefined}
          className="relative h-3 min-w-0 flex-1 cursor-pointer outline-none disabled:cursor-default"
          data-course-progress-bar
          data-progress-value={progress}
        >
          {/* The thin line itself: a 4px track + the progress fill. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10" />
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #38bdf8, #a78bfa)",
              boxShadow: "0 0 10px rgba(139, 92, 246, 0.45)",
            }}
          />
        </button>
        <span
          aria-hidden
          className="shrink-0 text-[9px] font-black leading-none tabular-nums text-white/60"
          data-course-progress-label
        >
          {progress}%
        </span>
        <span role="status" aria-live="polite" className="sr-only">
          {isDone ? "Lesson completed" : "Lesson not completed"}
        </span>
      </div>
      {/* The stage: portrait = lesson above the study pane (column), landscape
          = lesson left of the study pane (row) — the split always activates
          from the RIGHT in landscape, never from the bottom. */}
      <div className={`relative flex min-h-0 min-w-0 flex-1 ${useLandscapeRails ? "flex-row" : "flex-col"}`}>
      <section
        id="course-viewer"
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-course-split="on"
        {...(useLandscapeRails ? { "data-course-landscape-content": "" } : {})}
      >
        <SplitDeck
          axis={useLandscapeRails ? "row" : "column"}
          orientation={useLandscapeRails ? "landscape" : "portrait"}
          courseId={storageProductId}
          accent={activeStudyTab.color}
          studyIcon={activeStudyTab.icon}
          lesson={viewerStack}
          study={studyOverlay}
          // Every writing surface whose keyboard deserves the whole deck: the
          // notes editor, the mind map and the AI Mentor chat input. The deck
          // reacts to the player's ONE keyboard state (see useCourseKeyboard),
          // so "keyboard open → module/course content hidden" is one rule, not
          // three per-tab hacks.
          keyboardExpandEnabled={dockTab === "notes" || dockTab === "mindmap" || dockTab === "ai"}
          solid={dockTab === "notes" || dockTab === "mindmap" || dockTab === "brain" || dockTab === "ai" || dockTab === "player"}
          handleRef={splitDeckRef}
        />
      </section>
      </div>
      {/* ── CENTER COMPLETION CONTROL ─────────────────────────────────────
          Revealed by the top progress interaction (and kept alive by every
          further tap): the SAME animated ChargingCompleteButton the Player
          tab used to carry, at charging-widget scale, around the CENTER of
          the screen. Only the circle is interactive — the wrapper never
          blocks the player — and it settles away on its own after the idle
          window. It is a reversible toggle, exactly like the control it
          replaces. */}
      {centerCompleteVisible ? (
        <div
          className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center"
          data-course-center-complete
          data-completed={isDone ? "true" : "false"}
          role="status"
          aria-live="polite"
        >
          <ChargingCompleteButton
            done={isDone}
            onToggle={() => {
              void toggleComplete();
              revealCenterCompletion();
            }}
            size={132}
            className="pointer-events-auto"
          />
        </div>
      ) : null}
      {/* ── Footer navigation: the bottom-centre PEEK dock ────────────────
          OFF by default (the owner's preferred interaction): a thin frosted
          line at the bottom centre — tap/hover opens the footer, swipe
          left/right selects the tab under the finger. The "Always-visible
          footer dock" Player setting turns it off and restores the dock
          inside the study pane.
          The dock itself carries the ONE keyboard rule (it hides completely
          while the keyboard is open — src/course/CoursePeekDock.tsx), so the
          footer can never ride above the keyboard, between the keyboard and
          the writing surface. */}
      {!legacyFooterDock ? <CoursePeekDock tab={dockTab} onTabChange={handleDockTabChange} hiddenTabs={hiddenTabs} /> : null}
      {snowMode ? <SnowOverlay /> : null}
      {/* ── Uiverse "Card" folder burst on the Module dock button ──────────
          The existing Module tab is untouched; on click the uiverse
          folder-card (great-wombat-13) appears above it, plays the exact
          open animation in full, then closes back into icon form. */}
      <ModuleFolderBurst />
    </div>
    {addOfficialOpen ? (
      <Suspense fallback={null}>
        <AddOfficialResourceDialog
          open
          onClose={closeAddOfficialDialog}
          personal={personalModules}
          official={officialDialogTarget?.reference || null}
          resourceName={officialDialogTarget?.name || "Course resource"}
          resourceType={officialDialogTarget?.type}
        />
      </Suspense>
    ) : null}
    </>
    </CourseKeyboardProvider>
  );
}
