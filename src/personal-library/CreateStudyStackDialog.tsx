import { useState } from "react";
import Modal from "../components/ui/Modal";
import type { PersonalCourseModule, PersonalCourseResource } from "../lib/personalCourseClient";
import { createStudyStack } from "../lib/studyPackClient";
import { personalCourseTypeLabel } from "../../utils/personalCourse";
import { trackStudyShareEvent as trackFeatureEvent } from "../utils/featureAnalytics";

export default function CreateStudyStackDialog({
  open,
  module,
  onClose,
  onStart,
}: {
  open: boolean;
  module: PersonalCourseModule | null;
  onClose: () => void;
  onStart: (stackId: string, steps: PersonalCourseResource[]) => void;
}) {
  const [title, setTitle] = useState(module ? `${module.title} Stack` : "Study Stack");
  const [order, setOrder] = useState<string[]>(module?.resources.map((item) => item.id) || []);
  const [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!module) return null;
  const move = (index: number, delta: number) => {
    const next = [...order];
    const dest = index + delta;
    if (dest < 0 || dest >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(dest, 0, item);
    setOrder(next);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await createStudyStack({ moduleId: module.id, title, resourceIds: order, includePractice: practice });
      trackFeatureEvent("study_stack_created", { steps: order.length });
      const steps = order.map((id) => module.resources.find((item) => item.id === id)).filter(Boolean) as PersonalCourseResource[];
      onStart(result.stack.id, steps);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the stack.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Create Study Stack" maxWidth="max-w-lg">
      <div className="space-y-4">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm" />
        <ol className="space-y-2">
          {order.map((id, index) => {
            const resource = module.resources.find((item) => item.id === id);
            if (!resource) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm">
                <span className="w-6 font-black text-white/40">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{resource.name}</span>
                <span className="text-[10px] uppercase text-white/40">{personalCourseTypeLabel(resource.type)}</span>
                <button type="button" onClick={() => move(index, -1)} className="min-h-11 px-2">↑</button>
                <button type="button" onClick={() => move(index, 1)} className="min-h-11 px-2">↓</button>
              </li>
            );
          })}
        </ol>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={practice} onChange={(event) => setPractice(event.target.checked)} /> Add a practice step (opens AI questions after resources)</label>
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <button type="button" onClick={() => void save()} disabled={busy || !order.length} className="min-h-11 w-full rounded-full bg-violet-600 text-sm font-black">{busy ? "Saving…" : "Save and Start"}</button>
      </div>
    </Modal>
  );
}
