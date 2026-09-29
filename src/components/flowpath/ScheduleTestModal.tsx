// src/components/flowpath/ScheduleTestModal.tsx
//
// "Schedule Test" overlay for FlowPath — schedule ALREADY-CREATED tests.
//
// Instead of typing a blank MCQ placeholder, the learner picks from the
// tests they previously created (AI generator / bulk import / FlowPath
// import — all live in the revision DB as custom tests):
//   • a dropdown button ("Choose tests… (N available)") expands on click
//     into a clear, searchable checklist — every row has a checkbox, the
//     test title, question count, estimated minutes, date, source and
//     attempt status, so each test is recognisable at a glance;
//   • one date & time + one shared note apply to the whole selection;
//   • "Schedule N test(s)" drops one flow card per selected test onto the
//     same stair, in selection order (handled by the parent).
//
// When no tests exist yet the overlay says so honestly and offers shortcuts
// to import one or open Revision. A collapsed "blank plan" fallback keeps
// the old manual title + question-count scheduling available.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  FileUp,
  FlaskConical,
  ListChecks,
  Search,
  X,
} from "lucide-react";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassCheckbox } from "../ui/glass-checkbox";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../../firebase";
import {
  listCustomTests,
  type CustomTestListItem,
} from "../../revision/engine/customTestService";

export interface ScheduleTestsSelection {
  tests: CustomTestListItem[];
  /** ISO datetime shared by every scheduled card. */
  datetime: string;
  /** Optional shared note shown on every scheduled card. */
  description?: string;
  /** Manual fallback used only when no existing test is selected. */
  blank?: { title: string; totalQuestions: number };
}

interface ScheduleTestModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (selection: ScheduleTestsSelection) => void;
  /** Swap to the import overlay (keeps the same stair anchor). */
  onImportInstead?: () => void;
}

function defaultDatetimeLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** All local revision-DB keys that could hold this user's created tests. */
function candidateUids(resolved: string): string[] {
  const out = [resolved];
  if (resolved !== "guest") out.push("guest");
  if (resolved !== "") out.push("");
  return out;
}

function collectCreatedTests(resolvedUid: string): CustomTestListItem[] {
  const seen = new Set<number>();
  const out: CustomTestListItem[] = [];
  for (const uid of candidateUids(resolvedUid)) {
    try {
      for (const t of listCustomTests(uid)) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          out.push(t);
        }
      }
    } catch {
      // A corrupt DB under one key must not hide the healthy ones.
    }
  }
  return out.sort((a, b) => b.id - a.id);
}

