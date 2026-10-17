// src/course/CourseResourceLibrary.tsx
//
// The Course Player's Modules tab: the official course hierarchy
// (module → submodule → resource) rendered as a Branched Menu.
//
// Each module is a section that folds open; its notes, mind maps, lessons and
// practice sets are the branch rows beneath it, and nested submodules branch
// further. Master (admin-published) and self-created resources carry a small
// MASTER / SELF tag; locked content stays visible but cannot be opened.
//
// The library is purely navigational: opening a row delegates to the existing
// viewer / editor handlers the Course Player already owns. All modules remain
// visible.
//
// ── The owner's brief (2026-10-16) ──────────────────────────────────────────
// The page is PURE white, header included, and the name + icon + resource count
// moved OFF the header and onto the page itself, just under it — where the page
// scrolls exactly as it always did. The header's area now holds one circular
// search box carrying the long sentence, sliding left and right inside it.
// A click on that box opens a NESTED search page (still inside this panel):
// the box ready to write in, the back arrow beside it on the left, and a format
// button on its right that shows no options at all — it converts itself, and
// the listing follows. Enter sits inside the box on the right (the keyboard's
// own Enter runs the same search), the loading state is the shared flash scan
// with a full one-second floor, and previous searches come back in YouTube's
// own search-page design.
//
// ONE query, TWO answers: the library's own rows (the pure matcher in
// ./resourceSearch) and YouTube (the same key-gated, never-scraping search the
// Music pane owns). The shared experience itself — the sliding sentence, the
// flash scan, the history — lives in ./searchExperience, so the Music library
// wears exactly the same behaviour on its own page.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  CornerDownLeft,
  Eye,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FormInput,
  Library,
  LayoutGrid,
  Link2,
  LockKeyhole,
  Network,
  NotebookPen,
  PlayCircle,
  Rows3,
  Search,
  X,
} from "lucide-react";
import type { CourseFile, CourseModule, MasterCourseNote } from "../types/course";
import { isExperimentFileType, NOTE_RESOURCE_FILE_TYPE, READ_RESOURCE_FILE_TYPE } from "../types/course";
import BranchedMenu, { BranchedMenuSkeleton, useBranchedOpen, type BranchedMenuItem } from "../components/branched-menu/BranchedMenu";
import { ancestorSectionValues, buildBranchTree, type BranchEntry, type BranchSegment } from "../components/branched-menu/branchedTree";
import { StudyLibraryEmptyState, StudyLibraryNotice } from "./StudyLibraryStates";
import CoursePageHeader from "./CoursePageHeader";
import "./courseResourceLibrary.css";
import { isVisibleFile } from "./fileVisibility";
import { matchResources } from "./resourceSearch";
import {
  SearchFlashScan, SearchHistoryList, SlidingSearchText, STUDY_SEARCH_SENTENCE,
  useScrollAwayHidden, useStudySearch,
} from "./searchExperience";
import { setSearchScrolledAway, setSearchSurface } from "./coursePanelSession";
import {
  searchYouTubeOutcome, subscribeYouTubeKey, youTubeSearchAvailable, youTubeSearchUrl,
  type YouTubeKeyErrorCode,
} from "./musicSearch";
import {
  GOOGLE_PAGE_SIZE, googleSearchAvailable, googleSearchUrl, searchGoogleOutcome, subscribeGoogleSearchConfig,
  type GoogleSearchOutcome,
  type GoogleSearchType,
} from "./googleSearch";
import GoogleGlyph from "./GoogleGlyph";
import { GoogleImageResult, GoogleWebCard, GoogleWebResult } from "./GoogleResults";
import type { MusicTrack } from "./musicLibrary";
import { TrackArtwork } from "./MusicTrackList";

// ── Types ───────────────────────────────────────────────────────────────

export interface CourseResourceLibraryProps {
  modules: CourseModule[];
  courseTitle: string;
  selectedFileId?: string;
  completedFileIds: Set<string>;
  accessibleModuleIds: Set<string>;
  ownedUpdateIds: Set<string>;
  previewModuleIds: Set<string>;
  accessibleResourceIds: Set<string>;
  /** Admin-authored notes projected from the course tree. */
  masterNotes: MasterCourseNote[];
  /** The signed-in learner — their own YouTube key is stored per account. */
  uid?: string | null;
  /** Open a playable lesson file (video, doc, youtube, etc.) in the viewer. */
  onSelectFile: (file: CourseFile) => void;
  /** Open a master note in the read-only viewer. */
  onOpenMasterNote: (note: MasterCourseNote) => void;
  /** Open a mind map resource: the player focuses the owning module's map library. */
  onOpenMindMapResource: (file: CourseFile, modulePath: string[]) => void;
  /**
   * Play a YouTube search result in the MAIN content block — the same place
   * the course's own YouTube embeds play — instead of leaving for YouTube
   * ("direct vahin play ho jo main area hai content ka block").
   */
  onOpenYouTube?: (track: MusicTrack) => void;
  /** The learner's own "My Modules" entry, shown as the last branch of the library. */
  personalEntry?: { subtitle: string; locked?: boolean; onOpen: () => void } | null;
  /** Library state. Defaults to "ready". */
  status?: "ready" | "loading" | "error";
  errorMessage?: string | null;
  onRetry?: () => void;
}

/** The card plate per kind: the same ink language as the music library's tiles. */
const KIND_GRADIENT: Record<LibraryResourceKind, string> = {
  note: "linear-gradient(140deg, #b45309 0%, #78350f 55%, #0b1220 100%)",
  "mind-map": "linear-gradient(140deg, #7c3aed 0%, #4c1d95 55%, #0b1220 100%)",
  brain: "linear-gradient(140deg, #047857 0%, #065f46 55%, #0b1220 100%)",
  experiment: "linear-gradient(140deg, #be185d 0%, #831843 55%, #0b1220 100%)",
  lesson: "linear-gradient(140deg, #0369a1 0%, #0c4a6e 55%, #0b1220 100%)",
  read: "linear-gradient(140deg, #0369a1 0%, #0c4a6e 55%, #0b1220 100%)",
};

const resourceGlyph = (resource: LibraryResource) =>
  resource.file ? fileIconForType(resource.file.type) : resource.kind === "note" ? NotebookPen : File;

/** The row's second line: kind, then the presenter's own words, then the path. */
const resourceLine = (resource: LibraryResource): string =>
  [resourceKindLabel(resource.kind), resource.subtitle, resource.modulePath.join(" / ")]
    .filter(Boolean)
    .join(" · ");

/**
 * ONE library hit, in the LIST format — a row: a tinted plate, the title on one
 * line, the kind/subtitle/path beneath it, and the row's own marks (a source
 * tag, completion, a lock). Tapping it opens the resource itself.
 */
