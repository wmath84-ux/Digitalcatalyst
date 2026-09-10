import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  GraduationCap,
  Pencil,
  PenSquare,
  Plus,
  Radio,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import type { EventType, ScheduleEvent } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassCard } from "../ui/GlassCard";
import HeroMountains from "./HeroArt";
import MyDayCalendar, { sameDay } from "./MyDayCalendar";

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
  { icon: LucideIcon; text: string; dot: string; bg: string; ring: string; rgb: string; label: string }
> = {
  class: { icon: GraduationCap, label: "Class", text: "text-indigo-300", dot: "bg-indigo-500", bg: "bg-indigo-500/15", ring: "ring-indigo-400/30", rgb: "129, 140, 248" },
  study: { icon: BookOpen, label: "Study", text: "text-violet-300", dot: "bg-violet-500", bg: "bg-violet-500/15", ring: "ring-violet-400/30", rgb: "167, 139, 250" },
  break: { icon: Coffee, label: "Break", text: "text-amber-300", dot: "bg-amber-500", bg: "bg-amber-500/15", ring: "ring-amber-400/30", rgb: "252, 211, 77" },
  personal: { icon: User, label: "Personal", text: "text-emerald-300", dot: "bg-emerald-500", bg: "bg-emerald-500/15", ring: "ring-emerald-400/30", rgb: "110, 231, 183" },
  exam: { icon: PenSquare, label: "Exam", text: "text-rose-300", dot: "bg-rose-500", bg: "bg-rose-500/15", ring: "ring-rose-400/30", rgb: "253, 164, 175" },
};

const TYPE_ORDER: EventType[] = ["class", "study", "exam", "break", "personal"];

const formatTime = formatTime12;

