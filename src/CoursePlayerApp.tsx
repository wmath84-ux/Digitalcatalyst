import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { playSfxAdd, playSfxComplete, playSfxRemove } from "./utils/sfx";
import { db } from "../firebase";
import ResourceViewer, { type CourseFileActions } from "./course/ResourceViewer";
import { isExperimentFileType } from "./types/course";
import CourseOverlay, { STUDY_TAB_ORDER, dockTabRecord, unlockedModuleIds, type DockTab } from "./course/CourseOverlay";
import CourseBrainPanel from "./course/CourseBrainPanel";
import { collectBrainPracticeSets } from "../utils/practiceSet.js";
import {
  findSelfPracticeCourse,
  placeSelfPracticeSet,
  selfPracticeSetsFromCourses,
} from "../utils/selfPracticeSets.js";
// SELF experiments — the Experiment page's own “+” writes into the Study
// Library through the same `myCourses` shelf (src/utils/selfExperiments.ts).
import {
  SELF_EXPERIMENTS_COURSE_ID,
  placeSelfExperiment,
  placeSelfMindMap,
  selfExperimentCourseFile,
  selfExperimentsFromCourses,
} from "./utils/selfExperiments";
import ExperimentPanel, { type PlayerExperiment } from "./course/ExperimentPanel";
import { experimentHasSource } from "./utils/experimentSpec";
import { SplitDeck, type SplitDeckHandle } from "./course/studyPanels";
import SnowOverlay from "./course/SnowOverlay";
// The mind map canvas is the single heaviest thing in the player: the panel
// plus `@xyflow/react` is a 221 kB / 73 kB-gzip chunk. `StudyContent` only
// renders this slot when the mind-map tab is the active one, so React.lazy
// keeps that chunk off the wire for every learner who opens a lesson and
// never touches the mind map — while the element below stays byte-identical
// and the panel, once opened, stays mounted exactly as before.
const MindMapPanel = lazy(() => import("./course/MindMapPanel"));
/* The Excalidraw editor is a heavy chunk (the whole drawing engine + its UI),
   so it is downloaded on the FIRST activation of the Sketch tab and never for
   a learner who does not draw — the same lazy contract the mind map uses. */
const SketchPanel = lazy(() => import("./course/SketchPanel"));
const AddOfficialResourceDialog = lazy(() => import("./personal-library/AddOfficialResourceDialog"));
const LumenChat = lazy(() => import("./lumen/App"));
import PlayerPanel from "./course/PlayerPanel";
import CoursePeekDock from "./course/CoursePeekDock";
// ONE keyboard-visible state for the whole player: the footer navigation (peek
// dock + legacy in-pane dock), the Notes editor, the mind map and the AI chat
// all read this same state — no feature carries its own keyboard detection.
import { CourseKeyboardProvider } from "./course/useCourseKeyboard";
import ChargingCompleteButton from "./course/ChargingCompleteButton";
import PersonalModulesPanel from "./course/PersonalModulesPanel";
import { toast } from "./components/ui/glass-toast";
import { trackFeatureEvent } from "./utils/featureAnalytics";
import { usePersonalModules } from "./hooks/usePersonalModules";
// NEW My Study Library (2026-09-24): "Add to My Module" + "Save for later"
// now write into the learner-owned course shelf (`users/{uid}/myCourses`),
// not the old server-backed personal-modules tree.
import { useMyCourses } from "./hooks/useMyCourses";
import { createMyCourse, createMyModule, createMyResource, fetchMyCourses } from "./lib/myCourseClient";
import type { AddOfficialSaveInput, OfficialResourceDraft } from "./personal-library/AddOfficialResourceDialog";
import type { MyCourse, MyCourseModule, MyCourseQuestion, MyCourseResource } from "./types/myCourse";
import useCourseMindMap from "./course/useCourseMindMap";
import { isMasterMindMapFile, masterMindMapView } from "../utils/courseMindMaps.js";
import useCourseSketch from "./course/useCourseSketch";
import useCourseNotes from "./course/useCourseNotes";
import { appendCloudNote, patchCloudNote } from "./course/cloudNotes";
import { combineHtml } from "./course/notesStore";
import { getCoursePanelSession, resetCoursePanelSession } from "./course/coursePanelSession";
import { useCourseTheme, usePersistedBooleanPreference, useModuleListingStyle, isModernModuleListing, DEFAULT_MODULE_LISTING_STYLE } from "./course/playerPreferences";
import CourseGradientWavesBackground from "./course/CourseGradientWavesBackground";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";
import { readStoredExcalidrawLibraryLink } from "../utils/excalidrawLibraryLink.js";
import { readUploadModuleDraft, type ReadUpload } from "../utils/readUploads.js";
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
import CourseResourceLibrary from "./course/CourseResourceLibrary";
import { courseModuleSegments } from "./course/studyResourceContext";
import type { MasterCourseNote } from "./types/course";
import { collectMasterCourseNotes } from "./course/masterNotes";
import { Settings } from "lucide-react";