function LibraryHitRow({ resource, onOpen }: { resource: LibraryResource; onOpen: (resource: LibraryResource) => void }) {
  const Icon = resourceGlyph(resource);
  return (
    <button
      type="button"
      onClick={() => onOpen(resource)}
      data-library-search-hit
      data-library-hit-id={resource.id}
      data-library-hit-kind={resource.kind}
      data-library-hit-format="list"
      disabled={resource.locked}
      className="library-hit"
    >
      <span className="library-hit__plate" style={{ color: KIND_COLOR[resource.kind] }} aria-hidden="true">
        <Icon size={17} strokeWidth={2.1} />
      </span>
      <span className="library-hit__text">
        <span className="library-hit__title">{resource.title}</span>
        <span className="library-hit__sub">{resourceLine(resource)}</span>
      </span>
      {resource.source ? <span className="library-hit__tag" data-library-hit-source={resource.source}>{resource.source}</span> : null}
      {resource.completed ? <Check size={13} aria-label="Completed" className="course-library__done" /> : null}
      {resource.locked ? <LockKeyhole size={13} aria-label="Locked" className="course-library__lock" /> : null}
    </button>
  );
}

/** The same hit in the GRID format — the music library's thumbnail card. */
function LibraryHitCard({ resource, onOpen }: { resource: LibraryResource; onOpen: (resource: LibraryResource) => void }) {
  const Icon = resourceGlyph(resource);
  return (
    <button
      type="button"
      onClick={() => onOpen(resource)}
      data-library-search-hit
      data-library-hit-id={resource.id}
      data-library-hit-kind={resource.kind}
      data-library-hit-format="grid"
      disabled={resource.locked}
      className="library-hitcard"
    >
      <span className="library-hitcard__plate" style={{ background: KIND_GRADIENT[resource.kind] }} aria-hidden="true">
        <Icon size={30} strokeWidth={2} />
        <span className="library-hitcard__kind">{resourceKindLabel(resource.kind)}</span>
        {resource.source ? <span className="library-hitcard__tag">{resource.source}</span> : null}
      </span>
      <span className="library-hitcard__title">{resource.title}</span>
      <span className="library-hitcard__sub">{resourceLine(resource)}</span>
      {resource.locked ? <span className="library-hitcard__lock"><LockKeyhole size={13} aria-label="Locked" /></span> : null}
    </button>
  );
}

/**
 * A YouTube result: the same two formats, and the same artwork rules the Music
 * pane uses (edge-to-edge picture, or a proper audio tile when there is none).
 *
 * With `onOpen` it PLAYS RIGHT HERE — in the main content block, where every
 * other YouTube embed of the course plays (the owner: "turant YouTube open ho
 * jata hai click karte hi … aisa nahin hona chahie, direct vahin play ho jo
 * main area hai content ka block"). Only without a handler does it fall back
 * to the official YouTube page.
 */
function YouTubeHit({
  track,
  format,
  onOpen,
}: {
  track: MusicTrack;
  format: LibrarySearchFormat;
  onOpen?: ((track: MusicTrack) => void) | undefined;
}) {
  if (format === "grid") {
    const face = (
      <>
        <TrackArtwork track={track} variant="card" />
        <span className="library-hitcard__title">{track.title}</span>
        <span className="library-hitcard__sub">{track.subtitle || "YouTube"}</span>
      </>
    );
    if (onOpen) {
      return (
        <button
          type="button"
          onClick={() => onOpen(track)}
          data-library-search-youtube-hit
          data-library-hit-id={track.url}
          data-library-hit-format="grid"
          className="library-hitcard library-hitcard--video"
        >
          {face}
        </button>
      );
    }
    return (
      <a
        href={track.url}
        target="_blank"
        rel="noopener noreferrer"
        data-library-search-youtube-hit
        data-library-hit-id={track.url}
        data-library-hit-format="grid"
        className="library-hitcard library-hitcard--video"
      >
        {face}
      </a>
    );
  }
  const row = (
    <>
      <TrackArtwork track={track} variant="tile" />
      <span className="library-hit__text">
        <span className="library-hit__title">{track.title}</span>
        <span className="library-hit__sub">{track.subtitle || "YouTube"}</span>
      </span>
    </>
  );
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(track)}
        data-library-search-youtube-hit
        data-library-hit-id={track.url}
        data-library-hit-format="list"
        className="library-hit"
      >
        {row}
        <PlayCircle size={14} aria-hidden="true" className="library-hit__external" />
      </button>
    );
  }
  return (
    <a
      href={track.url}
      target="_blank"
      rel="noopener noreferrer"
      data-library-search-youtube-hit
      data-library-hit-id={track.url}
      data-library-hit-format="list"
      className="library-hit"
    >
      {row}
      <ExternalLink size={14} aria-hidden="true" className="library-hit__external" />
    </a>
  );
}

export type LibraryResourceKind = "lesson" | "note" | "mind-map" | "brain" | "experiment" | "read";

