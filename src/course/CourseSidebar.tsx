// src/course/CourseSidebar.tsx
//
// Part 11 — Course Player sidebar. Lists every visible module
// in either "Modules" or "Resources" mode and renders each
// file with the correct access state:
//
//   - Accessible: violet/cyan, fully clickable.
//   - Paid update (not owned): amber lock + "Buy this update".
//   - Preview-only: sky-blue lock, no purchase CTA, no
//     completion reward (see CoursePlayerApp for the
//     completion bookkeeping).
//   - Locked module (purchasable, not owned): amber lock + CTA.
//   - Dependency-blocked: rose-tinted lock + "Requires …".
//   - Hidden: never rendered.
//
// The access state is driven by the Part 10 resolver (via
// `accessibleModuleIds` / `lockedModuleIds` / `unmetDependencies`).
// When the resolver is unavailable the sidebar still falls
// back to the legacy `ownedUpdateIds` check so older
// `courseContent`-shaped products render correctly.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, File, FileSpreadsheet, FileText, FormInput, Link2, LockKeyhole, PlayCircle, RefreshCw, ShoppingBag, Sparkles } from "lucide-react";
import type { CourseAccessSource } from "../../utils/courseAccess";
import type { CourseFile, CourseModule, PaidCourseUpdate } from "../types/course";

