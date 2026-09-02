import { GlassSlider } from "../ui/glass-slider";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../ui/glass-toggle-group";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Activity, ActivityType, Priority } from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { ACTIVITY_ICONS } from "./icons";

interface CreateModalProps {
  type: ActivityType | null;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    datetime: string;
    extra?: Record<string, unknown>;
  }) => void;
  /**
   * When provided, the modal opens pre-populated with the activity's fields
   * and the "Create" button becomes "Save changes". The same onCreate callback
   * is used, so callers pass through the updated payload.
   */
  editing?: Activity | null;
}

function defaultDatetimeLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToDatetimeLocal(iso: string | undefined): string {
  if (!iso) return defaultDatetimeLocal();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultDatetimeLocal();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "4:30 PM" -> "16:30" for an <input type="time"> value. */
function labelToTimeInput(label: string | undefined): string {
  if (!label) return "16:00";
  const m = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return "16:00";
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function safePriority(value: unknown): Priority {
  return value === "low" || value === "high" ? value : "medium";
}

export function CreateModal({ type, onClose, onCreate, editing = null }: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [datetimeLocal, setDatetimeLocal] = useState(defaultDatetimeLocal());
  const [priority, setPriority] = useState<Priority>("medium");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [progress, setProgress] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [completedQuestions, setCompletedQuestions] = useState(0);

  // Pre-populate the form whenever the modal is opened in edit mode (or the
  // editing activity changes). When not editing, fall back to empty defaults.
  useEffect(() => {
    if (!editing) {
      setTitle("");
      setDescription("");
      setDatetimeLocal(defaultDatetimeLocal());
      setPriority("medium");
      setStartTime("16:00");
      setEndTime("17:00");
      setProgress(0);
      setTotalQuestions(10);
      setCompletedQuestions(0);
      return;
    }
    setTitle(editing.title);
    setDescription(editing.description ?? "");
    setDatetimeLocal(isoToDatetimeLocal(editing.datetime));
    if (editing.type === "task") {
      setPriority(safePriority((editing as { priority?: unknown }).priority));
    }
    if (editing.type === "schedule") {
      const a = editing as { startLabel?: string; endLabel?: string };
      setStartTime(labelToTimeInput(a.startLabel));
      setEndTime(labelToTimeInput(a.endLabel));
    }
    if (editing.type === "revision") {
      setProgress(Number((editing as { progress?: number }).progress ?? 0));
    }
    if (editing.type === "mcq") {
      const m = editing as { totalQuestions?: number; completedQuestions?: number };
      setTotalQuestions(Number(m.totalQuestions ?? 10));
      setCompletedQuestions(Number(m.completedQuestions ?? 0));
    }
  }, [editing]);

  if (typeof document === "undefined" || !type) return null;

  const meta = ACTIVITY_TYPE_META[type];
  const Icon = ACTIVITY_ICONS[type];
  const isEditing = !!editing;

  function reset() {
    setTitle("");
    setDescription("");
    setDatetimeLocal(defaultDatetimeLocal());
    setPriority("medium");
    setStartTime("16:00");
    setEndTime("17:00");
    setProgress(0);
    setTotalQuestions(10);
    setCompletedQuestions(0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    const datetime = new Date(datetimeLocal || defaultDatetimeLocal()).toISOString();
    const extra: Record<string, unknown> = {};
    if (type === "task") extra.priority = priority;
    if (type === "schedule") {
      extra.startLabel = formatTime(startTime);
      extra.endLabel = formatTime(endTime);
    }
    if (type === "note") extra.preview = description || "No preview yet.";
    if (type === "revision") extra.progress = progress;
    if (type === "mcq") {
      extra.totalQuestions = totalQuestions;
      extra.completedQuestions = completedQuestions;
    }

    onCreate({
      title: title.trim() || `New ${meta.label}`,
      description: description || undefined,
      datetime,
      extra,
    });
    reset();
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/55" onClick={onClose} />
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="relative z-10 w-full max-w-md"
        >
        {/* Wave 13c: the sheet is the pack GlassSurface (Dialog values) — the
            `.glass-panel-strong` gradient plate + glow shadow are gone. */}
        <GlassSurface radius={24} className="text-fp-text" contentClassName="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: `${meta.color}26`, color: meta.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-fp-muted">
                {isEditing ? "Edit" : "New"}
              </p>
              <h2 className="font-display text-lg font-semibold text-fp-text">
                {isEditing ? `Edit ${meta.label}` : meta.label}
              </h2>
            </div>
            <GlassButton
              onClick={onClose}
              className="ml-auto [&_.size-12]:size-8"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </GlassButton>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                Title
              </label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. ${placeholderFor(type)}`}
                className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                Date &amp; time
              </label>
              <input
                type="datetime-local"
                value={datetimeLocal}
                onChange={(e) => setDatetimeLocal(e.target.value)}
                className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none [color-scheme:dark]"
              />
            </div>

            {type === "task" && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                  Priority
                </label>
                <GlassToggleGroup className="dc-segment w-full" value={priority} onValueChange={(next) => setPriority(next as Priority)} aria-label="Priority">
                  {(["low", "medium", "high"] as Priority[]).map((p) => (
                    <GlassToggleItem key={p} value={p} className="flex-1 px-3 py-2 text-xs font-medium capitalize">
                      {p}
                    </GlassToggleItem>
                  ))}
                </GlassToggleGroup>
              </div>
            )}

            {type === "schedule" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            {type === "revision" && (
              <div>
                {/* Wave 6 (a11y): a <label> pointing at a `role="slider"` div
                    labels nothing, so the caption is plain text; the slider
                    carries its own accessible name. */}
                <div className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                {/* Wave 4: native range -> registry glass-slider (same 0-100
                    scale, same step-free drag semantics, plus keyboard). */}
                <GlassSlider
                  min={0}
                  max={100}
                  step={1}
                  value={progress}
                  onValueChange={setProgress}
                  ariaLabel="Progress"
                  className="w-full"
                />
              </div>
            )}

            {type === "mcq" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                    Total questions
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(Number(e.target.value))}
                    className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                    Completed
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={completedQuestions}
                    onChange={(e) => setCompletedQuestions(Number(e.target.value))}
                    className="dc-field w-full rounded-full border px-3.5 py-2.5 text-sm text-fp-text outline-none"
                  />
                </div>
              </div>
            )}

            {(type === "note" || type === "other" || type === "reminder") && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                  {type === "note" ? "Preview / content" : "Notes (optional)"}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="dc-field w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm text-fp-text outline-none"
                  placeholder="Add a little detail..."
                />
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2.5">
            <GlassButton
              variant="capsule"
              onClick={onClose}
              className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4"
            >
              Cancel
            </GlassButton>
            {/* the activity colour carries meaning (type), so it stays — as a
                solid fill, not a gradient + glow */}
            <button
              type="submit"
              className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ background: meta.color }}
            >
              {isEditing ? "Save changes" : "Create"}
            </button>
          </div>
        </GlassSurface>
        </motion.form>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function placeholderFor(type: ActivityType) {
  switch (type) {
    case "task":
      return "Study Mathematics";
    case "reminder":
      return "Call Mom";
    case "schedule":
      return "Creator Session";
    case "note":
      return "Video Ideas";
    case "revision":
      return "Physics — Chapter 4";
    case "mcq":
      return "Biology Practice";
    default:
      return "Plan weekend trip";
  }
}