interface LibraryResource {
  id: string;
  kind: LibraryResourceKind;
  file?: CourseFile;
  masterNote?: MasterCourseNote;
  title: string;
  subtitle: string;
  source: "MASTER" | "SELF" | null;
  metadata: string[];
  locked: boolean;
  completed: boolean;
  selected: boolean;
  modulePath: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

const KIND_COLOR: Record<LibraryResourceKind, string> = {
  note: "#f59e0b",
  "mind-map": "#a78bfa",
  brain: "#34d399",
  experiment: "#f472b6",
  lesson: "#38bdf8",
  read: "#38bdf8",
};

const SOURCE_COLOR = { MASTER: "#93c5fd", SELF: "#c4b5fd" } as const;

const fileIconForType = (type: string) => {
  switch (type) {
    case "brain": return Brain;
    case "interactive": return FlaskConical;
    case "youtube": case "video": case "audio": return PlayCircle;
    case "pdf": case "ebook": return FileText;
    case "sheet": return FileSpreadsheet;
    case "google_form": return FormInput;
    case "embed": case "mindmap": return Link2;
    case "note": return NotebookPen;
    case "mind_map": return Network;
    case "read": return FileText;
    default: return File;
  }
};

const resourceKindLabel = (kind: LibraryResourceKind): string => {
  switch (kind) {
    case "note": return "Note";
    case "mind-map": return "Mind map";
    case "brain": return "Practice";
    case "experiment": return "Experiment";
    case "read": return "Read";
    default: return "Lesson";
  }
};

const isPaidLockedModule = (module: CourseModule, ownedUpdateIds: Set<string>) =>
  module.accessLevel === "paidUpdate" && Boolean(module.paidUpdateId) && !ownedUpdateIds.has(String(module.paidUpdateId));

const isFilePaidLocked = (file: CourseFile, ownedUpdateIds: Set<string>) =>
  file.accessLevel === "paidUpdate" && Boolean(file.paidUpdateId) && !ownedUpdateIds.has(String(file.paidUpdateId));

const moduleFiles = (module: CourseModule): CourseFile[] => {
  const embedded = module.embedContentUrl ? [{
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
  } as CourseFile] : [];
  return [...embedded, ...(module.files || [])];
};

const wordsIn = (html: string) => {
  const plain = html.replace(/<[^>]+>/g, "").trim();
  return plain ? plain.split(/\s+/).filter(Boolean).length : 0;
};

/**
 * Walk the course tree once and produce flat branch entries (one per resource)
 * plus the path of every module, so modules without resources still appear.
 * Lightweight: metadata only — never note bodies or mind map data.
 */
function buildLibraryEntries(
  modules: CourseModule[],
  options: {
    completedFileIds: Set<string>;
    accessibleModuleIds: Set<string>;
    ownedUpdateIds: Set<string>;
    previewModuleIds: Set<string>;
    masterNotes: MasterCourseNote[];
    selectedFileId?: string;
  },
) {
  const { completedFileIds, accessibleModuleIds, ownedUpdateIds, previewModuleIds, masterNotes, selectedFileId } = options;
  const entries: Array<{ path: BranchSegment[]; resource: LibraryResource }> = [];
  const modulePaths: BranchSegment[][] = [];
  const moduleMeta = new Map<string, { locked: boolean; preview: boolean }>();

  const masterNotesByModule = new Map<string, MasterCourseNote[]>();
  for (const note of masterNotes) {
    const list = masterNotesByModule.get(note.moduleId) || [];
    list.push(note);
    masterNotesByModule.set(note.moduleId, list);
  }

  const visit = (nodes: CourseModule[], ancestors: BranchSegment[], ancestorLocked: boolean) => {
    for (const module of nodes) {
      if (module.accessLevel === "hidden") continue;

      const moduleId = String(module.id);
      const title = String(module.title || "Module");
      const path = [...ancestors, { key: moduleId, label: title }];
      const locked = ancestorLocked || !accessibleModuleIds.has(moduleId) || isPaidLockedModule(module, ownedUpdateIds);
      modulePaths.push(path);
      moduleMeta.set(moduleId, { locked, preview: previewModuleIds.has(moduleId) });

      const modulePath = path.map((segment) => segment.label);
      for (const file of moduleFiles(module)) {
        if (file.accessLevel === "hidden") continue;
        if (file.type === READ_RESOURCE_FILE_TYPE) continue; // Read library has its own tab

        const fileId = String(file.id);
        const fileLocked = locked || isFilePaidLocked(file, ownedUpdateIds);
        let kind: LibraryResourceKind;
        let subtitle: string;
        let metadata: string[] = [];

        if (file.type === NOTE_RESOURCE_FILE_TYPE) {
          kind = "note";
          const words = wordsIn(String(file.noteHtml || ""));
          subtitle = "Course note";
          metadata = words ? [`${words} words`] : [];
        } else if (file.type === "mind_map") {
          kind = "mind-map";
          subtitle = file.mindMapSourceMode === "code_import" ? "Imported mind map" : "Mind map";
          if (file.mindMapRootTopic) metadata = [String(file.mindMapRootTopic)];
        } else if (file.type === "brain") {
          kind = "brain";
          const qCount = file.practiceQuestions?.length ?? 0;
          subtitle = `${qCount} practice ${qCount === 1 ? "question" : "questions"}`;
          metadata = qCount ? [`${qCount} questions`] : [];
        } else if (isExperimentFileType(file.type)) {
          kind = "experiment";
          subtitle = "Interactive experiment";
        } else {
          // Lessons follow the shared visibility rule (a URL, or a Brain set /
          // experiment with content) — a URL-less lesson never shows up empty.
          if (!isVisibleFile(file)) continue;
          kind = "lesson";
          subtitle = file.type === "youtube" ? "YouTube" :
                     file.type === "video" ? "Video" :
                     file.type === "audio" ? "Audio" :
                     file.type === "pdf" ? "PDF" :
                     file.type === "doc" ? "Document" :
                     file.type === "sheet" ? "Spreadsheet" :
                     file.type === "slides" ? "Slides" :
                     file.type === "image" ? "Image" :
                     file.type === "mindmap" ? "Mind map (embed)" :
                     file.type === "google_form" ? "Form" :
                     file.type === "embed" ? "Web resource" :
                     file.type === "ebook" ? "eBook" :
                     file.type;
        }

        // MASTER = admin-published notes; SELF = learner-authored personal content.
        const source: LibraryResource["source"] = file.type === NOTE_RESOURCE_FILE_TYPE
          ? "MASTER"
          : file.source === "personal" ? "SELF" : null;

        entries.push({
          path,
          resource: {
            id: `file:${fileId}`,
            kind,
            file,
            title: String(file.name || "Untitled"),
            subtitle,
            source,
            metadata,
            locked: fileLocked,
            completed: completedFileIds.has(fileId),
            selected: selectedFileId === fileId,
            modulePath,
          },
        });
      }

      // Master notes that belong to this module but have no matching `note`
      // file in the tree (the projection handles access separately).
      const existing = new Set(
        moduleFiles(module).filter((file) => file.type === NOTE_RESOURCE_FILE_TYPE).map((file) => String(file.id)),
      );
      for (const note of masterNotesByModule.get(moduleId) || []) {
        if (existing.has(note.resourceId)) continue;
        const words = wordsIn(note.bodyHtml || "");
        entries.push({
          path,
          resource: {
            id: `master-note:${note.id}`,
            kind: "note",
            masterNote: note,
            title: note.title || "Untitled master note",
            subtitle: "Admin-authored course note",
            source: "MASTER",
            metadata: words ? [`${words} words`] : [],
            locked,
            completed: false,
            selected: false,
            modulePath,
          },
        });
      }

      visit(module.modules || [], path, locked);
    }
  };

  visit(modules, [], false);
  return { entries, modulePaths, moduleMeta };
}

// ── Row presentation ────────────────────────────────────────────────────

function resourceToItem(resource: LibraryResource): BranchedMenuItem {
  const Icon = resource.file ? fileIconForType(resource.file.type) : resource.kind === "note" ? NotebookPen : File;
  const kindLabel = resourceKindLabel(resource.kind);
  const meta: ReactNode = (
    <>
      {resource.metadata[0] ? <span>{resource.metadata[0]}</span> : null}
      {resource.completed ? <Check size={12} aria-label="Completed" className="course-library__done" /> : null}
      {resource.locked ? <LockKeyhole size={12} aria-label="Locked" className="course-library__lock" /> : null}
    </>
  );
  return {
    value: resource.id,
    label: resource.title,
    icon: <Icon size={16} strokeWidth={2.1} aria-hidden="true" />,
    color: KIND_COLOR[resource.kind],
    disabled: resource.locked,
    tag: resource.source ? { label: resource.source, color: SOURCE_COLOR[resource.source] } : undefined,
    meta,
    description: [kindLabel, resource.title, resource.subtitle, resource.source, resource.modulePath.join(" / ")]
      .filter(Boolean)
      .join(". ") + (resource.locked ? ". Locked" : ""),
    dataAttrs: {
      "data-library-resource": "",
      "data-resource-kind": resource.kind,
      "data-resource-id": resource.id,
      "data-selected": resource.selected ? "true" : "false",
      "data-locked": resource.locked ? "true" : "false",
      "data-completed": resource.completed ? "true" : "false",
    },
  };
}

/** What ONE library search answers with: the course's own rows, and YouTube. */
export interface LibrarySearchResults {
  local: LibraryResource[];
  online: MusicTrack[];
  /** False when the learner's YouTube key is not set up (the honest hand-off). */
  onlineReady: boolean;
  /** Why the YouTube half failed, when it failed for a reason of its own. */
  onlineError?: YouTubeKeyErrorCode | null;
  /** The sentence that explains it. */
  onlineMessage?: string;
}

/** The two listings the format button flips between — Music's own two. */
export type LibrarySearchFormat = "list" | "grid";

export default function CourseResourceLibrary({
  modules,
  courseTitle,
  selectedFileId,
  completedFileIds,
  accessibleModuleIds,
  ownedUpdateIds,
  previewModuleIds,
  accessibleResourceIds,
  masterNotes,
  uid = null,
  onSelectFile,
  onOpenMasterNote,
  onOpenMindMapResource,
  onOpenYouTube,
  personalEntry,
  status = "ready",
  errorMessage,
  onRetry,
}: CourseResourceLibraryProps) {
  void accessibleResourceIds;
  /**
   * The page's own search (owner brief, 2026-10-16). The header's rounded box
   * opens a NESTED search page inside this same panel: a back arrow, the box
   * (Enter inside it), the format button — and, until something is typed, the
   * learner's recent searches, exactly like YouTube's own search page.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchFormat, setSearchFormat] = useState<LibrarySearchFormat>("list");
  /** A late api key must not need a reload: the subscription re-renders this
   *  page, and every search then reads the key fresh. */
  const [, setYouTubeKeyTick] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => subscribeYouTubeKey(() => setYouTubeKeyTick((tick) => tick + 1)), []);
  /**
   * The GOOGLE page — the third answer the search box can give (the course,
   * YouTube, and the open web). It is its own nested page, with its own
   * history, and it lives HERE only: the Music library keeps its own
   * YouTube-shaped search.
   */
  const [googleSearchOpen, setGoogleSearchOpen] = useState(false);
  const [googleSearchText, setGoogleSearchText] = useState("");
  const googleInputRef = useRef<HTMLInputElement | null>(null);
  const [googleConfigTick, setGoogleConfigTick] = useState(0);
  /**
   * The Google page has TWO steps, exactly like the YouTube one:
   *
   *   "board"   → the ready-to-write page: the recent searches, the box empty
   *               and waiting (Google's own search-page shape);
   *   "results" → what the web answered.
   *
   * The back arrow walks them (results ⇒ board, board ⇒ the library's own
   * search page), and tapping the box on the results walks back the same way.
   */
  const [googleStage, setGoogleStage] = useState<"board" | "results">("board");
  /** Google's own two result kinds: web pages, or the Images tab. */
  const [googleType, setGoogleType] = useState<GoogleSearchType>("web");
  /** Which page of results we are on (Google shows ten a page). */
  const [googlePage, setGooglePage] = useState(1);
  /** The Images tab's own thumbnail size — Google's own small ↔ large switch. */
  const [googleImageSize, setGoogleImageSize] = useState<"compact" | "large">("compact");
  /** The run reads the page and the kind from here — a ref, so the search
   *  callback never has to be rebuilt when the page turns. */
  const googleOptionsRef = useRef<{ start: number; type: GoogleSearchType }>({ start: 1, type: "web" });
  useEffect(() => subscribeGoogleSearchConfig(() => setGoogleConfigTick((tick) => tick + 1)), []);
  /** Is the web search ready? The learner's own configuration first. */
  const googleReady = useMemo(() => googleSearchAvailable(uid), [uid, googleConfigTick]);
  const built = useMemo(
    () => buildLibraryEntries(modules, {
      completedFileIds,
      accessibleModuleIds,
      ownedUpdateIds,
      previewModuleIds,
      masterNotes,
      selectedFileId,
    }),
    [modules, completedFileIds, accessibleModuleIds, ownedUpdateIds, previewModuleIds, masterNotes, selectedFileId],
  );

