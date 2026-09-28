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
        className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6 lg:p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col sm:max-h-[85vh] sm:max-w-lg md:max-w-xl lg:max-w-2xl"
        >
          <GlassSurface radius={24} className="flex flex-col overflow-hidden text-fp-text" contentClassName="flex flex-col overflow-hidden p-0">
            {/* Header — responsive, flexible */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5 md:px-6">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl md:h-11 md:w-11"
                style={{ background: `${meta.color}26`, color: meta.color }}
              >
                <Icon className="h-5 w-5 md:h-6 md:w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-fp-muted md:text-xs">
                  {isEditing ? "Edit" : "New"} · Direct on FlowPath
                </p>
                <h2 className="font-display truncate text-lg font-semibold text-fp-text md:text-xl">
                  {isEditing ? `Edit ${meta.label}` : `${meta.label} — Plan Today`}
                </h2>
              </div>
              <GlassButton onClick={onClose} className="ml-auto shrink-0 [&_.size-12]:size-8 md:[&_.size-12]:size-9" aria-label="Close">
                <X className="h-4 w-4" />
              </GlassButton>
            </div>

            {/* Body — scrollable, responsive grid */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 md:p-6">
              <div className="space-y-4 md:space-y-5">
                <div className="grid gap-4 md:grid-cols-2 md:gap-5">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Title</label>
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`e.g. ${placeholderFor(type)}`}
                      className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none md:py-3.5 md:text-[15px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Date & time — when to place on stair</label>
                    <input
                      type="datetime-local"
                      value={datetimeLocal}
                      onChange={(e) => setDatetimeLocal(e.target.value)}
                      className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none [color-scheme:dark] md:py-3.5 md:text-[15px]"
                    />
                  </div>
                </div>

                {type === "task" && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Priority</label>
                    <GlassToggleGroup className="dc-segment w-full" value={priority} onValueChange={(next) => setPriority(next as Priority)} aria-label="Priority">
                      {(["low", "medium", "high"] as Priority[]).map((p) => (
                        <GlassToggleItem key={p} value={p} className="flex-1 px-3 py-2.5 text-xs font-medium capitalize md:py-3 md:text-sm">
                          {p}
                        </GlassToggleItem>
                      ))}
                    </GlassToggleGroup>
                  </div>
                )}

                {type === "schedule" && (
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Start</label>
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none [color-scheme:dark] md:py-3.5" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">End</label>
                      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none [color-scheme:dark] md:py-3.5" />
                    </div>
                  </div>
                )}

                {type === "revision" && (
                  <div>
                    <div className="mb-1.5 flex justify-between text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <GlassSlider min={0} max={100} step={1} value={progress} onValueChange={setProgress} ariaLabel="Progress" className="w-full" />
                  </div>
                )}

                {type === "mcq" && (
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Total questions</label>
                      <input type="number" min={1} value={totalQuestions} onChange={(e) => setTotalQuestions(Number(e.target.value))} className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none md:py-3.5" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Completed</label>
                      <input type="number" min={0} value={completedQuestions} onChange={(e) => setCompletedQuestions(Number(e.target.value))} className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none md:py-3.5" />
                    </div>
                  </div>
                )}

                {(type === "note" || type === "other" || type === "reminder") && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">
                      {type === "note" ? "Preview / content" : "Notes (optional)"}
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="dc-field w-full resize-none rounded-2xl border px-4 py-3 text-sm text-fp-text outline-none md:min-h-[100px] md:text-[15px]"
                      placeholder="Add a little detail... This will be scheduled directly on your selected stair"
                    />
                  </div>
                )}

                {type === "task" && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">Description (optional)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="dc-field w-full resize-none rounded-2xl border px-4 py-3 text-sm text-fp-text outline-none md:text-[15px]"
                      placeholder="Add details for this task..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer — responsive, sticky */}
            <div className="border-t border-white/10 p-4 sm:p-5 md:p-6">
              <div className="flex gap-2.5 md:gap-3">
                <GlassButton variant="capsule" onClick={onClose} className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4 md:[&>span>div]:h-12">
                  Cancel
                </GlassButton>
                <button
                  type="submit"
                  className="flex flex-1 min-h-[44px] items-center justify-center rounded-full text-sm font-semibold text-white transition hover:brightness-110 md:min-h-[48px] md:text-[15px]"
                  style={{ background: meta.color }}
                >
                  {isEditing ? "Save changes" : "Create & schedule on stair"}
                </button>
              </div>
              <p className="mt-2.5 text-center text-[10px] leading-5 text-white/40 md:text-[11px]">Will be scheduled directly on your selected stair — no need to leave FlowPath. Flexible for mobile, tablet, desktop.</p>
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
      return "Daily reminder — e.g. Drink water";
    case "schedule":
      return "Creator Session — e.g. Deep work";
    case "note":
      return "Quick Notes — e.g. Video Ideas";
    case "revision":
      return "Physics — Chapter 4";
    case "mcq":
      return "Biology Practice — Schedule Test";
    default:
      return "Plan weekend trip";
  }
}
