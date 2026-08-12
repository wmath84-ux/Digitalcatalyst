import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, FileSpreadsheet, FileText, FormInput, LockKeyhole, PlayCircle, RefreshCw, ShoppingBag } from "lucide-react";
import type { CourseFile, CourseModule, PaidCourseUpdate } from "../types/course";

interface SidebarProps {
  modules: CourseModule[];
  selectedId?: string;
  ownedUpdateIds: Set<string>;
  mode: "curriculum" | "resources";
  updates: PaidCourseUpdate[];
  onSelect: (file: CourseFile) => void;
  onBuyUpdate: (update: PaidCourseUpdate) => void;
}

const updateId = (item: { id: string; paidUpdateId?: string }) => String(item.paidUpdateId || item.id);
const moduleFiles = (module: CourseModule): CourseFile[] => {
  const embedded = module.embedContentUrl ? [{
    id: `${module.id}__embedded-page`,
    name: module.embedContentTypeLabel || (module.embedContentTypeId === "github_page" ? "Interactive GitHub Page" : "Embedded resource"),
    type: module.embedContentTypeId === "google_doc" ? "doc" as const : "link" as const,
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
const isLesson = (file: CourseFile) => ["youtube", "video", "audio", "quiz"].includes(file.type);
const iconFor = (file: CourseFile) => {
  if (file.type === "youtube" || file.type === "video") return PlayCircle;
  if (file.type === "pdf") return FileText;
  if (file.type === "sheet") return FileSpreadsheet;
  if (file.type === "google_form") return FormInput;
  return File;
};

export default function CourseSidebar(props: SidebarProps) {
  const initialOpen = useMemo(() => new Set(props.modules.slice(0, 1).map((module) => module.id)), [props.modules]);
  const [openModules, setOpenModules] = useState(initialOpen);
  const [updatesOpen, setUpdatesOpen] = useState(false);

  const toggle = (id: string) => setOpenModules((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#11111d] text-white">
      {props.updates.length > 0 && (
        <div className="shrink-0 border-b border-white/10 p-3">
          <button onClick={() => setUpdatesOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/10 p-3 text-left ring-1 ring-amber-400/20">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-slate-950"><RefreshCw size={17} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-amber-200">{props.updates.length} update{props.updates.length === 1 ? "" : "s"} available</span><span className="block truncate text-[10px] text-white/45">View new modules, files and individual prices</span></span>{updatesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {updatesOpen && <div className="mt-2 space-y-2">{props.updates.map((update) => <div key={update.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{update.title}</p><p className="mt-1 text-[10px] leading-4 text-white/45">{update.contentNames.slice(0, 3).join(" · ")}</p></div><span className="shrink-0 text-xs font-black text-amber-300">₹{update.price.toLocaleString("en-IN")}</span></div><button onClick={() => props.onBuyUpdate(update)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2 text-[11px] font-black text-slate-950"><ShoppingBag size={13} /> Buy this update</button></div>)}</div>}
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
  const moduleLocked = inheritedLocked || (module.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateId(module)));
  const visibleFiles = moduleFiles(module).filter((file) => file.accessLevel !== "hidden" && (props.mode === "curriculum" ? isLesson(file) : !isLesson(file) || ["pdf", "doc", "sheet", "google_form", "ebook", "link", "image"].includes(file.type)));
  const hasChildren = visibleFiles.length > 0 || (module.modules || []).length > 0;

  return <div className={`${depth ? "ml-3 border-l border-white/10 pl-2" : "mb-2"}`}>
    <button onClick={() => toggle(module.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left hover:bg-white/5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] font-black text-white/45">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-black">{module.title}</span>{moduleLocked && <LockKeyhole size={13} className="text-amber-400" />}{hasChildren && (open ? <ChevronDown size={15} className="text-white/40" /> : <ChevronRight size={15} className="text-white/40" />)}</button>
    {open && <div className="space-y-1 pb-2">{visibleFiles.map((file) => { const Icon = iconFor(file); const locked = moduleLocked || (file.accessLevel === "paidUpdate" && !props.ownedUpdateIds.has(updateId(file))); return <button key={file.id} disabled={locked} onClick={() => props.onSelect(file)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] transition ${props.selectedId === file.id ? "bg-violet-500 text-white" : locked ? "cursor-not-allowed bg-amber-400/5 text-white/35" : "text-white/65 hover:bg-white/5 hover:text-white"}`}><Icon size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{file.name}</span>{locked && <LockKeyhole size={12} className="text-amber-400" />}</button>; })}{(module.modules || []).map((child, childIndex) => <ModuleGroup key={child.id} module={child} index={childIndex} depth={depth + 1} inheritedLocked={moduleLocked} openModules={openModules} toggle={toggle} {...props} />)}</div>}
  </div>;
}