function statusPill(status: CustomTestListItem["status"], score: number | null) {
  if (status === "completed")
    return { label: score !== null ? `Scored ${score}%` : "Completed", cls: "bg-sky-500/20 text-sky-200 ring-sky-400/30" };
  if (status === "in_progress") return { label: "In progress", cls: "bg-amber-500/20 text-amber-200 ring-amber-400/30" };
  return { label: "Available", cls: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30" };
}

export function ScheduleTestModal({ open, onClose, onSchedule, onImportInstead }: ScheduleTestModalProps) {
  const { user } = useAuth();
  const resolvedUid = useMemo(() => {
    try {
      return user?.id || auth?.currentUser?.uid || "guest";
    } catch {
      return user?.id || "guest";
    }
  }, [user?.id]);

  const [tests, setTests] = useState<CustomTestListItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [datetimeLocal, setDatetimeLocal] = useState(defaultDatetimeLocal);
  const [description, setDescription] = useState("");
  const [blankOpen, setBlankOpen] = useState(false);
  const [blankTitle, setBlankTitle] = useState("");
  const [blankQuestions, setBlankQuestions] = useState(10);

  // (Re)load the created tests every time the overlay opens, and refresh
  // live if a test is created elsewhere while it stays open.
  useEffect(() => {
    if (!open) return;
    setTests(collectCreatedTests(resolvedUid));
    setSelected(new Set());
    setDropdownOpen(false);
    setFilter("");
    setDatetimeLocal(defaultDatetimeLocal());
    setDescription("");
    setBlankOpen(false);
    setBlankTitle("");
    setBlankQuestions(10);
    const onDbChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (!detail?.uid || candidateUids(resolvedUid).includes(detail.uid)) {
        setTests(collectCreatedTests(resolvedUid));
      }
    };
    window.addEventListener("revision-db-changed", onDbChanged);
    return () => window.removeEventListener("revision-db-changed", onDbChanged);
  }, [open, resolvedUid]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.planDetails.subjectNames.some((s) => s.toLowerCase().includes(q)),
    );
  }, [tests, filter]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of visible) next.add(t.id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const selectedTests = useMemo(
    () => tests.filter((t) => selected.has(t.id)),
    [tests, selected],
  );

  const canScheduleBlank =
    selectedTests.length === 0 && blankOpen && blankTitle.trim().length > 0 && blankQuestions > 0;
  const canSchedule = selectedTests.length > 0 || canScheduleBlank;

  const submitLabel = selectedTests.length
    ? `Schedule ${selectedTests.length} test${selectedTests.length === 1 ? "" : "s"}`
    : "Schedule test plan";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSchedule) return;
    const datetime = new Date(datetimeLocal || defaultDatetimeLocal()).toISOString();
    onSchedule({
      tests: selectedTests,
      datetime,
      description: description.trim() || undefined,
      ...(selectedTests.length === 0 && blankOpen
        ? { blank: { title: blankTitle.trim(), totalQuestions: Math.max(1, Math.round(blankQuestions) || 1) } }
        : {}),
    });
  }

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col sm:max-h-[85vh] sm:max-w-lg md:max-w-xl"
          >
            <GlassSurface
              radius={24}
              className="flex flex-col overflow-hidden text-fp-text"
              contentClassName="flex flex-col overflow-hidden p-0"
            >
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5 md:px-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30 md:h-11 md:w-11">
                  <CalendarPlus className="h-5 w-5 md:h-6 md:w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-fp-muted md:text-xs">
                    Revision · Direct on FlowPath
                  </p>
                  <h2 className="font-display truncate text-lg font-semibold text-fp-text md:text-xl">
                    Schedule Test
                  </h2>
                </div>
                <GlassButton
                  onClick={onClose}
                  className="ml-auto shrink-0 [&_.size-12]:size-8 md:[&_.size-12]:size-9"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </GlassButton>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 md:p-6">
                <div className="space-y-4 md:space-y-5">
                  {tests.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25">
                        <FlaskConical className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white md:text-[15px]">No tests created yet</p>
                        <p className="mt-1 text-xs leading-relaxed text-white/60 md:text-[13px]">
                          Create or import a test first — then schedule it on your flow from here.
                        </p>
                      </div>
                      <div className="mt-1 grid w-full gap-2 sm:grid-cols-2">
                        {onImportInstead && (
                          <button
                            type="button"
                            onClick={onImportInstead}
                            className="flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
                          >
                            <FileUp className="h-4 w-4" /> Import test
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "#/revision";
                          }}
                          className="flex min-h-[44px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15"
                        >
                          Open Revision
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs">
                        Already created tests — tap to choose
                      </span>
                      {/* Dropdown trigger */}
                      <button
                        type="button"
                        onClick={() => setDropdownOpen((v) => !v)}
                        aria-expanded={dropdownOpen}
                        className="dc-field flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm text-fp-text outline-none transition hover:border-emerald-400/40 md:text-[15px]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
                          <ListChecks className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {selected.size === 0
                              ? `Choose tests… (${tests.length} available)`
                              : `${selected.size} test${selected.size === 1 ? "" : "s"} selected`}
                          </span>
                          <span className="block truncate text-[11px] font-normal text-white/55 md:text-xs">
                            {selected.size === 0
                              ? "Tap to see every test you created"
                              : selectedTests
                                  .slice(0, 2)
                                  .map((t) => t.title)
                                  .join(" · ") +
                                (selectedTests.length > 2 ? ` +${selectedTests.length - 2} more` : "")}
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {/* Dropdown checklist */}
                      <AnimatePresence initial={false}>
                        {dropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 overflow-hidden rounded-2xl border border-white/12 bg-black/30">
                              <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
                                <div className="relative min-w-0 flex-1">
                                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                                  <input
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    placeholder="Search tests…"
                                    className="dc-field w-full rounded-full border py-2 pl-9 pr-3 text-[13px] text-fp-text outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={selectAllVisible}
                                  className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/15"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={clearSelection}
                                  className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-white/60 transition hover:bg-white/10"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="max-h-64 overflow-y-auto overscroll-contain p-2">
                                {visible.length === 0 ? (
                                  <p className="px-3 py-6 text-center text-xs text-white/55">
                                    No tests match “{filter.trim()}”.
                                  </p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {visible.map((t) => {
                                      const checked = selected.has(t.id);
                                      const pill = statusPill(t.status, t.score);
                                      return (
                                        <li key={t.id}>
                                          <div
                                            role="checkbox"
                                            aria-checked={checked}
                                            tabIndex={0}
                                            onClick={() => toggle(t.id)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                toggle(t.id);
                                              }
                                            }}
                                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 outline-none transition active:scale-[0.99] ${
                                              checked
                                                ? "border-emerald-400/50 bg-emerald-500/10"
                                                : "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]"
                                            }`}
                                          >
                                            <span
                                              className="mt-0.5 shrink-0"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggle(t.id);
                                              }}
                                            >
                                              <GlassCheckbox
                                                checked={checked}
                                                onCheckedChange={() => toggle(t.id)}
                                                ariaLabel={`Select ${t.title}`}
                                                tabIndex={-1}
                                              />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-[13.5px] font-bold text-white md:text-sm">
                                                {t.title}
                                              </span>
                                              <span className="mt-0.5 block text-[11px] font-medium text-white/65 md:text-xs">
                                                {t.totalQuestions} questions · ~{t.estimatedMinutes} min ·{" "}
                                                {t.testDate}
                                              </span>
                                              {t.planDetails.subjectNames.length > 0 && (
                                                <span className="mt-0.5 block truncate text-[11px] text-white/50">
                                                  {t.planDetails.subjectNames.slice(0, 3).join(" · ")}
                                                  {t.planDetails.subjectNames.length > 3 ? "…" : ""}
                                                </span>
                                              )}
                                              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                <span
                                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                                                    t.source === "ai"
                                                      ? "bg-violet-500/20 text-violet-200 ring-violet-400/30"
                                                      : "bg-sky-500/20 text-sky-200 ring-sky-400/30"
                                                  }`}
                                                >
                                                  {t.source === "ai" ? "AI generated" : "Imported"}
                                                </span>
                                                <span
                                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${pill.cls}`}
                                                >
                                                  {pill.label}
                                                </span>
                                              </span>
                                            </span>
                                            {checked && (
                                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                              </span>
                                            )}
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Shared schedule time */}
                  <div>
                    <label
                      htmlFor="fp-schedule-test-datetime"
                      className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs"
                    >
                      Date &amp; time — when to place on stair
                    </label>
                    <input
                      id="fp-schedule-test-datetime"
                      type="datetime-local"
                      value={datetimeLocal}
                      onChange={(e) => setDatetimeLocal(e.target.value)}
                      className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none [color-scheme:dark] md:py-3.5 md:text-[15px]"
                    />
                  </div>

                  {/* Shared note */}
                  <div>
                    <label
                      htmlFor="fp-schedule-test-note"
                      className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-fp-muted md:text-xs"
                    >
                      Note for the scheduled card{selectedTests.length > 1 ? "s" : ""} (optional)
                    </label>
                    <textarea
                      id="fp-schedule-test-note"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="dc-field w-full resize-none rounded-2xl border px-4 py-3 text-sm text-fp-text outline-none md:text-[15px]"
                      placeholder="e.g. Revise before Sunday's mock — shown on each scheduled card"
                    />
                  </div>

                  {/* Blank-plan fallback */}
                  {selectedTests.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={() => setBlankOpen((v) => !v)}
                        aria-expanded={blankOpen}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                      >
                        <span className="text-xs font-bold text-white/75 md:text-[13px]">
                          Or schedule a new blank test plan
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-white/50 transition-transform duration-200 ${blankOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {blankOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_130px]">
                              <input
                                value={blankTitle}
                                onChange={(e) => setBlankTitle(e.target.value)}
                                placeholder="Plan title — e.g. Sunday Mock Test"
                                className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none"
                              />
                              <input
                                type="number"
                                min={1}
                                value={blankQuestions}
                                onChange={(e) => setBlankQuestions(Number(e.target.value))}
                                aria-label="Total questions"
                                title="Total questions"
                                className="dc-field w-full rounded-full border px-4 py-3 text-sm text-fp-text outline-none"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 p-4 sm:p-5 md:p-6">
                <div className="flex gap-2.5 md:gap-3">
                  <GlassButton
                    variant="capsule"
                    onClick={onClose}
                    className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4 md:[&>span>div]:h-12"
                  >
                    Cancel
                  </GlassButton>
                  <button
                    type="submit"
                    disabled={!canSchedule}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 md:min-h-[48px] md:text-[15px]"
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                    {submitLabel}
                  </button>
                </div>
                <p className="mt-2.5 text-center text-[10px] leading-5 text-white/40 md:text-[11px]">
                  {selectedTests.length > 1
                    ? `${selectedTests.length} cards will be placed on your selected stair in order — no need to leave FlowPath.`
                    : "Will be scheduled directly on your selected stair — no need to leave FlowPath."}
                </p>
              </div>
            </GlassSurface>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