function durationLabel(start: string, end: string) {
  const diff = toMinutes(end) - toMinutes(start);
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function minutesLabel(total: number) {
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function hhmm(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function shiftDays(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

/**
 * The Schedule page, recomposed on the approved desktop + mobile references.
 *
 * Everything the page DOES is untouched: the same `events` prop, the same
 * start-time sort, the same active / next / past detection, the same
 * `onAdd` / `onEdit` / `onDelete` handlers and the same deep-link scroll +
 * highlight. What changed is the composition around them —
 *
 *   • a night-sky hero carrying the day, the live clock and the day's shape
 *   • a real month calendar (the shared `MyDayCalendar`, in its panel variant)
 *     beside the timeline on desktop, and a thumb-sized date selector on a phone
 *   • a true time axis: gutter time labels, a luminous rail, semantic dots
 *   • event cards with an obvious Live / Up Next / Done state
 *   • a full-width mobile FAB so "Add Event" is always one thumb away
 *
 * The date context is honest on purpose: a persisted `ScheduleEvent` carries
 * no date field (and this redesign does not add one), so the calendar is a
 * day CONTEXT — never a filter it cannot honour. Live / Up Next / Done are
 * derived from the clock and only apply while you are looking at today.
 */
export default function Timeline({ events, onAdd, onEdit, onDelete, highlightId = null }: TimelineProps) {
  // The clock ticks so the LIVE indicator, the "now" marker and the past /
  // upcoming split stay true during a long study session. 30 s is frequent
  // enough to read as live and cheap enough to stay out of the way.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);

  const isToday = sameDay(selectedDate, now);

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
    if (!isToday) return undefined;
    const active = sorted.find(
      (e) => nowMinutes >= toMinutes(e.startTime) && nowMinutes < toMinutes(e.endTime),
    );
    return active?.id;
  }, [sorted, nowMinutes, isToday]);

  const nextId = useMemo(() => {
    if (!isToday || activeId) return undefined;
    const next = sorted.find((e) => toMinutes(e.startTime) > nowMinutes);
    return next?.id;
  }, [sorted, nowMinutes, activeId, isToday]);

  const activeEvent = useMemo(() => sorted.find((e) => e.id === activeId), [sorted, activeId]);
  const nextEvent = useMemo(() => sorted.find((e) => e.id === nextId), [sorted, nextId]);

  const dayShape = useMemo(() => {
    let planned = 0;
    for (const event of sorted) {
      const diff = toMinutes(event.endTime) - toMinutes(event.startTime);
      if (diff > 0) planned += diff;
    }
    const mix = TYPE_ORDER.map((type) => ({
      type,
      count: sorted.filter((e) => e.type === type).length,
    })).filter((row) => row.count > 0);
    const done = isToday ? sorted.filter((e) => toMinutes(e.endTime) <= nowMinutes).length : 0;
    const upcoming = isToday
      ? sorted.filter((e) => toMinutes(e.startTime) > nowMinutes).length
      : sorted.length;
    return { planned, mix, done, upcoming };
  }, [sorted, nowMinutes, isToday]);

  // Where the "now" marker lands: directly above the first block that has not
  // started yet. Off today there is no live moment to point at.
  const rows = useMemo(() => {
    const list = sorted.map((event) => ({ kind: "event" as const, event }));
    if (!isToday || sorted.length === 0) return list;
    const index = sorted.findIndex((e) => toMinutes(e.startTime) > nowMinutes);
    const at = index === -1 ? list.length : index;
    return [...list.slice(0, at), { kind: "now" as const }, ...list.slice(at)];
  }, [sorted, isToday, nowMinutes]);

  const dayLong = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dayShort = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const dayKind = isToday
    ? "Today"
    : selectedDate.toLocaleDateString("en-US", { weekday: "long" });

  const statusLine = activeEvent
    ? `Live now — ${activeEvent.title}`
    : nextEvent
      ? `Up next — ${nextEvent.title} · ${formatTime(nextEvent.startTime)}`
      : isToday
        ? "No block running right now"
        : `${sorted.length} block${sorted.length === 1 ? "" : "s"} in your daily plan`;

  // Legibility (the same pass as Home, Store and the product page):
  // `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
  // navy backing, a real rim, blur 0 and lifted `/40 · /55 · /70 · /85` ink —
  // so this panel reads at the same contrast as the cards inside it.
  return (
    <div className="myday-schedule relative">
      {/* `data-schedule-panel` marks the big panel for the mobile transparency
          moment (below `md` the plate's own layers fade out so the cards float
          on the winter scene — see src/myday-overview.css). The wrapper is
          `display: contents`, so the pinned plate string and the layout stay
          byte-for-byte intact. */}
      <div data-schedule-panel className="contents">
      <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
        {/* ── Hero — the day's cover: date, heading, live clock, day shape ── */}
        <div className="myday-sched-hero">
          <div className="myday-hero-art" aria-hidden="true">
            <HeroMountains />
          </div>
          <div className="myday-hero-stars" aria-hidden="true" />
          <div className="myday-hero-scrim" aria-hidden="true" />

          <div className="relative z-[1] px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            <div className="myday-hero-top flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="myday-date-pill">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{dayLong}</span>
              </div>
              <button type="button" onClick={onAdd} className="myday-cta myday-sched-add">
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Add Event
              </button>
            </div>

            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="myday-greeting text-[1.9rem] leading-tight sm:text-[2.1rem] lg:text-[2.4rem]">
                  Daily Schedule
                </h2>
                <p className="myday-subtitle mt-1 text-[0.82rem] sm:text-[0.95rem]">
                  Plan your day, one focused block at a time.
                </p>
                <p className="myday-sched-hero-note">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{statusLine}</span>
                </p>
              </div>

              {/* Desktop right rail — the live clock over the day's shape. */}
              <div className="myday-sched-rail">
                <div className="myday-sched-clock">
                  <span className="myday-sched-clock-time">{formatTime(hhmm(now))}</span>
                  <span className="myday-sched-clock-label">
                    {isToday ? "Current time" : dayKind}
                  </span>
                </div>
                <dl className="myday-sched-railstats">
                  <div>
                    <dt>Planned</dt>
                    <dd>{minutesLabel(dayShape.planned)}</dd>
                  </div>
                  <div>
                    <dt>Blocks</dt>
                    <dd>{sorted.length}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Phone day card — the mobile reference's own glass moment under
                the title; from `sm` the hero rail carries the clock instead. */}
            <div className="myday-sched-daycard">
              <div className="myday-sched-daycard-time">
                <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{formatTime(hhmm(now))}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold leading-tight text-white">
                  {activeEvent ? "Happening now" : nextEvent ? "Up next" : isToday ? "Open day" : dayKind}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] font-semibold leading-snug text-white/65">
                  {statusLine}
                </p>
              </div>
              <span className="myday-sched-daycard-count">
                {sorted.length} {sorted.length === 1 ? "block" : "blocks"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Day selector — thumb-sized on a phone, a context strip everywhere ── */}
        <div className="myday-sched-datestrip">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDays(d, -1))}
            className="myday-sched-daynav"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="myday-sched-daykind">{dayKind}</p>
            <p className="myday-sched-daydate">{dayShort}</p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDays(d, 1))}
            className="myday-sched-daynav"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!isToday && (
          <p className="myday-sched-dayhint">
            You&apos;re previewing {dayShort}. My Day keeps one daily plan, so these blocks repeat —
            live progress shows on today.
          </p>
        )}

        {/* ── Body: the calendar panel (desktop) beside the timeline ───────── */}
        <div className="myday-sched-body">
          <aside className="myday-sched-side" aria-label="Day context">
            <MyDayCalendar
              variant="panel"
              className="myday-sched-cal"
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <dl className="myday-sched-stats">
              <div className="myday-sched-stat">
                <dt>Blocks today</dt>
                <dd>{sorted.length}</dd>
              </div>
              <div className="myday-sched-stat">
                <dt>Planned time</dt>
                <dd>{minutesLabel(dayShape.planned)}</dd>
              </div>
              <div className="myday-sched-stat">
                <dt>{isToday ? "Completed" : "In the plan"}</dt>
                <dd>{isToday ? dayShape.done : sorted.length}</dd>
              </div>
              <div className="myday-sched-stat">
                <dt>Still ahead</dt>
                <dd>{dayShape.upcoming}</dd>
              </div>
            </dl>
            {dayShape.mix.length > 0 && (
              <ul className="myday-sched-mix" aria-label="Block mix">
                {dayShape.mix.map((row) => {
                  const meta = typeMeta[row.type];
                  const Icon = meta.icon;
                  const share = sorted.length ? Math.round((row.count / sorted.length) * 100) : 0;
                  return (
                    <li key={row.type} className="myday-sched-mixrow" style={{ "--tl-rgb": meta.rgb } as CSSProperties}>
                      <span className={cn("myday-sched-mixicon", meta.bg, meta.text)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="myday-sched-mixlabel">
                          <span className="truncate">{meta.label}</span>
                          <span className="myday-sched-mixcount">{row.count}</span>
                        </span>
                        <span className="myday-sched-mixbar" aria-hidden="true">
                          <i style={{ width: `${share}%` }} />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ── Timeline ─────────────────────────────────────────────────── */}
          <div className="myday-sched-main">
            <div className="myday-sched-mainhead">
              <p className="myday-sched-maintitle">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {isToday ? "Today's timeline" : `${dayKind}'s timeline`}
              </p>
              <p className="myday-sched-mainsub">
                {sorted.length === 0
                  ? "Nothing planned yet"
                  : `${minutesLabel(dayShape.planned)} of focused time`}
              </p>
            </div>

            <div ref={listRef} className="myday-tl">
              {sorted.length === 0 ? (
                <div className="myday-sched-empty">
                  <span className="myday-sched-empty-icon" aria-hidden="true">
                    <CalendarClock className="h-8 w-8" />
                    <i className="myday-sched-empty-spark myday-sched-empty-spark--a" />
                    <i className="myday-sched-empty-spark myday-sched-empty-spark--b" />
                  </span>
                  <p className="myday-sched-empty-title">Nothing scheduled</p>
                  <p className="myday-sched-empty-sub">
                    Your day is still open. Add your first event and create a focused plan.
                  </p>
                  <button type="button" onClick={onAdd} className="myday-cta myday-cta--blue mt-4">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Event
                  </button>
                </div>
              ) : (
                rows.map((row, idx) => {
                  if (row.kind === "now") {
                    return (
                      <div key="__now__" className="myday-tl-nowrow">
                        <span className="myday-tl-nowrow-time">{formatTime(hhmm(now))}</span>
                        <span className="myday-tl-nowrow-rail" aria-hidden="true">
                          <i />
                        </span>
                        <span className="myday-tl-nowrow-line" aria-hidden="true" />
                      </div>
                    );
                  }

                  const event = row.event;
                  const meta = typeMeta[event.type];
                  const Icon = meta.icon;
                  const isActive = event.id === activeId;
                  const isNext = event.id === nextId;
                  const isPast = !isActive && !isNext && isToday && toMinutes(event.endTime) <= nowMinutes;
                  const isHighlighted = event.id === highlightId;

                  return (
                    <div
                      key={event.id}
                      data-highlight={event.id}
                      className="myday-tl-row group animate-slideUp"
                      style={{ "--tl-rgb": meta.rgb, animationDelay: `${idx * 40}ms` } as CSSProperties}
                    >
                      {/* Gutter: the block's start + end, stacked so the eye can
                          scan the whole day down one column. */}
                      <div className="myday-tl-time">
                        <span className="myday-tl-start">{formatTime(event.startTime)}</span>
                        <span className="myday-tl-end">{formatTime(event.endTime)}</span>
                        <span className="myday-tl-dur">
                          {durationLabel(event.startTime, event.endTime)}
                        </span>
                      </div>

                      {/* Axis: a luminous rail with a semantic dot. */}
                      <div className="myday-tl-rail" aria-hidden="true">
                        <span
                          className={cn(
                            "myday-tl-dot",
                            isActive && "myday-tl-dot--live",
                            isNext && "myday-tl-dot--next",
                            isPast && "myday-tl-dot--past",
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                      </div>

                      {/* Card */}
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
                          "myday-tl-card",
                          isActive && "myday-tl-card--live",
                          isNext && "myday-tl-card--next",
                          isPast && "myday-tl-card--past",
                          isHighlighted && "myday-tl-card--flash",
                        )}
                        contentClassName="myday-tl-card-in"
                      >
                        <div className="myday-tl-head">
                          <span className={cn("myday-tl-icon", meta.bg, meta.text)}>
                            <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="myday-tl-titlerow">
                              <p className="myday-tl-title">{event.title}</p>
                              {isActive && (
                                <span className="myday-tl-badge myday-tl-badge--live">
                                  <i aria-hidden="true" />
                                  Live
                                </span>
                              )}
                              {isNext && (
                                <span className="myday-tl-badge myday-tl-badge--next">Up Next</span>
                              )}
                              {isPast && (
                                <span className="myday-tl-badge myday-tl-badge--done">Done</span>
                              )}
                            </div>
                            {event.detail && <p className="myday-tl-detail">{event.detail}</p>}
                          </div>

                          {/* Edit / Delete — the hide-until-hover step is gated
                              on `(hover: hover)`: a touch tablet has no hover
                              state, so the row actions stay reachable on every
                              device instead of only under a mouse. */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="myday-tl-actions [@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <GlassButton
                              onClick={(e) => { e.stopPropagation(); onEdit(event); }}
                              aria-label="Edit event"
                              className="myday-tl-action [&_.size-12]:size-9 [&_svg]:text-white/70 hover:[&_svg]:text-sky-300"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </GlassButton>
                            <GlassButton
                              onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
                              aria-label="Delete event"
                              className="myday-tl-action [&_.size-12]:size-9 [&_svg]:text-white/70 hover:[&_svg]:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </GlassButton>
                          </div>
                        </div>

                        <div className="myday-tl-meta">
                          <span className="myday-tl-chip myday-tl-chip--time">
                            <Clock3 className="h-3 w-3" aria-hidden="true" />
                            {formatTime(event.startTime)} – {formatTime(event.endTime)}
                          </span>
                          <span className={cn("myday-tl-chip myday-tl-chip--type", meta.bg, meta.text, meta.ring)}>
                            {meta.label}
                          </span>
                          <span className="myday-tl-chip">
                            {durationLabel(event.startTime, event.endTime)}
                          </span>
                        </div>
                      </GlassCard>
                    </div>
                  );
                })
              )}
            </div>

            <p className="myday-sched-footquote">
              A focused day is built one block at a time — plan it, then protect it.
            </p>
          </div>
        </div>
      </GlassSurface>
      </div>

      {/* ── Phone FAB — "Add Event" is always one thumb away ───────────────── */}
      <button
        type="button"
        onClick={onAdd}
        className="myday-sched-fab md:hidden"
        aria-label="Add event"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
        <span>Add Event</span>
      </button>
    </div>
  );
}
