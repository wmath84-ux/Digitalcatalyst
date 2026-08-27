// src/flowpath/components/ActivityEditor.tsx
//
// Single modal that creates or edits any FlowPath activity — task,
// reminder, schedule, note, revision, mcq. Drives the same shape
// the server multiplexer (api/_lib/flowpathControl.ts) accepts,
// so the form values round-trip without translation. Used by:
//
//   • The "+" radial menu in the FlowPath view (top-level create).
//   • Any existing activity card (edit / re-schedule / mark done).
//   • The bulk revision creator (one slot per test, this modal
//     renders the per-slot form).
//
// Two scheduling modes:
//
//   1. Immediate (no scheduledFor). The activity is created right
//      now; FCM + Web Push + in-app bell all fire immediately.
//   2. Scheduled (scheduledFor set). The activity is created
//      now (so the user can see it in their My Day / Revision
//      pages) AND a TWA local alarm + server scheduled job are
//      queued to fire at the right time. Same model as the
//      existing My Day reminder path; this modal just unifies the
//      surface for every kind.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Clock, Repeat, X } from "lucide-react";
import type { FlowPathActivity, FlowPathActivityKind } from "../types/flowpath";
import { ACTIVITY_TYPE_META } from "../types/flowpath";

export type ActivityEditorMode = "create" | "edit";

export interface ActivityEditorProps {
  open: boolean;
  onClose: () => void;
  mode: ActivityEditorMode;
  initialKind?: FlowPathActivityKind;
  initialActivity?: FlowPathActivity | null;
  onSubmit: (activity: Partial<FlowPathActivity>) => Promise<{ ok: boolean; error?: string }>;
  submitting?: boolean;
}

const KIND_TABS: { key: FlowPathActivityKind; label: string }[] = [
  { key: "task", label: "Task" },
  { key: "reminder", label: "Reminder" },
  { key: "schedule", label: "Schedule" },
  { key: "note", label: "Note" },
  { key: "revision", label: "Revision" },
  { key: "mcq", label: "MCQ" },
];

const DEFAULT_FORM_STATE: Partial<FlowPathActivity> = {
  title: "",
  description: "",
  scheduledFor: null,
  status: "active",
  taskPriority: "medium",
  taskStatus: "pending",
  taskSubject: "",
  reminderTime: "",
  scheduleStartTime: "",
  scheduleEndTime: "",
  scheduleType: "personal",
  noteColor: "amber",
  testConfig: {
    totalQuestions: 10,
    difficulty: "medium",
    questionMode: "mixed",
    estimatedMinutes: 15,
  },
  recurrence: undefined,
};

