// src/course/CourseOverlay.tsx
//
// Course Player bottom dock + overlay. Replaces the old side panel
// with four toggles pinned to the very bottom (Modules / Resources /
// Notes / Paid). A pill indicator slides between the buttons, and
// tapping a button opens a dropdown overlay with the matching content:
//
//   - Modules   → every available module (expandable to its files).
//   - Resources → only files, grouped under the modules that have files.
//   - Notes     → the notes panel, sized to half the screen.
//   - Paid      → only paid modules / updates, with a purchase CTA.
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
import { BookOpen, ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, NotebookPen, PlayCircle, ShoppingBag, X } from "lucide-react";
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

const fileIcon = (file: CourseFile) => {
  if (file.type === "youtube" || file.type === "video" || file.type === "audio") return PlayCircle;
  if (file.type === "pdf" || file.type === "ebook") return FileText;
  if (file.type === "sheet") return FileSpreadsheet;
  if (file.type === "google_form") return FormInput;
  if (file.type === "embed" || file.type === "mindmap") return Link2;
  return File;
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

const TABS: Array<{ key: DockTab; label: string; heading: string; icon: (active: boolean) => ReactNode }> = [
  { key: "modules", label: "Module", heading: "Modules", icon: () => <BookOpen size={18} /> },
  { key: "resources", label: "Resource", heading: "Resources", icon: () => <FileText size={18} /> },
  { key: "notes", label: "Note", heading: "Notes", icon: () => <NotebookPen size={18} /> },
  { key: "paid", label: "Paid", heading: "Paid content", icon: () => <ShoppingBag size={18} /> },
];

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab, open } = props;
  const activeIndex = Math.max(0, TABS.findIndex((item) => item.key === tab));
  const landscape = orientation === "landscape";

  // Notes get exactly half the screen so the keyboard + list both fit.
  // Every other tab gets a taller sheet so long module trees breathe.
  const notesHeight = landscape ? "52vw" : "50dvh";
  const defaultHeight = landscape ? "min(78vw, 460px)" : "72dvh";
  const sheetHeight = tab === "notes" ? notesHeight : defaultHeight;

  const flatModules = useMemo(() => flattenModules(props.modules), [props.modules]);

  // Escape closes the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  return (
    <>
      {/* ── Scrim: closes the sheet when the content behind it is tapped ── */}
      <div
        onClick={props.onClose}
        aria-hidden={!open}
        className={`absolute z-30 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${
          landscape ? "bottom-0 left-0 right-16 top-0" : "inset-x-0 bottom-16 top-0"
        } ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        data-course-overlay-scrim
      />

      {/* ── Overlay sheet ─────────────────────────────────────────────── */}
      <div
        className={`absolute z-40 flex flex-col overflow-hidden border-[var(--course-border)] bg-[var(--course-panel)] shadow-[0_-18px_50px_rgba(0,0,0,0.55)] transition-[transform,opacity] duration-300 ease-out ${
          landscape
            ? "bottom-0 right-16 top-0 border-l"
            : "inset-x-0 bottom-16 rounded-t-3xl border-t"
        } ${open
          ? "pointer-events-auto translate-x-0 translate-y-0 opacity-100"
          : `pointer-events-none invisible opacity-0 ${landscape ? "translate-x-full" : "translate-y-full"}`
        }`}
        style={{ [landscape ? "width" : "height"]: sheetHeight }}
        data-course-overlay
        data-open={open ? "true" : "false"}
        data-orientation={orientation}
      >
        {/* Grab handle (portrait only) */}
        {!landscape ? (
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Collapse panel"
            className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-[var(--course-strong)]"
          />
        ) : null}

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--course-border)] px-4 py-3">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-overlay-title>
            {TABS[activeIndex].heading}
          </p>
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
        style={landscape ? undefined : { paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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

  // Resources mode: only modules that actually contain files are shown.
  const visible = flatModules.filter(({ module }) => {
    if (module.accessLevel === "hidden") return false;
    if (mode === "resources") return moduleFiles(module).some(isVisibleFile);
    return true;
  });

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
    <div className="h-full overflow-y-auto overscroll-contain p-3 pb-6" data-course-overlay-list data-mode={mode}>
      {visible.map(({ module, depth }) => {
        const files = moduleFiles(module).filter(isVisibleFile);
        const moduleId = String(module.id);
        const accessible = props.accessibleModuleIds.has(moduleId);
        const preview = props.previewModuleIds.has(moduleId);
        const paidNotOwned = module.accessLevel === "paidUpdate" && Boolean(module.paidUpdateId) && !props.ownedUpdateIds.has(String(module.paidUpdateId));
        const locked = !accessible || paidNotOwned;
        const open = mode === "modules" && expanded.has(moduleId);
        const holdsSelected = files.some((file) => file.id === props.selectedFileId);

        // In resources mode, files are listed directly (no expand/collapse).
        const rowFiles = mode === "resources" ? files : open ? files : [];

        return (
          <div key={moduleId} className={depth ? "ml-3 border-l border-[var(--course-border)] pl-2" : "mb-1.5"}>
            <button
              type="button"
              onClick={() => {
                if (mode === "modules") setExpanded((current) => { const next = new Set(current); if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId); return next; });
              }}
              disabled={mode === "resources"}
              className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-3 text-left transition ${mode === "resources" ? "cursor-default" : ""} ${
                locked ? "bg-amber-400/[0.07] ring-1 ring-inset ring-amber-400/15" : holdsSelected ? "bg-violet-500/10 ring-1 ring-inset ring-violet-400/25" : "hover:bg-[var(--course-soft)]"
              }`}
              data-course-overlay-module
              data-module-id={moduleId}
              data-locked={locked ? "true" : "false"}
              data-preview={preview ? "true" : "false"}
            >
              {mode === "modules" ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[10px] font-black text-[var(--course-muted)]">{depth + 1}</span>
              ) : (
                <FileText size={14} className="shrink-0 text-[var(--course-muted)]" />
              )}
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
              <div className="mx-2 mt-1 mb-1 flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
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

            {rowFiles.length > 0 && (
              <div className="space-y-1 py-1 pl-2">
                {rowFiles.map((file) => {
                  const Icon = fileIcon(file);
                  const fileLocked = locked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateKey(file)));
                  return (
                    <button
                      key={file.id}
                      disabled={fileLocked}
                      onClick={() => props.onSelectFile(file)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold transition ${
                        props.selectedFileId === file.id ? "bg-violet-500 text-white shadow-lg shadow-violet-600/25" : fileLocked ? "cursor-not-allowed bg-amber-400/5 text-[var(--course-muted)]" : "text-[var(--course-muted)] hover:bg-[var(--course-soft)] hover:text-[var(--course-text)]"
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
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Paid content ───────────────────────────────────────────────────────────
function PaidList(props: CourseOverlayProps) {
  // Paid content is presented as a single, consistent list of the purchasable
  // paid updates. Each update groups its modules/files (a module's paidUpdateId
  // points at the update that includes it), so listing the same modules again
  // as separate rows would render the same paid content twice in two styles.
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-3 pb-6" data-course-overlay-paid>
      {props.updates.length === 0 ? (
        <p className="grid h-40 place-items-center px-6 text-center text-xs text-[var(--course-muted)]">No paid content for this course.</p>
      ) : (
        <div className="space-y-2">
          {props.updates.map((update) => (
            <div key={update.id} className="rounded-2xl border border-[var(--course-border)] bg-[var(--course-soft)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black">{update.title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--course-muted)]">{update.contentNames.slice(0, 3).join(" · ")}</p>
                </div>
                <span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span>
              </div>
              <button onClick={() => props.onBuyUpdate(update)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2.5 text-[11px] font-black text-slate-950" data-course-overlay-buy-update={update.id}>
                <ShoppingBag size={13} /> Buy this update
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
