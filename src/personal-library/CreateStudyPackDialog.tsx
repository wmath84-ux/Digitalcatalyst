import { useMemo, useState } from "react";
import Modal from "../components/ui/Modal";
import type { PersonalCourseModule } from "../lib/personalCourseClient";
import { createStudyPack, studyPackShareUrl, type StudyPackVisibility } from "../lib/studyPackClient";
import { personalCourseTypeLabel } from "../../utils/personalCourse";
import { countResourceTypes } from "../../utils/studyPacks";
import { trackStudyShareEvent as trackFeatureEvent } from "../utils/featureAnalytics";

export default function CreateStudyPackDialog({
  open,
  module,
  onClose,
}: {
  open: boolean;
  module: PersonalCourseModule | null;
  onClose: (created?: { packId: string; sharePath: string }) => void;
}) {
  const [title, setTitle] = useState(module?.title || "");
  const [description, setDescription] = useState(module?.description || "");
  const [visibility, setVisibility] = useState<StudyPackVisibility>("unlisted");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"edit" | "preview" | "done">("edit");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [packId, setPackId] = useState("");

  const resources = module?.resources || [];
  const chosen = useMemo(() => {
    const ids = Object.entries(selected).filter(([, on]) => on).map(([id]) => id);
    return ids.length ? resources.filter((item) => ids.includes(item.id)) : resources;
  }, [resources, selected]);
  const types = countResourceTypes(chosen);

  const publish = async () => {
    if (!module || busy) return;
    setBusy(true); setError("");
    try {
      const allSelected = chosen.length === resources.length;
      const result = await createStudyPack({
        moduleId: module.id,
        title: title.trim() || module.title,
        description,
        visibility,
        resourceIds: allSelected ? undefined : chosen.map((item) => item.id),
      });
      setPackId(result.pack.id);
      setShareUrl(studyPackShareUrl(result.pack.id));
      setStep("done");
      trackFeatureEvent("study_pack_created", { visibility, count: chosen.length });
      trackFeatureEvent("study_pack_published", { visibility });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't create the Study Pack.";
      setError(message);
      if (String((err as { code?: string }).code || "").includes("LIMIT") || String((err as { code?: string }).code || "").includes("DISABLED")) {
        trackFeatureEvent("pack_creation_limit_reached", {});
      }
    } finally {
      setBusy(false);
    }
  };

  if (!module) return null;
  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(packId ? { packId, sharePath: shareUrl } : undefined); }} title={step === "done" ? "Study Pack Created" : "Create Study Pack"} maxWidth="max-w-lg">
      {step === "edit" ? (
        <div className="space-y-4">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm" placeholder="Title" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm" placeholder="Description (optional)" />
          <div>
            <p className="mb-2 text-xs font-black text-white/70">Resources</p>
            <label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={Object.values(selected).filter(Boolean).length === 0 || chosen.length === resources.length} onChange={() => setSelected({})} /> Entire module</label>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {resources.map((resource) => (
                <label key={resource.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                  <input type="checkbox" checked={Object.values(selected).filter(Boolean).length === 0 || Boolean(selected[resource.id])} onChange={(event) => setSelected((current) => ({ ...current, [resource.id]: event.target.checked }))} />
                  <span className="min-w-0 truncate">{resource.name}</span>
                  <span className="ml-auto text-[10px] uppercase text-white/40">{personalCourseTypeLabel(resource.type)}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-black text-white/70">Visibility</p>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as StudyPackVisibility)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm">
              <option value="private">Private — only you</option>
              <option value="unlisted">Unlisted — anyone with the link</option>
              <option value="public">Public — listed in discovery</option>
            </select>
            {visibility === "public" ? <p className="mt-2 text-xs text-amber-200">Public packs show title, description, resource names/types and your approved display name. Private notes, AI chats, email and UID stay hidden.</p> : null}
          </div>
          <button type="button" onClick={() => setStep("preview")} className="min-h-11 w-full rounded-full bg-violet-600 text-sm font-black">Preview</button>
        </div>
      ) : null}
      {step === "preview" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Study Pack Preview</p>
            <h3 className="mt-1 text-lg font-black">{title || module.title}</h3>
            <p className="mt-2 text-sm text-white/60">Includes: {chosen.length} resources{Object.entries(types).map(([type, count]) => ` · ${count} ${personalCourseTypeLabel(type)}`).join("")}</p>
          </div>
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("edit")} className="min-h-11 flex-1 rounded-full border border-white/10 text-sm font-black">Back</button>
            <button type="button" onClick={() => void publish()} disabled={busy} className="min-h-11 flex-1 rounded-full bg-violet-600 text-sm font-black">{busy ? "Creating…" : "Create & Share"}</button>
          </div>
        </div>
      ) : null}
      {step === "done" ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70">Share this link. Friends can preview before they import.</p>
          <p className="break-all rounded-2xl bg-black/30 px-3 py-2 text-xs">{shareUrl}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { void navigator.clipboard.writeText(shareUrl); trackFeatureEvent("share_clicked", { method: "copy" }); }} className="min-h-11 rounded-2xl bg-white/10 text-xs font-black">Copy link</button>
            <button type="button" onClick={() => { window.location.hash = `#/pack/${packId}`; }} className="min-h-11 rounded-2xl bg-violet-600 text-xs font-black">Open pack</button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
