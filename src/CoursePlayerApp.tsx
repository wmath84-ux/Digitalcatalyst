import { useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, BookOpen, Bot, CheckCircle2, FileText, Menu, NotebookPen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { db } from "../firebase";
import AiQuestion from "./course/AiQuestion";
import CourseSidebar from "./course/CourseSidebar";
import NotesPanel from "./course/NotesPanel";
import ResourceViewer from "./course/ResourceViewer";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, CoursePlayerNote, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";
import { useCourseAccess } from "./hooks/useCourseAccess";

type Tab = "curriculum" | "resources" | "notes" | "ai";

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
 * Part 10 + Part 11: find the first file the user can actually
 * open. The access source is determined by the resolver
 * (`useCourseAccess`) so per-module ownership, paid updates,
 * subscription grants, and preview flags all participate.
 *
 * `inheritedLocked` is set when a parent module was already
 * locked (e.g. a paid-update module whose update the user
 * does not own). Nested modules inherit the lock.
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
  const visit = (module: CourseModule) => {
    if (module.accessLevel === "paidUpdate") add(module, module.title);
    (module.files || []).forEach((file) => { if (file.accessLevel === "paidUpdate") add(file, file.name); });
    (module.modules || []).forEach(visit);
  };
  const add = (item: CourseModule | CourseFile, contentName: string) => {
    const id = accessId(item);
    const current = map.get(id) || { id, title: item.paidUpdateTitle || "Course update", price: numericPrice(item.paidUpdatePrice), coinPrice: Number(item.paidUpdateCoinPrice || 0), contentNames: [] };
    current.contentNames.push(contentName);
    current.price = Math.max(current.price, numericPrice(item.paidUpdatePrice));
    current.coinPrice = Math.max(current.coinPrice, Number(item.paidUpdateCoinPrice || 0));
    map.set(id, current);
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
  // Part 10 — the single source of truth for access. The
  // resolver is consumed here so per-module ownership, paid
  // updates, subscription grants, and preview flags all
  // participate in the lock state.
  const { resolution, hasActiveSubscription } = useCourseAccess({ product });
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [tab, setTab] = useState<Tab>("curriculum");
  const [panelOpen, setPanelOpen] = useState(true);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [lastOpenedFileId, setLastOpenedFileId] = useState<string | null>(null);
  const ownedUpdateIds = resolution.ownedUpdateIds;
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);
  const moduleTitleById = useMemo(() => collectModuleTitleById(modules), [modules]);

  // Find the parent module of a given file. Used to tag new
  // notes with the module / resource the user is currently
  // viewing.
  const selectedFileModuleId = useMemo(() => {
    if (!selectedFile) return null;
    const visit = (node: CourseModule): string | null => {
      const files = filesInModule(node);
      if (files.some((f) => f.id === selectedFile.id)) return String(node.id);
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

  // Subscribe to the progress doc; persists last opened file,
  // completed files, notes, and the user's last known access
  // source. Multi-device sync is automatic via Firestore.
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

  // When the resolver / files change, pick the first
  // accessible file unless the user already had a selection
  // OR the persisted "lastOpenedFileId" is still available.
  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    const first = firstAccessibleFile(modules, resolution.accessibleModuleIds);
    if (first) setSelectedFile(first);
  }, [files, resolution.accessibleModuleIds, selectedFile, modules]);

  // Resume the last opened file when the Firestore listener
  // delivers the id. Part 11 spec — "Resume last file".
  useEffect(() => {
    if (!lastOpenedFileId || selectedFile) return;
    const match = files.find((file) => file.id === lastOpenedFileId);
    if (match && resolution.accessibleModuleIds.has(String((match as CourseFile & { parentModuleId?: string }).parentModuleId || ""))) {
      setSelectedFile(match);
    }
  }, [files, lastOpenedFileId, resolution.accessibleModuleIds, selectedFile]);

  const markComplete = async () => {
    if (!user || !selectedFile || !progressRef) return;
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
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const editNote = async (id: string, nextText: string) => {
    if (!user || !progressRef) return;
    const next = notes.map((note) => note.id === id ? { ...note, text: nextText, updatedAt: Date.now() } : note);
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const deleteNote = async (id: string) => {
    if (!user || !progressRef) return;
    const next = notes.filter((note) => note.id !== id);
    await setDoc(progressRef, { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const selectFile = (file: CourseFile) => {
    setSelectedFile(file);
    if (window.innerWidth < 768) document.getElementById("course-viewer")?.scrollIntoView({ behavior: "smooth" });
    if (user && progressRef) {
      void setDoc(progressRef, { productId: product.id, lastOpenedFileId: file.id, lastOpenedAt: serverTimestamp() }, { merge: true });
    }
  };

  const openCommunityAi = () => {
    const prompt = aiDraft.trim() || `Help me understand ${selectedFile?.name || product.title}.`;
    sessionStorage.setItem("aiInitialPrompt", prompt);
    sessionStorage.setItem("aiCourseContext", JSON.stringify({ productId: product.id, courseTitle: product.title, fileId: selectedFile?.id || "", fileName: selectedFile?.name || "" }));
    window.location.hash = "#/ai-chat";
  };

  const handleBuyModule = (module: { id: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string }) => {
    if (!module.paidUpdateId) return;
    const update = updates.find((u) => u.id === module.paidUpdateId) || { id: module.paidUpdateId, title: module.paidUpdateTitle || "Course update", price: numericPrice(module.paidUpdatePrice), coinPrice: 0, contentNames: [] } as PaidCourseUpdate;
    onPurchaseUpdate(update);
  };

  // Total files exclude preview-only modules (their completion
  // does not count toward progress).
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

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#090912] text-white" data-course-player>
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
        <button onClick={() => setPanelOpen((value) => !value)} className="hidden h-10 items-center gap-2 rounded-xl bg-white/5 px-3 text-xs font-bold text-white/70 md:flex" data-course-toggle-panel>{panelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}{panelOpen ? "Hide panel" : "Course panel"}</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section id="course-viewer" className="flex min-h-[42dvh] min-w-0 flex-1 flex-col md:min-h-0">
          <div className="min-h-0 flex-1"><ResourceViewer file={selectedFile} /></div>
          {selectedFile && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#10101a] px-4 py-3" data-course-mark-complete-bar>
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
          )}
        </section>

        <aside className={`${panelOpen ? "h-[58dvh] md:h-auto md:w-[390px]" : "h-0 md:h-auto md:w-0"} flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#11111d] transition-[width] duration-300`} data-course-side-panel>
          <div className="flex shrink-0 border-b border-white/10 bg-[#10101a] p-2">
            <TabButton active={tab === "curriculum"} onClick={() => setTab("curriculum")} icon={<BookOpen size={14} />} label="Modules" dataAttr="data-course-tab-curriculum" />
            <TabButton active={tab === "resources"} onClick={() => setTab("resources")} icon={<FileText size={14} />} label="Resources" dataAttr="data-course-tab-resources" />
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={<NotebookPen size={14} />} label="Notes" dataAttr="data-course-tab-notes" />
            <TabButton active={tab === "ai"} onClick={() => setTab("ai")} icon={<Bot size={14} />} label="AI Q&A" dataAttr="data-course-tab-ai" />
          </div>
          <div className="min-h-0 flex-1" data-course-tab-panel data-active-tab={tab}>
            {tab === "notes" ? (
              <NotesPanel
                notes={notes}
                draft={noteDraft}
                setDraft={setNoteDraft}
                onSave={() => void saveNote()}
                onEdit={(id, text) => void editNote(id, text)}
                onDelete={(id) => void deleteNote(id)}
                productTitle={product.title}
                moduleTitle={selectedFileModuleId ? moduleTitleById[selectedFileModuleId] || null : null}
                resourceTitle={selectedFile?.name || null}
              />
            ) : tab === "ai" ? (
              <AiQuestion draft={aiDraft} setDraft={setAiDraft} fileName={selectedFile?.name} onOpen={openCommunityAi} />
            ) : (
              <CourseSidebar
                modules={modules}
                selectedId={selectedFile?.id}
                ownedUpdateIds={ownedUpdateIds}
                mode={tab}
                updates={updates}
                accessibleModuleIds={resolution.accessibleModuleIds}
                previewModuleIds={resolution.previewModuleIds}
                moduleAccessSources={resolution.moduleAccessSources}
                unmetDependencies={resolution.unmetDependencies}
                moduleTitleById={moduleTitleById}
                onBuyModule={handleBuyModule}
                onSelect={selectFile}
                onBuyUpdate={onPurchaseUpdate}
              />
            )}
          </div>
        </aside>
      </div>

      {!panelOpen && <button onClick={() => setPanelOpen(true)} className="fixed bottom-5 right-5 z-30 hidden items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-xs font-black shadow-xl md:flex"><Menu size={16} /> Modules & resources</button>}
    </div>
  );
}

function TabButton({ active, onClick, icon, label, dataAttr }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; dataAttr?: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-black ${active ? "bg-violet-500 text-white" : "text-white/40 hover:text-white"}`} data-active={active ? "true" : "false"} {...(dataAttr ? { [dataAttr]: "true" } : {})}>
      {icon}{label}
    </button>
  );
}
