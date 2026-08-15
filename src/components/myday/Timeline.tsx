import { useMemo } from "react";
import { BookOpen, CalendarClock, Coffee, GraduationCap, Pencil, PenSquare, Plus, Trash2, User, type LucideIcon } from "lucide-react";
import type { EventType, ScheduleEvent } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";

interface TimelineProps {
  events: ScheduleEvent[];
  onAdd: () => void;
  onEdit: (event: ScheduleEvent) => void;
  onDelete: (id: string) => void;
}

const typeMeta: Record<
  EventType,
  { icon: LucideIcon; text: string; dot: string; bg: string; ring: string }
> = {
  class: { icon: GraduationCap, text: "text-indigo-600", dot: "bg-indigo-500", bg: "bg-indigo-50", ring: "ring-indigo-200" },
  study: { icon: BookOpen, text: "text-violet-600", dot: "bg-violet-500", bg: "bg-violet-50", ring: "ring-violet-200" },
  break: { icon: Coffee, text: "text-amber-600", dot: "bg-amber-500", bg: "bg-amber-50", ring: "ring-amber-200" },
  personal: { icon: User, text: "text-emerald-600", dot: "bg-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  exam: { icon: PenSquare, text: "text-rose-600", dot: "bg-rose-500", bg: "bg-rose-50", ring: "ring-rose-200" },
};

const formatTime = formatTime12;

function durationLabel(start: string, end: string) {
  const diff = toMinutes(end) - toMinutes(start);
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Timeline({ events, onAdd, onEdit, onDelete }: TimelineProps) {
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const sorted = useMemo(
    () => [...events].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
    [events],
  );

  const activeId = useMemo(() => {
    const active = sorted.find(
      (e) => nowMinutes >= toMinutes(e.startTime) && nowMinutes < toMinutes(e.endTime),
    );
    return active?.id;
  }, [sorted, nowMinutes]);

  const nextId = useMemo(() => {
    if (activeId) return undefined;
    const next = sorted.find((e) => toMinutes(e.startTime) > nowMinutes);
    return next?.id;
  }, [sorted, nowMinutes, activeId]);

  return (
    <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-200">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">Daily Schedule</h2>
            <p className="text-xs text-slate-400">{events.length} events planned</p>
          </div>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-200/50 transition hover:shadow-xl sm:px-4 sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Event</span>
        </button>
      </div>

      {/* Timeline */}
      <div className="px-4 pb-5 sm:px-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <CalendarClock className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-400">No events scheduled</p>
            <button
              onClick={onAdd}
              className="text-sm font-semibold text-sky-600 hover:underline"
            >
              + Add your first event
            </button>
          </div>
        ) : (
          <div className="relative pl-7">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
            <div className="space-y-3">
              {sorted.map((event, idx) => {
                const meta = typeMeta[event.type];
                const Icon = meta.icon;
                const isActive = event.id === activeId;
                const isNext = event.id === nextId;
                const isPast = !isActive && !isNext && toMinutes(event.endTime) <= nowMinutes;

                return (
                  <div key={event.id} className="relative group" style={{ animationDelay: `${idx * 50}ms` }}>
                    {/* Dot */}
                    <div
                      className={cn(
                        "absolute -left-7 top-4 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-[3px] ring-white transition-all",
                        isActive ? `${meta.dot} shadow-md` : meta.dot,
                        isPast && "opacity-50",
                      )}
                    >
                      {isActive && (
                        <span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-30" />
                      )}
                    </div>

                    {/* Card */}
                    <div
                      className={cn(
                        "rounded-2xl border p-3.5 transition-all duration-200",
                        isActive
                          ? "border-indigo-300 bg-indigo-50/80 shadow-lg shadow-indigo-100/50"
                          : isNext
                            ? "border-slate-200 bg-white shadow-sm"
                            : isPast
                              ? "border-transparent bg-slate-50/50 opacity-60"
                              : "border-slate-100 bg-slate-50/80",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                            <Icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={cn("text-sm font-semibold text-slate-800", isPast && "text-slate-500")}>
                                {event.title}
                              </p>
                              {isActive && (
                                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white animate-pulse">
                                  Live
                                </span>
                              )}
                              {isNext && (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-600">
                                  Up Next
                                </span>
                              )}
                            </div>
                            {event.detail && (
                              <p className="mt-0.5 truncate text-xs text-slate-400">{event.detail}</p>
                            )}
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-500">
                                {formatTime(event.startTime)} – {formatTime(event.endTime)}
                              </span>
                              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", meta.bg, meta.text, meta.ring)}>
                                {event.type}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {durationLabel(event.startTime, event.endTime)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Edit / Delete */}
                        <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEdit(event)}
                            aria-label="Edit event"
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(event.id)}
                            aria-label="Delete event"
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
