// src/flowpath/components/BulkRevisionCreator.tsx
//
// The "2-3 tests at once" flow the user explicitly asked for.
//
//   • Toggle "Create multiple" to expand the form into 2 or 3
//     slots (the UI supports up to 5; the server's bulk cap is
//     50 so admin-only flows can go higher).
//   • Each slot has its own test config (subjects, difficulty,
//     question count, mode, estimated time). Slots are independent
//     so an admin can ship "easy / medium / hard" in one click
//     or "Math / Physics / Chemistry" in another.
//   • All slots share a single `batchId` so the audit feed groups
//     them as one logical action and the user's Revision bank
//     shows them as a cluster.
//   • Each slot becomes its own FlowPath activity in the master
//     copy; the server mirrors the ones that pass capacity +
//     plan gates into users/{uid}/revisionTests/{id} and the
//     others get a per-slot error in the response.

import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "../../components/ui/glass-select";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import type { FlowPathActivity } from "../types/flowpath";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";

interface BulkRevisionCreatorProps {
  open: boolean;
  onClose: () => void;
  uid: string;
  onBulkCreate: (items: Array<Partial<FlowPathActivity>>) => Promise<{ ok: boolean; error?: string; results?: Array<{ ok: boolean; error?: string }> }>;
}

const DEFAULT_TEST_CONFIG = {
  totalQuestions: 10,
  difficulty: "medium" as const,
  questionMode: "mixed" as const,
  estimatedMinutes: 15,
};

const DIFFICULTY_PRESETS: Record<"easy" | "medium" | "hard" | "mixed", { questions: number; minutes: number; label: string }> = {
  easy: { questions: 10, minutes: 12, label: "Easy" },
  medium: { questions: 15, minutes: 20, label: "Medium" },
  hard: { questions: 20, minutes: 30, label: "Hard" },
  mixed: { questions: 15, minutes: 20, label: "Mixed" },
};

