import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ActivityType, Priority } from "../../flowpath/types/flowpath";
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
}

function defaultDatetimeLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateModal({ type, onClose, onCreate }: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [datetimeLocal, setDatetimeLocal] = useState(defaultDatetimeLocal());
  const [priority, setPriority] = useState<Priority>("medium");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [progress, setProgress] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [completedQuestions, setCompletedQuestions] = useState(0);

  if (typeof document === "undefined" || !type) return null;

  const meta = ACTIVITY_TYPE_META[type];
  const Icon = ACTIVITY_ICONS[type];

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
        <div className="fp-overlay absolute inset-0" onClick={onClose} />
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="glass-panel-strong relative z-10 w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl sm:p-6"
          style={{ boxShadow: `0 0 60px -14px ${meta.glow}, 0 40px 90px -30px rgba(0,0,0,0.9)` }}
        >
          <div className="mb-4 flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: `${meta.color}26`, color: meta.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-fp-muted">New</p>
              <h2 className="font-display text-lg font-semibold text-fp-text">{meta.label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto grid h-8 w-8 place-items-center rounded-full text-fp-muted transition hover:bg-fp-surface-hover hover:text-fp-text"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
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
                className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3.5 py-2.5 text-sm text-fp-text placeholder-fp-text-30 outline-none transition focus:border-violet-400/60 focus:bg-fp-text-6"
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
                className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3.5 py-2.5 text-sm text-fp-text outline-none transition focus:border-violet-400/60 [color-scheme:dark]"
              />
            </div>

            {type === "task" && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                  Priority
                </label>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as Priority[]).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium capitalize transition ${
                        priority === p
                          ? "border-violet-400/60 bg-violet-400/15 text-fp-text"
                          : "border-fp-text-15 bg-fp-text-5 text-fp-muted hover:bg-fp-text-6"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
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
                    className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3 py-2.5 text-sm text-fp-text outline-none focus:border-violet-400/60 [color-scheme:dark]"
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
                    className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3 py-2.5 text-sm text-fp-text outline-none focus:border-violet-400/60 [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            {type === "revision" && (
              <div>
                <label className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-fp-muted">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-blue-400"
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
                    className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3 py-2.5 text-sm text-fp-text outline-none focus:border-violet-400/60"
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
                    className="w-full rounded-xl border border-fp-text-15 bg-fp-text-5 px-3 py-2.5 text-sm text-fp-text outline-none focus:border-violet-400/60"
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
                  className="w-full resize-none rounded-xl border border-fp-text-15 bg-fp-text-5 px-3.5 py-2.5 text-sm text-fp-text placeholder-fp-text-30 outline-none focus:border-violet-400/60"
                  placeholder="Add a little detail..."
                />
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-fp-text-15 bg-fp-text-5 py-2.5 text-sm font-medium text-fp-muted transition hover:bg-fp-text-6 hover:text-fp-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              style={{
                background: `linear-gradient(135deg, ${meta.color}, ${meta.color}aa)`,
                boxShadow: `0 10px 30px -10px ${meta.glow}`,
              }}
            >
              Create
            </button>
          </div>
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
