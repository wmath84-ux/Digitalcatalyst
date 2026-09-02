import { useEffect, useMemo, useRef } from "react";
import { BookOpen, CalendarClock, Coffee, GraduationCap, Pencil, PenSquare, Plus, Trash2, User, type LucideIcon } from "lucide-react";
import type { EventType, ScheduleEvent } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassCard } from "../ui/GlassCard";

interface TimelineProps {
  events: ScheduleEvent[];
  onAdd: () => void;
  onEdit: (event: ScheduleEvent) => void;
  onDelete: (id: string) => void;
  /** Id of the event a notification deep-linked to — scrolls to it + highlights it. */
  highlightId?: string | null;
}

const typeMeta: Record<
  EventType,
  { icon: LucideIcon; text: string; dot: string; bg: string; ring: string }
> = {
  class: { icon: GraduationCap, text: "text-indigo-300", dot: "bg-indigo-500", bg: "bg-indigo-500/15", ring: "ring-indigo-400/30" },
  study: { icon: BookOpen, text: "text-violet-300", dot: "bg-violet-500", bg: "bg-violet-500/15", ring: "ring-violet-400/30" },
  break: { icon: Coffee, text: "text-amber-300", dot: "bg-amber-500", bg: "bg-amber-500/15", ring: "ring-amber-400/30" },
  personal: { icon: User, text: "text-emerald-300", dot: "bg-emerald-500", bg: "bg-emerald-500/15", ring: "ring-emerald-400/30" },
  exam: { icon: PenSquare, text: "text-rose-300", dot: "bg-rose-500", bg: "bg-rose-500/15", ring: "ring-rose-400/30" },
};

const formatTime = formatTime12;

function durationLabel(start: string, end: string) {
  const diff = toMinutes(end) - toMinutes(start);
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Timeline({ events, onAdd, onEdit, onDelete, highlightId = null }: TimelineProps) {
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...events].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
    [events],
  );

  useEffect(() => {
    if (!highlightId) return;
    const el = listRef.current?.querySelector(`[data-highlight="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, sorted]);

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
    <GlassSurface radius={24} className="text-white" contentClassName="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500 text-white">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white sm:text-lg">Daily Schedule</h2>
            <p className="text-xs font-medium text-white/55">{events.length} events planned</p>
          </div>
        </div>
        <GlassButton variant="capsule" type="button" onClick={onAdd} className="[&>span>div]:h-10 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-xs [&>span>div]:font-bold sm:[&>span>div]:px-4 sm:[&>span>div]:text-sm">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Event</span>
        </GlassButton>
      </div>

      {/* Timeline */}
      <div className="px-4 pb-5 sm:px-6">
        {sorted.length === 0 ? (
          <GlassCard contentClassName="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15">
              <CalendarClock className="h-6 w-6 text-white/55" />
            </div>
            <p className="text-sm font-bold text-white/55">No events scheduled</p>
            <button
              onClick={onAdd}
              className="text-sm font-semibold text-sky-300 hover:underline"
            >
              + Add your first event
            </button>
          </GlassCard>
        ) : (
          <div className="relative pl-7">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/15" />
            <div ref={listRef} className="space-y-3">
              {sorted.map((event, idx) => {
                const meta = typeMeta[event.type];
                const Icon = meta.icon;
                const isActive = event.id === activeId;
                const isNext = event.id === nextId;
                const isPast = !isActive && !isNext && toMinutes(event.endTime) <= nowMinutes;
                const isHighlighted = event.id === highlightId;

                return (
                  <div key={event.id} data-highlight={event.id} className="relative group" style={{ animationDelay: `${idx * 50}ms` }}>
                    {/* Dot */}
                    <div
                      className={cn(
                        "absolute -left-7 top-4 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-[3px] ring-[var(--dc-bd-base)] transition-all",
                        isActive ? `${meta.dot} ` : meta.dot,
                        isPast && "opacity-50",
                      )}
                    >
                      {isActive && (
                        <span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-30" />
                      )}
                    </div>

                    {/* Card */}
                    {/* Wave 13: the event card is the pack GlassCard; live =
                        indigo ring, highlighted = sky ring, past = dimmed. */}
                    <GlassCard
                      onClick={() => onEdit(event)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEdit(event);
                        }
                      }}
                      aria-label={`Edit event: ${event.title}`}
                      className={cn(
                        "cursor-pointer transition-all duration-200",
                        isHighlighted ? "ring-2 ring-sky-400" : isActive ? "ring-1 ring-indigo-400/50" : "",
                        isPast && !isHighlighted && "opacity-60",
                      )}
                      contentClassName="p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                            <Icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={cn("text-sm font-semibold text-white/85", isPast && "text-white/55")}>
                                {event.title}
                              </p>
                              {isActive && (
                                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white animate-pulse">
                                  Live
                                </span>
                              )}
                              {isNext && (
                                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                                  Up Next
                                </span>
                              )}
                            </div>
                            {event.detail && (
                              <p className="mt-0.5 truncate text-xs text-white/55">{event.detail}</p>
                            )}
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-white/55">
                                {formatTime(event.startTime)} – {formatTime(event.endTime)}
                              </span>
                              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", meta.bg, meta.text, meta.ring)}>
                                {event.type}
                              </span>
                              <span className="text-[11px] text-white/55">
                                {durationLabel(event.startTime, event.endTime)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Edit / Delete */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                          <GlassButton
                            onClick={(e) => { e.stopPropagation(); onEdit(event); }}
                            aria-label="Edit event"
                            className="[&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-sky-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </GlassButton>
                          <GlassButton
                            onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
                            aria-label="Delete event"
                            className="[&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </GlassButton>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </GlassSurface>
  );
}
