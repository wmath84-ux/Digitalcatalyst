import { motion } from "framer-motion";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { ArrowRight, CalendarDays, Check, Circle, Clock3 } from "lucide-react";
import type { Activity, ActivityStatus } from "../../flowpath/types/flowpath";
import { flowPathKindMeta } from "../../flowpath/types/flowpath";
import { getFlowKindIcon } from "./icons";

interface ActivityCardProps {
  activity: Activity;
  status: ActivityStatus;
  side: "left" | "right";
  onComplete: () => void;
  completing: boolean;
  /**
   * Opens the edit modal pre-populated with this activity. The card body is
   * clickable for this; the small status pill / completion circle has its own
   * handler so it doesn't double-fire.
   */
  onEdit?: () => void;
  /**
   * Restore a completed item back to active (reverse of onComplete).
   * Wired to the green tick on a completed card so a single tap re-opens it.
   */
  onUncomplete?: () => void;
  isDarkMode?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Per-kind card identity.                                            */
/*                                                                     */
/*  Every schedule kind gets its own look — background wash direction,  */
/*  icon-chip shape, label and footer block — so a reminder, a task, a  */
/*  note, a test… are recognisable at a glance instead of sharing one   */
/*  identical glass plate. All text sits on a ~94% opaque dark navy     */
/*  base with bright slate/white ink, so it stays clearly legible over  */
/*  any page backdrop (the old white/60-on-frost ink washed out).       */
/* ------------------------------------------------------------------ */

type KindCardStyle = {
  chipShape: string;
  wash: (color: string, isDarkMode: boolean) => string;
};

const KIND_CARD_STYLE: Record<string, KindCardStyle> = {
  task: {
    chipShape: "rounded-lg",
    wash: (c, dark) => dark
      ? `linear-gradient(135deg, ${c}30 0%, rgba(9,12,26,0.95) 58%)`
      : `linear-gradient(135deg, ${c}20 0%, rgba(255,255,255,0.98) 58%)`,
  },
  reminder: {
    chipShape: "rounded-full border-2",
    wash: (c, dark) => dark
      ? `linear-gradient(225deg, ${c}36 0%, rgba(9,12,26,0.95) 62%)`
      : `linear-gradient(225deg, ${c}25 0%, rgba(255,255,255,0.98) 62%)`,
  },
  schedule: {
    chipShape: "rounded-xl",
    wash: (c, dark) => dark
      ? `linear-gradient(180deg, ${c}2b 0%, rgba(9,12,26,0.95) 68%)`
      : `linear-gradient(180deg, ${c}1f 0%, rgba(255,255,255,0.98) 68%)`,
  },
  note: {
    chipShape: "rounded-md",
    wash: (c, dark) => dark
      ? `linear-gradient(120deg, rgba(20,16,36,0.96) 0%, ${c}2e 130%)`
      : `linear-gradient(120deg, rgba(249,250,251,0.98) 0%, ${c}20 130%)`,
  },
  revision: {
    chipShape: "rounded-lg",
    wash: (c, dark) => dark
      ? `linear-gradient(90deg, ${c}2b 0%, rgba(9,12,26,0.95) 72%)`
      : `linear-gradient(90deg, ${c}1f 0%, rgba(255,255,255,0.98) 72%)`,
  },
  mcq: {
    chipShape: "rounded-full",
    wash: (c, dark) => dark
      ? `radial-gradient(130% 150% at 100% 0%, ${c}33 0%, rgba(9,12,26,0.95) 58%)`
      : `radial-gradient(130% 150% at 100% 0%, ${c}25 0%, rgba(255,255,255,0.98) 58%)`,
  },
  lecture: {
    chipShape: "rounded-xl",
    wash: (c, dark) => dark
      ? `linear-gradient(200deg, ${c}30 0%, rgba(9,12,26,0.95) 60%)`
      : `linear-gradient(200deg, ${c}20 0%, rgba(255,255,255,0.98) 60%)`,
  },
  other: {
    chipShape: "rounded-lg",
    wash: (c, dark) => dark
      ? `linear-gradient(150deg, ${c}28 0%, rgba(9,12,26,0.95) 62%)`
      : `linear-gradient(150deg, ${c}1c 0%, rgba(255,255,255,0.98) 62%)`,
  },
};

function kindStyle(kind: string | undefined): KindCardStyle {
  return (kind && KIND_CARD_STYLE[kind]) || KIND_CARD_STYLE.other;
}

/** "2026-09-28T16:00" → { date: "Sun, 28 Sep 2026", time: "4:00 PM" }. Never throws. */
function formatCardDateTime(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

/** "#8b7bff" → "139,123,255" for the pack surface's tintColor prop. */
function hexToRgbTriplet(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "139,123,255";
  const v = parseInt(m[1], 16);
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
}

/** "Today · 4:00 PM" → "Today" (relative day chip, empty when unparseable). */
function relativeDay(timeLabel: string | undefined): string {
  if (!timeLabel || !timeLabel.includes("·")) return "";
  return timeLabel.split("·")[0].trim();
}

/** Type-specific footer block — the part that makes each kind look different. */
function KindFooter({ activity, color, isDarkMode }: { activity: Activity; color: string; isDarkMode: boolean }) {
  const kind = activity.flowKind ?? activity.type;
  const textSecondary = isDarkMode ? "text-slate-100" : "text-slate-700";
  const textFaint = isDarkMode ? "text-slate-300/80" : "text-slate-500";

  switch (activity.type) {
    case "task": {
      const priority = activity.priority ?? "medium";
      const pill =
        priority === "high"
          ? "bg-rose-500/25 text-rose-100 ring-rose-400/40"
          : priority === "medium"
            ? "bg-amber-500/25 text-amber-100 ring-amber-400/40"
            : "bg-emerald-500/25 text-emerald-100 ring-emerald-400/40";
      const subject = (activity as { subject?: string }).subject;
      return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${pill}`}>
            {priority} priority
          </span>
          {subject ? (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${isDarkMode ? "bg-white/10 text-slate-100 ring-white/20" : "bg-slate-900/10 text-slate-700 ring-slate-300"}`}>
              {subject}
            </span>
          ) : null}
        </div>
      );
    }
    case "reminder": {
      const when =
        (activity as { time?: string }).time || activity.timeLabel.split("·")[1]?.trim() || activity.timeLabel;
      return (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 ring-1 ring-inset ring-amber-400/30">
          <Clock3 className="h-4 w-4 shrink-0 text-amber-200" />
          <span className="text-[13px] font-black tracking-wide text-amber-100">{when}</span>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-amber-200/70">
            Reminder
          </span>
        </div>
      );
    }
    case "schedule": {
      const start = activity.startLabel ?? (activity as { startTime?: string }).startTime;
      const end = activity.endLabel ?? (activity as { endTime?: string }).endTime;
      const scheduleType = (activity as { scheduleType?: string }).scheduleType;
      if (!start && !end && !scheduleType) return null;
      return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(start || end) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 px-3 py-1 text-[11px] font-black text-teal-100 ring-1 ring-inset ring-teal-400/40">
              <Clock3 className="h-3 w-3" />
              {start ?? "—"}
              <ArrowRight className="h-3 w-3 opacity-70" />
              {end ?? "—"}
            </span>
          )}
          {scheduleType ? (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${isDarkMode ? "bg-white/10 text-slate-100 ring-white/20" : "bg-slate-900/10 text-slate-700 ring-slate-300"}`}>
              {scheduleType}
            </span>
          ) : null}
        </div>
      );
    }
    case "note": {
      const body = activity.preview || activity.description;
      if (!body) return null;
      const dot = (activity as { color?: string }).color;
      return (
        <div className="mt-2 rounded-r-xl border-l-[3px] bg-white/[0.06] px-3 py-2" style={{ borderColor: color }}>
          <p className={`text-[12.5px] italic leading-relaxed ${textSecondary}`}>
            “{body}”
          </p>
          {dot ? (
            <p className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${textFaint}`}>
              {dot} note
            </p>
          ) : null}
        </div>
      );
    }
    case "revision": {
      const progress = Math.max(0, Math.min(100, Math.round(activity.progress ?? 0)));
      return (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-200">
              Revision progress
            </span>
            <span className="rounded-full bg-sky-500/25 px-2 py-0.5 text-[11px] font-black text-sky-100 ring-1 ring-inset ring-sky-400/40">
              {progress}%
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      );
    }
    case "mcq": {
      const total = activity.totalQuestions ?? 0;
      const done = Math.min(total, activity.completedQuestions ?? 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const testId = (activity as { testId?: number | string }).testId;
      const minutes = (activity as { estimatedMinutes?: number }).estimatedMinutes;
      return (
        <div className="mt-2.5 rounded-xl bg-emerald-500/10 p-2.5 ring-1 ring-inset ring-emerald-400/25">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-emerald-100">
              {done}/{total} questions
            </span>
            <span className="flex items-center gap-1.5">
              {typeof minutes === "number" && (
                <span className="text-[10px] font-bold text-emerald-200/80">~{minutes} min</span>
              )}
              {testId !== undefined && (
                <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-black text-emerald-100 ring-1 ring-inset ring-emerald-400/40">
                  Saved test
                </span>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    default: {
      // Firestore-merged "lecture" items are normalised to type "other"
      // (see FlowPathView merge) but keep their flowKind; show the real
      // lecture summary instead of a bare description.
      if (kind === "lecture") {
        const moduleTitle = activity.lectureModuleTitle;
        const minutes = activity.lectureEstimatedMinutes;
        const previewOnly = activity.lecturePreviewOnly;
        return (
          <div className="mt-2 rounded-xl bg-cyan-500/10 p-2.5 ring-1 ring-inset ring-cyan-400/25">
            {moduleTitle ? (
              <p className="truncate text-[12px] font-bold text-cyan-100">Module · {moduleTitle}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] font-semibold text-cyan-200/90">
              {minutes ? `${minutes} min lecture` : "Lecture"}
              {previewOnly ? " · Preview (not purchased)" : ""}
            </p>
          </div>
        );
      }
      return null;
    }
  }
}

export function ActivityCard({ activity, status, onComplete, completing, onEdit, onUncomplete, isDarkMode = true }: ActivityCardProps) {
  // Display metadata comes from the original server kind when present
  // (so merged lecture docs show "Lecture" + their cyan styling) and
  // always falls back safely — never undefined — for unknown kinds.
  const meta = flowPathKindMeta(activity.flowKind ?? activity.type);
  const Icon = getFlowKindIcon(activity.flowKind ?? activity.type);
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const isOverdue = status === "overdue";

  const style = kindStyle(activity.flowKind ?? activity.type);
  const { date, time } = formatCardDateTime(activity.datetime);
  const day = relativeDay(activity.timeLabel);
  const description = activity.description?.trim() || "";

  // Text color helpers for light/dark mode
  const textPrimary = isDarkMode ? "text-white" : "text-slate-900";
  const textSecondary = isDarkMode ? "text-slate-100" : "text-slate-700";
  const textMuted = isDarkMode ? "text-slate-200" : "text-slate-600";
  // Notes render their body inside the quote-style footer; every other kind
  // shows the scheduling-time description as its own always-visible line.
  const showDescriptionLine = description.length > 0 && activity.type !== "note";

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isCompleted ? 0.78 : 1,
        x: 0,
        scale: 1,
        filter: isCompleted ? "saturate(0.7) brightness(0.95)" : "saturate(1) brightness(1)",
      }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-auto relative w-full rounded-2xl outline-none ${onEdit ? "cursor-pointer" : ""}`}
      onClick={() => {
        // Don't open the edit modal when the user clicked the inner
        // status / completion controls — those have their own click
        // handlers and call e.stopPropagation() to keep this gate clean.
        if (!onEdit) return;
        onEdit();
      }}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onEdit) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      aria-label={onEdit ? `Edit ${activity.title}` : undefined}
    >
      {/* Per-kind card plate: the pack GlassSurface stays the structural
          plate (frost + tint + specular + content wrapper), while each
          schedule kind gives it its own identity — tintColor wash, accent
          bar, chip shape and footer (see KIND_CARD_STYLE above) — so cards
          are distinguishable at a glance. The underlay wash keeps the base
          ~94% opaque dark navy with bright slate/white ink + a soft text
          shadow, readable over any backdrop in both FlowPath themes. State
          (now / overdue) is an extra ring, because colour carries meaning
          there. */}
      <GlassSurface
        radius={16}
        tint={0.9}
        tintColor={hexToRgbTriplet(meta.color)}
        blur={10}
        className={`group transition duration-300 hover:-translate-y-0.5 ${isCurrent ? "ring-1 ring-violet-300/60" : ""} ${isOverdue ? "ring-1 ring-rose-400/50" : ""}`}
        contentClassName="overflow-hidden"
        style={{
          background: style.wash(meta.color, isDarkMode),
          border: `1px solid ${meta.color}59`,
          boxShadow: `0 14px 34px -14px rgba(0,0,0,0.85), 0 0 22px -6px ${meta.glow}`,
        }}
      >
        {/* Kind accent bar */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 top-0 w-[3.5px]"
          style={{ background: meta.color, boxShadow: `0 0 12px 1px ${meta.glow}` }}
        />
        {isCurrent && (
          <span className="fp-shimmer pointer-events-none absolute inset-0 rounded-2xl" />
        )}

        <div className="relative p-3.5 pl-4 sm:p-4 sm:pl-[18px]">
          {/* Header: kind chip + label … status + complete */}
          <div className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center ${style.chipShape}`}
              style={{
                background: `${meta.color}30`,
                color: isDarkMode ? "#fff" : meta.color,
                borderColor: `${meta.color}88`,
              }}
            >
              <Icon className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest"
              style={{
                background: `${meta.color}2e`,
                color: meta.color,
                textShadow: isDarkMode ? "0 1px 6px rgba(0,0,0,0.7)" : "none",
              }}
            >
              {meta.label}
            </span>
            <span className="min-w-0 flex-1" />
            {isOverdue && (
              <span className="shrink-0 rounded-full bg-rose-500/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-100 ring-1 ring-inset ring-rose-400/40">
                Overdue
              </span>
            )}
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-violet-500/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-100 ring-1 ring-inset ring-violet-400/40">
                Now
              </span>
            )}
            {!isCompleted ? (
              <GlassButton
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                aria-label="Mark complete"
                className="group relative shrink-0 [&_.size-12]:size-6"
              >
                {completing ? (
                  <motion.svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-emerald-300"
                    fill="none"
                  >
                    <motion.path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                    />
                  </motion.svg>
                ) : (
                  <Circle className={`h-3 w-3 ${isDarkMode ? "text-slate-200/80" : "text-slate-600"} group-hover:text-emerald-300`} />
                )}
              </GlassButton>
            ) : (
              <GlassButton
                onClick={(e) => {
                  e.stopPropagation();
                  if (onUncomplete) onUncomplete();
                  else onComplete();
                }}
                aria-label="Restore activity (undo complete)"
                className="shrink-0 [&_.size-12]:size-6 [&_svg]:text-emerald-300"
              >
                <Check className="h-3.5 w-3.5" />
              </GlassButton>
            )}
          </div>

          {/* Title — always fully legible; the card grows to fit it (§32) */}
          <h3
            className={`mt-2 text-[14px] font-bold leading-snug sm:text-[14.5px] ${
              isCompleted
                ? isDarkMode
                  ? "text-slate-300/70 line-through decoration-slate-400/50"
                  : "text-slate-500/70 line-through decoration-slate-400/50"
                : textPrimary
            }`}
            style={{ textShadow: isDarkMode ? "0 1px 10px rgba(0,0,0,0.65)" : "none" }}
          >
            {activity.title}
          </h3>

          {/* Scheduled date + time — the "when" is never hidden */}
          {(date || time || activity.timeLabel) && (
            <p className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] font-semibold ${textMuted}`}>
              <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" style={{ color: meta.color }} />
              {date && <span style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{date}</span>}
              {time && (
                <span className="inline-flex items-center gap-1" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>
                  <span aria-hidden className="opacity-50">·</span>
                  <Clock3 className="h-3 w-3 opacity-80" />
                  {time}
                </span>
              )}
              {!date && !time && <span>{activity.timeLabel}</span>}
              {day && (date || time) && (
                <span
                  className="rounded-full px-1.5 py-px text-[10px] font-black"
                  style={{ background: `${meta.color}30`, color: "#fff" }}
                >
                  {day}
                </span>
              )}
            </p>
          )}

          {/* Scheduling-time description — visible on every kind */}
          {showDescriptionLine && (
            <p
              className={`mt-1.5 text-[12.5px] leading-relaxed ${textSecondary}`}
              style={{ textShadow: isDarkMode ? "0 1px 8px rgba(0,0,0,0.6)" : "none" }}
            >
              {description}
            </p>
          )}

          <KindFooter activity={activity} color={meta.color} isDarkMode={isDarkMode} />
        </div>
      </GlassSurface>
    </motion.div>
  );
}
