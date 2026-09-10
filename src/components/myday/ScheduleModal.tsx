import { useEffect, useMemo, useState } from "react";
import type { EventType, ScheduleEvent } from "../../types";
import { cn } from "../../utils/cn";
import Modal from "../ui/Modal";
import { GlassButton } from "../ui/glass-button";
import {
  BookOpen,
  CalendarClock,
  Clock3,
  Coffee,
  GraduationCap,
  PenSquare,
  Text,
  User,
  type LucideIcon,
} from "lucide-react";
import { GlassTile } from "../ui/glass-tile";
import { toMinutes } from "../../../utils/timeOfDay";

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
  { key: "class", label: "Class", icon: GraduationCap, color: "text-indigo-200" },
  { key: "study", label: "Study", icon: BookOpen, color: "text-violet-200" },
  { key: "exam", label: "Exam", icon: PenSquare, color: "text-rose-200" },
  { key: "break", label: "Break", icon: Coffee, color: "text-amber-200" },
  { key: "personal", label: "Personal", icon: User, color: "text-emerald-200" },
];

function durationLabel(start: string, end: string) {
  const diff = toMinutes(end) - toMinutes(start);
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return null;
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Add / Edit Schedule Event, restyled for the Schedule redesign.
 *
 * Not one field moved, not one behaviour dropped: the same five pieces of
 * state (title, detail, start, end, type), the same native `type="time"`
 * inputs, the same required-title gate and the same `onSave({ ...event })`.
 * What changed is the presentation — a titled hero strip, grouped sections,
 * a live duration readout and a premium type picker.
 */
export default function ScheduleModal({ open, initialEvent, onClose, onSave }: ScheduleModalProps) {
  const [event, setEvent] = useState<ScheduleEvent>(initialEvent ?? emptyEvent());

  useEffect(() => {
    if (open) {
      setEvent(initialEvent ?? emptyEvent());
    }
  }, [open, initialEvent]);

  const duration = useMemo(() => durationLabel(event.startTime, event.endTime), [event.startTime, event.endTime]);
  const titleMissing = event.title.trim().length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event.title.trim()) return;
    onSave({ ...event, title: event.title.trim(), detail: event.detail?.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title={initialEvent ? "Edit Schedule Event" : "Add Schedule Event"}>
      <form onSubmit={handleSubmit} className="myday-sched-form">
        {/* Identity strip — tells the learner which block they are shaping. */}
        <div className="myday-sched-form-hero">
          <span className="myday-sched-form-hero-icon" aria-hidden="true">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="myday-sched-form-hero-title">
              {initialEvent ? "Edit this block" : "New schedule block"}
            </p>
            <p className="myday-sched-form-hero-sub">
              {initialEvent
                ? "Change the time, the details or the kind of block."
                : "Give it a name, a window and a kind — the timeline does the rest."}
            </p>
          </div>
        </div>

        {/* Title */}
        <div className="myday-sched-field">
          <label className="myday-form-label" htmlFor="myday-sched-title">
            Event Title <span className="text-rose-400">*</span>
          </label>
          <input
            id="myday-sched-title"
            autoFocus
            value={event.title}
            onChange={(e) => setEvent({ ...event, title: e.target.value })}
            placeholder="e.g., Live Class: Physics"
            aria-invalid={titleMissing || undefined}
            className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
          />
          {titleMissing && (
            <p className="myday-sched-field-hint">A short name keeps the timeline scannable.</p>
          )}
        </div>

        {/* Detail */}
        <div className="myday-sched-field">
          <label className="myday-form-label" htmlFor="myday-sched-detail">
            <Text className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
            Details (optional)
          </label>
          <input
            id="myday-sched-detail"
            value={event.detail ?? ""}
            onChange={(e) => setEvent({ ...event, detail: e.target.value })}
            placeholder="e.g., Thermodynamics with Dr. Gupta"
            className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
          />
        </div>

        {/* Time row */}
        <div className="myday-sched-timegroup">
          <div className="myday-sched-field">
            <label className="myday-form-label" htmlFor="myday-sched-start">
              <Clock3 className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
              Start Time
            </label>
            <input
              id="myday-sched-start"
              type="time"
              value={event.startTime}
              onChange={(e) => setEvent({ ...event, startTime: e.target.value })}
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div className="myday-sched-field">
            <label className="myday-form-label" htmlFor="myday-sched-end">
              <Clock3 className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
              End Time
            </label>
            <input
              id="myday-sched-end"
              type="time"
              value={event.endTime}
              onChange={(e) => setEvent({ ...event, endTime: e.target.value })}
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <p className={cn("myday-sched-duration", !duration && "myday-sched-duration--warn")}>
            {duration ? `Duration · ${duration}` : "End time must be after the start time"}
          </p>
        </div>

        {/* Type picker */}
        <div className="myday-sched-field">
          <label className="myday-form-label">
            Event Type
          </label>
          <div className="myday-sched-types">
            {eventTypes.map((et) => {
              const Icon = et.icon;
              const active = event.type === et.key;
              return (
                <GlassTile
                  type="button"
                  key={et.key}
                  onClick={() => setEvent({ ...event, type: et.key })}
                  selected={active}
                  className={cn("dc-tile aspect-auto min-h-[68px] rounded-xl px-2 py-3 text-xs font-semibold", active && et.color)}
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <Icon className="h-5 w-5" />
                    {et.label}
                  </span>
                </GlassTile>
              );
            })}
          </div>
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
            disabled={!event.title.trim()}
            className="myday-cta myday-cta--blue flex-1 py-3 text-sm"
          >
            {initialEvent ? "Save Changes" : "Add Event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
