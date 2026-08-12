import { useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, BookOpen, Bot, CheckCircle2, FileText, Menu, NotebookPen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { db } from "../firebase";
import AiQuestion from "./course/AiQuestion";
import CourseSidebar from "./course/CourseSidebar";
import ResourceViewer from "./course/ResourceViewer";
import type { Product } from "./data/products";
import type { CourseFile, CourseModule, PaidCourseUpdate } from "./types/course";
import { useAuth } from "./context/AuthContext";

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
    type: module.embedContentTypeId === "google_doc" ? "doc" as const : "link" as const,
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
const firstAccessibleFile = (modules: CourseModule[], owned: Set<string>, inheritedLocked = false): CourseFile | null => {
  for (const module of modules) {
    if (module.accessLevel === "hidden") continue;
    const moduleLocked = inheritedLocked || (module.accessLevel === "paidUpdate" && !owned.has(accessId(module)));
    const file = filesInModule(module).find((item) => item.accessLevel !== "hidden" && !moduleLocked && (item.accessLevel !== "paidUpdate" || owned.has(accessId(item))));
    if (file) return file;
    const nested = firstAccessibleFile(module.modules || [], owned, moduleLocked);
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

export default function CoursePlayer({ product, onBack, onPurchaseUpdate }: CoursePlayerProps) {
  const { user } = useAuth();
  const modules = product.courseContent || [];
  const files = useMemo(() => allFiles(modules).filter((file) => file.accessLevel !== "hidden"), [modules]);
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [tab, setTab] = useState<Tab>("curriculum");
  const [panelOpen, setPanelOpen] = useState(true);
  const [ownedUpdateIds, setOwnedUpdateIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Array<{ id: string; text: string; createdAt: number }>>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);

  useEffect(() => {
    if (!user) return undefined;
    const progressRef = doc(db, "users", user.id, "courseProgress", product.id);
    const unsubscribeProgress = onSnapshot(progressRef, (snapshot) => {
      const data = snapshot.data() || {};
      setCompletedIds(new Set(Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : []));
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    });
    const unsubscribeUser = onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
      const map = data.purchasedProductUpdateIds || {};
      setOwnedUpdateIds(new Set(Array.isArray(map[product.id]) ? map[product.id].map(String) : []));
    });
    return () => { unsubscribeProgress(); unsubscribeUser(); };
  }, [product.id, user]);

  useEffect(() => {
    if (selectedFile || files.length === 0) return;
    const first = firstAccessibleFile(modules, ownedUpdateIds);
    if (first) setSelectedFile(first);
  }, [files, ownedUpdateIds, selectedFile]);

  const markComplete = async () => {
    if (!user || !selectedFile) return;
    await setDoc(doc(db, "users", user.id, "courseProgress", product.id), { productId: product.id, completedFileIds: arrayUnion(selectedFile.id), lastOpenedFileId: selectedFile.id, updatedAt: serverTimestamp() }, { merge: true });
  };

  const saveNote = async () => {
    if (!user || !noteDraft.trim()) return;
    const next = [{ id: crypto.randomUUID(), text: noteDraft.trim(), createdAt: Date.now() }, ...notes];
    setNoteDraft("");
    await setDoc(doc(db, "users", user.id, "courseProgress", product.id), { productId: product.id, notes: next, updatedAt: serverTimestamp() }, { merge: true });
  };

  const selectFile = (file: CourseFile) => {
    setSelectedFile(file);
    if (window.innerWidth < 768) document.getElementById("course-viewer")?.scrollIntoView({ behavior: "smooth" });
    if (user) void setDoc(doc(db, "users", user.id, "courseProgress", product.id), { productId: product.id, lastOpenedFileId: file.id, lastOpenedAt: serverTimestamp() }, { merge: true });
  };

  const openCommunityAi = () => {
    const prompt = aiDraft.trim() || `Help me understand ${selectedFile?.name || product.title}.`;
    sessionStorage.setItem("aiInitialPrompt", prompt);
    sessionStorage.setItem("aiCourseContext", JSON.stringify({ productId: product.id, courseTitle: product.title, fileId: selectedFile?.id || "", fileName: selectedFile?.name || "" }));
    window.location.hash = "#/ai-chat";
  };

  const progress = files.length ? Math.round((completedIds.size / files.length) * 100) : 0;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#090912] text-white">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#10101a] px-3 sm:px-5">
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/70" aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-black sm:text-base">{product.title}</h1><div className="mt-1 flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${progress}%` }} /></div><span className="text-[10px] font-bold text-white/40">{progress}% complete</span></div></div>
        <button onClick={() => setPanelOpen((value) => !value)} className="hidden h-10 items-center gap-2 rounded-xl bg-white/5 px-3 text-xs font-bold text-white/70 md:flex">{panelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}{panelOpen ? "Hide panel" : "Course panel"}</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section id="course-viewer" className="flex min-h-[42dvh] min-w-0 flex-1 flex-col md:min-h-0">
          <div className="min-h-0 flex-1"><ResourceViewer file={selectedFile} /></div>
          {selectedFile && <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#10101a] px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-black">{selectedFile.name}</p><p className="text-[10px] text-white/35">Progress is saved to your Firebase account</p></div><button disabled={completedIds.has(selectedFile.id)} onClick={() => void markComplete()} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-slate-950 disabled:bg-emerald-500/15 disabled:text-emerald-300"><CheckCircle2 size={14} />{completedIds.has(selectedFile.id) ? "Completed" : "Mark complete"}</button></div>}
        </section>

        <aside className={`${panelOpen ? "h-[58dvh] md:h-auto md:w-[390px]" : "h-0 md:h-auto md:w-0"} flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#11111d] transition-[width] duration-300`}>
          <div className="flex shrink-0 border-b border-white/10 bg-[#10101a] p-2">
            <TabButton active={tab === "curriculum"} onClick={() => setTab("curriculum")} icon={<BookOpen size={14} />} label="Modules" />
            <TabButton active={tab === "resources"} onClick={() => setTab("resources")} icon={<FileText size={14} />} label="Resources" />
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={<NotebookPen size={14} />} label="Notes" />
            <TabButton active={tab === "ai"} onClick={() => setTab("ai")} icon={<Bot size={14} />} label="AI Q&A" />
          </div>
          <div className="min-h-0 flex-1">{tab === "notes" ? <Notes notes={notes} draft={noteDraft} setDraft={setNoteDraft} onSave={() => void saveNote()} /> : tab === "ai" ? <AiQuestion draft={aiDraft} setDraft={setAiDraft} fileName={selectedFile?.name} onOpen={openCommunityAi} /> : <CourseSidebar modules={modules} selectedId={selectedFile?.id} ownedUpdateIds={ownedUpdateIds} mode={tab} updates={updates} onSelect={selectFile} onBuyUpdate={onPurchaseUpdate} />}</div>
        </aside>
      </div>

      {!panelOpen && <button onClick={() => setPanelOpen(true)} className="fixed bottom-5 right-5 z-30 hidden items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-xs font-black shadow-xl md:flex"><Menu size={16} /> Modules & resources</button>}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-black ${active ? "bg-violet-500 text-white" : "text-white/40 hover:text-white"}`}>{icon}{label}</button>; }
function Notes({ notes, draft, setDraft, onSave }: { notes: Array<{ id: string; text: string; createdAt: number }>; draft: string; setDraft: (value: string) => void; onSave: () => void }) { return <div className="h-full overflow-y-auto p-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} placeholder="Write a course note…" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400" /><button disabled={!draft.trim()} onClick={onSave} className="mt-2 w-full rounded-xl bg-violet-500 py-2.5 text-xs font-black disabled:opacity-40">Save note</button><div className="mt-4 space-y-2">{notes.map((note) => <div key={note.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="whitespace-pre-wrap text-xs leading-5 text-white/75">{note.text}</p><p className="mt-2 text-[10px] text-white/30">{new Date(note.createdAt).toLocaleString("en-IN")}</p></div>)}</div></div>; }
