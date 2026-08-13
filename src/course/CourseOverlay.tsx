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

import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, NotebookPen, PlayCircle, RefreshCw, ShoppingBag } from "lucide-react";
import type { CourseFile, CourseModule, PaidCourseUpdate } from "../types/course";
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
  notes: Parameters<typeof NotesPanel>[0]["notes"];
  noteDraft: string;
  onNoteDraft: (value: string) => void;
  onSaveNote: () => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  productTitle: string;
  noteModuleTitle?: string | null;
  noteResourceTitle?: string | null;
}

const TABS: Array<{ key: DockTab; label: string; icon: (active: boolean) => ReactNode }> = [
  { key: "modules", label: "Module", icon: () => <BookOpen size={17} /> },
  { key: "resources", label: "Resource", icon: () => <FileText size={17} /> },
  { key: "notes", label: "Note", icon: () => <NotebookPen size={17} /> },
  { key: "paid", label: "Paid", icon: () => <ShoppingBag size={17} /> },
];

export default function CourseOverlay(props: CourseOverlayProps) {
  const { orientation, tab, open } = props;
  const activeIndex = TABS.findIndex((item) => item.key === tab);
  const landscape = orientation === "landscape";
  const notesHeight = landscape ? "50vw" : "50dvh";
  const defaultHeight = landscape ? "min(72vw, 380px)" : "72dvh";

  const sheetHeight = tab === "notes" ? notesHeight : defaultHeight;

  const flatModules = useMemo(() => flattenModules(props.modules), [props.modules]);

  return (
    <>
      {/* ── Overlay sheet ─────────────────────────────────────────────── */}
      <div
        className={`absolute z-40 overflow-hidden border-white/10 bg-[#11111d] shadow-2xl transition-all duration-300 ${
          landscape
            ? "bottom-0 right-16 top-0 border-l"
            : "bottom-16 inset-x-0 rounded-t-3xl border-t"
        } ${open ? (landscape ? "translate-x-0" : "translate-y-0") : landscape ? "translate-x-full" : "translate-y-full"}`}
        style={{ [landscape ? "width" : "height"]: sheetHeight }}
        data-course-overlay
        data-open={open ? "true" : "false"}
        data-orientation={orientation}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#10101a] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wider text-white/50" data-course-overlay-title>
              {TABS[activeIndex].label}s
            </p>
            <button onClick={props.onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-white/50" aria-label="Close overlay" data-course-overlay-close>
              <ChevronDown size={16} className={landscape ? "-rotate-90" : ""} />
            </button>
          </div>
          <div key={tab} className="min-h-0 flex-1 overflow-hidden animate-course-overlay-in" data-course-overlay-tab={tab}>
            {tab === "notes" ? (
              <NotesPanel
                notes={props.notes}
                draft={props.noteDraft}
                setDraft={props.onNoteDraft}
                onSave={props.onSaveNote}
                onEdit={props.onEditNote}
                onDelete={props.onDeleteNote}
                productTitle={props.productTitle}
                moduleTitle={props.noteModuleTitle}
                resourceTitle={props.noteResourceTitle}
              />
            ) : tab === "paid" ? (
              <PaidList {...props} />
            ) : (
              <ContentList {...props} flatModules={flatModules} mode={tab} />
            )}
          </div>
        </div>
      </div>

      {/* ── Dock ──────────────────────────────────────────────────────── */}
      <div
        className={`z-30 shrink-0 border-white/10 bg-[#10101a] ${landscape ? "flex w-16 flex-col border-l" : "h-16 border-t"}`}
        data-course-dock
        data-orientation={orientation}
      >
        <div className={`relative ${landscape ? "flex flex-1 flex-col" : "flex h-full"}`}>
          <span
            className={`absolute transition-transform duration-300 ease-out ${landscape ? "left-1.5 right-1.5 top-0 h-1/4" : "bottom-1.5 left-0 top-1.5 w-1/4"}`}
            style={{ transform: landscape ? `translateY(${activeIndex * 100}%)` : `translateX(${activeIndex * 100}%)` }}
            data-course-dock-indicator
          >
            <span className={`block h-full rounded-xl bg-violet-500/90 ${landscape ? "my-1.5" : "mx-1.5"}`} />
          </span>
          {TABS.map(({ key, label, icon }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => props.onTabChange(key)}
                className={`relative z-10 flex items-center justify-center gap-1.5 text-[10px] font-black transition-colors ${
                  landscape ? "flex-1 flex-col" : "flex-1 flex-col py-1"
                } ${active ? "text-white" : "text-white/40 hover:text-white/80"}`}
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

  if (visible.length === 0) {
    return <p className="grid h-full place-items-center px-6 text-center text-xs text-white/35">No {mode === "resources" ? "files" : "modules"} to show yet.</p>;
  }

  return (
    <div className="h-full overflow-y-auto p-3" data-course-overlay-list data-mode={mode}>
      {visible.map(({ module, depth }) => {
        const files = moduleFiles(module).filter(isVisibleFile);
        const moduleId = String(module.id);
        const accessible = props.accessibleModuleIds.has(moduleId);
        const preview = props.previewModuleIds.has(moduleId);
        const paidNotOwned = module.accessLevel === "paidUpdate" && Boolean(module.paidUpdateId) && !props.ownedUpdateIds.has(String(module.paidUpdateId));
        const locked = !accessible || paidNotOwned;
        const open = mode === "modules" && expanded.has(moduleId);

        // In resources mode, files are listed directly (no expand/collapse).
        const rowFiles = mode === "resources" ? files : open ? files : [];

        return (
          <div key={moduleId} className={depth ? "ml-3 border-l border-white/10 pl-2" : "mb-1"}>
            <button
              type="button"
              onClick={() => {
                if (mode === "modules") setExpanded((current) => { const next = new Set(current); next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId); return next; });
              }}
              disabled={mode === "resources"}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left ${mode === "resources" ? "cursor-default" : ""} ${locked ? "bg-amber-400/5" : "hover:bg-white/5"}`}
              data-course-overlay-module
              data-module-id={moduleId}
              data-locked={locked ? "true" : "false"}
              data-preview={preview ? "true" : "false"}
            >
              {mode === "modules" ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] font-black text-white/45">{depth + 1}</span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-xs font-black">{module.title}</span>
              {preview ? <Eye size={13} className="shrink-0 text-sky-300" /> : null}
              {locked && !preview ? <LockKeyhole size={13} className="shrink-0 text-amber-400" /> : null}
              {mode === "modules" && files.length > 0 ? (
                open ? <ChevronDown size={15} className="shrink-0 text-white/40" /> : <ChevronRight size={15} className="shrink-0 text-white/40" />
              ) : null}
            </button>

            {/* Locked paid module buy CTA */}
            {locked && paidNotOwned ? (
              <div className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
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
              <div className="space-y-1 pb-2">
                {rowFiles.map((file) => {
                  const Icon = fileIcon(file);
                  const fileLocked = locked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateKey(file)));
                  return (
                    <button
                      key={file.id}
                      disabled={fileLocked}
                      onClick={() => props.onSelectFile(file)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] transition ${
                        props.selectedFileId === file.id ? "bg-violet-500 text-white" : fileLocked ? "cursor-not-allowed bg-amber-400/5 text-white/35" : "text-white/65 hover:bg-white/5 hover:text-white"
                      }`}
                      data-course-overlay-file
                      data-file-id={file.id}
                      data-locked={fileLocked ? "true" : "false"}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      {fileLocked ? <LockKeyhole size={12} className="text-amber-400" /> : null}
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
  const paidModules = props.modules
    .flatMap((module) => {
      const collect = (node: CourseModule): CourseModule[] => [
        ...(node.accessLevel === "paidUpdate" ? [node] : []),
        ...(node.modules || []).flatMap(collect),
      ];
      return collect(module);
    })
    .filter((module) => !props.ownedUpdateIds.has(updateKey(module)));

  const showUpdates = props.updates.length > 0;

  return (
    <div className="h-full overflow-y-auto p-3" data-course-overlay-paid>
      {showUpdates && (
        <div className="mb-3 space-y-2">
          {props.updates.map((update) => (
            <div key={update.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black">{update.title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-white/45">{update.contentNames.slice(0, 3).join(" · ")}</p>
                </div>
                <span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span>
              </div>
              <button onClick={() => props.onBuyUpdate(update)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2 text-[11px] font-black text-slate-950" data-course-overlay-buy-update={update.id}>
                <ShoppingBag size={13} /> Buy this update
              </button>
            </div>
          ))}
        </div>
      )}

      {paidModules.length === 0 ? (
        <p className="grid h-40 place-items-center px-6 text-center text-xs text-white/35">
          {showUpdates ? "No locked paid modules." : "No paid content for this course."}
        </p>
      ) : (
        <div className="space-y-2">
          {paidModules.map((module) => (
            <div key={module.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <RefreshCw size={15} className="shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black">{module.title}</p>
                  {module.paidUpdatePrice ? <p className="text-[10px] font-bold text-amber-300">₹{Number(String(module.paidUpdatePrice).replace(/[^0-9.-]/g, "")).toLocaleString("en-IN")}</p> : null}
                </div>
              </div>
              <button
                onClick={() => props.onBuyModule({ id: module.id, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice })}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1.5 text-[10px] font-black text-slate-950"
                data-course-overlay-buy-module={module.id}
              >
                <ShoppingBag size={11} /> Buy
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
