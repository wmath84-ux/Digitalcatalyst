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

import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "../../components/ui/glass-select";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Clock, Repeat, X } from "lucide-react";
import type { FlowPathActivity, FlowPathActivityKind } from "../types/flowpath";
import { FLOW_PATH_KIND_META } from "../types/flowpath";

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
  { key: "lecture", label: "Lecture" },
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

/**
 * Wave 5 of the website-glass rollout: this modal carried seven hand-styled
 * `<select>` elements, all with the same border + `focus:border-indigo-500`
 * recipe. They render through one helper on top of the registry's
 * `glass-select` now, so the listbox (portaled, Escape-to-close, ✓ on the
 * active row) is identical everywhere and there is one place left to fix.
 * Values and the `setForm` patches are unchanged — the editor still writes the
 * exact same union types the server multiplexer accepts.
 */
function FieldSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <GlassSelect value={value} onValueChange={onChange}>
      <GlassSelectTrigger
        aria-label={label}
        className={`dc-glass-select mt-1 h-9 w-full text-sm ${className ?? ""}`}
      />
      <GlassSelectContent className="dc-glass-select-pop" aria-label={label}>
        {options.map((option) => (
          <GlassSelectItem key={option.value} value={option.value}>
            {option.label}
          </GlassSelectItem>
        ))}
      </GlassSelectContent>
    </GlassSelect>
  );
}

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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
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
            className="relative w-full max-w-[640px]"
          >
          {/* Wave 13: the editor is the pack GlassSurface (Dialog values:
              tint 0.5, radius 24) — no white panel, no header gradient. */}
          <GlassSurface radius={24} className="text-white" contentClassName="flex max-h-[88vh] flex-col overflow-hidden p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <h3 className="text-base font-black tracking-tight text-white">
                  {mode === "create" ? "Create" : "Edit"} activity
                </h3>
                <p className="mt-0.5 text-xs font-medium text-white/55">
                  {mode === "create" ? "Add a new task, reminder, schedule, note, or test." : "Update the activity details and schedule."}
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Kind tabs */}
              {mode === "create" ? (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  <GlassToggleGroup className="dc-segment" value={kind} onValueChange={(next) => setKind(next as FlowPathActivityKind)} aria-label="Activity kind">
                  {KIND_TABS.map((tab) => (
                    <GlassToggleItem
                      key={tab.key}
                      value={tab.key}
                      data-kind-tab={tab.key}
                      data-kind-active={kind === tab.key ? "true" : "false"}
                      className="px-3 py-1.5 text-xs font-bold"
                    >
                      {tab.label}
                    </GlassToggleItem>
                  ))}
                  </GlassToggleGroup>
                </div>
              ) : null}

              {/* Title + description */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">Title</span>
                  <input
                    type="text"
                    value={form.title || ""}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={`${FLOW_PATH_KIND_META[kind].label} title`}
                    className="dc-field mt-1 w-full rounded-full border px-3 py-2 text-sm text-white outline-none transition"
                    data-field="title"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">Description (optional)</span>
                  <textarea
                    value={form.description || ""}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Add notes, links or extra context."
                    className="dc-field mt-1 w-full rounded-xl border px-3 py-2 text-sm text-white outline-none transition"
                    data-field="description"
                  />
                </label>
              </div>

              {/* Kind-specific fields */}
              <div className="mt-4 rounded-xl border border-white/10 p-3">
                {kind === "task" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Subject</span>
                      <input
                        type="text"
                        value={form.taskSubject || ""}
                        onChange={(e) => setForm((f) => ({ ...f, taskSubject: e.target.value }))}
                        placeholder="Mathematics"
                        className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Priority</span>
                      <FieldSelect
                        label="Priority"
                        value={form.taskPriority || "medium"}
                        onChange={(v) => setForm((f) => ({ ...f, taskPriority: v as "low" | "medium" | "high" }))}
                        options={[
                          { value: "low", label: "Low" },
                          { value: "medium", label: "Medium" },
                          { value: "high", label: "High" },
                        ]}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Status</span>
                      <FieldSelect
                        label="Status"
                        value={form.taskStatus || "pending"}
                        onChange={(v) => setForm((f) => ({ ...f, taskStatus: v as "pending" | "in-progress" | "completed" }))}
                        options={[
                          { value: "pending", label: "Pending" },
                          { value: "in-progress", label: "In progress" },
                          { value: "completed", label: "Completed" },
                        ]}
                      />
                    </label>
                  </div>
                ) : null}

                {kind === "reminder" ? (
                  <label className="block">
                    <span className="text-[11px] font-semibold text-white/75">Reminder time (HH:MM)</span>
                    <input
                      type="time"
                      value={form.reminderTime || ""}
                      onChange={(e) => setForm((f) => ({ ...f, reminderTime: e.target.value }))}
                      className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                    />
                  </label>
                ) : null}

                {kind === "schedule" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Start (HH:MM)</span>
                      <input
                        type="time"
                        value={form.scheduleStartTime || ""}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleStartTime: e.target.value }))}
                        className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">End (HH:MM)</span>
                      <input
                        type="time"
                        value={form.scheduleEndTime || ""}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleEndTime: e.target.value }))}
                        className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Type</span>
                      <FieldSelect
                        label="Schedule type"
                        value={form.scheduleType || "personal"}
                        onChange={(v) => setForm((f) => ({ ...f, scheduleType: v as "class" | "study" | "break" | "personal" | "exam" }))}
                        options={[
                          { value: "class", label: "Class" },
                          { value: "study", label: "Study" },
                          { value: "break", label: "Break" },
                          { value: "personal", label: "Personal" },
                          { value: "exam", label: "Exam" },
                        ]}
                      />
                    </label>
                  </div>
                ) : null}

                {kind === "note" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Color</span>
                      <FieldSelect
                        label="Note colour"
                        value={form.noteColor || "amber"}
                        onChange={(v) => setForm((f) => ({ ...f, noteColor: v as FlowPathActivity["noteColor"] }))}
                        options={["amber", "sky", "rose", "emerald", "violet"].map((c) => ({ value: c, label: c }))}
                      />
                    </label>
                  </div>
                ) : null}

                {(kind === "revision" || kind === "mcq") ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-white/75">Questions</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={form.testConfig?.totalQuestions || 10}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), totalQuestions: Number(e.target.value || 0) } }))}
                          className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-white/75">Difficulty</span>
                        <FieldSelect
                          label="Difficulty"
                          value={form.testConfig?.difficulty || "medium"}
                          onChange={(v) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), difficulty: v as "easy" | "medium" | "hard" | "mixed" } }))}
                          options={[
                            { value: "easy", label: "Easy" },
                            { value: "medium", label: "Medium" },
                            { value: "hard", label: "Hard" },
                            { value: "mixed", label: "Mixed" },
                          ]}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-white/75">Mode</span>
                        <FieldSelect
                          label="Question mode"
                          value={form.testConfig?.questionMode || "mixed"}
                          onChange={(v) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), questionMode: v as "theory" | "application" | "mixed" } }))}
                          options={[
                            { value: "theory", label: "Theory" },
                            { value: "application", label: "Application" },
                            { value: "mixed", label: "Mixed" },
                          ]}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-white/75">Time (min)</span>
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={form.testConfig?.estimatedMinutes || 15}
                          onChange={(e) => setForm((f) => ({ ...f, testConfig: { ...(f.testConfig || DEFAULT_FORM_STATE.testConfig!), estimatedMinutes: Number(e.target.value || 0) } }))}
                          className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-white/55">
                      The test bank will draft questions using the curriculum planner. Difficulty and mode apply to every question; the engine picks the actual topic mix from the user's My Day subjects.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Schedule picker */}
              <div className="mt-4 rounded-xl border border-white/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">Schedule</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <GlassToggleGroup className="dc-segment" value={scheduleMode} onValueChange={(next) => setScheduleMode(next as "immediate" | "datetime" | "recurring")} aria-label="Schedule mode">
                  {[
                    { key: "immediate", label: "Immediate", icon: Clock },
                    { key: "datetime", label: "At date & time", icon: Calendar },
                    { key: "recurring", label: "Recurring", icon: Repeat },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <GlassToggleItem
                        key={opt.key}
                        value={opt.key}
                        data-schedule-mode={opt.key}
                        className="px-3 py-1.5 text-xs font-semibold"
                      >
                        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{opt.label}</span>
                      </GlassToggleItem>
                    );
                  })}
                  </GlassToggleGroup>
                </div>
                {scheduleMode !== "immediate" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Date</span>
                      <input
                        type="date"
                        value={dateStr}
                        onChange={(e) => setDateStr(e.target.value)}
                        className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-white/75">Time</span>
                      <input
                        type="time"
                        value={timeStr}
                        onChange={(e) => setTimeStr(e.target.value)}
                        className="dc-field mt-1 w-full rounded-full border px-3 py-1.5 text-sm text-white outline-none"
                      />
                    </label>
                    {scheduleMode === "recurring" ? (
                      <label className="col-span-2 block">
                        <span className="text-[11px] font-semibold text-white/75">Repeat</span>
                        <FieldSelect
                          label="Repeats"
                          value={form.recurrence?.freq || "daily"}
                          onChange={(v) => setForm((f) => ({ ...f, recurrence: { ...(f.recurrence || { freq: "daily" as const }), freq: v as "daily" | "weekly" | "monthly" } }))}
                          options={[
                            { value: "daily", label: "Every day" },
                            { value: "weekly", label: "Every week" },
                            { value: "monthly", label: "Every month" },
                          ]}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
              <span className="text-[11px] text-white/55">
                {computedScheduledFor
                  ? `Will fire on ${new Date(computedScheduledFor).toLocaleString()}`
                  : "Fires immediately on save."}
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
                  disabled={!isValid || submitting}
                  data-submit-activity
                  className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {submitting ? "Saving…" : mode === "create" ? `Create ${FLOW_PATH_KIND_META[kind].label}` : "Save changes"}
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
