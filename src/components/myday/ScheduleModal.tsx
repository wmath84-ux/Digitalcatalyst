import { useEffect, useState } from "react";
import type { EventType, ScheduleEvent } from "../../types";
import { cn } from "../../utils/cn";
import Modal from "../ui/Modal";
import { BookOpen, Coffee, GraduationCap, PenSquare, User, type LucideIcon } from "lucide-react";

interface ScheduleModalProps {
  open: boolean;
  initialEvent: ScheduleEvent | null;
  onClose: () => void;
  onSave: (event: ScheduleEvent) => void;
}

const emptyEvent = (): ScheduleEvent => ({
  id: crypto.randomUUID(),
  title: "",
  detail: "",
  startTime: "09:00",
  endTime: "10:00",
  type: "study",
});

const eventTypes: { key: EventType; label: string; icon: LucideIcon; color: string }[] = [
  { key: "class", label: "Class", icon: GraduationCap, color: "border-indigo-500 bg-indigo-50 text-indigo-700" },
  { key: "study", label: "Study", icon: BookOpen, color: "border-violet-500 bg-violet-50 text-violet-700" },
  { key: "exam", label: "Exam", icon: PenSquare, color: "border-rose-500 bg-rose-50 text-rose-700" },
  { key: "break", label: "Break", icon: Coffee, color: "border-amber-500 bg-amber-50 text-amber-700" },
  { key: "personal", label: "Personal", icon: User, color: "border-emerald-500 bg-emerald-50 text-emerald-700" },
];

export default function ScheduleModal({ open, initialEvent, onClose, onSave }: ScheduleModalProps) {
  const [event, setEvent] = useState<ScheduleEvent>(initialEvent ?? emptyEvent());

  useEffect(() => {
    if (open) {
      setEvent(initialEvent ?? emptyEvent());
    }
  }, [open, initialEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event.title.trim()) return;
    onSave({ ...event, title: event.title.trim(), detail: event.detail?.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title={initialEvent ? "Edit Schedule Event" : "Add Schedule Event"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Event Title <span className="text-rose-400">*</span>
          </label>
          <input
            autoFocus
            value={event.title}
            onChange={(e) => setEvent({ ...event, title: e.target.value })}
            placeholder="e.g., Live Class: Physics"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Detail */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Details (optional)
          </label>
          <input
            value={event.detail ?? ""}
            onChange={(e) => setEvent({ ...event, detail: e.target.value })}
            placeholder="e.g., Thermodynamics with Dr. Gupta"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
              Start Time
            </label>
            <input
              type="time"
              value={event.startTime}
              onChange={(e) => setEvent({ ...event, startTime: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">
              End Time
            </label>
            <input
              type="time"
              value={event.endTime}
              onChange={(e) => setEvent({ ...event, endTime: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {/* Type picker */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55">
            Event Type
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {eventTypes.map((et) => {
              const Icon = et.icon;
              const active = event.type === et.key;
              return (
                <button
                  type="button"
                  key={et.key}
                  onClick={() => setEvent({ ...event, type: et.key })}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-all",
                    active
                      ? et.color + ""
                      : "border-white/10 text-white/55 hover:border-white/10 hover:bg-white/[0.06]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {et.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!event.title.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {initialEvent ? "Save Changes" : "Add Event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
