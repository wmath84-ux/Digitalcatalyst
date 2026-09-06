import { useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, Pencil, Plus, Trash2 } from "lucide-react";
import type { Reminder } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";
import { GlassButton } from "../ui/glass-button";
import { GlassSurface } from "../ui/glass";
import { GlassCard } from "../ui/GlassCard";
import { GlassCheckbox } from "../ui/glass-checkbox";

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

  // Legibility (the same pass as Home, Store and the product page):
  // `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
  // navy backing, a real rim, blur 0 and lifted `/40 · /55 · /70 · /85` ink —
  // so this panel reads at the same contrast as the cards inside it.
  return (
    <>
      <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
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
            <GlassCard contentClassName="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
                <AlarmClock className="h-6 w-6 text-white/55" />
              </div>
              <p className="text-sm font-bold text-white/55">No reminders set</p>
              <button onClick={openAdd} className="text-sm font-bold text-orange-300 hover:underline">
                + Set a reminder
              </button>
            </GlassCard>
          ) : (
            <div ref={listRef} className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar">
              {sorted.map((rem) => {
                const status = getTimeStatus(rem.time, rem.done);
                return (
                  <GlassCard
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
                    /* Wave 13: pack GlassCard row; status = ring colour only. */
                    className={cn(
                      "group cursor-pointer transition-all",
                      rem.id === highlightId
                        ? "ring-2 ring-amber-400"
                        : status === "done"
                          ? "ring-1 ring-emerald-400/40"
                          : status === "overdue"
                            ? "ring-1 ring-rose-400/40"
                            : status === "soon"
                              ? "ring-1 ring-amber-400/40"
                              : "",
                    )}
                    contentClassName="flex items-center gap-3 p-3"
                  >
                    {/* Toggle */}
                    <span className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
                      <GlassCheckbox
                        checked={rem.done}
                        onCheckedChange={() => onToggle(rem.id)}
                        ariaLabel={rem.done ? "Mark reminder as pending" : "Mark reminder as done"}
                      />
                    </span>

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

                    {/* Actions — the hide-until-hover step is gated on
                        `(hover: hover)`: a touch tablet has no hover state, so
                        Edit / Delete stay reachable on every device instead of
                        only under a mouse. */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    >
                      <GlassButton
                        onClick={(e) => { e.stopPropagation(); openEdit(rem); }}
                        aria-label="Edit reminder"
                        className="[&_.size-12]:size-7 [&_svg]:text-white/70 hover:[&_svg]:text-amber-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </GlassButton>
                      <GlassButton
                        onClick={(e) => { e.stopPropagation(); onDelete(rem.id); }}
                        aria-label="Delete reminder"
                        className="[&_.size-12]:size-7 [&_svg]:text-white/70 hover:[&_svg]:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </GlassButton>
                    </div>
                  </GlassCard>
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
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
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
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
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
