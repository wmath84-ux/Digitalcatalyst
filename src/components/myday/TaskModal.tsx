import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, nowHHMM, to24h } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";

interface TaskModalProps {
  open: boolean;
  initialTask: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
}

const emptyTask = (): Task => ({
  id: crypto.randomUUID(),
  title: "",
  subject: "",
  time: "",
  priority: "medium",
  status: "pending",
});

const priorities: { key: TaskPriority; label: string; dot: string }[] = [
  { key: "low", label: "Low", dot: "bg-emerald-400" },
  { key: "medium", label: "Medium", dot: "bg-amber-400" },
  { key: "high", label: "High", dot: "bg-rose-400" },
];

const statuses: { key: TaskStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "in-progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

export default function TaskModal({ open, initialTask, onClose, onSave }: TaskModalProps) {
  const [task, setTask] = useState<Task>(initialTask ?? emptyTask());
  const timeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Older tasks were saved from a free-text box ("4 pm", "04:00 PM").
      // `<input type="time">` renders blank — and drops the value on the
      // next save — unless it receives a strict "HH:MM".
      const source = initialTask ?? emptyTask();
      setTask({ ...source, time: to24h(source.time) });
    }
  }, [open, initialTask]);

  // Tapping anywhere on the field should open the clock, not just the
  // tiny native indicator. showPicker() is the supported way to do it;
  // browsers without it still get the default click-to-open behaviour.
  const openTimePicker = () => {
    const input = timeInputRef.current;
    if (!input) return;
    if (!task.time) setTask((prev) => ({ ...prev, time: nowHHMM() }));
    try {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      input.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.title.trim()) return;
    onSave({ ...task, title: task.title.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? "Edit Task" : "Create New Task"}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Task Title <span className="text-rose-400">*</span>
          </label>
          <input
            autoFocus
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            placeholder="e.g., Complete algebra worksheet"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Subject & Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Subject
            </label>
            <input
              value={task.subject}
              onChange={(e) => setTask({ ...task, subject: e.target.value })}
              placeholder="e.g., Physics"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label
              htmlFor="myday-task-time"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Time
            </label>
            <div
              onClick={openTimePicker}
              className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-all focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100"
            >
              <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                id="myday-task-time"
                ref={timeInputRef}
                type="time"
                data-myday-task-time
                value={task.time ?? ""}
                onChange={(e) => setTask({ ...task, time: e.target.value })}
                aria-label="Task time"
                className="w-full bg-transparent text-sm text-slate-800 outline-none"
              />
            </div>
            {task.time ? (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">{formatTime12(task.time)}</span>
                <button
                  type="button"
                  onClick={() => setTask({ ...task, time: "" })}
                  className="text-[11px] font-semibold text-slate-400 transition hover:text-rose-500"
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] font-medium text-slate-400">Optional — tap to pick a time</p>
            )}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Priority
          </label>
          <div className="flex gap-2">
            {priorities.map((p) => (
              <button
                type="button"
                key={p.key}
                onClick={() => setTask({ ...task, priority: p.key })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-all",
                  task.priority === p.key
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <div className="flex gap-2">
            {statuses.map((s) => (
              <button
                type="button"
                key={s.key}
                onClick={() => setTask({ ...task, status: s.key })}
                className={cn(
                  "flex-1 rounded-xl border-2 px-2 py-2.5 text-[11px] font-semibold transition-all sm:text-xs",
                  task.status === s.key
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!task.title.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {initialTask ? "Save Changes" : "Add Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
