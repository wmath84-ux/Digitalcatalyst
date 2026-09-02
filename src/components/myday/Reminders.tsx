import { useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { Reminder } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";
import { GlassButton } from "../ui/glass-button";
import { GlassSurface } from "../ui/glass";

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
    // No access check for editing existing reminders - users should always be able to edit their own items
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
      <GlassSurface radius={24} className="text-white" contentClassName="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white sm:text-lg">Reminders</h2>
              <p className="text-xs font-medium text-white/55">
                {pendingCount} pending reminder{pendingCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <GlassButton variant="capsule" type="button" onClick={openAdd} className="[&>span>div]:h-10 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-xs [&>span>div]:font-bold sm:[&>span>div]:px-4 sm:[&>span>div]:text-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </GlassButton>
        </div>

        {/* List */}
        <div className="px-4 pb-5 sm:px-6">
          {sorted.length === 0 ? (
            <div className="dc-glass flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-amber-400/30 bg-white/[0.04] py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08]">
                <AlarmClock className="h-6 w-6 text-white/55" />
              </div>
              <p className="text-sm font-bold text-white/55">No reminders set</p>
              <button onClick={openAdd} className="text-sm font-bold text-orange-300 hover:underline">
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
                    onClick={() => openEdit(rem)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(rem);
                      }
                    }}
                    aria-label={`Edit reminder: ${rem.text}`}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border p-3 transition-all cursor-pointer hover:border-amber-300/70",
                      rem.id === highlightId && "ring-2 ring-amber-400 ring-offset-2 ring-offset-white",
                      status === "done"
                        ? "border-emerald-400/30 bg-white/[0.08]"
                        : status === "overdue"
                          ? "border-rose-400/30 bg-white/[0.08]"
                          : status === "soon"
                            ? "border-amber-400/30 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.08]",
                    )}
                  >
                    {/* Toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggle(rem.id); }}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        rem.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-white/10 text-transparent hover:border-amber-400",
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold text-white/85", rem.done && "text-white/55 line-through")}>
                        {rem.text}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-white/55">
                          <AlarmClock className="h-3 w-3" />
                          {formatTime12(rem.time)}
                        </span>
                        {status === "overdue" && !rem.done && (
                          <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">Overdue</span>
                        )}
                        {status === "soon" && (
                          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">Soon</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(rem); }}
                        aria-label="Edit reminder"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/[0.08] hover:text-amber-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(rem.id); }}
                        aria-label="Delete reminder"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/[0.08] hover:text-rose-300"
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
      </GlassSurface>

      {/* Modal for Add / Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingReminder ? "Edit Reminder" : "Set a Reminder"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
              Reminder Text <span className="text-rose-400">*</span>
            </label>
            <input
              autoFocus
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="e.g., Submit assignment before 5 PM"
              className="dc-field w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
              Time
            </label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="dc-field w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <GlassButton
              variant="capsule"
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4 [&>span>div]:text-sm [&>span>div]:font-semibold"
            >
              Cancel
            </GlassButton>
            <button
              type="submit"
              disabled={!form.text.trim()}
              className="flex-1 rounded-full bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingReminder ? "Save Changes" : "Set Reminder"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