interface SidebarProps {
  modules: CourseModule[];
  selectedId?: string;
  ownedUpdateIds: Set<string>;
  mode: "curriculum" | "resources";
  updates: PaidCourseUpdate[];
  onSelect: (file: CourseFile) => void;
  onBuyUpdate: (update: PaidCourseUpdate) => void;
  /**
   * Part 11 — module ids the resolver says the user can open.
   * When provided, takes precedence over the legacy
   * `ownedUpdateIds` check.
   */
  accessibleModuleIds?: Set<string>;
  /**
   * Part 11 — module ids the resolver has marked as preview.
   * Surfaced with a soft sky lock and no purchase CTA.
   */
  previewModuleIds?: Set<string>;
  /**
   * Part 11 — per-module access source so the UI can decide
   * which CTA to render. When absent we default to
   * "locked" for everything outside the legacy access set.
   */
  moduleAccessSources?: Record<string, CourseAccessSource>;
  /**
   * Part 11 — modules whose required previous modules are
   * unmet. Surfaces the "Requires …" inline hint.
   */
  unmetDependencies?: Record<string, string[]>;
  /**
   * Part 11 — paid-update id of a module. Used to render the
   * "Buy this module" CTA on locked paid-update modules.
   */
  onBuyModule?: (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => void;
  /**
   * Title lookup so the dependency hint can show a human
   * readable name instead of a raw id.
   */
  moduleTitleById?: Record<string, string>;
}

const updateId = (item: { id: string; paidUpdateId?: string }) => String(item.paidUpdateId || item.id);
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

const isLesson = (file: CourseFile) => ["youtube", "video", "audio"].includes(file.type);

const iconFor = (file: CourseFile) => {
  if (file.type === "youtube" || file.type === "video") return PlayCircle;
  if (file.type === "pdf") return FileText;
  if (file.type === "sheet") return FileSpreadsheet;
  if (file.type === "slides") return FileText;
  if (file.type === "google_form") return FormInput;
  if (file.type === "embed" || file.type === "mindmap") return Link2;
  return File;
};

type ModuleLockState = {
  locked: boolean;
  source: CourseAccessSource;
  preview: boolean;
  /** True when this is a paid-update module the user hasn't bought yet. */
  paidUpdateNotOwned: boolean;
  /** True when this module is purchasable a-la-carte (Part 1). */
  purchasable: boolean;
  /** True when this module's dependency is unmet. */
  dependencyBlocked: boolean;
  /** First missing dependency's title (for the inline hint). */
  dependencyHint: string | null;
};

const computeLockState = (
  module: CourseModule,
  accessible: Set<string> | undefined,
  preview: Set<string> | undefined,
  sources: Record<string, CourseAccessSource> | undefined,
  unmet: Record<string, string[]> | undefined,
  ownedUpdates: Set<string>,
  titleById?: Record<string, string>,
): ModuleLockState => {
  const id = String(module.id);
  const source: CourseAccessSource = (sources?.[id] as CourseAccessSource) || "locked";
  const isPaidUpdate = module.accessLevel === "paidUpdate";
  const hasPaidUpdateId = Boolean(module.paidUpdateId);
  const isPurchasable = (module as CourseModule & { purchasable?: boolean }).purchasable === true;
  const paidUpdateNotOwned = hasPaidUpdateId && !ownedUpdates.has(String(module.paidUpdateId));
  const isPreview = Boolean(preview?.has(id));
  const isAccessible = source === "full_product" || source === "module_purchase" || source === "paid_update" || source === "subscription" || source === "resource_purchase" || (accessible?.has(id) ?? false);
  const dependencyMissing = unmet?.[id] || [];
  const dependencyBlocked = isAccessible && dependencyMissing.length > 0;
  const locked = !isAccessible || (isPaidUpdate && paidUpdateNotOwned) || dependencyBlocked;
  return {
    locked,
    source,
    preview: isPreview,
    paidUpdateNotOwned,
    purchasable: isPurchasable,
    dependencyBlocked,
    dependencyHint: dependencyMissing.length > 0 ? (titleById?.[dependencyMissing[0]] || dependencyMissing[0]) : null,
  };
};

export default function CourseSidebar(props: SidebarProps) {
  const initialOpen = useMemo(() => new Set(props.modules.slice(0, 1).map((module) => module.id)), [props.modules]);
  const [openModules, setOpenModules] = useState(initialOpen);
  const [updatesOpen, setUpdatesOpen] = useState(false);

  const toggle = (id: string) => setOpenModules((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#11111d] text-white" data-course-sidebar>
      {props.updates.length > 0 && (
        <div className="shrink-0 border-b border-white/10 p-3">
          <button onClick={() => setUpdatesOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/10 p-3 text-left ring-1 ring-amber-400/20">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-slate-950"><RefreshCw size={17} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-amber-200">{props.updates.length} update{props.updates.length === 1 ? "" : "s"} available</span><span className="block truncate text-[10px] text-white/45">View new modules, files and individual prices</span></span>{updatesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {updatesOpen && <div className="mt-2 space-y-2">{props.updates.map((update) => <div key={update.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{update.title}</p><p className="mt-1 text-[10px] leading-4 text-white/45">{update.contentNames.slice(0, 3).join(" · ")}</p></div><span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span></div><button onClick={() => props.onBuyUpdate(update)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2 text-[11px] font-black text-slate-950" data-course-sidebar-buy-update={update.id}><ShoppingBag size={13} /> Buy this update</button></div>)}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {props.modules.length === 0 ? <p className="py-10 text-center text-sm text-white/35">No course content has been published.</p> : props.modules.map((module, index) => <ModuleGroup key={module.id} module={module} index={index} depth={0} inheritedLocked={false} openModules={openModules} toggle={toggle} {...props} />)}
      </div>
    </div>
  );
}

function ModuleGroup({ module, index, depth, inheritedLocked, openModules, toggle, ...props }: SidebarProps & { module: CourseModule; index: number; depth: number; inheritedLocked: boolean; openModules: Set<string>; toggle: (id: string) => void }) {
  if (module.accessLevel === "hidden") return null;
  const open = openModules.has(module.id);
  const state = computeLockState(module, props.accessibleModuleIds, props.previewModuleIds, props.moduleAccessSources, props.unmetDependencies, props.ownedUpdateIds, props.moduleTitleById);
  const moduleLocked = inheritedLocked || state.locked;
  const visibleFiles = moduleFiles(module).filter((file) => file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId) && (props.mode === "curriculum" ? isLesson(file) : ["pdf", "doc", "sheet", "slides", "google_form", "ebook", "image", "embed", "mindmap"].includes(file.type)));
  const hasChildren = visibleFiles.length > 0 || (module.modules || []).length > 0;

  return (
    <div className={`${depth ? "ml-3 border-l border-white/10 pl-2" : "mb-2"}`} data-course-module-group data-module-id={module.id} data-locked={moduleLocked ? "true" : "false"}>
      <div className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left ${moduleLocked ? "bg-amber-400/5" : "hover:bg-white/5"}`}>
        <button onClick={() => toggle(module.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] font-black text-white/45">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-black">{module.title}</span>
        </button>
        {state.preview ? <Eye size={13} className="text-sky-300" data-course-module-preview /> : null}
        {state.dependencyBlocked ? <Sparkles size={13} className="text-rose-300" /> : null}
        {moduleLocked && !state.preview ? <LockKeyhole size={13} className="text-amber-400" data-course-module-lock /> : null}
        {hasChildren ? (
          <button onClick={() => toggle(module.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/40 hover:bg-white/5" aria-label={open ? "Collapse module" : "Expand module"}>
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : null}
      </div>
      {state.dependencyBlocked && state.dependencyHint ? (
        <p className="mx-3 mb-1 rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200" data-course-module-dependency>
          Requires: {state.dependencyHint}
        </p>
      ) : null}
      {moduleLocked && state.paidUpdateNotOwned ? (
        <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
          <p className="text-[10px] font-bold text-amber-200">Unlock with this update</p>
          <button
            type="button"
            onClick={() => {
              if (props.onBuyModule) {
                props.onBuyModule({ id: module.id, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle, paidUpdatePrice: module.paidUpdatePrice });
              } else if (module.paidUpdateId) {
                const update = props.updates.find((u) => u.id === module.paidUpdateId);
                if (update) props.onBuyUpdate(update);
              }
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-950"
            data-course-sidebar-buy-module={module.id}
          >
            <ShoppingBag size={11} /> {module.paidUpdateTitle || "Buy update"}
          </button>
        </div>
      ) : null}
      {open && (
        <div className="space-y-1 pb-2">
          {visibleFiles.map((file) => {
            const Icon = iconFor(file);
            const fileLocked = moduleLocked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateId(file)));
            return (
              <button
                key={file.id}
                disabled={fileLocked}
                onClick={() => props.onSelect(file)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] transition ${
                  props.selectedId === file.id ? "bg-violet-500 text-white" : fileLocked ? "cursor-not-allowed bg-amber-400/5 text-white/35" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
                data-course-sidebar-file
                data-file-id={file.id}
                data-locked={fileLocked ? "true" : "false"}
              >
                <Icon size={15} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                {fileLocked ? <LockKeyhole size={12} className="text-amber-400" /> : null}
              </button>
            );
          })}
          {(module.modules || []).map((child, childIndex) => (
            <ModuleGroup key={child.id} module={child} index={childIndex} depth={depth + 1} inheritedLocked={moduleLocked} openModules={openModules} toggle={toggle} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}
