// src/flowpath/components/LecturePicker.tsx
//
// The 3-step wizard the user explicitly asked for: "kon sa course
// kab dekhna hai, dropdowns me, multiple courses ek saath".
//
//   Step 1: pick a course (search + category filter, owned
//           courses listed first, preview-only last with a
//           "Preview" badge).
//   Step 2: pick a module within that course (skipped for flat
//           courses with no modules; auto-picks the first module
//           for preview-only courses so the user can still
//           schedule without owning the course).
//   Step 3: confirm + schedule (immediate / at time / recurring,
//           same picker as the rest of FlowPath).
//
//   "+ Add another" button on step 3 queues a second selection
//   without closing the modal. The whole batch goes out in a
//   single flowpath.bulk call (the dashboard caps the visible
//   list at 20 to keep the modal tidy).
//
//   Preview-only handling: the picker makes the user aware
//   before they confirm (a yellow "Preview" badge on the
//   course + a sentence at the bottom of step 3 explaining
//   that the deep link will go to the product page until
//   they buy). The user is never blocked from scheduling a
//   future course.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Check, ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
import type { FlowPathActivity, FlowPathActivityKind } from "../types/flowpath";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassCard } from "../../components/ui/GlassCard";
import { GlassTile } from "../../components/ui/glass-tile";
import { GlassInput } from "../../components/ui/glass-input";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";

export type LectureCourseOption = {
  id: string;
  title: string;
  category: string | null;
  productType: string | null;
  image: string | null;
  moduleCount: number;
  previewOnly: boolean;
};

export type LectureModuleOption = {
  id: string;
  title: string;
  description: string | null;
  order: number;
};

export type LectureSelection = {
  productId: string;
  productTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  estimatedMinutes: number;
  scheduledFor: number | null;
  recurrence?: FlowPathActivity["recurrence"];
  previewOnly: boolean;
};

interface LecturePickerProps {
  open: boolean;
  onClose: () => void;
  /** Server-side fetch of the user's courses (owned first, then preview-only). */
  fetchCourses: (q: string) => Promise<LectureCourseOption[]>;
  /** Server-side fetch of a course's modules. */
  fetchModules: (productId: string) => Promise<LectureModuleOption[]>;
  /** Called with the queued lectures on submit. */
  onSubmit: (lectures: Array<Partial<FlowPathActivity>>) => Promise<{ ok: boolean; error?: string }>;
  submitting?: boolean;
}

const MAX_BATCH = 20;

