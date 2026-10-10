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
// viewer / editor handlers the Course Player already owns. The title search is
// the only filter — the old type chips (All / Notes / Mind Maps / …) are gone.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Check,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FormInput,
  Library,
  Link2,
  LockKeyhole,
  Network,
  NotebookPen,
  PlayCircle,
  Search,
  X,
} from "lucide-react";
import type { CourseFile, CourseModule, MasterCourseNote } from "../types/course";
import { isExperimentFileType, NOTE_RESOURCE_FILE_TYPE, READ_RESOURCE_FILE_TYPE } from "../types/course";
import BranchedMenu, { BranchedMenuSkeleton, useBranchedOpen, type BranchedMenuItem } from "../components/branched-menu/BranchedMenu";
import { allSectionValues, ancestorSectionValues, buildBranchTree, type BranchEntry, type BranchSegment } from "../components/branched-menu/branchedTree";
import { StudyLibraryEmptyState, StudyLibraryNotice } from "./StudyLibraryStates";
import "./courseResourceLibrary.css";
import { isVisibleFile } from "./fileVisibility";

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
  /** Open a playable lesson file (video, doc, youtube, etc.) in the viewer. */
  onSelectFile: (file: CourseFile) => void;
  /** Open a master note in the read-only viewer. */
  onOpenMasterNote: (note: MasterCourseNote) => void;
  /** Open a mind map resource: the player focuses the owning module's map library. */
  onOpenMindMapResource: (file: CourseFile, modulePath: string[]) => void;
  /** The learner's own "My Modules" entry, shown as the last branch of the library. */
  personalEntry?: { subtitle: string; locked?: boolean; onOpen: () => void } | null;
  /** Current search query (controlled by the parent when it provides both props). */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  /** Library state. Defaults to "ready". */
  status?: "ready" | "loading" | "error";
  errorMessage?: string | null;
  onRetry?: () => void;
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

// ── Search ──────────────────────────────────────────────────────────────

function LibrarySearchBar({
  query,
  onChange,
  resultCount,
}: {
  query: string;
  onChange: (value: string) => void;
  resultCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="library-search" data-library-search>
      <Search size={15} className="library-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search modules, notes, mind maps…"
        className="library-search__input"
        aria-label="Search course resources"
        data-library-search-input
      />
      {query ? (
        <>
          <span className="library-search__count" aria-live="polite">{resultCount} {resultCount === 1 ? "result" : "results"}</span>
          <button
            type="button"
            onClick={() => { onChange(""); inputRef.current?.focus(); }}
            className="library-search__clear"
            aria-label="Clear search"
            data-library-search-clear
          >
            <X size={14} />
          </button>
        </>
      ) : null}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

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
  onSelectFile,
  onOpenMasterNote,
  onOpenMindMapResource,
  personalEntry,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  status = "ready",
  errorMessage,
  onRetry,
}: CourseResourceLibraryProps) {
  void accessibleResourceIds;
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = externalSearchQuery ?? internalQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalQuery;
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
  const query = searchQuery.trim().toLowerCase();

  // Filter by the title search only (the type chips are removed).
  const visibleEntries = useMemo(() => {
    if (!query) return built.entries;
    return built.entries.filter(({ path, resource }) => [
      resource.title,
      resource.subtitle,
      resource.source ?? "",
      ...path.map((segment) => segment.label),
      ...resource.metadata,
    ].join(" ").toLowerCase().includes(query));
  }, [built.entries, query]);

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
    const ensurePaths = query ? [] : built.modulePaths;
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
  }, [visibleEntries, query, built.modulePaths, built.moduleMeta, progressByKey, personalEntry]);

  // Expansion (shared hook): the top level opens by default and the learner's
  // choices are kept. Searching opens every matching module; a selected
  // resource reveals the chain that holds it.
  const { openValues, toggle: toggleSection, reveal, setAll } = useBranchedOpen(tree);
  useEffect(() => {
    if (!query) return;
    setAll(allSectionValues(tree));
  }, [query, tree, setAll]);

  useEffect(() => {
    if (!selectedFileId || query) return;
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

  return (
    <div className="course-resource-library" data-course-resource-library>
      <div className="library-header" data-library-header>
        <div className="library-header__title-row">
          <h2 className="library-header__title">
            <BookOpen size={15} aria-hidden="true" />
            <span>Resource Library</span>
          </h2>
          {status === "ready" && hasAnything ? (
            <span className="library-header__count">{totalResources} {totalResources === 1 ? "resource" : "resources"}</span>
          ) : null}
        </div>
        {status === "ready" && hasAnything ? (
          <LibrarySearchBar query={searchQuery} onChange={setSearchQuery} resultCount={visibleEntries.length} />
        ) : null}
      </div>

      <div className="library-body" data-library-body>
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
        ) : tree.length === 0 ? (
          <div className="library-no-results" data-library-no-results>
            <Search size={20} aria-hidden="true" />
            <p>No resources match &ldquo;{searchQuery}&rdquo;</p>
            <button type="button" onClick={() => setSearchQuery("")} className="library-no-results__reset" data-library-reset-search>
              Clear search
            </button>
          </div>
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
      </div>
    </div>
  );
}