export function BulkRevisionCreator({ open, onClose, uid, onBulkCreate }: BulkRevisionCreatorProps) {
  const [slots, setSlots] = useState<Array<{ title: string; difficulty: keyof typeof DIFFICULTY_PRESETS; questions: number; minutes: number }>>([
    { title: "Revision Test 1 — Easy", difficulty: "easy", questions: 10, minutes: 12 },
    { title: "Revision Test 2 — Medium", difficulty: "medium", questions: 15, minutes: 20 },
    { title: "Revision Test 3 — Hard", difficulty: "hard", questions: 20, minutes: 30 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ ok: boolean; error?: string }> | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");
  const [applyPreset, setApplyPreset] = useState<"easy-medium-hard" | "manual" | "subjects">("easy-medium-hard");

  const setSlot = (index: number, patch: Partial<typeof slots[number]>) => {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const addSlot = () => {
    if (slots.length >= 5) return;
    setSlots((current) => [
      ...current,
      { title: `Revision Test ${current.length + 1}`, difficulty: "medium", questions: 15, minutes: 20 },
    ]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots((current) => current.filter((_, i) => i !== index));
  };

  const applyPresetEazyMediumHard = () => {
    setSlots([
      { title: "Revision Test 1 — Easy", difficulty: "easy", questions: 10, minutes: 12 },
      { title: "Revision Test 2 — Medium", difficulty: "medium", questions: 15, minutes: 20 },
      { title: "Revision Test 3 — Hard", difficulty: "hard", questions: 20, minutes: 30 },
    ]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setResults(null);
    try {
      const batchId = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const computed = scheduledFor ? computeScheduledFor(scheduledFor, timeStr) : null;
      const items: Array<Partial<FlowPathActivity>> = slots.map((slot, i) => ({
        id: `${batchId}-${i}`,
        uid,
        kind: "revision",
        title: slot.title,
        description: `Batch of ${slots.length} tests. Slot ${i + 1} of ${slots.length}.`,
        status: "active",
        scheduledFor: computed,
        createdBy: uid,
        source: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        batchId,
        batchIndex: i,
        testConfig: {
          ...DEFAULT_TEST_CONFIG,
          totalQuestions: slot.questions,
          difficulty: slot.difficulty,
          questionMode: slot.difficulty === "hard" ? "application" : slot.difficulty === "easy" ? "theory" : "mixed",
          estimatedMinutes: slot.minutes,
        },
      }));
      const result = await onBulkCreate(items);
      if (result.ok) {
        setResults(result.results || items.map(() => ({ ok: true })));
        // Close after a short delay so the user sees the green checkmarks.
        setTimeout(() => onClose(), 1200);
      } else {
        setError(result.error || "Bulk create failed.");
        if (result.results) setResults(result.results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk create failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          data-bulk-revision-creator
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            className="relative w-full max-w-[680px]"
          >
          {/* Wave 13: the creator is the pack GlassSurface (Dialog values) —
              no white panel, no indigo header gradient. */}
          <GlassSurface radius={24} className="text-white" contentClassName="flex max-h-[88vh] flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <h3 className="text-base font-black tracking-tight text-white">Create multiple tests</h3>
                <p className="mt-0.5 text-xs font-medium text-white/55">
                  Ship 2-3 revision tests in one click. Each slot becomes its own test in the bank.
                </p>
              </div>
              <GlassButton
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="disabled:opacity-40 [&_.size-12]:size-9"
              >
                <X className="h-4 w-4" />
              </GlassButton>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                <GlassToggleGroup
                  className="dc-segment"
                  value={applyPreset}
                  onValueChange={(next) => {
                    if (next === "easy-medium-hard") { setApplyPreset("easy-medium-hard"); applyPresetEazyMediumHard(); }
                    else setApplyPreset("manual");
                  }}
                  aria-label="Slot preset"
                >
                  <GlassToggleItem value="easy-medium-hard" data-preset="easy-medium-hard" className="px-3 py-1.5 text-xs font-bold">
                    Easy / Medium / Hard
                  </GlassToggleItem>
                  <GlassToggleItem value="manual" data-preset="manual" className="px-3 py-1.5 text-xs font-bold">
                    Manual per slot
                  </GlassToggleItem>
                </GlassToggleGroup>
              </div>

              <div className="space-y-2">
                {slots.map((slot, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 rounded-lg border border-white/10 p-2.5"
                    data-slot-index={i}
                  >
                    <input
                      type="text"
                      value={slot.title}
                      onChange={(e) => setSlot(i, { title: e.target.value })}
                      placeholder={`Test ${i + 1} title`}
                      className="dc-field col-span-5 rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                    />
                    {/* Wave 5: same preset side-effect (difficulty also writes
                        the question count + minutes), registry listbox instead
                        of a native popup the bulk creator could not style. */}
                    <GlassSelect
                      value={slot.difficulty}
                      onValueChange={(v) => {
                        const diff = v as keyof typeof DIFFICULTY_PRESETS;
                        const preset = DIFFICULTY_PRESETS[diff];
                        setSlot(i, { difficulty: diff, questions: preset.questions, minutes: preset.minutes });
                      }}
                    >
                      <GlassSelectTrigger
                        aria-label="Difficulty"
                        className="dc-glass-select col-span-3 h-9 w-full text-sm"
                      />
                      <GlassSelectContent className="dc-glass-select-pop" aria-label="Difficulty options">
                        {Object.entries(DIFFICULTY_PRESETS).map(([k, v]) => (
                          <GlassSelectItem key={k} value={k}>{v.label}</GlassSelectItem>
                        ))}
                      </GlassSelectContent>
                    </GlassSelect>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={slot.questions}
                      onChange={(e) => setSlot(i, { questions: Number(e.target.value || 0) })}
                      className="dc-field col-span-2 rounded-full border px-2 py-1.5 text-sm text-white outline-none"
                      title="Question count"
                    />
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={slot.minutes}
                      onChange={(e) => setSlot(i, { minutes: Number(e.target.value || 0) })}
                      className="dc-field col-span-1 rounded-full border px-2 py-1.5 text-sm text-white outline-none"
                      title="Estimated minutes"
                    />
                    <GlassButton
                      onClick={() => removeSlot(i)}
                      disabled={slots.length <= 1}
                      aria-label="Remove slot"
                      className="col-span-1 justify-self-center disabled:opacity-30 [&_.size-12]:size-8 [&_svg]:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </GlassButton>
                  </div>
                ))}
              </div>

              <GlassButton
                variant="capsule"
                onClick={addSlot}
                disabled={slots.length >= 5}
                className="mt-2 w-full disabled:opacity-40 [&>span>div]:h-9 [&>span>div]:w-full [&>span>div]:rounded-lg [&>span>div]:text-xs [&>span>div]:font-semibold"
              >
                <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add slot ({slots.length}/5)</span>
              </GlassButton>

              <div className="mt-4 rounded-xl border border-white/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">Schedule (optional)</p>
                <p className="mt-0.5 text-[11px] text-white/55">Leave blank to send immediately.</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="dc-field rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                  />
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="dc-field rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                  />
                </div>
              </div>

              {error ? (
                <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
              ) : null}
              {results ? (
                <div className="mt-3 space-y-1 rounded-lg border border-white/10 p-3">
                  {results.map((r, i) => (
                    <p key={i} className={`text-xs ${r.ok ? "text-emerald-300" : "text-rose-300"}`}>
                      Test {i + 1}: {r.ok ? "✓ Created" : r.error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
              <span className="text-[11px] text-white/55">{slots.length} test{slots.length === 1 ? "" : "s"} will be created with shared batchId.</span>
              <div className="flex items-center gap-2">
                <GlassButton
                  variant="capsule"
                  onClick={onClose}
                  disabled={submitting}
                  className="disabled:opacity-40 [&>span>div]:h-10 [&>span>div]:px-3 [&>span>div]:text-sm [&>span>div]:font-semibold"
                >
                  Cancel
                </GlassButton>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || slots.length === 0}
                  data-submit-bulk
                  className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {submitting ? "Creating…" : `Create ${slots.length} test${slots.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </GlassSurface>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function computeScheduledFor(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const ts = Date.parse(`${dateStr}T${timeStr}:00`);
  return Number.isFinite(ts) ? ts : null;
}