/** A MASTER mind map in the library: its module chain plus the file to open (when it is a file). */
interface MasterMindMapEntry {
  mapKey: string;
  title: string;
  rootTopic: string;
  nodeCount: number;
  updatedAt: number;
  createdAt: number;
  segments: { key: string; label: string }[];
  moduleId: string;
  file?: CourseFile;
}

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
      item.type !== "read" &&
      item.type !== "note" &&
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
    item.type !== "read" &&
    item.type !== "note" &&
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
  // Read resources open from the dedicated Read dock tab, not the lesson
  // stack, last-opened resume target, completion tally or progress denominator.
  const files = useMemo(() => allFiles(modules).filter((file) => file.type !== "read" && file.type !== "note" && file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId)), [modules]);
  /**
   * …and the ONE lesson type that is playable with no URL at all: an
   * interactive 2D experiment, whose source (`interactiveHtml`) travels inside
   * the course document — the same idea as a Brain set carrying its questions.
   *
   * A Brain set is deliberately NOT added here: it is opened through
   * `brainSets` / the Brain tab and never through the viewer stack, which is
   * what `files` staying URL-only guarantees. An experiment IS a viewer
   * lesson, so it joins `playableFiles` — the list every "what can this
   * learner open?" decision reads: first-lesson / deep-link selection, resume,
   * and the progress denominator (an experiment the learner can complete must
   * count towards the bar, or completion would push the percentage past 100%).
   */
  const experimentFiles = useMemo(
    () => allFiles(modules).filter((file) => file.accessLevel !== "hidden" && isExperimentFileType(file.type) && Boolean(String(file.interactiveHtml || "").trim())),
    [modules],
  );
  const playableFiles = useMemo(() => (experimentFiles.length ? [...files, ...experimentFiles] : files), [files, experimentFiles]);
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
  // ── Notes: Firestore-backed, device-mirrored ─────────────────────────────
  // One document per note at `users/{uid}/notes/{noteId}`, scoped by the SAME
  // namespaced id everything else in this player uses — so a learner-authored
  // course can never share notes with an official one, and one learner can
  // never see another's. `useCourseNotes` keeps a live Firestore listener plus
  // the localStorage mirror (`notesStore`) as the offline copy, so notes save
  // on Firebase and render on every device.
  const notesCtl = useCourseNotes({ uid: user?.id ?? null, productId: storageProductId });
  const notes = notesCtl.notes;
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
  // A library arriving from libraries.excalidraw.com ("Add to Excalidraw" —
  // parked by main.tsx, see utils/excalidrawLibraryLink.js) must land where
  // the learner can see it: open the Sketch tab ONCE so the editor mounts and
  // installs the items into their personal library.
  const libraryReturnOpened = useRef(false);
  useEffect(() => {
    if (libraryReturnOpened.current || !user?.id || hiddenTabs.includes("sketch")) return;
    if (!readStoredExcalidrawLibraryLink(window.sessionStorage)) return;
    libraryReturnOpened.current = true;
    setDockTab("sketch");
  }, [hiddenTabs, user?.id]);
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
  // Part 1 §6 / §25 — the player's genuine light/dark appearance and the
  // Sketch "Clean / Optimised Look" are BOTH remembered, per-user preferences
  // from the shared course-player preference layer (never CSS inversion).
  const playerThemeCtl = useCourseTheme("player", user?.id ?? null);
  const sketchCleanLookCtl = usePersistedBooleanPreference("sketchCleanLook", user?.id ?? null, false);
  // Player settings → "Modern module listing": ON (the default when nothing
  // has been saved) = modern module list + the landing page's animated
  // Gradient Waves behind the content area; OFF = classic list + the legacy
  // player backdrop. A saved choice is only ever read here, never re-written.
  const moduleListingStyleCtl = useModuleListingStyle(user?.id ?? null, DEFAULT_MODULE_LISTING_STYLE);
  const gradientWavesOn = isModernModuleListing(moduleListingStyleCtl.style);
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
  const [officialDialogTarget, setOfficialDialogTarget] = useState<OfficialResourceDraft | null>(null);
  const [personalLibraryActionBusy, setPersonalLibraryActionBusy] = useState<"save" | null>(null);
  const personalActionRef = useRef(false);
  // ── NEW My Study Library controller ────────────────────────────────────
  // ONE live listener feeding the "Add to My Module" dialog and the
  // "Save for later" action below. Both write a `myCourses` document
  // (users/{uid}/myCourses/{courseId}) — the same surface the Study Library
  // page and the self-authored Course Player read, so anything saved here is
  // visible on the library shelf the moment Firestore confirms it.
  const myLibrary = useMyCourses();
  /**
   * SELF practice sets — the learner's OWN sets for this course, read from the
   * “My practice sets” course on the Study Library shelf through this same
   * live listener. A set created from the Brain tab's “+” is written there and
   * shows up here (and on every other device) the moment Firestore confirms it.
   */
  const selfBrainSets = useMemo(
    () => selfPracticeSetsFromCourses(myLibrary.courses, storageProductId),
    [myLibrary.courses, storageProductId],
  );
  /**
   * SELF experiments — the learner's OWN 2D experiments for this course, read
   * from “My experiments” on the Study Library shelf through the same live
   * listener. Created from the Experiment page's “+”, they appear here (and on
   * every other device) the moment Firestore confirms the write.
   */
  const selfExperimentItems = useMemo<PlayerExperiment[]>(
    () =>
      selfExperimentsFromCourses(myLibrary.courses, storageProductId).map((experiment) => ({
        id: experiment.id,
        title: experiment.title,
        moduleTitle: experiment.moduleTitle,
        file: selfExperimentCourseFile(experiment),
        kind: experiment.kind,
      })),
    [myLibrary.courses, storageProductId],
  );
  /**
   * MASTER experiments — every `interactive` resource of THIS course, in
   * curriculum order, carrying its module's own access state: an experiment in
   * a locked (paid or not-yet-granted) module is listed with its lock instead
   * of opening. Same visibility rule the Modules tab uses — inline source or a
   * hosted page — so the page can never list something the viewer cannot run.
   */
  const masterExperimentItems = useMemo<PlayerExperiment[]>(() => {
    const items: PlayerExperiment[] = [];
    const visit = (nodes: CourseModule[]) => {
      for (const module of nodes) {
        if (module.accessLevel === "hidden") continue;
        const moduleId = String(module.id);
        const moduleLocked =
          !resolution.accessibleModuleIds.has(moduleId) ||
          (module.accessLevel === "paidUpdate" && !ownedUpdateIds.has(String(module.paidUpdateId || module.id)));
        for (const file of module.files || []) {
          if (file.accessLevel === "hidden") continue;
          // A MASTER mind map is listed beside the experiments with the same lock
          // rule. It opens in the LOWER pane (the Mind Map tab), never upstairs.
          if (isMasterMindMapFile(file)) {
            if (!file.mindMapData) continue;
            items.push({
              id: String(file.id),
              title: String(file.name || "Mind map"),
              moduleTitle: String(module.title || ""),
              locked:
                moduleLocked ||
                (file.accessLevel === "paidUpdate" && !ownedUpdateIds.has(String(file.paidUpdateId || file.id))),
              file,
              kind: "mind_map",
            });
            continue;
          }
          if (!isExperimentFileType(file.type)) continue;
          if (!experimentHasSource(file.interactiveHtml, file.url)) continue;
          items.push({
            id: String(file.id),
            title: String(file.name || "Experiment"),
            moduleTitle: String(module.title || ""),
            locked:
              moduleLocked ||
              (file.accessLevel === "paidUpdate" && !ownedUpdateIds.has(String(file.paidUpdateId || file.id))),
            file,
            kind: "experiment",
          });
        }
        visit(module.modules || []);
      }
    };
    visit(modules);
    return items;
  }, [modules, resolution, ownedUpdateIds]);
  /** The product's class/level — only when it reads like one (“Class 10”). */
  const selfSetLevelSeed = useMemo(() => {
    const value = String(product.classLevel || "").trim();
    return /class|grade|jee|neet|college|year|board|sem|foundation/i.test(value) ? value : "";
  }, [product.classLevel]);
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

  // ── Official resource → My Study Library draft ──────────────────────────
  // The active official file, flattened into the shape a `myCourses` resource
  // needs. Both settings actions consume this, so an official resource and
  // its library copy always carry the same name, type, link and Brain set.
  const officialResourceDraft: OfficialResourceDraft | null = useMemo(() => {
    if (!selectedFile || activeFileIsPersonal || selectedFile.type === "read") return null;
    const file = selectedFile;
    return {
      name: String(file.name || "Course resource"),
      type: file.type as Exclude<CourseFile["type"], "read">,
      url: String(file.url || file.embedUrl || file.youtubeUrl || ""),
      description: String(file.description || ""),
      ...(file.type === "brain" && Array.isArray(file.practiceQuestions)
        ? {
            practiceTitle: String(file.practiceTitle || ""),
            practiceQuestions: file.practiceQuestions.map((question) => ({ ...question })),
          }
        : {}),
    };
  }, [selectedFile, activeFileIsPersonal]);

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

  // ── Writing official resources into the NEW My Study Library ────────────
  // Both settings rows land in `users/{uid}/myCourses/{courseId}` documents:
  //
  //   · "Save for later"  → the learner's reserved "Saved for later" shelf
  //     course (stable id below) so the resource is one tap away on the
  //     Study Library page.
  //   · "Add to My Module" → whichever course + module the learner picks in
  //     the dialog (or a brand-new course/module created on the spot).
  //
  // The write goes through `myLibrary.save()` — the same optimistic
  // patch + Firestore setDoc the course builder uses — so the library page,
  // any open dialog and the player stay in step from one live listener.

  /** Stable id of the shelf course that backs "Save for later". */
  const SAVED_FOR_LATER_COURSE_ID = "saved-for-later";
  const SAVED_FOR_LATER_MODULE_TITLE = "Saved";

  /** Deep-clone a course so drafts never mutate the live snapshot. */
  const cloneCourse = (course: MyCourse): MyCourse =>
    typeof structuredClone === "function"
      ? structuredClone(course)
      : JSON.parse(JSON.stringify(course)) as MyCourse;

  const buildLibraryResource = (draft: OfficialResourceDraft): MyCourseResource => {
    const resource = createMyResource(draft.type);
    const mapped: MyCourseResource = {
      ...resource,
      name: draft.name,
      url: draft.url,
      description: draft.description,
      source: "link",
      // A `read` resource must keep its library provenance: the owned Storage
      // path + file size are what let the player resolve it
      // (getReadResourcePresentation) and reopen it in the annotated PDF.js
      // viewer inside the module the learner just built.
      ...(draft.type === "read" && draft.readSourceKind
        ? {
            readSourceKind: draft.readSourceKind,
            readStoragePath: draft.readStoragePath,
            readFileName: draft.readFileName || draft.name,
            readFileSize: draft.readFileSize,
          }
        : {}),
      ...(draft.type === "brain" && draft.practiceQuestions
        ? {
            practiceTitle: draft.practiceTitle || draft.name,
            practiceQuestions: draft.practiceQuestions.map((question) => ({ ...question })),
          }
        : {}),
    };
    return mapped;
  };

  /**
   * The same resource (by link, or name+type when it has no link) must never
   * land twice in one course — mirrors the old server-side duplicate guard.
   */
  const findDuplicateResource = (
    modules: MyCourseModule[],
    draft: OfficialResourceDraft,
  ): MyCourseResource | null => {
    for (const module of modules) {
      for (const resource of module.resources) {
        const sameUrl = Boolean(draft.url) && String(resource.url || "") === draft.url;
        const sameIdentity = !draft.url
          && resource.type === draft.type
          && String(resource.name || "") === draft.name;
        if (sameUrl || sameIdentity) return resource;
      }
      const nested = findDuplicateResource(module.modules || [], draft);
      if (nested) return nested;
    }
    return null;
  };

  const addLibraryResource = async (
    course: MyCourse,
    draft: OfficialResourceDraft,
    destination: { moduleId: string | null; newModuleTitle: string },
  ): Promise<{ ok: boolean; alreadyExists?: boolean; destinationTitle?: string; message?: string }> => {
    const working = cloneCourse(course);
    if (findDuplicateResource(working.modules, draft)) {
      return { ok: true, alreadyExists: true, destinationTitle: working.title || "your library" };
    }
    const resource = buildLibraryResource(draft);
    let destinationTitle = "";
    if (destination.moduleId) {
      const append = (modules: MyCourseModule[]): boolean => {
        for (const module of modules) {
          if (module.id === destination.moduleId) {
            module.resources = [...(module.resources || []), resource];
            module.updatedAt = Date.now();
            destinationTitle = `${module.title || "Module"} · ${working.title || "My Study Library"}`;
            return true;
          }
          if (append(module.modules || [])) return true;
        }
        return false;
      };
      if (!append(working.modules)) {
        return { ok: false, message: "That module no longer exists. Please pick another destination." };
      }
    } else {
      const module = createMyModule(destination.newModuleTitle || "New module");
      module.resources = [resource];
      working.modules = [...(working.modules || []), module];
      destinationTitle = `${module.title} · ${working.title || "My Study Library"}`;
    }
    const result = await myLibrary.save(working);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, destinationTitle };
  };

  const addOfficialToLibrary = async (
    input: AddOfficialSaveInput,
  ): Promise<{ ok: boolean; alreadyExists?: boolean; destinationTitle?: string; message?: string }> => {
    // The dialog's own target, not the active lesson: the same dialog is
    // opened from the Player settings (the official file) AND from the Read
    // library's "Save to my module" (one of the learner's own PDFs).
    const draft = officialDialogTarget;
    if (!draft) return { ok: false, message: "Open a lesson file first." };
    if (!user?.id) return { ok: false, message: "Please sign in to save to your library." };
    trackFeatureEvent("library_official_add", { surface: "course_player_settings", type: draft.type });
    if (input.existingCourseId) {
      const course = myLibrary.courses.find((entry) => entry.id === input.existingCourseId);
      if (!course) return { ok: false, message: "That course no longer exists. Please pick another destination." };
      return addLibraryResource(course, draft, {
        moduleId: input.moduleId,
        newModuleTitle: input.newModuleTitle,
      });
    }
    const course = createMyCourse(user.id, input.newCourseTitle || "My course");
    return addLibraryResource(course, draft, {
      moduleId: null,
      newModuleTitle: input.newModuleTitle || "Module 1",
    });
  };

  /**
   * The Read library's "Save to my module": one of the learner's OWN uploaded
   * PDFs becomes a `read` resource in a My Study Library course — the same
   * builder path the Player settings use, so it lands in a module and opens
   * there in the annotated viewer with its annotations intact. The PDF never
   * leaves the learner's own Storage folder: only the reference travels.
   */
  const addReadUploadToModule = useCallback(
    (row: ReadUpload) => {
      if (!user?.id) {
        toast({ title: "Sign in first", description: "Please sign in to build your own modules.", variant: "info" });
        return;
      }
      const draft = readUploadModuleDraft(row) as OfficialResourceDraft | null;
      if (!draft) {
        toast({ title: "That PDF can't be added", description: "Re-upload it and try again.", variant: "error" });
        return;
      }
      trackFeatureEvent("read_upload_add_to_module", { surface: "course_player_read" });
      setOfficialDialogTarget(draft);
      setAddOfficialOpen(true);
    },
    [user?.id],
  );

  const saveSelectedOfficialForLater = async () => {
    if (!officialResourceDraft || personalActionRef.current) return;
    if (!user?.id) {
      toast({ title: "Sign in first", description: "Please sign in to save resources to your library.", variant: "info" });
      return;
    }
    personalActionRef.current = true;
    setPersonalLibraryActionBusy("save");
    try {
      trackFeatureEvent("save_for_later_submitted", { type: officialResourceDraft.type || "unknown" });
      // Never guess the shelf is empty: if the live snapshot hasn't resolved
      // yet, read Firestore once — an overwrite of the real shelf document
      // with a fresh single-module course would drop the learner's other
      // saved resources.
      const coursesNow = myLibrary.state === "loading"
        ? await fetchMyCourses(user.id).catch(() => myLibrary.courses)
        : myLibrary.courses;
      const existing = coursesNow.find((entry) => entry.id === SAVED_FOR_LATER_COURSE_ID) || null;
      let course: MyCourse;
      if (existing) {
        course = cloneCourse(existing);
      } else {
        course = {
          ...createMyCourse(user.id, "Saved for later"),
          id: SAVED_FOR_LATER_COURSE_ID,
          description: "Resources you saved from your courses — find them here on the Study Library shelf.",
        };
      }
      // The shelf course keeps ONE root module ("Saved") that holds every
      // saved resource, in save order.
      let savedModule = (course.modules || []).find((module) => module.title === SAVED_FOR_LATER_MODULE_TITLE) || null;
      if (!savedModule) {
        savedModule = createMyModule(SAVED_FOR_LATER_MODULE_TITLE);
        course.modules = [...(course.modules || []), savedModule];
      }
      if (findDuplicateResource(course.modules, officialResourceDraft)) {
        toast({
          title: "Already saved",
          description: "This resource is already in Saved for Later.",
          variant: "info",
        });
        trackFeatureEvent("official_already_added", { destination: "saved" });
        return;
      }
      const resource = buildLibraryResource(officialResourceDraft);
      savedModule.resources = [...(savedModule.resources || []), resource];
      savedModule.updatedAt = Date.now();
      const result = await myLibrary.save(course);
      if (!result.ok) {
        toast({ title: "Couldn't save resource", description: result.message, variant: "error" });
        trackFeatureEvent("save_for_later_failed", { code: "save-failed" });
        return;
      }
      toast({
        title: "Saved for later",
        description: `${officialResourceDraft.name} is in My Study Library.`,
        variant: "success",
      });
      trackFeatureEvent("saved_for_later", { type: officialResourceDraft.type || "unknown" });
    } finally {
      personalActionRef.current = false;
      setPersonalLibraryActionBusy(null);
    }
  };

  // ── Per-module mind map ─────────────────────────────────────────────────
  // The player tracks the selected FILE, but the mind map is scoped per
  // MODULE, so switching lessons inside one module keeps the same diagram
  // while switching modules swaps to that module's own map. The hook is
  // called unconditionally (React's rules of hooks) and treats a missing
  // module id as "nothing to load yet".
  const moduleIdByFileId = useMemo(() => collectModuleIdByFileId(modules), [modules]);
  // The module whose mind-map library is showing when the learner opened a map
  // from the Modules library (no file selected). Cleared by any file selection.
  const [mindMapModuleOverride, setMindMapModuleOverride] = useState<string | null>(null);
  // The MASTER mind map open in the LOWER study pane (Mind Map tab). It never
  // touches `selectedFile`, so the upper lesson pane keeps its video/content.
  const [masterMapKey, setMasterMapKey] = useState<string | null>(null);
  const activeMindMapModuleId = mindMapModuleOverride
    || (selectedFile ? moduleIdByFileId[String(selectedFile.id)] || selectedFile.personalModuleId || undefined : undefined);

  // Personal curriculum is lazy by design. Load it only when a visible note or
  // active personal map needs real breadcrumbs; ordinary course playback
  // keeps its zero-request path.
  useEffect(() => {
    const personalNoteContextNeeded = dockTab === "notes" && notesCtl.notes.some(
      (note) => Boolean(note.personalModuleId || note.personalResourceId),
    );
    const personalMapContextNeeded = dockTab === "mindmap" && Boolean(selectedFile?.personalModuleId);
    if (personalNoteContextNeeded || personalMapContextNeeded) {
      void personalModules.ensureLoaded();
    }
  }, [dockTab, notesCtl.notes, selectedFile?.personalModuleId, personalModules.ensureLoaded]);

  // ── Per-module Brain practice ───────────────────────────────────────────
  // The Brain tab follows the module of the lesson being watched, exactly
  // like the mind map above: same module ⇒ same practice sets, and the tab
  // can be re-scoped by hand from its own module chip row.
  const activeBrainModuleId = selectedFile ? moduleIdByFileId[String(selectedFile.id)] ?? null : null;

  /**
   * Create a practice set from the Brain tab's “+” and put it on the Study
   * Library shelf — the SELF half of MASTER/SELF. Everything lands in ONE
   * library course (“My practice sets”, created on first use through the same
   * `myCourseClient` builders the rest of the shelf uses), so the set syncs to
   * every device and opens in the existing Brain editor there. The resource is
   * tagged with this player's scope (`storageProductId`), which is what makes
   * it show in THIS course's SELF list and nowhere else.
   *
   * The live shelf may not have resolved yet: like “Save for later”, an
   * unloaded list is read once from Firestore instead of guessing it is empty
   * (a guess would overwrite the learner's other saved sets).
   */
  const createSelfBrainSet = useCallback(
    async ({
      title,
      questions,
    }: {
      title: string;
      questions: MyCourseQuestion[];
    }): Promise<{ ok: boolean; message?: string }> => {
      if (!user?.id) return { ok: false, message: "Please sign in to save practice sets." };
      // Never write the shelf from a list that did not load: the save replaces
      // the whole course document, so a guessed-empty shelf would erase the
      // learner's other sets. Refuse honestly instead.
      if (myLibrary.state === "error") {
        return { ok: false, message: "Your Study Library could not be read, so this set was not saved. Reload and try again." };
      }
      let coursesNow = myLibrary.courses;
      if (myLibrary.state === "loading") {
        try {
          coursesNow = await fetchMyCourses(user.id);
        } catch {
          return { ok: false, message: "Could not reach your Study Library to save this set. Check your connection and try again." };
        }
      }
      const existing = findSelfPracticeCourse(coursesNow);
      const placed = placeSelfPracticeSet(
        {
          course: existing,
          uid: user.id,
          productId: storageProductId,
          courseTitle: product.title,
          moduleTitle: activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "",
          name: title,
          questions,
        },
        {
          createCourse: (ownerUid, courseTitle) => createMyCourse(ownerUid, courseTitle),
          createModule: (moduleTitle) => createMyModule(moduleTitle),
          createResource: (type) => createMyResource(type),
        },
      );
      if (!placed.course) return { ok: false, message: placed.issues[0] || "Could not build the practice set." };
      const result = await myLibrary.save(placed.course);
      if (!result.ok) return { ok: false, message: result.message };
      trackFeatureEvent("brain_self_set_created", { questions: questions.length });
      toast({
        title: "Practice set created",
        description: `“${title}” is saved to My Study Library.`,
        variant: "success",
      });
      return { ok: true };
    },
    [user?.id, myLibrary, storageProductId, product.title, activeBrainModuleId, moduleTitleById],
  );

  /**
   * Create a 2D experiment from the Experiment page's “+” (behind its
   * dropdown) and put it on the Study Library shelf — the SELF half of that
   * page's MASTER/SELF filter, exactly like the Brain tab's sets above.
   * Everything lands in ONE library course (“My experiments”, created on first
   * use through the same `myCourseClient` builders the rest of the shelf
   * uses), so the experiment syncs to every device and opens in the existing
   * Study Library editor there. The resource is tagged with this player's
   * scope (`storageProductId`), which is what makes it show in THIS course's
   * SELF list and nowhere else.
   *
   * The live shelf may not have resolved yet: like “Save for later”, an
   * unloaded list is read once from Firestore instead of guessing it is empty
   * (a guess would overwrite the learner's other experiments).
   */
  const createSelfExperiment = useCallback(
    async ({
      name,
      html,
      url,
    }: {
      name: string;
      html: string;
      url?: string;
    }): Promise<{ ok: boolean; message?: string }> => {
      if (!user?.id) return { ok: false, message: "Please sign in to save experiments." };
      const coursesNow = myLibrary.state === "loading"
        ? await fetchMyCourses(user.id).catch(() => myLibrary.courses)
        : myLibrary.courses;
      const existing = coursesNow.find((entry) => entry.id === SELF_EXPERIMENTS_COURSE_ID) || null;
      const placed = placeSelfExperiment(
        {
          course: existing,
          uid: user.id,
          productId: storageProductId,
          courseTitle: product.title,
          moduleTitle: activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "",
          name,
          html,
          url,
        },
        {
          createCourse: (ownerUid, courseTitle) => createMyCourse(ownerUid, courseTitle),
          createModule: (moduleTitle) => createMyModule(moduleTitle),
          createResource: (type) => createMyResource(type),
        },
      );
      if (!placed.course) return { ok: false, message: placed.issues[0] || "Could not build the experiment." };
      const result = await myLibrary.save(placed.course);
      if (!result.ok) return { ok: false, message: result.message };
      trackFeatureEvent("experiment_created", { surface: "course_player" });
      toast({
        title: "Experiment created",
        description: `“${name}” is saved to My Study Library.`,
        variant: "success",
      });
      return { ok: true };
    },
    [user?.id, myLibrary, storageProductId, product.title, activeBrainModuleId, moduleTitleById],
  );

  /**
   * A learner's own mind map from the Experiment page's “+”. Same shelf course,
   * same player scope, same save path as an experiment. Resolves `ok` only after
   * the library write has committed, so the success toast is never early.
   */
  const createSelfMindMap = useCallback(
    async ({
      name,
      mindMapData,
    }: {
      name: string;
      mindMapData: Record<string, unknown>;
    }): Promise<{ ok: boolean; message?: string }> => {
      if (!user?.id) return { ok: false, message: "Please sign in to save mind maps." };
      const coursesNow = myLibrary.state === "loading"
        ? await fetchMyCourses(user.id).catch(() => myLibrary.courses)
        : myLibrary.courses;
      const existing = coursesNow.find((entry) => entry.id === SELF_EXPERIMENTS_COURSE_ID) || null;
      const placed = placeSelfMindMap(
        {
          course: existing,
          uid: user.id,
          productId: storageProductId,
          courseTitle: product.title,
          moduleTitle: activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "",
          name,
          mindMapData,
        },
        {
          createCourse: (ownerUid, courseTitle) => createMyCourse(ownerUid, courseTitle),
          createModule: (moduleTitle) => createMyModule(moduleTitle),
          createResource: (type) => createMyResource(type),
        },
      );
      if (!placed.course) return { ok: false, message: placed.issues[0] || "Could not build the mind map." };
      const result = await myLibrary.save(placed.course);
      if (!result.ok) return { ok: false, message: result.message };
      toast({
        title: "Mind map saved",
        description: `“${name}” is saved to My Study Library.`,
        variant: "success",
      });
      return { ok: true };
    },
    [user?.id, myLibrary, storageProductId, product.title, activeBrainModuleId, moduleTitleById],
  );

  const personalMapModule = activeMindMapModuleId
    ? personalModules.modules.find((module) => String(module.id) === String(activeMindMapModuleId))
    : undefined;
  const activeMindMapModuleTitle = activeMindMapModuleId
    ? moduleTitleById[activeMindMapModuleId] || personalMapModule?.title || ""
    : "";
  const mindMap = useCourseMindMap({
    uid: user?.id,
    productId: storageProductId,
    moduleId: activeMindMapModuleId,
    rootTopic: activeMindMapModuleTitle || product.title,
  });

  // ── Per-module sketch (Excalidraw) ──────────────────────────────────────
  // Scoped exactly like the mind map above — uid + course + module — so
  // Module A's board can never appear under Module B, and coming back to A
  // restores A. The resource open beside it is recorded as an association
  // only; it does NOT split the board, because a learner draws about the
  // lesson, not about one PDF inside it.
  //
  // The hook lives HERE, not in the panel, so the scene survives the panel
  // unmounting on every tab switch (the editor only mounts while its tab is
  // active) and so an unsaved stroke is flushed even if the learner leaves
  // the player straight from another tab.
  const sketch = useCourseSketch({
    uid: user?.id,
    productId: storageProductId,
    moduleId: activeMindMapModuleId,
    resourceId: selectedFile ? String(selectedFile.id) : null,
    resourceName: selectedFile?.name ?? null,
  });

  // ── Part 17: Structural Readiness Gate ─────────────────────────────────
  // Wait for ALL critical data before showing the player. This prevents
  // broken UI, flickering, and race conditions between Product A → B or
  // Module A → B transitions.
  const readinessStages = useMemo(() => ({
    access: !accessState.loading,
    notes: !notesCtl.loading,
    mindMap: !mindMap.loading,
    sketch: !sketch.loading,
    playback: playbackReady,
  }), [accessState.loading, notesCtl.loading, mindMap.loading, sketch.loading, playbackReady]);
  
  const isReady = Object.values(readinessStages).every(Boolean);

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

  // Notes no longer live only on this device: `useCourseNotes` (mounted above)
  // reads `users/{uid}/notes` live, mirrors every change to localStorage and
  // pushes anything device-only back up — so an old local note migrates to
  // Firebase on the first open after this change.

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
            // This runs while the player is UNMOUNTING, so the notes hook has
            // already flushed and torn itself down: the draft is rescued
            // through the standalone store helpers, which write the device
            // mirror synchronously and push the same note to Firestore
            // (`users/{uid}/notes/{noteId}`). A draft left in the editor is
            // therefore saved to the cloud exactly like a note saved by hand.
            if (sessionNotes.view === "compose") {
              appendCloudNote(user.id, storageProductId, {
                id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: plain,
                html: safeHtml,
                createdAt: Date.now(),
              });
            } else if (sessionNotes.noteId) {
              patchCloudNote(user.id, storageProductId, sessionNotes.noteId, safeHtml);
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
    if (selectedFile || playableFiles.length === 0) return;
    // A deep-linked module (hero slide tap) wins over "first lesson". The
    // official `files` lookup is tried first (it is the pinned, URL-backed
    // list), then the learner's own experiment, which has no URL at all.
    const deep = deepLinkFileId ? files.find((file) => file.id === deepLinkFileId) ?? playableFiles.find((file) => file.id === deepLinkFileId) : null;
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
  }, [files, playableFiles, deepLinkFileId, resolution.accessibleModuleIds, selectedFile, modules, brainSets, openBrainSet]);

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
    // Official lessons first (the pinned `files` lookup), then the learner's own
    // experiment — `playableFiles` is the union of both.
    const match = files.find((file) => file.id === lastOpenedFileId) ?? playableFiles.find((file) => file.id === lastOpenedFileId);
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
  }, [files, playableFiles, lastOpenedFileId, deepLinkFileId, resolution.accessibleModuleIds, resolution.ownedUpdateIds, modules, brainSets, openBrainSet]);

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

  /**
   * An interactive experiment that finished ITSELF
   * (`window.dcExperiment.complete()` — see src/course/ExperimentStage.tsx)
   * marks the open lesson complete, once, and only ever in the COMPLETE
   * direction: `toggleComplete` is a toggle, so blindly calling it would
   * un-complete a lesson the learner is re-running to revise.
   */
  const completeFromExperiment = useCallback((fileId: string) => {
    if (!fileId || !selectedFile || fileId !== selectedFile.id) return;
    if (completedIds.has(fileId)) return;
    void toggleComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, completedIds, toggleComplete]);

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
  // projection is stored alongside it for safe card titles and context previews.
  //
  // Persistence itself belongs to `useCourseNotes`: every mutation below lands
  // in Firestore (`users/{uid}/notes/{noteId}`) AND in the localStorage mirror,
  // debounced into one batched commit, retried with backoff, and flushed the
  // moment the player is left. That is what makes a note survive a device
  // change, a browser clear and a dropped connection.
  const saveNote = (html: string) => {
    if (!user) return;
    const safeHtml = sanitizeRichText(html);
    if (isEmptyRichText(safeHtml)) return;
    const selectedModuleId = selectedFile
      ? moduleIdByFileId[String(selectedFile.id)] || selectedFile.personalModuleId
      : undefined;
    const saved = notesCtl.add(safeHtml, {
      text: richTextToPlain(safeHtml),
      ...(selectedModuleId ? { moduleId: String(selectedModuleId) } : {}),
      ...(selectedFile ? { resourceId: String(selectedFile.id) } : {}),
      ...(selectedFile?.personalModuleId ? { personalModuleId: String(selectedFile.personalModuleId) } : {}),
      ...(selectedFile?.personalResourceId ? { personalResourceId: String(selectedFile.personalResourceId) } : {}),
    });
    if (saved) playSfxAdd();
  };

  const editNote = (id: string, nextHtml: string) => {
    if (!user) return;
    const safeHtml = sanitizeRichText(nextHtml);
    if (isEmptyRichText(safeHtml)) return;
    notesCtl.edit(id, safeHtml);
  };

  const deleteNote = (id: string) => {
    if (!user) return;
    // Deleting a note must also drop any incoming wires from other notes,
    // so the wire layer in `NotesPanel` never tries to draw a line to a
    // card that no longer exists. The outbound side is gone with the note
    // itself; the inbound side is pruned in the same pass — and the delete is
    // committed to Firestore immediately (plus a device tombstone, so a later
    // cloud snapshot can never resurrect it).
    notesCtl.remove(id);
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
    // The symmetric rule now lives in `utils/courseNotes.js` (`applyNoteLinks`)
    // so the hook can return exactly which documents changed — every one of
    // them is written back to Firestore, not just the source note.
    notesCtl.link(sourceId, nextLinks);
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
    setMindMapModuleOverride(null);
    setMasterMapKey(null);
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
      if (dockTab === "sketch") sketch.flush();
      splitDeckRef.current?.toggleStudy();
      return;
    }
    setDockTab(next);
    splitDeckRef.current?.activateStudy();
  };

  // ⌘/Ctrl+1…9 walks the study tabs — a desktop shortcut, so it stays out of
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
    const eligible = playableFiles.filter((file) => {
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
  }, [playableFiles, modules, resolution.lockedModuleIds, brainSets]);

  // Clamped: a completed id that is no longer eligible (content removed, module
  // locked after a refund) can never render more than a full bar.
  const progress = totalEligibleFiles.length ? Math.min(100, Math.round((completedIds.size / totalEligibleFiles.length) * 100)) : 0;
  const isDone = Boolean(selectedFile && completedIds.has(selectedFile.id));
  // The top progress bar's completion interaction is available for exactly the
  // files that can join official completion (never personal My Modules
  // content — that keeps its own rule from the Player tab, unchanged).
  const canMarkCompleteTop = Boolean(selectedFile) && !activeFileIsPersonal;
  const useLandscapeRails = isLandscape;
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
    // The board is unmounted the instant its tab loses focus, so the last
    // stroke has to be written on the way out, not on the next debounce.
    if (previous === "sketch" && dockTab !== "sketch") sketch.flush();
    // `mindMap.flush` / `sketch.flush` are stable callbacks, so only the tab
    // is watched.
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
                onComplete={completeFromExperiment}
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
      showPersonalLibraryActions={Boolean(selectedOfficialReference) && Boolean(user) && !isMine}
      personalLibraryActionBusy={personalLibraryActionBusy}
      onAddToPersonalModule={() => {
        if (!officialResourceDraft || personalActionRef.current) return;
        setOfficialDialogTarget(officialResourceDraft);
        setAddOfficialOpen(true);
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
      playerTheme={playerThemeCtl.theme}
      onPlayerThemeChange={playerThemeCtl.setTheme}
      sketchCleanLook={sketchCleanLookCtl.value}
      onSketchCleanLookChange={sketchCleanLookCtl.setValue}
      moduleListingStyle={moduleListingStyleCtl.style}
      onModuleListingStyleChange={moduleListingStyleCtl.setStyle}
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

  // ── Resource Library for the Modules tab ──────────────────────────────
  // The structured resource library replaces the flat module list when the
  // course has note/mind_map resources. It shows the full hierarchy (chapters
  // → modules → submodules → resources) with proper cards for each type.
  // Master notes are computed here (same pure logic as the overlay) so the
  // library can index them without loading bodies.
  const libraryMasterNotes = useMemo(() => {
    const unlocked = unlockedModuleIds(modules, resolution.accessibleModuleIds, resolution.ownedUpdateIds);
    return collectMasterCourseNotes(modules, {
      courseId: String(product.id),
      unlockedModuleIds: unlocked,
      ownedUpdateIds: resolution.ownedUpdateIds,
      accessibleResourceIds: resolution.accessibleResourceIds,
      enabled: !isMine,
    });
  }, [modules, product.id, resolution.accessibleModuleIds, resolution.accessibleResourceIds, resolution.ownedUpdateIds, isMine]);

  // Part 1 §10 — MASTER mind maps are the course-published mind-map resources
  // (embedded Whimsical maps + mindmap files), projected read-only. They reuse
  // the existing course tree (no new store); SELF stays the learner's own maps.
  // Only maps in modules the learner can open are listed, each carrying its
  // real module chain so the library groups it under the right module.
  const masterMindMaps = useMemo<MasterMindMapEntry[]>(() => {
    if (isMine) return [];
    const out: MasterMindMapEntry[] = [];
    const walk = (mods: CourseModule[]) => {
      for (const m of mods) {
        const moduleUnlocked = resolution.accessibleModuleIds.has(String(m.id)) || resolution.previewModuleIds.has(String(m.id));
        if (moduleUnlocked) {
          const segments = courseModuleSegments(modules, m.id);
          if (m.embedContentTypeId === "whimsical_mindmap" && m.embedContentUrl) {
            out.push({ mapKey: `master-${m.id}`, title: m.title || "Master mind map", rootTopic: m.title || "", nodeCount: 0, updatedAt: 0, createdAt: 0, segments, moduleId: String(m.id) });
          }
          for (const f of m.files || []) {
            if (f.type !== "mindmap" && !isMasterMindMapFile(f)) continue;
            if (!resolution.accessibleResourceIds.has(String(f.id)) && !moduleUnlocked) continue;
            const nodeCount = isMasterMindMapFile(f) ? masterMindMapView(f)?.nodeCount ?? 0 : 0;
            out.push({ mapKey: `master-${f.id}`, title: f.name || "Master mind map", rootTopic: f.name || "", nodeCount, updatedAt: 0, createdAt: 0, segments, moduleId: String(m.id), file: f });
          }
        }
        walk(m.modules || []);
      }
    };
    walk(modules);
    return out;
  }, [modules, isMine, resolution.accessibleModuleIds, resolution.previewModuleIds, resolution.accessibleResourceIds]);

  // Signal to open a specific master note in the NotesPanel. Each increment
  // with a new id triggers the panel to switch to the master note viewer.
  const [openMasterNoteSignal, setOpenMasterNoteSignal] = useState<{ id: string; count: number } | null>(null);

  const handleOpenMasterNoteFromLibrary = useCallback((note: MasterCourseNote) => {
    // Switch to the Notes tab and signal the panel to open this master note.
    setDockTab("notes");
    setOpenMasterNoteSignal({ id: note.id, count: Date.now() });
    splitDeckRef.current?.activateStudy();
  }, []);

  const handleOpenMindMapResourceFromLibrary = useCallback((file: CourseFile, _modulePath: string[]) => {
    // Switch to the Mind Map tab on the module that owns this map — the
    // override keeps the library on that module even though no file is open.
    setMindMapModuleOverride(moduleIdByFileId[String(file.id)] || file.personalModuleId || null);
    // An admin mind map opens its own read-only view in this lower pane.
    setMasterMapKey(isMasterMindMapFile(file) ? `master-${file.id}` : null);
    setDockTab("mindmap");
    splitDeckRef.current?.activateStudy();
  }, [moduleIdByFileId]);

  // A MASTER map opened from the Mind Map library: a map file opens through the
  // same selection path as a lesson (so its module becomes the active one),
  // then the Mind Map tab shows it. Embedded maps have no file: they open on
  // their module's map library instead.
  const handleOpenMasterMap = useCallback((mapKey: string) => {
    const entry = masterMindMaps.find((item) => item.mapKey === mapKey);
    if (!entry) return;
    if (entry.file && isMasterMindMapFile(entry.file)) {
      // Admin mind map: shown read-only in the LOWER pane. The upper lesson
      // pane is left exactly as it was.
      setMasterMapKey(entry.mapKey);
      setMindMapModuleOverride(entry.moduleId);
    } else if (entry.file) {
      selectFile(entry.file);
    } else {
      setMindMapModuleOverride(entry.moduleId);
    }
    setDockTab("mindmap");
    splitDeckRef.current?.activateStudy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterMindMaps]);
  /** A learner's own map opened from the Experiment page (SELF). Lower pane only. */
  const openSelfMindMap = useCallback((id: string) => {
    setMasterMapKey(`self-${id}`);
    setDockTab("mindmap");
    splitDeckRef.current?.activateStudy();
  }, []);
  const masterMapView = useMemo(() => {
    if (!masterMapKey) return null;
    if (masterMapKey.startsWith("self-")) {
      const item = selfExperimentItems.find((entry) => `self-${entry.id}` === masterMapKey && entry.file?.type === "mind_map");
      if (!item?.file) return null;
      const view = masterMindMapView(item.file);
      return {
        key: masterMapKey,
        title: item.title,
        mind: view?.mind ?? null,
        error: view?.error ?? null,
      };
    }
    const entry = masterMindMaps.find((item) => item.mapKey === masterMapKey && isMasterMindMapFile(item.file));
    if (!entry?.file) return null;
    const view = masterMindMapView(entry.file);
    return {
      key: entry.mapKey,
      title: entry.title,
      mind: view?.mind ?? null,
      error: view?.error ?? null,
    };
  }, [masterMapKey, masterMindMaps, selfExperimentItems]);

  // The structured library is the Modules tab for every course: it groups the
  // real module tree (with notes, mind maps and lessons in each module), and
  // the learner's own "My Modules" entry sits at its root. An empty course
  // shows the library's own empty state.
  const libraryPersonalEntry = isMine || !personalModulesEntry
    ? null
    : { ...personalModulesEntry, onOpen: openPersonalModules };
  const resourceLibraryPanel = (
    <CourseResourceLibrary
      modules={modules}
      courseTitle={product.title}
      selectedFileId={selectedFile?.id}
      completedFileIds={completedIds}
      accessibleModuleIds={resolution.accessibleModuleIds}
      ownedUpdateIds={resolution.ownedUpdateIds}
      previewModuleIds={resolution.previewModuleIds}
      accessibleResourceIds={resolution.accessibleResourceIds}
      masterNotes={libraryMasterNotes}
      onSelectFile={selectFile}
      onOpenMasterNote={handleOpenMasterNoteFromLibrary}
      onOpenMindMapResource={handleOpenMindMapResourceFromLibrary}
      personalEntry={libraryPersonalEntry}
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
      courseTitle={product.title}
      personalModules={personalModules.modules}
      productId={String(product.id)}
      uid={user?.id ?? null}
      // Read tab → "Save to my module": the learner's own PDF becomes a
      // My Study Library resource through the same dialog the Player
      // settings use.
      onAddReadUploadToModule={addReadUploadToModule}
      selectedFileId={selectedFile?.id}
      ownedUpdateIds={ownedUpdateIds}
      accessibleModuleIds={resolution.accessibleModuleIds}
      accessibleResourceIds={resolution.accessibleResourceIds}
      previewModuleIds={resolution.previewModuleIds}
      masterNotesEnabled={!isMine}
      updates={updates}
      moduleTitleById={moduleTitleById}
      onSelectFile={selectFile}
      onBuyModule={handleBuyModule}
      onBuyUpdate={onPurchaseUpdate}
      // A learner-authored course has nothing to sell: the Paid ("premium")
      // tab is removed from the footer dock and from the ⌘/Ctrl+1… shortcuts.
      hiddenTabs={hiddenTabs}
      moduleListingStyle={moduleListingStyleCtl.style}
      notes={notes}
      onAddNote={(text) => saveNote(text)}
      onEditNote={(id, text) => editNote(id, text)}
      onDeleteNote={(id) => deleteNote(id)}
      onLinkNote={(id, links) => linkNote(id, links)}
      notesSync={{ status: notesCtl.status, synced: notesCtl.synced, errorMessage: notesCtl.errorMessage }}
      onRetryNotes={notesCtl.reload}
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
          courseTitle={product.title}
          modules={modules}
          moduleId={activeMindMapModuleId}
          personalModules={personalModules.modules}
          onRetryMaps={mindMap.reload}
          uid={user?.id ?? null}
          masterMaps={masterMindMaps}
          onOpenMasterMap={handleOpenMasterMap}
          masterMap={masterMapView}
          onCloseMasterMap={() => setMasterMapKey(null)}
          landscape={useLandscapeRails}
          // True only while the mind map tab is the one on screen. Within one
          // player visit the panel restores the learner's last view (library
          // or canvas) from the panel session; leaving the player resets it
          // back to the library home screen.
          open={dockTab === "mindmap"}
        />
        </Suspense>
      )}
      // The sketch board, owned here for the same reason as the mind map:
      // the scene + its Firestore hook outlive the editor, which only mounts
      // while the Sketch tab is on screen.
      sketchPanel={(
        <Suspense
          fallback={(
            <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm font-semibold text-white/60">
              <span className="block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-orange-400" />
            </div>
          )}
        >
          <SketchPanel
            getScene={sketch.getScene}
            sceneKey={sketch.sceneKey}
            loading={sketch.loading}
            status={sketch.status}
            errorMessage={sketch.errorMessage}
            pendingSync={sketch.pendingSync}
            scoped={sketch.scoped}
            onChange={sketch.updateScene}
            playerTheme={playerThemeCtl.theme}
            canvasColor={sketch.canvasColor}
            onCanvasColorChange={sketch.setCanvasColor}
            boardName={activeMindMapModuleTitle || product.title}
            // The personal library is the LEARNER's (users/{uid}/sketchLibraries),
            // so the panel needs to know who is signed in.
            uid={user?.id ?? null}
            deviceSaved={sketch.deviceSaved}
            onRetry={sketch.retry}
            // The module's boards: switcher + "+" (new blank canvas).
            boards={sketch.boards}
            activeBoardKey={sketch.activeBoardKey}
            activeBoardTitle={sketch.activeBoardTitle}
            onSelectBoard={sketch.selectBoard}
            onCreateBoard={sketch.createBoard}
            onDeleteActive={() => sketch.deleteBoard(sketch.activeBoardKey)}
            canDeleteActive={sketch.boards.length > 1}
            canCreateBoard={sketch.canCreateBoard}
            cleanLook={sketchCleanLookCtl.value}
            productId={product.id}
            moduleId={activeMindMapModuleId}
            resourceId={selectedFile?.id || null}
            resourceName={selectedFile?.name || null}
          />
        </Suspense>
      )}
      playerPanel={playerPanel}
      // Structured resource library — replaces the flat module list when the
      // course has note/mind_map resources. Owned here, hosted by the overlay.
      resourceLibraryPanel={resourceLibraryPanel}
      // Signal from the library to open a specific master note in the Notes tab.
      openMasterNoteSignal={openMasterNoteSignal}
      // My Modules — the Modules tab swaps its official list for the
      // learner-owned manager panel (owned here, hosted by the overlay).
      personalModulesOpen={personalModulesOpen}
      personalModulesPanel={(
        <PersonalModulesPanel
          personal={personalModules}
          productTitle={product.title}
          landscape={useLandscapeRails}
          playerTheme={playerThemeCtl.theme}
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
          // The learner's own sets (the “+” composer writes them to the Study
          // Library shelf; the live listener feeds them back here).
          selfSets={selfBrainSets}
          onCreateSelfSet={createSelfBrainSet}
          selfSetPrompt={{
            topic: (activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "") || product.title,
            level: selfSetLevelSeed,
            defaultName: `${(activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "") || product.title} — practice set`,
          }}
          activeModuleId={activeBrainModuleId}
          completedFileIds={completedIds}
          openSetId={brainOpenSetId}
          onOpenedSet={() => setBrainOpenSetId(null)}
          onPass={(fileId) => {
            void markFileComplete(fileId);
          }}
          uid={user?.id ?? null}
        />
      }
      // ── Experiment tab: the course's own 2D experiments (MASTER) and the
      // learner's own (SELF). The parent owns the panel because it reads BOTH
      // the course tree and the Study Library shelf — and owns the “+” save,
      // so a created experiment is already on the shelf before the sheet
      // closes. MASTER opens through `selectFile` (official progress);
      // SELF through `selectPersonalFile`, which deliberately leaves course
      // progress alone.
      experimentPanel={
        <ExperimentPanel
          masterExperiments={masterExperimentItems}
          selfExperiments={selfExperimentItems}
          onCreateSelfExperiment={createSelfExperiment}
          onCreateSelfMindMap={createSelfMindMap}
          selfExperimentSeed={{
            name: (activeBrainModuleId ? moduleTitleById[activeBrainModuleId] || "" : "") || product.title,
          }}
          onOpen={(experiment, source) => {
            // A mind map never opens in the upper lesson pane: it is drawn in the
            // lower Mind Map tab, from the same master/self routes the library uses.
            if (experiment.kind === "mind_map") {
              if (source === "self") openSelfMindMap(experiment.id);
              else handleOpenMasterMap(`master-${experiment.id}`);
              return;
            }
            if (source === "self") selectPersonalFile(experiment.file);
            else selectFile(experiment.file);
          }}
          uid={user?.id ?? null}
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
    {/* ── Part 17: Readiness Gate ─────────────────────────────────────────
        Show a staged loading UI until all critical data is ready. This
        prevents broken UI, flickering, and race conditions. */}
    {!isReady && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0c12]"
        data-course-player-loading
        data-course-theme={playerThemeCtl.theme}
      >
        <div className="flex flex-col items-center gap-4 px-6">
          {/* Animated loading indicator */}
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/10 border-t-violet-500" />
            <div className="absolute inset-2 animate-spin rounded-full border-4 border-white/10 border-t-sky-400" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          
          {/* Stage indicators */}
          <div className="flex flex-col items-center gap-2 text-sm text-white/70">
            <div className="font-semibold text-white">Loading course...</div>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {Object.entries(readinessStages).map(([stage, ready]) => (
                <span
                  key={stage}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                    ready ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40'
                  }`}
                >
                  {ready ? (
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 animate-pulse rounded-full bg-current" />
                  )}
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    
    {/* ── Main Player UI (only render when ready) ──────────────────────── */}
    {isReady && (
    <div
      ref={playerShellRef}
      className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden text-[var(--course-text)]"
      data-course-player
      data-course-theme={playerThemeCtl.theme}
      data-course-waves={gradientWavesOn ? "on" : "off"}
      data-orientation={useLandscapeRails ? "landscape" : "portrait"}
      {...(useLandscapeRails
        ? {
            "data-course-landscape-scroll": "vertical",
            "data-course-statusbar-hidden": courseFullscreen ? "true" : "false",
          }
        : {})}
      style={{ colorScheme: playerThemeCtl.theme }}
    >
      {/* ── TOP PROGRESS + SETTINGS RAIL — Part 19 ─────────────────────────
          Combined control: 2W wide (double the original progress bar width).
          LEFT 50%: Real progress indicator with Runway loader animation
          RIGHT 50%: Settings trigger button
          The progress percentage and calculation remain unchanged. The Runway
          effect is purely visual (continuous animation overlay). Settings
          trigger opens the existing Player settings surface. */}
      <div
        className="relative z-[75] flex shrink-0 items-stretch border-b border-white/10 bg-[#0a0c12]/85 pt-[max(env(safe-area-inset-top),3px)]"
        data-course-progress-summary
        data-course-top-progress
        data-progress-value={progress}
      >
        {/* LEFT HALF: Progress Bar with Runway Animation */}
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
          className="relative flex w-1/2 cursor-pointer items-center gap-2 px-3 pb-[3px] outline-none disabled:cursor-default"
          data-course-progress-bar
          data-progress-value={progress}
        >
          {/* Progress track and fill */}
          <div className="relative h-3 min-w-0 flex-1">
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10" />
            <span
              aria-hidden
              data-course-progress-fill
              className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #38bdf8, #a78bfa)",
                boxShadow: "0 0 10px rgba(139, 92, 246, 0.45)",
              }}
            />
            {/* Runway loader animation overlay - continuous shimmer effect */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full opacity-60"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                backgroundSize: "200% 100%",
                animation: "runwayShimmer 2s linear infinite",
              }}
            />
          </div>
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
        </button>

        {/* DIVIDER between progress and settings */}
        <div
          aria-hidden
          className="w-px self-stretch bg-white/20"
          data-course-progress-divider
        />

        {/* RIGHT HALF: Settings Trigger */}
        <button
          type="button"
          onClick={() => {
            // Switch to player tab to open settings
            handleDockTabChange("player");
          }}
          aria-label="Open Player settings"
          title="Player settings"
          className="flex w-1/2 cursor-pointer items-center justify-center gap-2 px-3 pb-[3px] outline-none transition-colors hover:bg-white/5"
          data-course-settings-trigger
        >
          <Settings className="h-3.5 w-3.5 text-white/70" />
          <span className="text-[9px] font-black uppercase tracking-wide text-white/60">
            Settings
          </span>
        </button>
      </div>
      
      {/* Runway animation keyframes */}
      <style>{`
        @keyframes runwayShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      {/* The stage: portrait = lesson above the study pane (column), landscape
          = lesson left of the study pane (row) — the split always activates
          from the RIGHT in landscape, never from the bottom. */}
      <div className={`relative flex min-h-0 min-w-0 flex-1 ${useLandscapeRails ? "flex-row" : "flex-col"}`} data-course-stage>
      {/* ── Animated background — React Bits Gradient Waves ───────────────
          The landing page's own component, behind the content area only (the
          stage — never the top rail). Click-through, z-index -1 inside the
          fixed shell, so panes, dock, overlays and dialogs all stay above it.
          Mounted only while "Modern module listing" is ON; OFF unmounts it
          (GPU context released) and the legacy backdrop shows again. */}
      {gradientWavesOn ? <CourseGradientWavesBackground /> : null}
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
          keyboardExpandEnabled={dockTab === "notes" || dockTab === "mindmap" || dockTab === "ai" || dockTab === "sketch"}
          solid={dockTab === "notes" || dockTab === "mindmap" || dockTab === "brain" || dockTab === "ai" || dockTab === "player" || dockTab === "sketch"}
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
    </div>
    )}
    {addOfficialOpen ? (
      <Suspense fallback={null}>
        <AddOfficialResourceDialog
          open
          onClose={closeAddOfficialDialog}
          courses={myLibrary.courses}
          coursesState={myLibrary.state === "error" ? "ready" : myLibrary.state}
          resource={officialDialogTarget}
          onSave={addOfficialToLibrary}
        />
      </Suspense>
    ) : null}
    </>
    </CourseKeyboardProvider>
  );
}