export function ActivityEditor({
  open,
  onClose,
  mode,
  initialKind = "task",
  initialActivity = null,
  onSubmit,
  submitting = false,
}: ActivityEditorProps) {
  const [kind, setKind] = useState<FlowPathActivityKind>(initialKind);
  const [form, setForm] = useState<Partial<FlowPathActivity>>(DEFAULT_FORM_STATE);
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "datetime" | "recurring">("immediate");
  const [dateStr, setDateStr] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (initialActivity) {
      setKind(initialActivity.kind);
      setForm({
        ...DEFAULT_FORM_STATE,
        ...initialActivity,
        scheduledFor: initialActivity.scheduledFor ?? null,
      });
      if (initialActivity.scheduledFor) {
        const d = new Date(initialActivity.scheduledFor);
        setDateStr(toDateInputValue(d));
        setTimeStr(toTimeInputValue(d));
        setScheduleMode(initialActivity.recurrence ? "recurring" : "datetime");
      } else {
        setScheduleMode("immediate");
        setDateStr("");
        setTimeStr("");
      }
    } else {
      setKind(initialKind);
      setForm({ ...DEFAULT_FORM_STATE, kind: initialKind });
      setScheduleMode("immediate");
      // Default to "now + 1 hour" for a friendlier first run.
      const soon = new Date(Date.now() + 60 * 60_000);
      setDateStr(toDateInputValue(soon));
      setTimeStr(toTimeInputValue(soon));
    }
  }, [open, initialActivity, initialKind]);

  const computedScheduledFor = useMemo<number | null>(() => {
    if (scheduleMode === "immediate") return null;
    if (!dateStr || !timeStr) return null;
    const ts = Date.parse(`${dateStr}T${timeStr}:00`);
    return Number.isFinite(ts) ? ts : null;
  }, [scheduleMode, dateStr, timeStr]);

  const isValid = useMemo(() => {
    if (!form.title || !form.title.trim()) return false;
    if (scheduleMode === "datetime" && !computedScheduledFor) return false;
    if (kind === "schedule" && (!form.scheduleStartTime || !form.scheduleEndTime)) return false;
    if (kind === "reminder" && !form.reminderTime) return false;
    if ((kind === "revision" || kind === "mcq") && !(form.testConfig?.totalQuestions && form.testConfig.totalQuestions > 0)) return false;
    return true;
  }, [form, kind, scheduleMode, computedScheduledFor]);

  const handleSubmit = async () => {
    if (!isValid) return;
    const payload: Partial<FlowPathActivity> = {
      ...form,
      id: form.id || `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      title: form.title?.trim() || "",
      description: form.description?.trim() || undefined,
      scheduledFor: computedScheduledFor,
      status: form.status || "active",
      updatedAt: Date.now(),
    };
    // Kind-specific field cleanup.
    if (kind === "task") {
      payload.taskPriority = form.taskPriority || "medium";
      payload.taskStatus = form.taskStatus || "pending";
      payload.taskSubject = form.taskSubject?.trim() || undefined;
    } else if (kind === "reminder") {
      payload.reminderTime = form.reminderTime;
    } else if (kind === "schedule") {
      payload.scheduleStartTime = form.scheduleStartTime;
      payload.scheduleEndTime = form.scheduleEndTime;
      payload.scheduleType = form.scheduleType || "personal";
    } else if (kind === "note") {
      payload.noteColor = form.noteColor || "amber";
    } else if (kind === "revision" || kind === "mcq") {
      payload.testConfig = form.testConfig;
    }
    const result = await onSubmit(payload);
    if (result.ok) onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          data-activity-editor
          onClick={(event) => {
            if (event.target === event.currentTarget && !submitting) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            className="relative flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/20 dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-slate-800">
              <div>
                <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-slate-100">
                  {mode === "create" ? "Create" : "Edit"} activity
                </h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {mode === "create" ? "Add a new task, reminder, schedule, note, or test." : "Update the activity details and schedule."}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Kind tabs */}
              {mode === "create" ? (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {KIND_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setKind(tab.key)}
                      data-kind-tab={tab.key}
                      data-kind-active={kind === tab.key ? "true" : "false"}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        kind === tab.key
                          ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Title + description */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Title</span>
                  <input
                    type="text"
                    value={form.title || ""}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={`${ACTIVITY_TYPE_META[kind].label} title`}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                    data-field="title"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Description (optional)</span>
                  <textarea
                    value={form.description || ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Add notes, links or extra context."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                    data-field="description"
                  />
                </label>
              </div>

              {/* Kind-specific fields */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                {kind === "task" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Subject</span>
                      <input
                        type="text"
                        value={form.taskSubject || ""}
                        onChange={(e) => setForm((f) => ({ ...f, taskSubject: e.target.value }))}
                        placeholder="Mathematics"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Priority</span>
                      <select
                        value={form.taskPriority || "medium"}
                        onChange={(e) => setForm((f) => ({ ...f, taskPriority: e.target.value as "low" | "medium" | "high" }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Status</span>
                      <select
                        value={form.taskStatus || "pending"}
                        onChange={(e) => setForm((f) => ({ ...f, taskStatus: e.target.value as "pending" | "in-progress" | "completed" }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      >
                        <option value="pending">Pending</option>
                        <option value="in-progress">In progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {kind === "reminder" ? (
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-600">Reminder time (HH:MM)</span>
                    <input
                      type="time"
                      value={form.reminderTime || ""}
                      onChange={(e) => setForm((f) => ({ ...f, reminderTime: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </label>
                ) : null}

                {kind === "schedule" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Start (HH:MM)</span>
                      <input
                        type="time"
                        value={form.scheduleStartTime || ""}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleStartTime: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">End (HH:MM)</span>
                      <input
                        type="time"
                        value={form.scheduleEndTime || ""}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleEndTime: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Type</span>
                      <select
                        value={form.scheduleType || "personal"}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value as "class" | "study" | "break" | "personal" | "exam" }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      >
                        <option value="class">Class</option>
                        <option value="study">Study</option>
                        <option value="break">Break</option>
                        <option value="personal">Personal</option>
                        <option value="exam">Exam</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {kind === "note" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Color</span>
                      <select
                        value={form.noteColor || "amber"}
                        onChange={(e) => setForm((f) => ({ ...f, noteColor: e.target.value as FlowPathActivity["noteColor"] }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      >
                        {["amber", "sky", "rose", "emerald", "violet"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {(kind === "revision" || kind === "mcq") ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-slate-600">Questions</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={form.testConfig?.totalQuestions || 10}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), totalQuestions: Number(e.target.value || 0) } }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-slate-600">Difficulty</span>
                        <select
                          value={form.testConfig?.difficulty || "medium"}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), difficulty: e.target.value as "easy" | "medium" | "hard" | "mixed" } }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-slate-600">Mode</span>
                        <select
                          value={form.testConfig?.questionMode || "mixed"}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), questionMode: e.target.value as "theory" | "application" | "mixed" } }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="theory">Theory</option>
                          <option value="application">Application</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-slate-600">Time (min)</span>
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={form.testConfig?.estimatedMinutes || 15}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), estimatedMinutes: Number(e.target.value || 0) } }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      The test bank will draft questions using the curriculum planner. Difficulty and mode apply to every question; the engine picks the actual topic mix from the user's My Day subjects.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Schedule picker */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Schedule</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    { key: "immediate", label: "Immediate", icon: Clock },
                    { key: "datetime", label: "At date & time", icon: Calendar },
                    { key: "recurring", label: "Recurring", icon: Repeat },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = scheduleMode === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setScheduleMode(opt.key as "immediate" | "datetime" | "recurring")}
                        data-schedule-mode={opt.key}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          active ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {scheduleMode !== "immediate" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Date</span>
                      <input
                        type="date"
                        value={dateStr}
                        onChange={(e) => setDateStr(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">Time</span>
                      <input
                        type="time"
                        value={timeStr}
                        onChange={(e) => setTimeStr(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    {scheduleMode === "recurring" ? (
                      <label className="col-span-2 block">
                        <span className="text-[11px] font-semibold text-slate-600">Repeat</span>
                        <select
                          value={form.recurrence?.freq || "daily"}
                          onChange={(e) => setForm((f) => ({ ...f, recurrence: { ...(f.recurrence || { freq: "daily" as const }), freq: e.target.value as "daily" | "weekly" | "monthly" } }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
                        >
                          <option value="daily">Every day</option>
                          <option value="weekly">Every week</option>
                          <option value="monthly">Every month</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
              <span className="text-[11px] text-slate-500">
                {computedScheduledFor
                  ? `Will fire on ${new Date(computedScheduledFor).toLocaleString()}`
                  : "Fires immediately on save."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isValid || submitting}
                  data-submit-activity
                  className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {submitting ? "Saving…" : mode === "create" ? `Create ${ACTIVITY_TYPE_META[kind].label}` : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