  const resourceById = useMemo(() => {
    const map = new Map<string, LibraryResource>();
    for (const entry of built.entries) map.set(entry.resource.id, entry.resource);
    return map;
  }, [built.entries]);

  const totalResources = built.entries.length;
  const visibleEntries = built.entries;

  // Per-module progress over every resource beneath it (unlocked resources only).
  const progressByKey = useMemo(() => {
    const totals = new Map<string, { total: number; done: number }>();
    for (const { path, resource } of visibleEntries) {
      if (resource.locked) continue;
      for (const segment of path) {
        const row = totals.get(segment.key) || { total: 0, done: 0 };
        row.total += 1;
        if (resource.completed) row.done += 1;
        totals.set(segment.key, row);
      }
    }
    return totals;
  }, [visibleEntries]);

  const tree = useMemo<BranchedMenuItem[]>(() => {
    const entries: BranchEntry[] = visibleEntries.map(({ path, resource }) => ({ path, item: resourceToItem(resource) }));
    const ensurePaths = built.modulePaths;
    const branches = buildBranchTree(entries, {
      ensurePaths,
      sectionMeta: ({ key, count }) => {
        const meta = built.moduleMeta.get(key);
        const progress = progressByKey.get(key);
        const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
        return (
          <>
            {meta?.preview ? <Eye size={12} aria-label="Preview" className="course-library__preview" /> : null}
            {meta?.locked ? <LockKeyhole size={12} aria-label="Locked" className="course-library__lock" /> : null}
            {pct != null && !meta?.locked && count > 0 ? <span className="course-library__pct" data-progress={pct}>{pct}%</span> : null}
            {count > 0 ? <span className="course-library__count">{count}</span> : <span className="course-library__empty-tag">No resources yet</span>}
          </>
        );
      },
      sectionDataAttrs: ({ key, depth }) => ({
        "data-course-library-module": key,
        "data-module-depth": String(depth),
        "data-locked": built.moduleMeta.get(key)?.locked ? "true" : "false",
        "data-preview": built.moduleMeta.get(key)?.preview ? "true" : "false",
      }),
    });
    if (personalEntry) {
      branches.push({
        value: "personal-modules-entry",
        label: "My Modules",
        icon: <Library size={16} strokeWidth={2.1} aria-hidden="true" />,
        color: "#c4b5fd",
        meta: (
          <>
            <span className="course-library__personal-sub">{personalEntry.subtitle}</span>
            {personalEntry.locked ? <LockKeyhole size={12} aria-label="Requires an eligible plan" className="course-library__lock" /> : null}
          </>
        ),
        dataAttrs: {
          "data-course-personal-entry": "",
          "data-personal-locked": personalEntry.locked ? "true" : "false",
        },
      });
    }
    return branches;
  }, [visibleEntries, built.modulePaths, built.moduleMeta, progressByKey, personalEntry]);

