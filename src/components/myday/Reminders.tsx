import { useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { Reminder } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";

interface RemindersProps {
  reminders: Reminder[];
  onAdd: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  /** Id of the reminder a notification deep-linked to — scrolls to it + highlights it. */
  highlightId?: string | null;
  onRequireAccess?: () => boolean;
}

function getTimeStatus(time: string, done: boolean) {
  if (done) return "done" as const;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const remMin = toMinutes(time);
  if (remMin <= nowMin) return "overdue" as const;
  if (remMin - nowMin <= 30) return "soon" as const;
  return "upcoming" as const;
}

const emptyReminder = (): Reminder => ({
  id: crypto.randomUUID(),
  text: "",
  time: "12:00",
  done: false,
  createdAt: Date.now(),
});

export default function Reminders({ reminders, onAdd, onEdit, onToggle, onDelete, highlightId = null, onRequireAccess }: RemindersProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState<Reminder>(emptyReminder());
  const listRef = useRef<HTMLDivElement>(null);

  const openAdd = () => {
    if (onRequireAccess && !onRequireAccess()) return;
    setEditingReminder(null);
    setForm(emptyReminder());
    setModalOpen(true);
  };

  const openEdit = (rem: Reminder) => {
    if (onRequireAccess && !onRequireAccess()) return;
    setEditingReminder(rem);
    setForm({ ...rem });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.text.trim()) return;
    const data = { ...form, text: form.text.trim() };
    if (editingReminder) {
      onEdit(data);
    } else {
      onAdd(data);
    }
    setModalOpen(false);
  };

  const sorted = [...reminders].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  useEffect(() => {
    if (!highlightId) return;
    const el = listRef.current?.querySelector(`[data-highlight="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, sorted]);

  const pendingCount = reminders.filter((r) => !r.done).length;

  return (
    <>
      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-md shadow-amber-200">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">Reminders</h2>
              <p className="text-xs text-slate-400">
                {pendingCount} pending reminder{pendingCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-400 to-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-200/50 transition hover:shadow-xl sm:px-4 sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>

        {/* List */}
        <div className="px-4 pb-5 sm:px-6">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <AlarmClock className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-400">No reminders set</p>
              <button onClick={openAdd} className="text-sm font-semibold text-orange-600 hover:underline">
                + Set a reminder
              </button>
            </div>
          ) : (
            <div ref={listRef} className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar">
              {sorted.map((rem) => {
                const status = getTimeStatus(rem.time, rem.done);
                return (
                  <div
                    key={rem.id}
                    data-highlight={rem.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border p-3 transition-all",
                      rem.id === highlightId && "ring-2 ring-amber-400 ring-offset-2 ring-offset-white",
                      status === "done"
                        ? "border-emerald-200/60 bg-emerald-50/40"
                        : status === "overdue"
                          ? "border-rose-200/60 bg-rose-50/50"
                          : status === "soon"
                            ? "border-amber-200/60 bg-amber-50/40"
                            : "border-slate-200 bg-slate-50/40",
                    )}
                  >
                    {/* Toggle */}
                    <button
                      onClick={() => onToggle(rem.id)}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        rem.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 text-transparent hover:border-amber-400",
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium text-slate-700", rem.done && "text-slate-400 line-through")}>
                        {rem.text}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                          <AlarmClock className="h-3 w-3" />
                          {formatTime12(rem.time)}
                        </span>
                        {status === "overdue" && !rem.done && (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">Overdue</span>
                        )}
                        {status === "soon" && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">Soon</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(rem)}
                        aria-label="Edit reminder"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-amber-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(rem.id)}
                        aria-label="Delete reminder"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal for Add / Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingReminder ? "Edit Reminder" : "Set a Reminder"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reminder Text <span className="text-rose-400">*</span>
            </label>
            <input
              autoFocus
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="e.g., Submit assignment before 5 PM"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Time
            </label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.text.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-orange-400 to-amber-500 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200/50 transition hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingReminder ? "Save Changes" : "Set Reminder"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
