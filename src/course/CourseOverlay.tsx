// src/course/CourseOverlay.tsx
//
// Course Player bottom dock + overlay. Replaces the old side panel
// with four toggles pinned to the very bottom (Modules / Resources /
// Notes / Paid). A pill indicator slides between the buttons, and
// tapping a button opens a dropdown overlay with the matching content:
//
//   - Modules   → every available module (expandable to its files).
//   - Resources → only non-paid files, grouped under modules that have them.
//   - Notes     → the notes panel, sized to half the screen.
//   - Paid      → only paid modules / updates, with a purchase CTA.
//
// Modules and their files are drawn as a left-side wire tree: a glowing
// vertical rail with nodes, so every lesson is visibly connected to its
// parent module instead of sitting in disconnected cards.
//
// If one overlay is already open and the user taps another button,
// the SAME overlay stays open and its content swaps in place (with a
// short slide-in animation) rather than closing and reopening.
//
// Layout notes (important):
//   - The dock is ALWAYS the top-most interactive layer (z-50) and is
//     rendered in normal flow so it can never scroll away.
//   - The sheet is `pointer-events-none` + `invisible` while closed so
//     the off-screen (translated) sheet cannot swallow taps meant for
//     the dock underneath it.
//   - Portrait  → dock pinned to the bottom edge, sheet slides up.
//   - Landscape → dock pinned to the right edge as a vertical rail,
//     sheet slides in from the right.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, NotebookPen, PlayCircle, ShoppingBag, Sparkles, X } from "lucide-react";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "../types/course";
import NotesPanel from "./NotesPanel";

export type DockTab = "modules" | "resources" | "notes" | "paid";
export type DockOrientation = "portrait" | "landscape";

const updateKey = (item: { id: string; paidUpdateId?: string }) => String(item.paidUpdateId || item.id);

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
  }] : [];
  return [...embedded, ...(module.files || [])];
};

type FlatModule = { module: CourseModule; depth: number };

const flattenModules = (modules: CourseModule[], depth = 0): FlatModule[] =>
  modules.flatMap((module) => [{ module, depth }, ...flattenModules(module.modules || [], depth + 1)]);

const isVisibleFile = (file: CourseFile) =>
  file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId);

/** Paid modules / paid files already live in the dedicated Paid tab. */
const isPaidContent = (item: { accessLevel?: string }) => item.accessLevel === "paidUpdate";

const fileIcon = (file: CourseFile) => {
  if (file.type === "youtube" || file.type === "video" || file.type === "audio") return PlayCircle;
  if (file.type === "pdf" || file.type === "ebook") return FileText;
  if (file.type === "sheet") return FileSpreadsheet;
  if (file.type === "google_form") return FormInput;
  if (file.type === "embed" || file.type === "mindmap") return Link2;
  return File;
};

const isPaidLocked = (module: CourseModule, ownedUpdateIds: Set<string>) =>
  module.accessLevel === "paidUpdate" && Boolean(module.paidUpdateId) && !ownedUpdateIds.has(String(module.paidUpdateId));

/**
 * The "Module" tab only lists unlocked modules. Locked / paid modules are
 * surfaced in the dedicated "Paid" tab instead, so the curriculum rail never
 * double-lists purchasable content. A locked module also hides its nested
 * children (the whole branch stays locked until the parent is unlocked), so
 * the wire tree never shows an orphaned child under a hidden parent.
 */
const unlockedModuleIds = (
  modules: CourseModule[],
  accessibleModuleIds: Set<string>,
  ownedUpdateIds: Set<string>,
): Set<string> => {
  const out = new Set<string>();
  const visit = (nodes: CourseModule[], ancestorLocked: boolean) => {
    for (const node of nodes) {
      if (node.accessLevel === "hidden") continue;
      const locked = ancestorLocked || !accessibleModuleIds.has(String(node.id)) || isPaidLocked(node, ownedUpdateIds);
      if (!locked) out.add(String(node.id));
      visit(node.modules || [], locked);
    }
  };
  visit(modules, false);
  return out;
};