  // Keep expansion choices and reveal the selected resource's ancestors.
  const { openValues, toggle: toggleSection, reveal } = useBranchedOpen(tree);
  useEffect(() => {
    if (!selectedFileId) return;
    reveal(ancestorSectionValues(tree, `file:${selectedFileId}`));
    // Only re-run when the learner switches the selected file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFileId]);

  const handleSelect = useCallback((value: string) => {
    if (value === "personal-modules-entry") {
      personalEntry?.onOpen();
      return;
    }
    const resource = resourceById.get(value);
    if (!resource || resource.locked) return;

    if (resource.kind === "note") {
      if (resource.masterNote) onOpenMasterNote(resource.masterNote);
      else if (resource.file) onSelectFile(resource.file);
    } else if (resource.kind === "mind-map" && resource.file) {
      onOpenMindMapResource(resource.file, resource.modulePath);
    } else if (resource.file) {
      onSelectFile(resource.file);
    }
  }, [resourceById, personalEntry, onOpenMasterNote, onSelectFile, onOpenMindMapResource]);

  const activeValue = selectedFileId ? `file:${selectedFileId}` : null;
  const hasAnything = built.modulePaths.length > 0 || Boolean(personalEntry);

  /**
   * ONE query, two answers: the library's own rows (the pure matcher in
   * ./resourceSearch) and YouTube (the same key-gated, never-scraping search
   * the Music pane owns). The one-second loading floor and the history are the
   * shared experience's job — see ./searchExperience.
   */
  const runLibrarySearch = useCallback(async (text: string): Promise<LibrarySearchResults> => {
    const local = matchResources(
      built.entries.map(({ resource }) => ({
        id: resource.id,
        title: resource.title,
        subtitle: resource.subtitle,
        kind: resource.kind,
        metadata: resource.metadata,
        modulePath: resource.modulePath,
        keywords: [resourceKindLabel(resource.kind), resource.source ?? ""],
      })),
      text,
    ).map((hit) => resourceById.get(hit.resource.id))
      .filter((resource): resource is LibraryResource => Boolean(resource));

    let online: MusicTrack[] = [];
    let onlineError: YouTubeKeyErrorCode | null = null;
    let onlineMessage = "";
    if (youTubeSearchAvailable(uid)) {
      const outcome = await searchYouTubeOutcome(text, undefined, uid);
      online = outcome.rows;
      onlineError = outcome.error;
      onlineMessage = outcome.message;
    }
    return { local, online, onlineReady: youTubeSearchAvailable(uid), onlineError, onlineMessage };
  }, [built.entries, resourceById, uid]);

  const search = useStudySearch<LibrarySearchResults>({
    namespace: "course-library",
    run: runLibrarySearch,
  });

  /**
   * The web search — Google's own Programmable Search API, through the very
   * same kit (the one-second flash scan, the recent-searches board). It
   * never throws: a refused configuration is an ANSWER, not a crash.
   */
  const runGoogleSearch = useCallback(
    async (text: string): Promise<GoogleSearchOutcome> =>
      searchGoogleOutcome(text, undefined, uid, {
        start: googleOptionsRef.current.start,
        type: googleOptionsRef.current.type,
      }),
    [uid],
  );
  const googleSearch = useStudySearch<GoogleSearchOutcome>({
    namespace: "course-library-google",
    run: runGoogleSearch,
  });

  /** The Google page opens with the caret in its box. */
  const openGoogleSearch = useCallback(() => {
    setGoogleSearchOpen(true);
    setGoogleStage("board");
    setGooglePage(1);
    googleOptionsRef.current = { start: 1, type: googleOptionsRef.current.type };
    window.setTimeout(() => googleInputRef.current?.focus(), 30);
  }, []);

  const closeGoogleSearch = useCallback(() => {
    setGoogleSearchOpen(false);
  }, []);

  /**
   * The Google page's back button, in TWO steps: the results go back to the
   * board, and the board goes back to the library's own search page.
   */
  const stepBackFromGoogle = useCallback(() => {
    if (googleStage === "results") {
      setGoogleStage("board");
      return;
    }
    closeGoogleSearch();
  }, [googleStage, closeGoogleSearch]);

  /** Run a query from the box — always from the FIRST page of results. */
  const runGoogleQuery = useCallback((text: string) => {
    setGooglePage(1);
    googleOptionsRef.current = { start: 1, type: googleOptionsRef.current.type };
    setGoogleStage("results");
    void googleSearch.search(text);
  }, [googleSearch]);

  /** Turn to another page of results — Google's own ten-a-page index. */
  const turnGooglePage = useCallback((page: number) => {
    const next = Math.max(1, page);
    setGooglePage(next);
    googleOptionsRef.current = { ...googleOptionsRef.current, start: (next - 1) * GOOGLE_PAGE_SIZE + 1 };
    setGoogleStage("results");
    void googleSearch.search(googleSearch.query);
  }, [googleSearch]);

  /** Google's own two kinds of results: the web, or the pictures. */
  const switchGoogleType = useCallback((type: GoogleSearchType) => {
    setGoogleType(type);
    setGooglePage(1);
    googleOptionsRef.current = { ...googleOptionsRef.current, type, start: 1 };
    setGoogleStage("results");
    void googleSearch.search(googleSearch.query);
  }, [googleSearch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // "ready to write": the box is the reason this page opened, so it takes the
    // caret — after the frame that mounts it.
    window.setTimeout(() => searchInputRef.current?.focus(), 30);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  /** The self-convertible format button: ONE icon, the other listing's own. */
  const flipSearchFormat = useCallback(
    () => setSearchFormat((current) => (current === "list" ? "grid" : "list")),
    [],
  );

  /**
   * Opening a hit NEVER closes the results page any more (the owner:
   * "search result open hone ke baad close nahin hona chahie jab tak user
   * khud se na kar de") — the resource opens in the player while the results
   * stay exactly where they are, until the back arrow is pressed.
   */
  const openSearchHit = useCallback((resource: LibraryResource) => {
    handleSelect(resource.id);
  }, [handleSelect]);

  /** A YouTube hit plays in the MAIN content block — and the results stay. */
  const openYouTubeHit = useCallback((track: MusicTrack) => {
    onOpenYouTube?.(track);
  }, [onOpenYouTube]);

  const searchResults = search.phase === "results" ? search.results : null;
  const libraryHits = searchResults?.local ?? [];
  const onlineHits = searchResults?.online ?? [];
  /** The Google page's own answer — the rows, and WHY it failed if it did. */
  const googleOutcome = googleSearch.results ?? null;
  const googleResults = googleOutcome?.rows ?? [];

  /**
   * The footer rule for this page (owner, 2026-10-16):
   *
   *   · the LIBRARY page keeps the footer navigation;
   *   · the SEARCH page — the ready-to-write box, the recent searches and the
   *     flash scan — does NOT ("search page par footer nahin");
   *   · a RESULTS page shows it, and the scroll half below steps it away only
   *     while the learner is scrolling down through the results.
   */
  // The Google page is a page of its own, and it follows the same footer
  // rule: the ready-to-write step takes the footer away, the results give it
  // back.
  const searchSurfaceView = googleSearchOpen
    ? (googleStage === "results" ? "results" : "page")
    : !searchOpen
      ? "closed"
      : search.phase === "results"
        ? "results"
        : "page";
  useEffect(() => {
    setSearchSurface("library", searchSurfaceView);
  }, [searchSurfaceView]);
  // Leaving the tab (unmount) can never strand a hidden footer behind it.
  useEffect(() => () => setSearchSurface("library", "closed"), []);

  /**
   * "Scroll down kare to hide ho jaye, wapas top par aate hi dikh jaye." The
   * results live in `.library-body` (the page's own scroll host), so the
   * shared rule reads that element and nothing else.
   */
  const { scrollerRef: searchScrollerRef, hidden: searchScrolledAway } =
    useScrollAwayHidden(searchSurfaceView === "results");
  useEffect(() => {
    setSearchScrolledAway("library", searchScrolledAway);
  }, [searchScrolledAway]);

  return (
    <div
      className="course-resource-library"
      data-course-resource-library
      data-library-search-open={searchOpen ? "true" : "false"}
      data-library-search-format={searchFormat}
    >
      {/* ── The top strip ────────────────────────────────────────────────────
          The page's name, icon and count moved OFF the header and onto the
          page itself (owner brief, 2026-10-16) — the header's area is now the
          search box: fully rounded, with the long sentence sliding inside it.
          On the search page this same strip becomes the box itself, with the
          back arrow beside it and the format button on its other side. */}
      {googleSearchOpen ? (
        /* ── The GOOGLE page's own strip: back · the box · the format ───── */
        <CoursePageHeader
          className="library-header library-header--search"
          dataAttrs={{
            "data-library-header": "",
            "data-library-search-header": "",
            "data-library-google-header": "",
          }}
          leading={
            <div className="library-searchbar" data-library-searchbar data-library-google-bar>
              <button
                type="button"
                onClick={stepBackFromGoogle}
                data-library-google-back
                data-library-google-back-step={googleStage === "results" ? "results" : "board"}
                aria-label={googleStage === "results" ? "Back to the Google search page" : "Back to the course library search"}
                title={googleStage === "results" ? "Back to the Google search page" : "Back to the course library search"}
                className="library-searchbar__back"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <form
                className="library-searchbar__box"
                data-library-google-form
                onSubmit={(event) => {
                  event.preventDefault();
                  // The box gives the caret up the moment the search runs, so
                  // the results get the screen — and a later tap on the box
                  // walks back to the search page.
                  googleInputRef.current?.blur();
                  runGoogleQuery(googleSearchText);
                }}
              >
                <GoogleGlyph size={16} className="library-searchbar__glyph" aria-hidden="true" />
                <input
                  ref={googleInputRef}
                  value={googleSearchText}
                  onChange={(event) => setGoogleSearchText(event.target.value)}
                  onFocus={() => {
                    // Tapping the box ON the results is the learner asking to
                    // search again — it walks back to the search page, exactly
                    // like the back arrow's first step.
                    if (googleStage === "results") setGoogleStage("board");
                  }}
                  data-library-google-input
                  aria-label="Search Google"
                  className="library-searchbar__input"
                />
                {googleSearchText ? (
                  <button
                    type="button"
                    onClick={() => setGoogleSearchText("")}
                    data-library-google-clear
                    aria-label="Clear the search box"
                    className="library-searchbar__clear"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  data-library-google-enter
                  disabled={!googleSearchText.trim()}
                  aria-label="Search Google"
                  title="Search Google"
                  className="library-searchbar__enter"
                >
                  <CornerDownLeft size={15} aria-hidden="true" />
                </button>
              </form>
              <button
                type="button"
                onClick={() => {
                  // On the web tab the button converts the listing; on the
                  // Images tab it is Google's own thumbnail-size switch.
                  if (googleType === "image") {
                    setGoogleImageSize((current) => (current === "compact" ? "large" : "compact"));
                    return;
                  }
                  flipSearchFormat();
                }}
                data-library-search-format-toggle
                data-library-google-format
                data-library-search-format-next={
                  googleType === "image"
                    ? (googleImageSize === "compact" ? "large" : "compact")
                    : (searchFormat === "list" ? "grid" : "list")
                }
                aria-label={
                  googleType === "image"
                    ? (googleImageSize === "compact" ? "Show bigger pictures" : "Show smaller pictures")
                    : (searchFormat === "list" ? "Show results as thumbnails" : "Show results as a list")
                }
                title={
                  googleType === "image"
                    ? (googleImageSize === "compact" ? "Large pictures" : "Small pictures")
                    : (searchFormat === "list" ? "Thumbnail view" : "List view")
                }
                aria-pressed={googleType === "image" ? googleImageSize === "large" : searchFormat === "grid"}
                className="library-searchbar__format"
              >
                {googleType === "image"
                  ? (googleImageSize === "compact" ? <LayoutGrid size={16} aria-hidden="true" /> : <Rows3 size={16} aria-hidden="true" />)
                  : (searchFormat === "list" ? <LayoutGrid size={16} aria-hidden="true" /> : <Rows3 size={16} aria-hidden="true" />)}
              </button>
            </div>
          }
        />
      ) : null}

      {searchOpen && !googleSearchOpen ? (
        <CoursePageHeader
          className="library-header library-header--search"
          dataAttrs={{ "data-library-header": "", "data-library-search-header": "" }}
          leading={
            <div className="library-searchbar" data-library-searchbar>
              <button
                type="button"
                onClick={closeSearch}
                data-library-search-back
                aria-label="Back to the Resource Library"
                title="Back to the Resource Library"
                className="library-searchbar__back"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <form
                className="library-searchbar__box"
                data-library-search-form
                onSubmit={(event) => {
                  event.preventDefault();
                  // "Jaise hi Enter karein keyboard close ho jaaye" — the box
                  // yields the caret the moment the search runs (the page
                  // itself opened WITH the keyboard via openSearch's focus).
                  searchInputRef.current?.blur();
                  void search.search(searchText);
                }}
              >
                <Search size={16} className="library-searchbar__glyph" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  data-library-search-input
                  aria-label="Search the course library, YouTube lectures and songs"
                  className="library-searchbar__input"
                />
                {searchText ? (
                  <button
                    type="button"
                    onClick={() => setSearchText("")}
                    data-library-search-clear
                    aria-label="Clear the search box"
                    className="library-searchbar__clear"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
                {/* The GOOGLE mark, INSIDE the box on its right: one tap opens
                    the web search (the third answer this box gives — the
                    course, YouTube, and the open web). */}
                <button
                  type="button"
                  onClick={openGoogleSearch}
                  data-library-google-toggle
                  aria-label="Google par search karo"
                  title="Google par search karo"
                  className="library-searchbar__google"
                >
                  <GoogleGlyph size={15} />
                </button>
                {/* The Enter button lives INSIDE the box, on its right — and the
                    keyboard's own Enter runs the same search (the form above). */}
                <button
                  type="submit"
                  data-library-search-enter
                  disabled={!searchText.trim()}
                  aria-label="Search"
                  title="Search"
                  className="library-searchbar__enter"
                >
                  <CornerDownLeft size={15} aria-hidden="true" />
                </button>
              </form>
              {/* Self-convertible: ONE button, and the icon is the format it
                  switches TO — no menu, no second option on screen. */}
              <button
                type="button"
                onClick={flipSearchFormat}
                data-library-search-format-toggle
                data-library-search-format-next={searchFormat === "list" ? "grid" : "list"}
                aria-label={searchFormat === "list" ? "Show results as thumbnails" : "Show results as a list"}
                title={searchFormat === "list" ? "Thumbnail view" : "List view"}
                aria-pressed={searchFormat === "grid"}
                className="library-searchbar__format"
              >
                {searchFormat === "list" ? <LayoutGrid size={16} aria-hidden="true" /> : <Rows3 size={16} aria-hidden="true" />}
              </button>
            </div>
          }
        />
      ) : (
        <CoursePageHeader
          className="library-header"
          dataAttrs={{ "data-library-header": "" }}
          leading={
            <button
              type="button"
              onClick={openSearch}
              data-library-search-open-button
              className="library-searchbox"
              aria-label="Search the course library, YouTube lectures and songs"
            >
              <Search size={16} className="library-searchbox__glyph" aria-hidden="true" />
              <SlidingSearchText text={STUDY_SEARCH_SENTENCE} className="library-searchbox__slide" />
            </button>
          }
        />
      )}

      <div className="library-body" data-library-body ref={searchScrollerRef}>
        {googleSearchOpen ? (
          /* ── The GOOGLE page: the same shape as the search page ─────────
             the recent-searches board first, then the results — and the
             results look like GOOGLE's own: the tabs, the count and the time
             it took, the blue titles, the bold words, the pictures, and the
             pager for the next page. */
          <div className="library-search-page" data-library-google-page-body>
            {googleStage === "results" ? (
              googleSearch.phase === "loading" ? (
                <SearchFlashScan rows={5} label="Google par search ho raha hai" />
              ) : (
                <>
                  {/* Google's own two kinds of results, and its own count. */}
                  <div className="gpage__tabs" role="tablist" aria-label="Google results" data-library-google-tabs>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={googleType === "web"}
                      onClick={() => switchGoogleType("web")}
                      data-library-google-tab="web"
                      className="gpage__tab"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={googleType === "image"}
                      onClick={() => switchGoogleType("image")}
                      data-library-google-tab="image"
                      className="gpage__tab"
                    >
                      Images
                    </button>
                    <span className="gpage__count" data-library-google-count>
                      {googleOutcome?.totalResults
                        ? `About ${googleOutcome.totalResults} results`
                        : `${googleResults.length} results`}
                      {googleOutcome?.totalTime ? ` (${googleOutcome.totalTime} seconds)` : ""}
                    </span>
                  </div>

                  {googleResults.length ? (
                    googleType === "image" ? (
                      <div
                        className="gpage__grid"
                        data-library-search-listing="grid"
                        data-library-google-size={googleImageSize}
                      >
                        {googleResults.map((result) => (
                          <GoogleImageResult key={result.url} result={result} />
                        ))}
                      </div>
                    ) : searchFormat === "grid" ? (
                      <div className="library-search-grid" data-library-search-listing="grid">
                        {googleResults.map((result) => (
                          <GoogleWebCard key={result.url} result={result} />
                        ))}
                      </div>
                    ) : (
                      <div className="library-search-list" data-library-search-listing="list">
                        {googleResults.map((result) => (
                          <GoogleWebResult key={result.url} result={result} />
                        ))}
                      </div>
                    )
                  ) : (
                    <p className="library-search-empty" data-library-google-no-hits>
                      {googleOutcome?.error
                        ? `${googleOutcome.message} Settings → Google search me apni configuration badal do.`
                        : `Google par kuch nahin mila “${googleSearch.query}” ke liye.`}{" "}
                      <a
                        href={googleSearchUrl(googleSearch.query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-library-google-external
                        className="library-search-empty__link"
                      >
                        Google par khud search karo <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </p>
                  )}

                  {/* Google's own pager — the API serves ten a page, and at
                      most a hundred results for one query. */}
                  {googleType === "web" && (googleOutcome?.hasNext || googleOutcome?.hasPrevious || googlePage > 1) ? (
                    <div className="gpage__pager" data-library-google-pager>
                      <button
                        type="button"
                        onClick={() => turnGooglePage(Math.max(1, googlePage - 1))}
                        disabled={!googleOutcome?.hasPrevious}
                        data-library-google-prev
                        className="gpage__page"
                      >
                        ‹ Previous
                      </button>
                      <span className="gpage__note" data-library-google-page>
                        Page {googleOutcome?.page ?? googlePage}
                      </span>
                      <button
                        type="button"
                        onClick={() => turnGooglePage(googlePage + 1)}
                        disabled={!googleOutcome?.hasNext}
                        data-library-google-next
                        className="gpage__page"
                      >
                        Next ›
                      </button>
                    </div>
                  ) : null}
                </>
              )
            ) : (
              <>
                <SearchHistoryList
                  entries={googleSearch.history}
                  onPick={(entry) => { setGoogleSearchText(entry); runGoogleQuery(entry); }}
                  onRemove={googleSearch.forget}
                  onClear={googleSearch.clearHistory}
                />
                {googleSearch.history.length ? null : (
                  <p className="library-search-hint" data-library-google-hint>
                    {googleReady
                      ? "Poore web ko search karo — type karo aur Enter dabao."
                      : "Google search ki configuration set nahin hai — Settings → Google search me apni API key aur Search Engine ID jodo, ya Google par khud search karo."}
                  </p>
                )}
              </>
            )}
          </div>
        ) : searchOpen ? (
          /* ── The nested search page ───────────────────────────────────── */
          <div className="library-search-page" data-library-search-page-body>
            {search.phase === "loading" ? (
              <SearchFlashScan rows={5} label="Searching the course library and YouTube" />
            ) : search.phase === "results" ? (
              <>
                {/* The library's own half shows ONLY when it has something to
                    say. A zero-count "In this library / Nothing matches yet"
                    block is noise the owner removed (2026-10-16+): the related
                    YouTube results below already answer the query, and the
                    learner can simply search again. */}
                {libraryHits.length ? (
                  <section className="library-search-section" data-library-search-section="library" data-library-search-count={libraryHits.length}>
                    <p className="library-search-section__head">
                      In this library
                      <span className="library-search-section__count">{libraryHits.length}</span>
                      {search.query ? <span className="library-search-section__query">“{search.query}”</span> : null}
                    </p>
                    {searchFormat === "grid" ? (
                      <div className="library-search-grid" data-library-search-listing="grid">
                        {libraryHits.map((resource) => (
                          <LibraryHitCard key={resource.id} resource={resource} onOpen={openSearchHit} />
                        ))}
                      </div>
                    ) : (
                      <div className="library-search-list" data-library-search-listing="list">
                        {libraryHits.map((resource) => (
                          <LibraryHitRow key={resource.id} resource={resource} onOpen={openSearchHit} />
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                <section className="library-search-section" data-library-search-section="youtube" data-library-search-count={onlineHits.length}>
                  <p className="library-search-section__head">
                    On YouTube
                    <span className="library-search-section__count">{onlineHits.length}</span>
                  </p>
                  {onlineHits.length ? (
                    searchFormat === "grid" ? (
                      <div className="library-search-grid" data-library-search-listing="grid">
                        {onlineHits.map((track) => (
                          <YouTubeHit key={track.url} track={track} format="grid" onOpen={onOpenYouTube ? openYouTubeHit : undefined} />
                        ))}
                      </div>
                    ) : (
                      <div className="library-search-list" data-library-search-listing="list">
                        {onlineHits.map((track) => (
                          <YouTubeHit key={track.url} track={track} format="list" onOpen={onOpenYouTube ? openYouTubeHit : undefined} />
                        ))}
                      </div>
                    )
                  ) : (
                    /* Honest hand-off, exactly like the Music pane: without a
                       key the search happens ON YouTube — the link is the
                       search — and a key can be set up for inline results. */
                    <p className="library-search-empty" data-library-search-no-online-hits>
                      {searchResults?.onlineError
                        ? `${searchResults.onlineMessage} Settings → YouTube search me apni key badal do.`
                        : searchResults?.onlineReady
                          ? `YouTube par kuch nahin mila “${search.query}” ke liye.`
                          : "YouTube search ki key set nahin hai — neeche wale link se YouTube par search karo."}{" "}
                      <a
                        href={youTubeSearchUrl(search.query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-library-search-external
                        className="library-search-empty__link"
                      >
                        YouTube par search karo <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    </p>
                  )}
                </section>
              </>
            ) : (
              /* Nothing run yet: the learner's own recent searches, exactly the
                 way YouTube's search page shows them. */
              <>
                <SearchHistoryList
                  entries={search.history}
                  onPick={(entry) => { setSearchText(entry); void search.rerun(entry); }}
                  onRemove={search.forget}
                  onClear={search.clearHistory}
                />
                {search.history.length ? null : (
                  <p className="library-search-hint" data-library-search-hint>
                    Search everything in this course — lessons, notes, mind maps, brain cards, experiments and PDFs —
                    and YouTube, from one box.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* The page's OWN name row, just under the header (owner brief): the
                header above it is the search box now. */}
            <div className="library-title-row" data-library-title-row>
              <span className="library-title-row__icon" aria-hidden="true"><BookOpen size={20} /></span>
              <h2 className="library-title-row__name" data-course-page-title>Resource Library</h2>
              {status === "ready" && hasAnything ? (
                <span className="library-header__count" data-library-count>
                  {totalResources} {totalResources === 1 ? "resource" : "resources"}
                </span>
              ) : null}
            </div>

            {status === "loading" ? (
              <>
                <StudyLibraryNotice state="loading" title="Loading the course library" message="Modules and resources appear as soon as the course is ready." />
                <BranchedMenuSkeleton rows={5} label="Loading course modules" />
              </>
            ) : status === "error" ? (
              <StudyLibraryNotice
                state="error"
                title="The course library could not load"
                message={errorMessage || "Check your connection and try again. Your progress is safe."}
                onRetry={onRetry}
              />
            ) : !hasAnything ? (
              <StudyLibraryEmptyState
                kind="note"
                title="No course content available"
                description={courseTitle
                  ? `The resource library for "${courseTitle}" will appear here once the course creator publishes modules and lessons.`
                  : "The resource library will appear here once the course creator publishes modules and lessons."}
              />
            ) : (
              <BranchedMenu
                items={tree}
                openValues={openValues}
                onToggle={toggleSection}
                activeValue={activeValue}
                onSelect={(value) => handleSelect(value)}
                ariaLabel="Course modules and resources"
                fullWidth
                rowHeight={40}
                fontSize={14}
                indent={40}
                className="course-library__menu"
                dataAttrs={{ "data-course-library-menu": "", "data-listing": "modules" }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
