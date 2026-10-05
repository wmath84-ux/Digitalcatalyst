// src/course/CourseResourceLibrary.tsx
//
// Structured resource library for the Course Player's Modules tab.
//
// Instead of a flat file list, this component presents course content as a
// navigable hierarchy: Chapter → Module → Submodule → Resources (Notes, Mind
// Maps, lessons, and other resource types). Each module is a visual group with
// its own progress, resource counts, and expand/collapse behaviour.
//
// Resource cards use the existing StudyResourceCard visual language for notes
// and mind maps, and a compact lesson card for playable content. Opening a
// resource delegates to the existing editors/viewers — the library is purely
// a navigation layer.
//
// ── Performance ──────────────────────────────────────────────────────────
// Library cards use LIGHTWEIGHT metadata only: file id, name, type, timestamps,
// word counts (from note titles), and module path. No note body or mind map
// data is loaded into memory until the learner opens a resource.
//
// ── Data consistency ─────────────────────────────────────────────────────
// Master/admin resources and Self/user resources remain logically distinct.
// Master notes are surfaced from the course tree; self notes stay in the
// Notes panel. Mind map type resources from the course tree are treated as
// admin-authored library content.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
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
import { formatStudyTimestamp } from "./studyResourceContext";
import "./courseResourceLibrary.css";

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
  /** Open a master note in the read-only BlockNote viewer. */
  onOpenMasterNote: (note: MasterCourseNote) => void;
  /**
   * Open a structured mind_map resource (type: "mind_map") — the course tree
   * file carrying its own mindMapData. The player decides how to surface it
   * (MindMapPanel pre-loaded, or a dedicated viewer).
   */
  onOpenMindMapResource: (file: CourseFile, modulePath: string[]) => void;
  /** Current search/filter query from the parent (the Modules tab's search). */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

// ── Hierarchy builder ───────────────────────────────────────────────────

export type LibraryResourceKind = "lesson" | "note" | "mind-map" | "brain" | "experiment" | "read";

interface LibraryResource {
  id: string;
  kind: LibraryResourceKind;
  file?: CourseFile;
  masterNote?: MasterCourseNote;
  title: string;
  subtitle: string;
  sourceLabel: string;
  metadata: string[];
  timestamp?: number;
  locked: boolean;
  completed: boolean;
  selected: boolean;
  modulePath: string[];
}

interface LibraryModuleGroup {
  id: string;
  title: string;
  depth: number;
  resources: LibraryResource[];
  totalCount: number;
  completedCount: number;
  noteCount: number;
  mindMapCount: number;
  lessonCount: number;
  brainCount: number;
  locked: boolean;
  preview: boolean;
  modulePath: string[];
  hasChildren: boolean;
}

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
    case "note": return "NOTE";
    case "mind-map": return "MIND MAP";
    case "brain": return "PRACTICE";
    case "experiment": return "EXPERIMENT";
    case "read": return "READ";
    default: return "LESSON";
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

/**
 * Build the resource library hierarchy from the course module tree.
 * Lightweight: uses only metadata fields, never note bodies or mind map data.
 */
