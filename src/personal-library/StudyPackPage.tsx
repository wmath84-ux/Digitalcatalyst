import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, FolderPlus, LoaderCircle, Share2, Sparkles } from "lucide-react";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import Modal from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { usePersonalModules } from "../hooks/usePersonalModules";
import {
  fetchStudyPack,
  importStudyPack,
  studyPackShareUrl,
  updateStudyPack,
  type StudyPackPreview,
  type StudyPackVisibility,
} from "../lib/studyPackClient";
import { personalCourseTypeLabel } from "../../utils/personalCourse";
import { trackStudyShareEvent as trackFeatureEvent } from "../utils/featureAnalytics";

const packIdFromHash = () => {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const match = hash.match(/^#\/pack\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

const navigateFromBottom = (tab: TabKey) => {
  if (tab === "home") window.location.hash = "#/home";
  else if (tab === "myday") window.location.hash = "#/my-day";
  else if (tab === "store") window.location.hash = "#/store";
  else if (tab === "purchases") window.location.hash = "#/store/purchases";
  else if (tab === "profile") window.location.hash = "#/profile";
};

export default function StudyPackPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const [packId] = useState(packIdFromHash);
  const [pack, setPack] = useState<StudyPackPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStudyPack(packId)
      .then((result) => {
        if (cancelled) return;
        setPack(result.pack);
        trackFeatureEvent("study_pack_opened", { visibility: result.pack.visibility, public: result.pack.visibility === "public" });
        if (result.pack.visibility === "public") trackFeatureEvent("public_pack_viewed", { pack: result.pack.id });
        document.title = `${result.pack.title} — Study Pack | Digitalcatalyst`;
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This Study Pack isn't available.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; document.title = "Digitalcatalyst"; };
  }, [packId]);

  const copyLink = async () => {
    const url = studyPackShareUrl(packId);
    try {
      await navigator.clipboard.writeText(url);
      trackFeatureEvent("share_clicked", { method: "copy" });
      trackFeatureEvent("study_pack_shared", { method: "copy" });
    } catch { /* ignore */ }
  };

  const nativeShare = async () => {
    const url = studyPackShareUrl(packId);
    trackFeatureEvent("share_clicked", { method: "native" });
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: pack?.title || "Study Pack", text: pack?.description || "A Digitalcatalyst Study Pack", url }); trackFeatureEvent("study_pack_shared", { method: "native" }); } catch { /* cancelled */ }
    } else {
      await copyLink();
    }
  };

  return (
    <div className="min-h-screen text-white" data-study-pack-page>
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col lg:max-w-full">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          title="Study Pack"
          subtitle={pack?.title || "Shared learning"}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            <button type="button" onClick={() => { window.location.hash = user ? "#/study-library" : "#/home"; }} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-white/70">
              <ArrowLeft size={16} /> Back
            </button>
            {loading ? (
              <div className="grid min-h-64 place-items-center rounded-3xl border border-white/10 bg-white/[0.04]"><LoaderCircle className="h-8 w-8 animate-spin text-violet-200" /></div>
            ) : error || !pack ? (
              <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-center"><p className="font-black">{error || "This Study Pack isn't available."}</p></div>
            ) : (
              <>
                <header className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Study Pack</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">{pack.title}</h1>
                  {pack.description ? <p className="mt-2 text-sm font-medium leading-6 text-white/60">{pack.description}</p> : null}
                  <p className="mt-3 text-xs font-bold text-white/45">{pack.creatorDisplayName} · {pack.resourceCount} resources · v{pack.version}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setImportOpen(true)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black sm:flex-none">
                      <Download size={16} /> Import to My Library
                    </button>
                    <button type="button" onClick={() => void nativeShare()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-sm font-black"><Share2 size={16} /> Share</button>
                    <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-sm font-black"><Copy size={16} /> Copy link</button>
                    {pack.isOwner ? <OwnerVisibility pack={pack} onUpdated={setPack} /> : null}
                  </div>
                </header>
                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-black">What's inside</h2>
                  <p className="mt-1 text-xs text-white/50">{Object.entries(pack.typeCounts).map(([type, count]) => `${count} ${personalCourseTypeLabel(type)}`).join(" · ") || "No typed resources"}</p>
                  <ul className="mt-4 space-y-2">
                    {pack.resources.map((resource) => (
                      <li key={resource.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-sm font-black">{resource.name}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">{personalCourseTypeLabel(resource.type)}</p>
                        {resource.availability && !resource.availability.readable ? <p className="mt-1 text-[11px] text-amber-200/80">{resource.availability.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
                {pack.aiStudyAvailable ? (
                  <section className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-5">
                    <h2 className="inline-flex items-center gap-2 text-sm font-black"><Sparkles size={16} /> AI Study Overview</h2>
                    <p className="mt-2 text-sm leading-6 text-white/65">After you import this pack, Ask AI, summaries, questions and flashcards run only on the copied resources in your library — never on the creator's private notes or chats.</p>
                  </section>
                ) : (
                  <p className="text-xs text-white/45">AI cannot claim to have read unreadable files in this pack. Import first, then use Study Mode on your own copy.</p>
                )}
              </>
            )}
          </div>
        </main>
        <BottomNav active="home" onChange={navigateFromBottom} purchasesBadge={purchasedIds.size} />
      </div>
      {pack ? <ImportDialog open={importOpen} pack={pack} signedIn={Boolean(user)} onClose={() => setImportOpen(false)} busy={busy} setBusy={setBusy} /> : null}
    </div>
  );
}

function OwnerVisibility({ pack, onUpdated }: { pack: StudyPackPreview; onUpdated: (pack: StudyPackPreview) => void }) {
  const change = async (visibility: StudyPackVisibility) => {
    const result = await updateStudyPack({ packId: pack.id, visibility });
    onUpdated(result.pack);
  };
  return (
    <label className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 px-3 text-xs font-black">
      Visibility
      <select className="bg-transparent text-white" defaultValue={pack.visibility} onChange={(event) => void change(event.target.value as StudyPackVisibility)}>
        <option value="private">Private</option>
        <option value="unlisted">Link access</option>
        <option value="public">Public</option>
      </select>
    </label>
  );
}

function ImportDialog({ open, pack, signedIn, onClose, busy, setBusy }: { open: boolean; pack: StudyPackPreview; signedIn: boolean; onClose: () => void; busy: boolean; setBusy: (value: boolean) => void }) {
  const { user } = useAuth();
  const personal = usePersonalModules(user?.id, "__library__", { autoLoad: signedIn, scope: "all" });
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState(pack.title);
  const [error, setError] = useState("");
  const modules = personal.allModules;
  const destinationReady = mode === "new" || Boolean(moduleId);

  const submit = async () => {
    if (!signedIn) {
      sessionStorage.setItem("authReturnHash", window.location.hash);
      window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(window.location.hash)}`;
      return;
    }
    if (busy) return;
    setBusy(true); setError("");
    trackFeatureEvent("study_pack_import_started", { destination: mode });
    try {
      const result = await importStudyPack({ packId: pack.id, destination: mode, moduleId: mode === "existing" ? moduleId : undefined, title });
      trackFeatureEvent("study_pack_imported", { imported: result.imported, skipped: result.skipped });
      onClose();
      window.location.hash = "#/study-library";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      setError(message);
      if (String((err as { code?: string }).code || "").includes("LIMIT")) trackFeatureEvent("import_limit_reached", {});
    } finally {
      setBusy(false);
    }
  };

  const template = async () => {
    if (!signedIn) { submit(); return; }
    setBusy(true);
    try {
      await importStudyPack({ packId: pack.id, destination: "new", title: `${pack.title} copy` });
      trackFeatureEvent("study_pack_remixed", {});
      onClose();
      window.location.hash = "#/study-library";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use as template.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Import to My Library" maxWidth="max-w-lg">
      <div className="space-y-4">
        {!signedIn ? <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm">Preview is open. Sign in to import this pack into your own library.</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("new")} className={`min-h-11 rounded-2xl text-xs font-black ${mode === "new" ? "bg-violet-600" : "bg-white/10"}`}>New module</button>
          <button type="button" onClick={() => setMode("existing")} className={`min-h-11 rounded-2xl text-xs font-black ${mode === "existing" ? "bg-violet-600" : "bg-white/10"}`}>Existing module</button>
        </div>
        {mode === "new" ? (
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm" />
        ) : (
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm">
            <option value="">Choose a module</option>
            {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
          </select>
        )}
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => void template()} disabled={busy} className="min-h-11 rounded-full border border-white/10 px-4 text-sm font-black"><FolderPlus size={14} className="mr-1 inline" /> Use as template</button>
          <button type="button" onClick={() => void submit()} disabled={busy || (signedIn && !destinationReady)} className="min-h-11 rounded-full bg-violet-600 px-5 text-sm font-black">
            {busy ? "Importing…" : signedIn ? "Import" : "Sign in to import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
