import { useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Minimize2, Moon, RotateCw, Sun } from "lucide-react";
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

// Notes are kept in the user's localStorage (per user + product) so they stay
// on the device and never collide with Firestore course progress.
const notesStorageKey = (uid: string, productId: string) => `dc.courseNotes.${uid}.${productId}`;
const loadLocalNotes = (uid: string, productId: string): CoursePlayerNote[] => {
  try {
    const raw = localStorage.getItem(notesStorageKey(uid, productId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const persistLocalNotes = (uid: string, productId: string, notes: CoursePlayerNote[]) => {
  try {
    localStorage.setItem(notesStorageKey(uid, productId), JSON.stringify(notes));
  } catch {
    /* storage full / private mode — ignore */
  }
};

type CoursePlayerTheme = "dark" | "light";
const courseThemeStorageKey = "dc.coursePlayerTheme";
const loadCourseTheme = (): CoursePlayerTheme => {
  try {
    return localStorage.getItem(courseThemeStorageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

export default function CoursePlayer({ product, onBack, onPurchaseUpdate }: CoursePlayerProps) {
  const { user } = useAuth();
  const modules = product.courseContent || [];
  const files = useMemo(() => allFiles(modules).filter((file) => file.accessLevel !== "hidden" && Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId)), [modules]);
  const { resolution, hasActiveSubscription } = useCourseAccess({ product });
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [lastOpenedFileId, setLastOpenedFileId] = useState<string | null>(null);
  // Bottom dock state — the single overlay is reused across the four toggles.
  const [dockTab, setDockTab] = useState<DockTab>("modules");
  const [dockOpen, setDockOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  // Immersive mode: rotates the viewer a quarter-turn so a portrait-locked
  // phone can still watch a video / read a wide sheet edge-to-edge.
  const [immersive, setImmersive] = useState(false);
  const [theme, setTheme] = useState<CoursePlayerTheme>(loadCourseTheme);
  const ownedUpdateIds = resolution.ownedUpdateIds;
  const updates = useMemo(() => collectUpdates(modules).filter((update) => !ownedUpdateIds.has(update.id)), [modules, ownedUpdateIds]);
  const moduleTitleById = useMemo(() => collectModuleTitleById(modules), [modules]);

  // Detect orientation for the landscape layout (header left, toggles right,
  // content filling the space between the two rails). Comparing the live
  // viewport as well as matchMedia covers mobile/PWA browsers whose media
  // query can lag behind the visual viewport during rotation.
  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(media.matches || window.innerWidth > window.innerHeight);
    update();
    media.addEventListener?.("change", update);
    window.screen.orientation?.addEventListener?.("change", update);
    window.visualViewport?.addEventListener?.("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener?.("change", update);
      window.screen.orientation?.removeEventListener?.("change", update);
      window.visualViewport?.removeEventListener?.("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The rotated immersive view only makes sense on a portrait viewport —
  // once the device is physically turned, drop back to the rail layout.
  useEffect(() => { if (isLandscape) setImmersive(false); }, [isLandscape]);

  // The preference is scoped to the Course Player and restored on the next
  // visit without changing the theme of the rest of the application.
  useEffect(() => {
    try {
      localStorage.setItem(courseThemeStorageKey, theme);
    } catch {
      /* private mode / storage disabled — keep the in-memory preference */
    }
  }, [theme]);

  // Escape leaves immersive mode.
  useEffect(() => {
    if (!immersive) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setImmersive(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);

  const progressRef = useMemo(() => (user ? doc(db, "users", user.id, "courseProgress", product.id) : null), [product.id, user]);

  useEffect(() => {
    if (!user || !progressRef) return undefined;
    const unsubscribeProgress = onSnapshot(progressRef, (snapshot) => {
      const data = snapshot.data() || {};
      setCompletedIds(new Set(Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : []));
      setLastOpenedFileId(typeof data.lastOpenedFileId === "string" ? data.lastOpenedFileId : null);
    });
    return () => { unsubscribeProgress(); };
  }, [progressRef, user]);

  // Notes live in localStorage (per user + product), not Firestore.
  useEffect(() => {
    setNotes(user?.id ? loadLocalNotes(user.id, product.id) : []);
  }, [user, product.id]);

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

  const saveNote = (text: string) => {
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: CoursePlayerNote[] = [
      { id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed, createdAt: Date.now() },
      ...notes,
    ];
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
    playSfxAdd();
  };

  const editNote = (id: string, nextText: string) => {
    if (!user) return;
    const next = notes.map((note) => note.id === id ? { ...note, text: nextText.trim(), updatedAt: Date.now() } : note);
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
  };

  const deleteNote = (id: string) => {
    if (!user) return;
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    persistLocalNotes(user.id, product.id, next);
    playSfxRemove();
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

  // Tapping the active toggle collapses the sheet; tapping a different
  // toggle keeps the SAME sheet open and swaps its content in place.
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
  const isDone = Boolean(selectedFile && completedIds.has(selectedFile.id));
  // A portrait-locked phone can enter the rotated landscape interface. It
  // must use the same left header + right dock as a physically rotated phone.
  const useLandscapeRails = isLandscape || immersive;
  const nextTheme = theme === "dark" ? "light" : "dark";

  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === "dark"}
      data-course-theme-toggle
      data-theme={theme}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  const markCompleteBar = selectedFile ? (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--course-border)] bg-[var(--course-surface)] px-4 py-2.5" data-course-mark-complete-bar>
      <div className="min-w-0">
        <p className="truncate text-xs font-black" data-course-selected-name>{selectedFile.name}</p>
        <p className="text-[10px] text-[var(--course-muted)]">Progress is saved to your account</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!useLandscapeRails ? (
          <button
            type="button"
            onClick={() => setImmersive(true)}
            className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
            aria-label="Rotate to fullscreen"
            title="Rotate to fullscreen"
            data-course-rotate-fullscreen
          >
            <RotateCw size={15} />
          </button>
        ) : null}
        <button
          disabled={isDone}
          onClick={() => void markComplete()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-slate-950 disabled:bg-emerald-500/15 disabled:text-emerald-300"
          data-course-mark-complete
          data-completed={isDone ? "true" : "false"}
        >
          <CheckCircle2 size={14} />
          {isDone ? "Completed" : "Mark complete"}
        </button>
      </div>
    </div>
  ) : null;

  const overlay = (
    <CourseOverlay
      orientation={useLandscapeRails ? "landscape" : "portrait"}
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
      onAddNote={(text) => saveNote(text)}
      onEditNote={(id, text) => editNote(id, text)}
      onDeleteNote={(id) => deleteNote(id)}
    />
  );

  // Both physical landscape and the quarter-turned mobile view share this
  // layout. This keeps the header rail on the left and the four-tab footer
  // navigation on the right instead of dropping all navigation in fullscreen.
  const landscapeLayout = (mobileRotated: boolean) => (
    <>
      <header
        className={`sticky left-0 top-0 z-50 flex h-full w-14 shrink-0 flex-col items-center border-r border-[var(--course-border)] bg-[var(--course-surface)] py-2 ${mobileRotated ? "gap-2" : "gap-3"}`}
        style={{ paddingLeft: mobileRotated ? "0px" : "env(safe-area-inset-left, 0px)" }}
        data-course-landscape-header
        data-course-mobile-landscape-header={mobileRotated ? "true" : undefined}
      >
        <button onClick={onBack} className="course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]" aria-label="Back" data-course-back><ArrowLeft size={18} /></button>
        {!mobileRotated ? themeToggle : null}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <span className="line-clamp-1 max-h-full text-xs font-black [writing-mode:vertical-rl] rotate-180" data-course-product-title>{product.title}</span>
        </div>
        {!mobileRotated && hasActiveSubscription ? (
          <span data-course-subscription-badge="active" className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30 [writing-mode:vertical-rl] rotate-180">Active subscription</span>
        ) : null}
        {!mobileRotated && resolution.previewModuleIds.size > 0 ? (
          <span data-course-preview-badge className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-2 text-[8px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20 [writing-mode:vertical-rl] rotate-180">Preview mode</span>
        ) : null}
        <div className="flex shrink-0 flex-col items-center gap-1.5" data-course-progress-summary>
          <div className={`relative w-1.5 overflow-hidden rounded-full bg-[var(--course-soft-hover)] ${mobileRotated ? "h-14" : "h-24"}`} data-course-progress-bar>
            <div className="absolute bottom-0 w-full bg-gradient-to-t from-violet-500 to-cyan-400" style={{ height: `${progress}%` }} data-course-progress-fill data-progress-value={progress} />
          </div>
          <span className="text-[9px] font-bold text-[var(--course-muted)]" data-course-progress-label>{progress}%</span>
        </div>
        {mobileRotated ? (
          <button
            type="button"
            onClick={() => setImmersive(false)}
            className="course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
            aria-label="Exit landscape view"
            title="Exit landscape view"
            data-course-exit-immersive
          >
            <Minimize2 size={16} />
          </button>
        ) : null}
      </header>

      {/* Content is strictly bounded between both rails, preventing embedded
          players from extending underneath the right-side navigation. */}
      <section id="course-viewer" className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden" data-course-landscape-content>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden"><ResourceViewer file={selectedFile} /></div>
          {markCompleteBar}
        </div>
        {overlay}
      </section>
    </>
  );

  // ── Immersive: quarter-turn the complete landscape UI on a portrait-locked
  // phone. Both side rails rotate with the viewer and remain interactive.
  if (immersive && !isLandscape) {
    return (
      <div className="fixed inset-0 z-[100] overflow-hidden bg-black" data-course-mobile-landscape-viewport>
        <div
          className="absolute left-1/2 top-1/2 origin-center overflow-hidden"
          style={{ width: "100dvh", height: "100dvw", transform: "translate(-50%, -50%) rotate(90deg)" }}
        >
          <div className="course-player-shell flex h-full w-full flex-row overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-player data-course-theme={theme} data-course-mobile-landscape="rails" data-orientation="immersive" style={{ colorScheme: theme }}>
            {landscapeLayout(true)}
          </div>
        </div>
      </div>
    );
  }

  // ── Landscape: header rail left, content centre, toggle rail right ──
  if (isLandscape) {
    return (
      <div className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-row overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="landscape" style={{ colorScheme: theme }}>
        {landscapeLayout(false)}
      </div>
    );
  }

  // ── Portrait: sticky header top, content full-bleed, sticky dock bottom ──
  return (
    <div className="course-player-shell fixed inset-0 flex h-[100dvh] flex-col overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-player data-course-theme={theme} data-orientation="portrait" style={{ colorScheme: theme }}>
      <header
        className="sticky top-0 z-50 flex shrink-0 items-center gap-3 border-b border-[var(--course-border)] bg-[var(--course-surface)] px-3 py-2.5 sm:px-5"
        style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))" }}
        data-course-header
      >
        <button onClick={onBack} className="course-icon-button grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--course-soft)] text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]" aria-label="Back" data-course-back><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-black sm:text-base" data-course-product-title>{product.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1" data-course-progress-summary>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--course-soft-hover)]" data-course-progress-bar>
              <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-500" style={{ width: `${progress}%` }} data-course-progress-fill data-progress-value={progress} />
            </div>
            <span className="text-[10px] font-bold text-[var(--course-muted)]" data-course-progress-label>{progress}% complete</span>
            {hasActiveSubscription ? (
              <span data-course-subscription-badge="active" className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">Active subscription</span>
            ) : null}
            {resolution.previewModuleIds.size > 0 ? (
              <span data-course-preview-badge className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20">Preview mode</span>
            ) : null}
          </div>
        </div>
        {themeToggle}
      </header>

      {/* Everything between the pinned header and the pinned dock. */}
      <section id="course-viewer" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden"><ResourceViewer file={selectedFile} /></div>
        {markCompleteBar}
        {overlay}
      </section>
    </div>
  );
}
