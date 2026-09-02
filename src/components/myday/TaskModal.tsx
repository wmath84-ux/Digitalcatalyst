import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, nowHHMM, to24h } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";
import { GlassButton } from "../ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../ui/glass-toggle-group";

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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Task Title <span className="text-rose-400">*</span>
          </label>
          <input
            autoFocus
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            placeholder="e.g., Complete algebra worksheet"
            className="dc-field w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all"
          />
        </div>

        {/* Subject & Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
              Subject
            </label>
            <input
              value={task.subject}
              onChange={(e) => setTask({ ...task, subject: e.target.value })}
              placeholder="e.g., Physics"
              className="dc-field w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div>
            <label
              htmlFor="myday-task-time"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55"
            >
              Time
            </label>
            <div
              onClick={openTimePicker}
              className="dc-field flex w-full cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 transition-all focus-within:border-white/35"
            >
              <Clock3 className="h-4 w-4 shrink-0 text-white/55" />
              <input
                id="myday-task-time"
                ref={timeInputRef}
                type="time"
                data-myday-task-time
                value={task.time ?? ""}
                onChange={(e) => setTask({ ...task, time: e.target.value })}
                aria-label="Task time"
                className="w-full bg-transparent text-sm text-white/85 outline-none"
              />
            </div>
            {task.time ? (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-white/55">{formatTime12(task.time)}</span>
                <button
                  type="button"
                  onClick={() => setTask({ ...task, time: "" })}
                  className="text-[11px] font-semibold text-white/55 transition hover:text-rose-500"
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] font-medium text-white/55">Optional — tap to pick a time</p>
            )}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Priority
          </label>
          <GlassToggleGroup
            className="dc-segment flex w-full"
            data-stretch
            value={task.priority}
            onValueChange={(v) => setTask({ ...task, priority: v as Task["priority"] })}
            aria-label="Priority"
          >
            {priorities.map((p) => (
              <GlassToggleItem key={p.key} value={p.key} className="flex-1 justify-center gap-2 py-2 text-xs font-semibold">
                <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                {p.label}
              </GlassToggleItem>
            ))}
          </GlassToggleGroup>
        </div>

        {/* Status */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Status
          </label>
          <GlassToggleGroup
            className="dc-segment flex w-full"
            data-stretch
            value={task.status}
            onValueChange={(v) => setTask({ ...task, status: v as Task["status"] })}
            aria-label="Status"
          >
            {statuses.map((s) => (
              <GlassToggleItem key={s.key} value={s.key} className="flex-1 justify-center py-2 text-[11px] font-semibold sm:text-xs">
                {s.label}
              </GlassToggleItem>
            ))}
          </GlassToggleGroup>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <GlassButton
            variant="capsule"
            type="button"
            onClick={onClose}
            className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4 [&>span>div]:text-sm [&>span>div]:font-semibold"
          >
            Cancel
          </GlassButton>
          <button
            type="submit"
            disabled={!task.title.trim()}
            className="flex-1 rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {initialTask ? "Save Changes" : "Add Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