interface CourseOverlayProps {
  orientation: DockOrientation;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  modules: CourseModule[];
  selectedFileId?: string;
  ownedUpdateIds: Set<string>;
  accessibleModuleIds: Set<string>;
  previewModuleIds: Set<string>;
  updates: PaidCourseUpdate[];
  moduleTitleById: Record<string, string>;
  onSelectFile: (file: CourseFile) => void;
  onBuyModule: (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => void;
  onBuyUpdate: (update: PaidCourseUpdate) => void;
  // Notes wiring
  notes: CoursePlayerNote[];
  onAddNote: (text: string) => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
}

const TABS: Array<{ key: DockTab; label: string; heading: string; hint: string; icon: (active: boolean) => ReactNode }> = [
  { key: "modules", label: "Module", heading: "Modules", hint: "Lessons on a connected path", icon: () => <BookOpen size={18} /> },
  { key: "resources", label: "Resource", heading: "Resources", hint: "Course files (paid modules live in Paid)", icon: () => <FileText size={18} /> },
  { key: "notes", label: "Note", heading: "Notes", hint: "Your private writing pad", icon: () => <NotebookPen size={18} /> },
  { key: "paid", label: "Paid", heading: "Paid content", hint: "Upgrades still locked", icon: () => <ShoppingBag size={18} /> },
];

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab, open } = props;
  const activeIndex = Math.max(0, TABS.findIndex((item) => item.key === tab));
  const landscape = orientation === "landscape";
  // NotesPanel reports when its big editor is open so the sheet can grow.
  const [notesEditorOpen, setNotesEditorOpen] = useState(false);

  // Notes: the saved list only needs half the screen, but the moment the
  // editor is open it takes the full sheet so the writing surface is as
  // large as the notes area allows and long text is easy to read.
  const notesHeight = landscape ? "52vw" : "50dvh";
  const notesEditorHeight = landscape ? "min(92vw, 620px)" : "88dvh";
  const defaultHeight = landscape ? "min(78vw, 460px)" : "72dvh";
  const sheetHeight = tab === "notes"
    ? (notesEditorOpen ? notesEditorHeight : notesHeight)
    : defaultHeight;

  const flatModules = useMemo(() => flattenModules(props.modules), [props.modules]);
  // Only unlocked modules are listed in the "Module" tab, so the header
  // count reflects the same set the learner actually sees.
  const visibleModuleCount = useMemo(
    () => unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds).size,
    [props.modules, props.accessibleModuleIds, props.ownedUpdateIds],
  );

  // Escape closes the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  const activeTab = TABS[activeIndex];

  return (
    <>
      {/* ── Scrim: closes the sheet when the content behind it is tapped ── */}
      <div
        onClick={props.onClose}
        aria-hidden={!open}
        className={`absolute z-30 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${
          landscape ? "bottom-0 left-0 top-0" : "inset-x-0 bottom-16 top-0"
        } ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        style={landscape ? { right: "calc(4rem + env(safe-area-inset-right, 0px))" } : undefined}
        data-course-overlay-scrim
      />

      {/* ── Overlay sheet ─────────────────────────────────────────────── */}
      <div
        className={`absolute z-40 flex flex-col overflow-hidden border-[var(--course-border)] bg-[var(--course-panel)] shadow-[0_-18px_50px_rgba(0,0,0,0.55)] transition-[transform,opacity] duration-300 ease-out ${
          landscape
            ? "bottom-0 top-0 border-l"
            : "inset-x-0 bottom-16 rounded-t-[1.75rem] border-t"
        } ${open
          ? "pointer-events-auto translate-x-0 translate-y-0 opacity-100"
          : `pointer-events-none invisible opacity-0 ${landscape ? "translate-x-full" : "translate-y-full"}`
        }`}
        style={{
          // Sits flush against the dock's left edge — the dock grows by the
          // right safe-area inset in fullscreen, so the sheet must too.
          ...(landscape ? { right: "calc(4rem + env(safe-area-inset-right, 0px))" } : null),
          [landscape ? "width" : "height"]: sheetHeight,
        }}
        data-course-overlay
        data-open={open ? "true" : "false"}
        data-orientation={orientation}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-violet-500/10 to-transparent" />

        {/* Grab handle (portrait only) */}
        {!landscape ? (
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Collapse panel"
            className="relative mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-[var(--course-strong)]"
          />
        ) : null}

        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--course-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-overlay-title>
              {activeTab.heading}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--course-muted)]">
              {tab === "modules" ? `${visibleModuleCount} connected ${visibleModuleCount === 1 ? "module" : "modules"}` : activeTab.hint}
            </p>
          </div>
          <button
            onClick={props.onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
            aria-label="Close overlay"
            data-course-overlay-close
          >
            <X size={15} />
          </button>
        </div>

        {/* Content swaps in place — the sheet itself never closes. */}
        <div key={tab} className="min-h-0 flex-1 overflow-hidden animate-course-overlay-in" data-course-overlay-tab={tab}>
          {tab === "notes" ? (
            <NotesPanel
              notes={props.notes}
              onAdd={props.onAddNote}
              onEdit={props.onEditNote}
              onDelete={props.onDeleteNote}
              onEditorOpenChange={setNotesEditorOpen}
            />
          ) : tab === "paid" ? (
            <PaidList {...props} />
          ) : (
            <ContentList {...props} flatModules={flatModules} mode={tab} />
          )}
        </div>
      </div>

      {/* ── Dock: always the top-most interactive layer ───────────────── */}
      <div
        className={`relative z-50 shrink-0 border-[var(--course-border)] bg-[var(--course-surface-translucent)] backdrop-blur ${landscape ? "flex w-16 flex-col border-l" : "h-16 border-t"}`}
        style={landscape
          ? {
              // In fullscreen the navigation-bar / cutout inset becomes
              // non-zero; growing the rail by that inset (instead of letting
              // padding eat the fixed 4rem box) keeps the four tab buttons
              // fully visible and tappable.
              width: "calc(4rem + env(safe-area-inset-right, 0px))",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }
          : { paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        data-course-dock
        data-orientation={orientation}
      >
        <div className={`relative ${landscape ? "flex flex-1 flex-col" : "flex h-full"}`}>
          <span
            className={`pointer-events-none absolute transition-transform duration-300 ease-out ${landscape ? "left-1.5 right-1.5 top-0 h-1/4" : "bottom-1.5 left-0 top-1.5 w-1/4"}`}
            style={{ transform: landscape ? `translateY(${activeIndex * 100}%)` : `translateX(${activeIndex * 100}%)` }}
            data-course-dock-indicator
            data-index={activeIndex}
          >
            <span className={`block h-full rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-600/30 ${landscape ? "my-1.5" : "mx-1.5"}`} />
          </span>
          {TABS.map(({ key, label, icon }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => props.onTabChange(key)}
                aria-pressed={active}
                className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-black transition-colors ${
                  active ? "text-white" : "text-[var(--course-muted)] hover:text-[var(--course-text)]"
                }`}
                data-course-dock-tab
                data-tab={key}
                data-active={active ? "true" : "false"}
              >
                {icon(active)}
                <span className="truncate px-1">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Modules / Resources content ───────────────────────────────────────────
function ContentList(props: CourseOverlayProps & { flatModules: FlatModule[]; mode: "modules" | "resources" }) {
  const { flatModules, mode } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modules mode: only unlocked modules are shown — locked / paid modules
  // live in the dedicated "Paid" tab. Resources mode: only NON-PAID modules
  // that actually contain non-paid files are shown, so paid content is never
  // listed twice.
  const visible = useMemo(() => {
    if (mode === "resources") {
      return flatModules.filter(({ module }) =>
        module.accessLevel !== "hidden" &&
        !isPaidContent(module) &&
        moduleFiles(module).some((file) => isVisibleFile(file) && !isPaidContent(file)),
      );
    }
    const unlocked = unlockedModuleIds(props.modules, props.accessibleModuleIds, props.ownedUpdateIds);
    return flatModules.filter(({ module }) => unlocked.has(String(module.id)));
  }, [flatModules, mode, props.modules, props.accessibleModuleIds, props.ownedUpdateIds]);

  // Keep the module holding the open file expanded by default.
  useEffect(() => {
    if (mode !== "modules" || !props.selectedFileId) return;
    const owner = visible.find(({ module }) => moduleFiles(module).some((file) => file.id === props.selectedFileId));
    if (owner) setExpanded((current) => (current.has(String(owner.module.id)) ? current : new Set(current).add(String(owner.module.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, props.selectedFileId]);

  if (visible.length === 0) {
    return <p className="grid h-full place-items-center px-6 text-center text-xs text-[var(--course-muted)]">No {mode === "resources" ? "files" : "modules"} to show yet.</p>;
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-4 pb-8" data-course-overlay-list data-mode={mode} data-course-overlay-wire="true">
      <div className="relative">
        {visible.map(({ module, depth }, index) => {
          const files = moduleFiles(module).filter((file) =>
            isVisibleFile(file) && (mode !== "resources" || !isPaidContent(file)),
          );
          const moduleId = String(module.id);
          const accessible = props.accessibleModuleIds.has(moduleId);
          const preview = props.previewModuleIds.has(moduleId);
          const paidNotOwned = isPaidLocked(module, props.ownedUpdateIds);
          const locked = !accessible || paidNotOwned;
          const open = mode === "modules" && expanded.has(moduleId);
          const holdsSelected = files.some((file) => file.id === props.selectedFileId);
          const last = index === visible.length - 1;
          const showFiles = mode === "resources" ? files : open ? files : [];

          return (
            <div key={moduleId} className="relative flex gap-3" style={{ marginLeft: depth ? depth * 12 : 0 }} data-course-wire-node>
              <WireRail last={last && showFiles.length === 0} tone={paidNotOwned ? "paid" : holdsSelected ? "active" : "default"} />
              <div className="min-w-0 flex-1 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "modules") setExpanded((current) => { const next = new Set(current); if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId); return next; });
                  }}
                  disabled={mode === "resources"}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-3 text-left transition ${mode === "resources" ? "cursor-default" : ""} ${
                    locked
                      ? "bg-amber-400/[0.08] ring-1 ring-inset ring-amber-400/20"
                      : holdsSelected
                        ? "bg-violet-500/12 ring-1 ring-inset ring-violet-400/30 shadow-[0_8px_24px_-16px_rgba(139,92,246,0.8)]"
                        : "bg-[var(--course-soft)] hover:bg-[var(--course-soft-hover)]"
                  }`}
                  data-course-overlay-module
                  data-module-id={moduleId}
                  data-locked={locked ? "true" : "false"}
                  data-preview={preview ? "true" : "false"}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[10px] font-black ${
                    paidNotOwned ? "bg-amber-400/20 text-amber-200" : holdsSelected ? "bg-violet-500 text-white" : "bg-[var(--course-soft-hover)] text-[var(--course-muted)]"
                  }`}>{depth + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black">{module.title}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-[var(--course-muted)]">
                      {files.length} {files.length === 1 ? "file" : "files"}
                    </span>
                  </span>
                  {preview ? <Eye size={13} className="shrink-0 text-sky-300" /> : null}
                  {locked && !preview ? <LockKeyhole size={13} className="shrink-0 text-amber-400" /> : null}
                  {mode === "modules" && files.length > 0 ? (
                    open ? <ChevronDown size={15} className="shrink-0 text-[var(--course-muted)]" /> : <ChevronRight size={15} className="shrink-0 text-[var(--course-muted)]" />
                  ) : null}
                </button>

                {/* Locked paid module buy CTA */}
                {locked && paidNotOwned ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
                    <p className="text-[10px] font-bold text-amber-200">Paid module</p>
                    <button
                      type="button"
                      onClick={() => props.onBuyModule({ id: moduleId, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice })}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-950"
                      data-course-overlay-buy-module={moduleId}
                    >
                      <ShoppingBag size={11} /> {module.paidUpdateTitle || "Buy"}
                    </button>
                  </div>
                ) : null}

                {showFiles.length > 0 && (
                  <div className="relative mt-1.5 space-y-1 pl-1">
                    {showFiles.map((file, fileIndex) => {
                      const Icon = fileIcon(file);
                      const fileLocked = locked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateKey(file)));
                      const selected = props.selectedFileId === file.id;
                      const lastFile = fileIndex === showFiles.length - 1;
                      return (
                        <div key={file.id} className="relative flex gap-2.5">
                          <div className="relative flex w-4 shrink-0 flex-col items-center">
                            <span className={`w-px flex-1 ${fileIndex === 0 ? "bg-transparent" : "bg-[var(--course-border)]"}`} />
                            <span className={`relative z-10 h-1.5 w-1.5 rounded-full ${selected ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" : fileLocked ? "bg-amber-400/70" : "bg-[var(--course-strong)]"}`} />
                            <span className={`w-px flex-1 ${lastFile ? "bg-transparent" : "bg-[var(--course-border)]"}`} />
                          </div>
                          <button
                            disabled={fileLocked}
                            onClick={() => props.onSelectFile(file)}
                            className={`mb-0.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold transition ${
                              selected ? "bg-violet-500 text-white shadow-lg shadow-violet-600/25" : fileLocked ? "cursor-not-allowed bg-amber-400/5 text-[var(--course-muted)]" : "text-[var(--course-muted)] hover:bg-[var(--course-soft)] hover:text-[var(--course-text)]"
                            }`}
                            data-course-overlay-file
                            data-file-id={file.id}
                            data-locked={fileLocked ? "true" : "false"}
                          >
                            <Icon size={15} className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                            <span className="shrink-0 rounded-md bg-[var(--course-soft-hover)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider opacity-70">{file.type}</span>
                            {fileLocked ? <LockKeyhole size={12} className="shrink-0 text-amber-400" /> : null}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WireRail({ last, tone }: { last: boolean; tone: "default" | "active" | "paid" }) {
  const node = tone === "paid"
    ? "border-amber-400 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.65)]"
    : tone === "active"
      ? "border-violet-300 bg-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.8)]"
      : "border-violet-400/80 bg-[var(--course-panel)] shadow-[0_0_10px_rgba(139,92,246,0.35)]";
  const line = tone === "paid" ? "from-amber-400/70 via-amber-400/25 to-transparent" : "from-violet-400/80 via-violet-400/25 to-violet-400/0";
  return (
    <div className="relative flex w-5 shrink-0 flex-col items-center" data-course-wire-rail data-tone={tone}>
      <span className={`absolute top-4 bottom-0 w-px bg-gradient-to-b ${line} ${last ? "opacity-0" : ""}`} />
      <span className={`relative z-10 mt-[18px] h-3 w-3 rounded-full border-2 ${node}`} />
    </div>
  );
}

// ─── Paid content ───────────────────────────────────────────────────────────
function PaidList(props: CourseOverlayProps) {
  // Paid content is presented as a single, consistent list of the purchasable
  // paid updates. Each update groups its modules/files (a module's paidUpdateId
  // points at the update that includes it), so listing the same modules again
  // as separate rows would render the same paid content twice in two styles.
  const lockedModules = useMemo(
    () => flattenModules(props.modules).filter(({ module }) => module.accessLevel !== "hidden" && isPaidLocked(module, props.ownedUpdateIds)),
    [props.modules, props.ownedUpdateIds],
  );

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-4 pb-8" data-course-overlay-paid data-course-overlay-wire="true">
      {props.updates.length === 0 && lockedModules.length === 0 ? (
        <p className="grid h-40 place-items-center px-6 text-center text-xs text-[var(--course-muted)]">No paid content for this course.</p>
      ) : (
        <div className="relative">
          {props.updates.map((update, index) => (
            <div key={update.id} className="relative flex gap-3">
              <WireRail last={index === props.updates.length - 1 && lockedModules.length === 0} tone="paid" />
              <div className="min-w-0 flex-1 pb-3">
                <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/12 via-[var(--course-soft)] to-transparent p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-black">
                        <Sparkles size={12} className="text-amber-300" /> {update.title}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--course-muted)]">{update.contentNames.slice(0, 3).join(" · ")}</p>
                    </div>
                    <span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span>
                  </div>
                  <button onClick={() => props.onBuyUpdate(update)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2.5 text-[11px] font-black text-slate-950" data-course-overlay-buy-update={update.id}>
                    <ShoppingBag size={13} /> Buy this update
                  </button>
                </div>
              </div>
            </div>
          ))}
          {lockedModules.map(({ module, depth }, index) => {
            const moduleId = String(module.id);
            return (
              <div key={moduleId} className="relative flex gap-3" style={{ marginLeft: depth ? depth * 12 : 0 }}>
                <WireRail last={index === lockedModules.length - 1} tone="paid" />
                <div className="min-w-0 flex-1 pb-3">
                  <div className="rounded-2xl bg-amber-400/[0.07] p-3 ring-1 ring-inset ring-amber-400/15">
                    <p className="truncate text-xs font-black">{module.title}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-amber-200/80">Paid module</p>
                    <button
                      type="button"
                      onClick={() => props.onBuyModule({ id: moduleId, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice })}
                      className="mt-2 flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1.5 text-[10px] font-black text-slate-950"
                      data-course-overlay-buy-module={moduleId}
                    >
                      <ShoppingBag size={11} /> {module.paidUpdateTitle || "Buy"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