export function LecturePicker({
  open,
  onClose,
  fetchCourses,
  fetchModules,
  onSubmit,
  submitting = false,
}: LecturePickerProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [courses, setCourses] = useState<LectureCourseOption[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<LectureCourseOption | null>(null);
  const [modules, setModules] = useState<LectureModuleOption[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(30);
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "datetime" | "recurring">("immediate");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [queue, setQueue] = useState<LectureSelection[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the date/time inputs to a friendly default each time
  // step 3 is opened ("1 hour from now" reads better than 1970).
  useEffect(() => {
    if (!open) return;
    if (scheduleMode === "datetime" || scheduleMode === "recurring") {
      if (!dateStr) {
        const soon = new Date(Date.now() + 60 * 60_000);
        setDateStr(toDateInputValue(soon));
        setTimeStr(toTimeInputValue(soon));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleMode]);

  // Fetch courses when step 1 opens or search changes (debounced).
  useEffect(() => {
    if (!open || step !== 1) return;
    setLoadingCourses(true);
    const t = window.setTimeout(() => {
      void fetchCourses(search).then((list) => {
        setCourses(list);
        setLoadingCourses(false);
      }).catch(() => {
        setCourses([]);
        setLoadingCourses(false);
      });
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, step, search, fetchCourses]);

  // Fetch modules when a course is picked.
  useEffect(() => {
    if (!open || !selectedCourse) return;
    setLoadingModules(true);
    void fetchModules(selectedCourse.id).then((list) => {
      setModules(list);
      // Auto-pick the first module so the user lands on step 2 with
      // something already selected. If there are no modules, jump
      // straight to step 3 (flat course).
      if (list.length > 0) {
        setSelectedModuleId(list[0].id);
        setStep(2);
      } else {
        setSelectedModuleId(null);
        setStep(3);
      }
      setLoadingModules(false);
    }).catch(() => {
      setModules([]);
      setLoadingModules(false);
      setStep(3);
    });
  }, [open, selectedCourse, fetchModules]);

  // Reset state when modal closes.
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      setStep(1);
      setSearch("");
      setCourses([]);
      setSelectedCourse(null);
      setModules([]);
      setSelectedModuleId(null);
      setEstimatedMinutes(30);
      setScheduleMode("immediate");
      setDateStr("");
      setTimeStr("");
      setQueue([]);
      setError(null);
    }, 250);
    return () => window.clearTimeout(t);
  }, [open]);

  const computedScheduledFor = useMemo<number | null>(() => {
    if (scheduleMode === "immediate") return null;
    if (!dateStr || !timeStr) return null;
    const ts = Date.parse(`${dateStr}T${timeStr}:00`);
    return Number.isFinite(ts) ? ts : null;
  }, [scheduleMode, dateStr, timeStr]);

  const handleAddToQueue = () => {
    if (!selectedCourse) return;
    if (queue.length >= MAX_BATCH) return;
    const module = modules.find((m) => m.id === selectedModuleId) || null;
    const sel: LectureSelection = {
      productId: selectedCourse.id,
      productTitle: selectedCourse.title,
      moduleId: module?.id || null,
      moduleTitle: module?.title || null,
      estimatedMinutes: estimatedMinutes || 30,
      scheduledFor: computedScheduledFor,
      recurrence: scheduleMode === "recurring" ? { freq: "daily" } : undefined,
      previewOnly: selectedCourse.previewOnly,
    };
    setQueue((current) => [...current, sel]);
    // Reset the picker for the next selection.
    setStep(1);
    setSelectedCourse(null);
    setModules([]);
    setSelectedModuleId(null);
    setError(null);
  };

  const handleRemoveFromQueue = (index: number) => {
    setQueue((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (queue.length === 0) return;
    setError(null);
    const items: Array<Partial<FlowPathActivity>> = queue.map((sel, i) => ({
      id: `lecture-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      kind: "lecture" as FlowPathActivityKind,
      title: sel.moduleTitle ? `${sel.productTitle}: ${sel.moduleTitle}` : sel.productTitle,
      description: sel.moduleTitle ? `Course: ${sel.productTitle} · Module: ${sel.moduleTitle}` : `Course: ${sel.productTitle}`,
      scheduledFor: sel.scheduledFor,
      status: "active",
      lectureProductId: sel.productId,
      lectureProductTitle: sel.productTitle,
      lectureModuleId: sel.moduleId,
      lectureModuleTitle: sel.moduleTitle,
      lectureEstimatedMinutes: sel.estimatedMinutes,
      lecturePreviewOnly: sel.previewOnly,
      recurrence: sel.recurrence,
    }));
    const result = await onSubmit(items);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error || "Failed to schedule lectures.");
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          data-lecture-picker
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            className="relative w-full max-w-[760px]"
          >
          {/* Wave 13: the picker is the pack GlassSurface (Dialog values) —
              no white panel, no cyan header gradient. */}
          <GlassSurface radius={24} className="text-white" contentClassName="flex max-h-[88vh] flex-col overflow-hidden p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <h3 className="text-base font-black tracking-tight text-white">Plan lectures</h3>
                <p className="mt-0.5 text-xs font-medium text-white/55">
                  Pick a course, choose a module, set a time. Add several in one batch.
                </p>
              </div>
              <GlassButton
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="disabled:opacity-40 [&_.size-12]:size-9"
              >
                <X className="h-4 w-4" />
              </GlassButton>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2 text-[11px] font-bold uppercase tracking-wide">
              {[
                { id: 1 as const, label: "Pick course" },
                { id: 2 as const, label: "Pick module" },
                { id: 3 as const, label: "Schedule" },
              ].map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span
                    data-step-indicator={s.id}
                    data-step-active={step === s.id ? "true" : "false"}
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      step === s.id ? "bg-cyan-600 text-white" : step > s.id ? "bg-emerald-500 text-white" : "border border-white/20 text-white/55"
                    }`}
                  >
                    {step > s.id ? <Check className="h-3 w-3" /> : s.id}
                  </span>
                  <span className={step === s.id ? "text-white" : "text-white/55"}>{s.label}</span>
                  {i < 2 ? <ChevronRight className="h-3 w-3 text-white/30" /> : null}
                </div>
              ))}
              {queue.length > 0 ? (
                <span className="ml-auto rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black text-cyan-200 ring-1 ring-cyan-400/30" data-queue-count>
                  {queue.length} queued
                </span>
              ) : null}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 1 ? (
                <StepPickCourse
                  search={search}
                  setSearch={setSearch}
                  courses={courses}
                  loading={loadingCourses}
                  onSelect={(c) => setSelectedCourse(c)}
                />
              ) : null}

              {step === 2 ? (
                <StepPickModule
                  course={selectedCourse}
                  modules={modules}
                  selectedId={selectedModuleId}
                  setSelectedId={setSelectedModuleId}
                  loading={loadingModules}
                  onBack={() => { setStep(1); setSelectedCourse(null); }}
                  onContinue={() => setStep(3)}
                />
              ) : null}

              {step === 3 ? (
                <StepSchedule
                  course={selectedCourse}
                  module={modules.find((m) => m.id === selectedModuleId) || null}
                  estimatedMinutes={estimatedMinutes}
                  setEstimatedMinutes={setEstimatedMinutes}
                  scheduleMode={scheduleMode}
                  setScheduleMode={setScheduleMode}
                  dateStr={dateStr}
                  setDateStr={setDateStr}
                  timeStr={timeStr}
                  setTimeStr={setTimeStr}
                  onBack={() => setStep(2)}
                  onAddToQueue={handleAddToQueue}
                  canAddToQueue={queue.length < MAX_BATCH}
                />
              ) : null}

              {/* Queue (visible on every step) */}
              {queue.length > 0 ? (
                <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-200">Queued lectures</p>
                  <ul className="mt-2 space-y-1.5">
                    {queue.map((sel, i) => (
                      <li
                        key={i}
                        data-queued-lecture-index={i}
                        className="flex items-center gap-2 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-cyan-300" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">
                            {sel.productTitle}
                            {sel.moduleTitle ? <span className="font-normal text-white/55"> · {sel.moduleTitle}</span> : null}
                          </p>
                          <p className="truncate text-[10px] text-white/55">
                            {sel.scheduledFor
                              ? `Fires ${new Date(sel.scheduledFor).toLocaleString()}`
                              : "Immediate"}{" "}
                            · {sel.estimatedMinutes} min
                            {sel.previewOnly ? " · Preview (not purchased)" : ""}
                          </p>
                        </div>
                        <GlassButton
                          onClick={() => handleRemoveFromQueue(i)}
                          className="[&_.size-12]:size-7 [&_svg]:text-rose-300"
                          aria-label="Remove from queue"
                        >
                          <Trash2 className="h-3 w-3" />
                        </GlassButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? (
                <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
              <span className="text-[11px] text-white/55">
                {queue.length === 0
                  ? "Pick a course, then a module, then schedule."
                  : `${queue.length} lecture${queue.length === 1 ? "" : "s"} ready. Tap "Schedule all" to commit.`}
              </span>
              <div className="flex items-center gap-2">
                <GlassButton
                  variant="capsule"
                  onClick={onClose}
                  disabled={submitting}
                  className="disabled:opacity-40 [&>span>div]:h-10 [&>span>div]:px-3 [&>span>div]:text-sm [&>span>div]:font-semibold"
                >
                  Cancel
                </GlassButton>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || queue.length === 0}
                  data-submit-lectures
                  className="h-10 rounded-full bg-cyan-600 px-4 text-sm font-black text-white transition hover:bg-cyan-500 disabled:opacity-40"
                >
                  {submitting ? "Scheduling…" : `Schedule ${queue.length || ""} lecture${queue.length === 1 ? "" : "s"}`.trim()}
                </button>
              </div>
            </div>
          </GlassSurface>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1: pick a course                                            */
/* ------------------------------------------------------------------ */

function StepPickCourse({
  search,
  setSearch,
  courses,
  loading,
  onSelect,
}: {
  search: string;
  setSearch: (v: string) => void;
  courses: LectureCourseOption[];
  loading: boolean;
  onSelect: (c: LectureCourseOption) => void;
}) {
  return (
    <div>
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">Search courses</span>
        <div className="mt-1">
          <GlassInput
            type="text"
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mathematics, Physics, or any course name"
            data-field="course-search"
            className="w-full"
          />
        </div>
      </label>

      {loading ? (
        <p className="mt-3 text-center text-xs text-white/55">Loading courses…</p>
      ) : courses.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-white/15 p-6 text-center text-xs text-white/55">
          No courses found. Add a course in Products first.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-course-list>
          {courses.map((c) => (
            <GlassCard
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c); } }}
              data-course-id={c.id}
              data-course-preview={c.previewOnly ? "true" : "false"}
              className="cursor-pointer text-left transition hover:ring-1 hover:ring-cyan-400/40"
              contentClassName="flex items-center gap-3 p-2.5"
            >
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-white/10">
                {c.image ? (
                  <img src={c.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-base">🎓</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.title}</p>
                <p className="truncate text-[11px] text-white/55">
                  {c.category || "Course"} · {c.moduleCount} module{c.moduleCount === 1 ? "" : "s"}
                </p>
                {c.previewOnly ? (
                  <span className="mt-0.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/30">
                    Preview · not purchased
                  </span>
                ) : null}
              </div>
              <ChevronRight className="h-4 w-4 text-white/40" />
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2: pick a module                                            */
/* ------------------------------------------------------------------ */

function StepPickModule({
  course,
  modules,
  selectedId,
  setSelectedId,
  loading,
  onBack,
  onContinue,
}: {
  course: LectureCourseOption | null;
  modules: LectureModuleOption[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      {course ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 p-2.5">
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-white/10">
            {course.image ? (
              <img src={course.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base">🎓</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{course.title}</p>
            <p className="truncate text-[11px] text-white/55">
              {course.moduleCount} module{course.moduleCount === 1 ? "" : "s"} · {course.previewOnly ? "Preview only" : "Owned"}
            </p>
          </div>
          <GlassButton
            variant="capsule"
            onClick={onBack}
            className="shrink-0 [&>span>div]:h-8 [&>span>div]:px-2.5 [&>span>div]:text-xs [&>span>div]:font-semibold"
          >
            Change course
          </GlassButton>
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-xs text-white/55">Loading modules…</p>
      ) : modules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/55">
          This course has no modules. The full course will be scheduled.
        </p>
      ) : (
        <div className="space-y-1.5" data-module-list>
          {modules.map((m) => (
            <GlassTile
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              selected={selectedId === m.id}
              data-module-id={m.id}
              data-module-selected={selectedId === m.id ? "true" : "false"}
              className="dc-tile aspect-auto w-full rounded-lg p-2.5 text-left text-sm [&>span]:w-full [&>span]:items-start [&>span]:justify-start [&>span]:gap-2"
            >
              <span
                className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[10px] ${
                  selectedId === m.id ? "bg-cyan-600 text-white" : "border border-white/20 text-white/55"
                }`}
              >
                {m.order + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{m.title}</p>
                {m.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-white/55">{m.description}</p>
                ) : null}
              </div>
            </GlassTile>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="h-10 rounded-full bg-cyan-600 px-4 text-sm font-black text-white transition hover:bg-cyan-500"
          data-continue-to-schedule
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3: schedule                                                  */
/* ------------------------------------------------------------------ */

function StepSchedule({
  course,
  module,
  estimatedMinutes,
  setEstimatedMinutes,
  scheduleMode,
  setScheduleMode,
  dateStr,
  setDateStr,
  timeStr,
  setTimeStr,
  onBack,
  onAddToQueue,
  canAddToQueue,
}: {
  course: LectureCourseOption | null;
  module: LectureModuleOption | null;
  estimatedMinutes: number;
  setEstimatedMinutes: (v: number) => void;
  scheduleMode: "immediate" | "datetime" | "recurring";
  setScheduleMode: (m: "immediate" | "datetime" | "recurring") => void;
  dateStr: string;
  setDateStr: (v: string) => void;
  timeStr: string;
  setTimeStr: (v: string) => void;
  onBack: () => void;
  onAddToQueue: () => void;
  canAddToQueue: boolean;
}) {
  return (
    <div>
      <div className="rounded-xl border border-white/10 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">Lecture summary</p>
        <p className="mt-1 text-sm font-semibold text-white">
          {course?.title || "Course"}
          {module ? <span className="text-white/55"> · {module.title}</span> : null}
        </p>
        {course?.previewOnly ? (
          <p className="mt-1 rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200">
            You don't own this course yet. The notification will open the product page so you can purchase it.
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">Estimated minutes</span>
          <input
            type="number"
            min={5}
            max={480}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(Number(e.target.value || 30))}
            className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
          />
        </label>
        <div />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">Schedule</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <GlassToggleGroup className="dc-segment" value={scheduleMode} onValueChange={(next) => setScheduleMode(next as typeof scheduleMode)} aria-label="Schedule mode">
          {[
            { key: "immediate", label: "Immediate" },
            { key: "datetime", label: "At date & time" },
            { key: "recurring", label: "Recurring (daily)" },
          ].map((opt) => (
              <GlassToggleItem
                key={opt.key}
                value={opt.key}
                data-schedule-mode={opt.key}
                className="px-3 py-1.5 text-xs font-semibold"
              >
                {opt.label}
              </GlassToggleItem>
          ))}
          </GlassToggleGroup>
        </div>
        {scheduleMode !== "immediate" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="dc-field rounded-full border px-3 py-1.5 text-sm text-white outline-none"
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="dc-field rounded-full border px-3 py-1.5 text-sm text-white outline-none"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <GlassButton
          variant="capsule"
          onClick={onBack}
          className="[&>span>div]:h-10 [&>span>div]:px-3 [&>span>div]:text-sm [&>span>div]:font-semibold"
        >
          Back
        </GlassButton>
        <button
          type="button"
          onClick={onAddToQueue}
          disabled={!canAddToQueue}
          data-add-to-queue
          className="h-10 rounded-full bg-cyan-600 px-4 text-sm font-black text-white transition hover:bg-cyan-500 disabled:opacity-40"
        >
          <Plus className="mr-1 inline h-3.5 w-3.5" /> Add to queue
        </button>
      </div>
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