function buildLibraryHierarchy(
  modules: CourseModule[],
  options: {
    courseTitle: string;
    selectedFileId?: string;
    completedFileIds: Set<string>;
    accessibleModuleIds: Set<string>;
    ownedUpdateIds: Set<string>;
    previewModuleIds: Set<string>;
    accessibleResourceIds: Set<string>;
    masterNotes: MasterCourseNote[];
  },
): LibraryModuleGroup[] {
  const groups: LibraryModuleGroup[] = [];
  const {
    selectedFileId,
    completedFileIds,
    accessibleModuleIds,
    ownedUpdateIds,
    previewModuleIds,
    masterNotes,
  } = options;

  // Index master notes by module id for O(1) lookup.
  const masterNotesByModule = new Map<string, MasterCourseNote[]>();
  for (const note of masterNotes) {
    const list = masterNotesByModule.get(note.moduleId) || [];
    list.push(note);
    masterNotesByModule.set(note.moduleId, list);
  }

  const visit = (nodes: CourseModule[], ancestors: string[], ancestorLocked: boolean, depth: number) => {
    for (const module of nodes) {
      if (module.accessLevel === "hidden") continue;

      const moduleId = String(module.id);
      const title = String(module.title || "Module");
      const modulePath = [...ancestors, title];
      const moduleLocked = ancestorLocked || !accessibleModuleIds.has(moduleId) || isPaidLockedModule(module, ownedUpdateIds);
      const preview = previewModuleIds.has(moduleId);
      const children = module.modules || [];

      // Collect ALL resource types for this module.
      const files = moduleFiles(module);
      const resources: LibraryResource[] = [];

      for (const file of files) {
        if (file.accessLevel === "hidden") continue;
        if (file.type === READ_RESOURCE_FILE_TYPE) continue; // Read library has its own tab

        const fileId = String(file.id);
        const fileLocked = moduleLocked || isFilePaidLocked(file, ownedUpdateIds);

        let kind: LibraryResourceKind;
        let subtitle: string;
        let metadata: string[] = [];

        if (file.type === NOTE_RESOURCE_FILE_TYPE) {
          kind = "note";
          // Lightweight metadata: word count from noteHtml preview (cheap string op)
          const html = String(file.noteHtml || "");
          const plainText = html.replace(/<[^>]+>/g, "").trim();
          const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
          subtitle = "Course note";
          metadata = wordCount ? [`${wordCount} words`] : [];
        } else if (file.type === "mind_map") {
          kind = "mind-map";
          subtitle = file.mindMapSourceMode === "code_import" ? "Imported mind map" : "Mind map";
          const rootTopic = String(file.mindMapRootTopic || "");
          if (rootTopic) metadata = [rootTopic];
        } else if (file.type === "brain") {
          kind = "brain";
          const qCount = file.practiceQuestions?.length ?? 0;
          subtitle = `${qCount} practice ${qCount === 1 ? "question" : "questions"}`;
          metadata = qCount ? [`${qCount} questions`] : [];
        } else if (isExperimentFileType(file.type)) {
          kind = "experiment";
          subtitle = "Interactive experiment";
        } else {
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

        const sourceLabel = file.type === NOTE_RESOURCE_FILE_TYPE ? "MASTER" :
                           file.source === "personal" ? "SELF" : "COURSE";

        resources.push({
          id: `file:${fileId}`,
          kind,
          file,
          title: String(file.name || "Untitled"),
          subtitle,
          sourceLabel,
          metadata,
          timestamp: file.updatedAt || file.createdAt,
          locked: fileLocked,
          completed: completedFileIds.has(fileId),
          selected: selectedFileId === fileId,
          modulePath,
        });
      }

      // Add master notes that belong to this module (they may not have a
      // matching `type: "note"` file in the tree — the projection handles
      // access filtering separately).
      const moduleMasterNotes = masterNotesByModule.get(moduleId) || [];
      const existingNoteIds = new Set(
        resources.filter((r) => r.kind === "note" && r.file).map((r) => String(r.file?.id)),
      );
      for (const note of moduleMasterNotes) {
        if (existingNoteIds.has(note.resourceId)) continue; // Already in tree
        const plainText = (note.bodyHtml || "").replace(/<[^>]+>/g, "").trim();
        const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
        resources.push({
          id: `master-note:${note.id}`,
          kind: "note",
          masterNote: note,
          title: note.title || "Untitled master note",
          subtitle: "Admin-authored course note",
          sourceLabel: "MASTER",
          metadata: wordCount ? [`${wordCount} words`] : [],
          timestamp: note.updatedAt || note.createdAt,
          locked: moduleLocked,
          completed: false,
          selected: false,
          modulePath,
        });
      }

      // Count by type.
      const noteCount = resources.filter((r) => r.kind === "note").length;
      const mindMapCount = resources.filter((r) => r.kind === "mind-map").length;
      const brainCount = resources.filter((r) => r.kind === "brain").length;
      const lessonCount = resources.filter((r) => r.kind === "lesson" || r.kind === "experiment").length;
      const completableResources = resources.filter((r) => !r.locked);
      const completedCount = completableResources.filter((r) => r.completed).length;

      groups.push({
        id: moduleId,
        title,
        depth,
        resources,
        totalCount: resources.length,
        completedCount,
        noteCount,
        mindMapCount,
        lessonCount,
        brainCount,
        locked: moduleLocked,
        preview,
        modulePath,
        hasChildren: children.length > 0,
      });

      visit(children, modulePath, moduleLocked, depth + 1);
    }
  };

  visit(modules, [], false, 0);
  return groups;
}

// ── Resource Card ───────────────────────────────────────────────────────

function LibraryResourceCard({
  resource,
  onOpen,
}: {
  resource: LibraryResource;
  onOpen: (resource: LibraryResource) => void;
}) {
  const kindLabel = resourceKindLabel(resource.kind);
  const Icon = resource.file
    ? fileIconForType(resource.file.type)
    : resource.kind === "note" ? NotebookPen : File;
  const timestamp = formatStudyTimestamp(resource.timestamp);

  const accentClass = resource.kind === "note"
    ? "library-resource--note"
    : resource.kind === "mind-map"
    ? "library-resource--mind-map"
    : resource.kind === "brain"
    ? "library-resource--brain"
    : resource.kind === "experiment"
    ? "library-resource--experiment"
    : "library-resource--lesson";

  return (
    <button
      type="button"
      className={`library-resource ${accentClass} ${resource.selected ? "library-resource--selected" : ""} ${resource.locked ? "library-resource--locked" : ""}`}
      onClick={() => !resource.locked && onOpen(resource)}
      disabled={resource.locked}
      aria-label={
        resource.locked
          ? `${resource.title} — locked`
          : `${kindLabel}: ${resource.title}. ${resource.subtitle}. ${resource.modulePath.join(" / ")}`
      }
      data-library-resource
      data-resource-kind={resource.kind}
      data-resource-id={resource.id}
      data-selected={resource.selected ? "true" : "false"}
      data-locked={resource.locked ? "true" : "false"}
      data-completed={resource.completed ? "true" : "false"}
    >
      <span className="library-resource__icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <span className="library-resource__body">
        <span className="library-resource__topline">
          <span className="library-resource__kind">{kindLabel}</span>
          {resource.completed ? <span className="library-resource__badge library-resource__badge--done">DONE</span> : null}
          {resource.locked ? <LockKeyhole size={11} className="library-resource__lock" aria-hidden="true" /> : null}
        </span>
        <span className="library-resource__title">{resource.title}</span>
        <span className="library-resource__subtitle">{resource.subtitle}</span>
        {resource.metadata.length ? (
          <span className="library-resource__meta">
            {resource.metadata.map((item, i) => (
              <span key={i} className="library-resource__meta-item">{item}</span>
            ))}
          </span>
        ) : null}
        {timestamp ? (
          <span className="library-resource__time">
            <time dateTime={new Date(resource.timestamp || 0).toISOString()}>
              {timestamp.short}
            </time>
          </span>
        ) : null}
      </span>
      <span className="library-resource__source">{resource.sourceLabel}</span>
    </button>
  );
}

// ── Module Group ────────────────────────────────────────────────────────

function LibraryModuleGroup({
  group,
  expanded,
  onToggle,
  onOpenResource,
}: {
  group: LibraryModuleGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenResource: (resource: LibraryResource) => void;
}) {
  const progressPct = group.totalCount > 0
    ? Math.round((group.completedCount / group.totalCount) * 100)
    : 0;

  const depthIndent = Math.min(group.depth, 3) * 12;

  const typeCounts: ReactNode[] = [];
  if (group.lessonCount > 0) typeCounts.push(<span key="l" className="library-module__count library-module__count--lesson">{group.lessonCount} {group.lessonCount === 1 ? "lesson" : "lessons"}</span>);
  if (group.noteCount > 0) typeCounts.push(<span key="n" className="library-module__count library-module__count--note">{group.noteCount} {group.noteCount === 1 ? "note" : "notes"}</span>);
  if (group.mindMapCount > 0) typeCounts.push(<span key="m" className="library-module__count library-module__count--map">{group.mindMapCount} {group.mindMapCount === 1 ? "map" : "maps"}</span>);
  if (group.brainCount > 0) typeCounts.push(<span key="b" className="library-module__count library-module__count--brain">{group.brainCount} {group.brainCount === 1 ? "practice" : "practices"}</span>);

  return (
    <section
      className="library-module"
      data-library-module
      data-module-id={group.id}
      data-module-depth={group.depth}
      data-locked={group.locked ? "true" : "false"}
    >
      <button
        type="button"
        className="library-module__header"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ paddingLeft: `${12 + depthIndent}px` }}
      >
        <span className="library-module__chevron" aria-hidden="true">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <span className="library-module__info">
          <span className="library-module__title-row">
            <span className="library-module__title">{group.title}</span>
            {group.preview ? <Eye size={12} className="library-module__preview-badge" /> : null}
            {group.locked ? <LockKeyhole size={12} className="library-module__lock-badge" /> : null}
          </span>
          <span className="library-module__counts">
            {typeCounts.length > 0 ? (
              <>{typeCounts.reduce<ReactNode[]>((acc, item, i) => {
                if (i > 0) acc.push(<span key={`sep-${i}`} className="library-module__sep" aria-hidden="true">·</span>);
                acc.push(item);
                return acc;
              }, [])}</>
            ) : (
              <span className="library-module__count library-module__count--empty">No resources yet</span>
            )}
          </span>
        </span>
        {group.totalCount > 0 && !group.locked ? (
          <span className="library-module__progress" data-progress={progressPct}>
            <span className="library-module__progress-bar" aria-hidden="true">
              <span className="library-module__progress-fill" style={{ width: `${progressPct}%` }} />
            </span>
            <span className="library-module__progress-label">{progressPct}%</span>
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="library-module__body" style={{ paddingLeft: `${depthIndent}px` }}>
          {group.resources.length > 0 ? (
            <div className="library-module__resources">
              {group.resources.map((resource) => (
                <LibraryResourceCard
                  key={resource.id}
                  resource={resource}
                  onOpen={onOpenResource}
                />
              ))}
            </div>
          ) : (
            <div className="library-module__empty" data-library-module-empty>
              <Library size={18} aria-hidden="true" />
              <p>This module doesn't have any resources yet.</p>
              <p className="library-module__empty-hint">
                {group.locked
                  ? "Unlock this module to access its content."
                  : "Resources published by the course creator will appear here."}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────

function LibraryEmptyState({ courseTitle }: { courseTitle: string }) {
  return (
    <div className="library-empty" data-library-empty>
      <BookOpen size={28} aria-hidden="true" />
      <h2 className="library-empty__title">No course content available</h2>
      <p className="library-empty__description">
        {courseTitle
          ? `The resource library for "${courseTitle}" will appear here once the course creator publishes modules and lessons.`
          : "The resource library will appear here once the course creator publishes modules and lessons."}
      </p>
    </div>
  );
}

// ── Search / Filter Bar ─────────────────────────────────────────────────

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
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search modules, notes, mind maps…"
        className="library-search__input"
        aria-label="Search course resources"
        data-library-search-input
      />
      {query ? (
        <>
          <span className="library-search__count">{resultCount} {resultCount === 1 ? "result" : "results"}</span>
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

// ── Filter Chips ────────────────────────────────────────────────────────

type LibraryFilter = "all" | "notes" | "mind-maps" | "lessons" | "practice";

const FILTERS: { key: LibraryFilter; label: string; icon: typeof BookOpen }[] = [
  { key: "all", label: "All", icon: Library },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "mind-maps", label: "Mind Maps", icon: Network },
  { key: "lessons", label: "Lessons", icon: PlayCircle },
  { key: "practice", label: "Practice", icon: Brain },
];

function LibraryFilterChips({
  active,
  onChange,
  counts,
}: {
  active: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  counts: Record<LibraryFilter, number>;
}) {
  return (
    <div className="library-filters" data-library-filters role="tablist" aria-label="Resource type filter">
      {FILTERS.map(({ key, label, icon: Icon }) => {
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`library-filter ${active === key ? "library-filter--active" : ""}`}
            onClick={() => onChange(key)}
            data-library-filter={key}
          >
            <Icon size={13} aria-hidden="true" />
            <span>{label}</span>
            {count > 0 ? <span className="library-filter__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Library Component ──────────────────────────────────────────────

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
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
}: CourseResourceLibraryProps) {
  // Internal search state (used when the parent doesn't manage it).
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = externalSearchQuery ?? internalQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalQuery;

  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Build the hierarchy once per modules/access change.
  const hierarchy = useMemo(
    () => buildLibraryHierarchy(modules, {
      courseTitle,
      selectedFileId,
      completedFileIds,
      accessibleModuleIds,
      ownedUpdateIds,
      previewModuleIds,
      accessibleResourceIds,
      masterNotes,
    }),
    [modules, courseTitle, selectedFileId, completedFileIds, accessibleModuleIds, ownedUpdateIds, previewModuleIds, accessibleResourceIds, masterNotes],
  );

  // Auto-expand the module holding the currently selected file.
  useEffect(() => {
    if (!selectedFileId) return;
    for (const group of hierarchy) {
      if (group.resources.some((r) => r.selected)) {
        setExpandedIds((current) => {
          if (current.has(group.id)) return current;
          const next = new Set(current);
          next.add(group.id);
          return next;
        });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFileId, hierarchy]);

  // Toggle module expansion.
  const toggleModule = useCallback((moduleId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  // Handle resource opening — delegates to the appropriate handler.
  const handleOpenResource = useCallback((resource: LibraryResource) => {
    if (resource.locked) return;

    if (resource.kind === "note") {
      if (resource.masterNote) {
        onOpenMasterNote(resource.masterNote);
      } else if (resource.file) {
        // Admin note file from the course tree — open as master note view
        onSelectFile(resource.file);
      }
    } else if (resource.kind === "mind-map" && resource.file) {
      onOpenMindMapResource(resource.file, resource.modulePath);
    } else if (resource.file) {
      onSelectFile(resource.file);
    }
  }, [onSelectFile, onOpenMasterNote, onOpenMindMapResource]);

  // Filter resources by search query and type filter.
  const { filteredGroups, totalResults, filterCounts } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const counts: Record<LibraryFilter, number> = { all: 0, notes: 0, "mind-maps": 0, lessons: 0, practice: 0 };

    // Count all resources (pre-filter).
    for (const group of hierarchy) {
      for (const resource of group.resources) {
        counts.all++;
        if (resource.kind === "note") counts.notes++;
        else if (resource.kind === "mind-map") counts["mind-maps"]++;
        else if (resource.kind === "brain") counts.practice++;
        else counts.lessons++;
      }
    }

    if (!query && filter === "all") {
      return { filteredGroups: hierarchy, totalResults: counts.all, filterCounts: counts };
    }

    const filtered = hierarchy.map((group) => {
      const resources = group.resources.filter((resource) => {
        // Type filter.
        if (filter === "notes" && resource.kind !== "note") return false;
        if (filter === "mind-maps" && resource.kind !== "mind-map") return false;
        if (filter === "lessons" && resource.kind !== "lesson" && resource.kind !== "experiment") return false;
        if (filter === "practice" && resource.kind !== "brain") return false;

        // Search filter.
        if (!query) return true;
        const searchTarget = [
          resource.title,
          resource.subtitle,
          resource.sourceLabel,
          ...resource.modulePath,
          ...resource.metadata,
        ].join(" ").toLowerCase();
        return searchTarget.includes(query);
      });

      return { ...group, resources };
    }).filter((group) => group.resources.length > 0 || (!query && filter === "all"));

    const total = filtered.reduce((sum, group) => sum + group.resources.length, 0);
    return { filteredGroups: filtered, totalResults: total, filterCounts: counts };
  }, [hierarchy, searchQuery, filter]);

  // Auto-expand filtered modules when searching.
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedIds(new Set(filteredGroups.map((g) => g.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  if (hierarchy.length === 0) {
    return <LibraryEmptyState courseTitle={courseTitle} />;
  }

  return (
    <div className="course-resource-library" data-course-resource-library>
      {/* Sticky header with search and filters */}
      <div className="library-header" data-library-header>
        <div className="library-header__title-row">
          <h2 className="library-header__title">
            <Library size={16} aria-hidden="true" />
            <span>Resource Library</span>
          </h2>
          <span className="library-header__count">{hierarchy.reduce((s, g) => s + g.totalCount, 0)} resources</span>
        </div>
        <LibrarySearchBar
          query={searchQuery}
          onChange={setSearchQuery}
          resultCount={totalResults}
        />
        <LibraryFilterChips
          active={filter}
          onChange={setFilter}
          counts={filterCounts}
        />
      </div>

      {/* Scrollable module groups */}
      <div className="library-body" data-library-body>
        {filteredGroups.length > 0 ? (
          filteredGroups.map((group) => (
            <LibraryModuleGroup
              key={group.id}
              group={group}
              expanded={expandedIds.has(group.id)}
              onToggle={() => toggleModule(group.id)}
              onOpenResource={handleOpenResource}
            />
          ))
        ) : (
          <div className="library-no-results" data-library-no-results>
            <Search size={20} aria-hidden="true" />
            <p>No resources match "{searchQuery}"</p>
            <p className="library-no-results__hint">
              Try a different search term or remove the filter.
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setFilter("all"); }}
              className="library-no-results__reset"
              data-library-reset-search
            >
              Clear search and filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
