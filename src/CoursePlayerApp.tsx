import { useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { playSfxAdd, playSfxComplete, playSfxRemove } from "./utils/sfx";
import { db } from "../firebase";
import ResourceViewer from "./course/ResourceViewer";
import CourseOverlay, { type DockTab } from "./course/CourseOverlay";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";
import { useCourseAccess } from "./hooks/useCourseAccess";

interface CoursePlayerProps {
  product: Product;
  onBack: () => void;
  onPurchaseUpdate: (update: PaidCourseUpdate) => void;
}

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

export default function CoursePlayer({ product, onBack, onPurchaseUpdate }: CoursePlayerProps) {
  const { user } = useAuth();
  const modules = product.courseContent || [];
  const files = useMemo(() => allFiles(modules).filter((file) => file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId)), [modules]);
  const { resolution, hasActiveSubscription } = useCourseAccess({ product });
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [lastOpenedFileId, setLastOpenedFileId] = useState<string | null>(null);
  // Bottom dock state — the single overlay is reused across the four toggles.
  const [dockTab, setDockTab] = useState<DockTab>("modules");
  const [dockOpen, setDockOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const ownedUpdateIds = resolution.ownedUpdateIds;
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);
  const moduleTitleById = useMemo(() => collectModuleTitleById(modules), [modules]);

  // Detect orientation for the landscape layout (header left, toggles right,
  // content rotated to fill the space).
  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(media.matches);
    update();
    media.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Find the parent module of the currently selected file (note tagging).
  const selectedFileModuleId = useMemo(() => {
    if (!selectedFile) return null;
    const visit = (node: CourseModule): string | null => {
      if (filesInModule(node).some((f) => f.id === selectedFile.id)) return String(node.id);
      for (const child of node.modules || []) {
        const inner = visit(child);
        if (inner) return inner;
      }
      return null;
    };
    for (const module of modules) {
      const found = visit(module);
      if (found) return found;
    }
    return null;
  }, [modules, selectedFile]);

  const progressRef = useMemo(() => (user ? doc(db, "users", user.id, "courseProgress", product.id) : null), [product.id, user]);

  useEffect(() => {
    if (!user || !progressRef) return undefined;
    const unsubscribeProgress = onSnapshot(progressRef, (snapshot) => {
      const data = snapshot.data() || {};
      setCompletedIds(new Set(Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : []));
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setLastOpenedFileId(typeof data.lastOpenedFileId === "string" ? data.lastOpenedFileId : null);
    });
    return () => { unsubscribeProgress(); };
  }, [progressRef, user]);

  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    const first = firstAccessibleFile(modules, resolution.accessibleModuleIds);
    if (first) setSelectedFile(first);
  }, [files, resolution.accessibleModuleIds, selectedFile, modules]);

  // Resume the last opened file when the Firestore listener
  // delivers the id.
  useEffect(() => {
    if (!lastOpenedFileId || selectedFile) return;
    const match = files.find((file) => file.id === lastOpenedFileId);
    if (match && resolution.accessibleModuleIds.has(String((match as CourseFile & { parentModuleId?: string }).parentModuleId || ""))) {
      setSelectedFile(match);
    }
  }, [files, lastOpenedFileId, resolution.accessibleModuleIds, selectedFile]);

  const markComplete = async () => {
    if (!user || !selectedFile || !progressRef) return;
    playSfxComplete();
    await setDoc(progressRef, { productId: product.id, completedFileIds: arrayUnion(selectedFile.id), lastOpenedFileId: selectedFile.id, lastOpenedAt: serverTimestamp(), accessSource: resolution.hasFullProductAccess ? "full_product" : (resolution.ownedModuleIds.size > 0 ? "module_purchase" : (resolution.subscriptionGrantedModuleIds.size > 0 ? "subscription" : "locked")), updatedAt: serverTimestamp() }, { merge: true });
  };

  const saveNote = async () => {
    if (!user || !progressRef || !noteDraft.trim()) return;
    const trimmed = noteDraft.trim();
    setNoteDraft("");
    const next: CoursePlayerNote[] = [
      { id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed, createdAt: Date.now(), moduleId: selectedFileModuleId || undefined, resourceId: selectedFile?.id || undefined },
      ...notes,
    ];
    setNotes(next);
    playSfxAdd();
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const editNote = async (id: string, nextText: string) => {
    if (!user || !progressRef) return;
    const next = notes.map((note) => note.id === id ? { ...note, text: nextText, updatedAt: Date.now() } : note);
    setNotes(next);
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const deleteNote = async (id: string) => {
    if (!user || !progressRef) return;
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    playSfxRemove();
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const selectFile = (file: CourseFile) => {
    setSelectedFile(file);
    // Close the overlay so the user sees the freshly opened content.
    setDockOpen(false);
    if (window.innerWidth < 768) document.getElementById("course-viewer")?.scrollIntoView({ behavior: "smooth" });
    if (user && progressRef) {
      void setDoc(progressRef, { productId: product.id, lastOpenedFileId: file.id, lastOpenedAt: serverTimestamp() }, { merge: true });
    }
  };

  const handleBuyModule = (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => {
    if (!module.paidUpdateId) return;
    const update = updates.find((u) => u.id === module.paidUpdateId) || { id: module.paidUpdateId, title: module.paidUpdateTitle || "Course update", price: numericPrice(module.paidUpdatePrice), coinPrice: 0, contentNames: [] } as PaidCourseUpdate;
    onPurchaseUpdate(update);
  };

  const handleDockTabChange = (next: DockTab) => {
    if (next === dockTab) {
      setDockOpen((open) => !open);
    } else {
      setDockTab(next);
      setDockOpen(true);
    }
  };

  const totalEligibleFiles = useMemo(() => {
    const inaccessibleModuleIds = resolution.lockedModuleIds;
    return files.filter((file) => {
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
  }, [files, modules, resolution.lockedModuleIds]);

  const progress = totalEligibleFiles.length ? Math.round((completedIds.size / totalEligibleFiles.length) * 100) : 0;

  const markCompleteBar = selectedFile ? (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#10101a] px-4 py-2.5" data-course-mark-complete-bar>
      <div className="min-w-0">
        <p className="truncate text-xs font-black" data-course-selected-name>{selectedFile.name}</p>
        <p className="text-[10px] text-white/35">Progress is saved to your Firebase account</p>
      </div>
      <button
        disabled={completedIds.has(selectedFile.id)}
        onClick={() => void markComplete()}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-slate-950 disabled:bg-emerald-500/15 disabled:text-emerald-300"
        data-course-mark-complete
        data-completed={completedIds.has(selectedFile.id) ? "true" : "false"}
      >
        <CheckCircle2 size={14} />
        {completedIds.has(selectedFile.id) ? "Completed" : "Mark complete"}
      </button>
    </div>
  ) : null;

  const overlay = (
    <CourseOverlay
      orientation={isLandscape ? "landscape" : "portrait"}
      tab={dockTab}
      onTabChange={handleDockTabChange}
      open={dockOpen}
      onToggle={() => setDockOpen((open) => !open)}
      onClose={() => setDockOpen(false)}
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
      notes={notes}
      noteDraft={noteDraft}
      onNoteDraft={setNoteDraft}
      onSaveNote={() => void saveNote()}
      onEditNote={(id, text) => void editNote(id, text)}
      onDeleteNote={(id) => void deleteNote(id)}
      productTitle={product.title}
      noteModuleTitle={selectedFileModuleId ? moduleTitleById[selectedFileModuleId] || null : null}
      noteResourceTitle={selectedFile?.name || null}
    />
  );

  // ── Landscape: header left (vertical), content rotated, toggles right ──
  if (isLandscape) {
    return (
      <div className="relative flex h-[100dvh] w-full flex-row overflow-hidden bg-[#090912] text-white" data-course-player data-orientation="landscape">
        {/* Left vertical header */}
        <header className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-white/10 bg-[#10101a] py-3" data-course-landscape-header>
          <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/70" aria-label="Back" data-course-back><ArrowLeft size={18} /></button>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <span className="line-clamp-1 max-h-full text-xs font-black [writing-mode:vertical-rl] rotate-180" data-course-product-title>{product.title}</span>
          </div>
          <div className="flex flex-col items-center gap-2" data-course-progress-summary>
            <div className="relative h-24 w-1.5 overflow-hidden rounded-full bg-white/10" data-course-progress-bar>
              <div className="absolute bottom-0 w-full bg-gradient-to-t from-violet-500 to-cyan-400" style={{ height: `${progress}%` }} data-course-progress-fill data-progress-value={progress} />
            </div>
            <span className="text-[9px] font-bold text-white/40" data-course-progress-label>{progress}%</span>
          </div>
        </header>

        {/* Rotated content area */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 flex flex-col" style={{ width: "100dvh", height: "calc(100vw - 8rem)", transform: "translate(-50%, -50%) rotate(90deg)" }}>
            <div className="min-h-0 flex-1"><ResourceViewer file={selectedFile} /></div>
            {markCompleteBar}
          </div>
        </div>

        {overlay}
      </div>
    );
  }

  // ── Portrait: header top, content full-bleed, dock bottom ──
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#090912] text-white" data-course-player data-orientation="portrait">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#10101a] px-3 sm:px-5">
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/70" aria-label="Back" data-course-back><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-black sm:text-base" data-course-product-title>{product.title}</h1>
          <div className="mt-1 flex items-center gap-2" data-course-progress-summary>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10" data-course-progress-bar>
              <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${progress}%` }} data-course-progress-fill data-progress-value={progress} />
            </div>
            <span className="text-[10px] font-bold text-white/40" data-course-progress-label>{progress}% complete</span>
            {hasActiveSubscription ? (
              <span data-course-subscription-badge="active" className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">Active subscription</span>
            ) : null}
            {resolution.previewModuleIds.size > 0 ? (
              <span data-course-preview-badge className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20">Preview mode</span>
            ) : null}
          </div>
        </div>
      </header>

      <section id="course-viewer" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1"><ResourceViewer file={selectedFile} /></div>
        {markCompleteBar}
      </section>

      {overlay}
    </div>
  );
}
