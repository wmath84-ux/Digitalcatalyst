// src/course/CourseBrainPanel.tsx
//
// The Course Player's BRAIN tab — practice sets imported by the admin on the
// Product / Course-content page (resource type "Brain · practice set").
//
// The design is the revision test-taking page, exactly
// (src/revision/pages/TestPlayerPage.tsx):
//
//   · the top ProgressBar,
//   · the question Card with the difficulty Badge and the
//     "{subjectIcon} {subjectName} · {topicName}" chip,
//   · the GlassTile answer options (indigo-600 letter circle + indigo ink on
//     the chosen one, "Skip this question" underneath),
//   · the swipeable scroller (60px threshold, same as revision),
//   · the `dc-scene-plate dc-scene-plate--bar` footer with Previous / Next,
//   · the 5-column review grid with its indigo/amber legend + "Submit …",
//   · the submit confirmation dialog (same glass card, same copy, same
//     buttons) — scoped to this panel instead of the revision page column,
//   · and the result / answer-review screens in the same revision language
//     (score card, correct/wrong/skipped chips, accuracy bar, topic
//     breakdown, per-question review with explanations).
//
// One difference: this page lives INSIDE the player's study pane, so it fills
// the pane instead of a page, and its type + cards scale with the viewport via
// `--brain-scale` (1 on a phone — the revision page's own pixel sizes — up to
// 1.24 on a wide pane). Every scaled metric is written as
// `calc(<the revision px> * var(--brain-scale))`, so the design is the
// revision design at 1× and simply grows with the screen.
//
// What the learner sees comes straight off the course tree: a `brain` file
// carries `practiceQuestions` (see utils/practiceSet.js). Nothing is fetched
// separately, and nothing is written to the revision engine — practice sets
// belong to their module, not to the revision Test Bank.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { Brain, RotateCcw } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import { GlassTile } from "../components/ui/glass-tile";
import { Badge, Card, PrimaryButton, ProgressBar, SecondaryButton } from "../revision/components/ui";
import { CheckIcon, ChevronRightIcon, MinusIcon, XIcon } from "../revision/components/icons";
import { collectBrainPracticeSets } from "../../utils/practiceSet.js";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const SWIPE_THRESHOLD = 60;
/** The score that marks the module's Brain resource complete in the player. */
export const BRAIN_PASS_SCORE = 60;

/** Chip-row sentinel: "show every practice set in the course", not one module. */
const ALL_MODULES = "__all__";

const S = (px: number) => `calc(${px}px * var(--brain-scale, 1))`;

/**
 * One practice set, exactly as `collectBrainPracticeSets` (the shared
 * `utils/practiceSet.js` normaliser) builds it — derived rather than
 * re-declared, so the player and the util can never drift apart.
 */
export type BrainPracticeSet = ReturnType<typeof collectBrainPracticeSets>[number];

type BrainPracticeScore = { attempts: number; best: number; last: number; at: number };

export interface CourseBrainPanelProps {
  productId: string;
  /** Every practice set this learner may open, across the whole course. */
  sets: BrainPracticeSet[];
  /**
   * The module the learner is currently watching. The Brain tab follows it —
   * "practice for the module I am in" — exactly like the notes and mind map
   * tabs do. Null (nothing selected yet) shows the whole course's practice.
   */
  activeModuleId?: string | null;
  /** File ids the player already counts as complete (shows the ✓ on a set). */
  completedFileIds?: Set<string>;
  /** Called once when a set is finished with BRAIN_PASS_SCORE or better. */
  onPass?: (fileId: string, score: number) => void;
  /** A set to open immediately (a Brain resource tapped in the Modules list). */
  openSetId?: string | null;
  /** Told once the pinned set has been opened, so the parent can clear it. */
  onOpenedSet?: () => void;
}

/* ------------------------------------------------------------------ */
/* Per-device practice history (no backend, no revision-bank writes)    */
/* ------------------------------------------------------------------ */

const scoreKey = (productId: string) => `dc:courseBrain:${productId}`;

function loadScores(productId: string): Record<string, BrainPracticeScore> {
  try {
    const raw = localStorage.getItem(scoreKey(productId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BrainPracticeScore>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveScores(productId: string, scores: Record<string, BrainPracticeScore>) {
  try {
    localStorage.setItem(scoreKey(productId), JSON.stringify(scores));
  } catch {
    /* private mode / quota — the practice still works, only history is lost */
  }
}

/* ------------------------------------------------------------------ */
/* Module chip — how a learner moves between modules' practice         */
/* ------------------------------------------------------------------ */

function ModuleChip({
  label,
  count,
  active = false,
  onClick,
}: {
  label: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const base = "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition";
  return (
    <button
      type="button"
      data-brain-module-chip=""
      data-brain-module-chip-active={active ? "true" : undefined}
      onClick={onClick}
      className={`${base} ${
        active
          ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/70 hover:text-white"
      }`}
      style={{ fontSize: S(11), padding: `${S(5)} ${S(11)}` }}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      <span className={`rounded-full px-1.5 ${active ? "bg-emerald-400/25" : "bg-white/10"}`} style={{ fontSize: S(10) }}>
        {count}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

export default function CourseBrainPanel({
  productId,
  sets,
  activeModuleId = null,
  completedFileIds,
  onPass,
  openSetId = null,
  onOpenedSet,
}: CourseBrainPanelProps) {
  const [scores, setScores] = useState<Record<string, BrainPracticeScore>>(() => loadScores(productId));
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [mode, setMode] = useState<"question" | "review" | "result" | "answers">("question");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [passedNow, setPassedNow] = useState(false);
  /**
   * The module whose practice is on screen. It FOLLOWS the lesson the learner
   * is watching; picking another module in the chip row pins it until the
   * lesson changes again (which clears the pin below).
   */
  const [moduleOverride, setModuleOverride] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const scoredRef = useRef<string | null>(null);

  useEffect(() => {
    setScores(loadScores(productId));
  }, [productId]);

  // Switching lessons returns the Brain tab to that module's practice and
  // closes any half-played set — the tab is never left showing a stale module.
  useEffect(() => {
    setModuleOverride(null);
    setActiveSetId(null);
    setMode("question");
    setCurrentIndex(0);
    setSelections({});
    setShowSubmitConfirm(false);
    setPassedNow(false);
  }, [activeModuleId]);

  /** Modules that actually have practice to show, in curriculum order. */
  const practiceModules = useMemo(() => {
    const seen = new Map<string, { id: string; title: string; count: number }>();
    for (const set of sets) {
      const entry = seen.get(set.moduleId) ?? { id: set.moduleId, title: set.moduleTitle, count: 0 };
      entry.count += 1;
      seen.set(set.moduleId, entry);
    }
    return [...seen.values()];
  }, [sets]);

  /** The set list the tab is showing: the pinned module, else the lesson's. */
  const moduleSets = useMemo(() => {
    // "*" is the explicit "show me the whole course" pick from the chip row;
    // null means "follow the lesson I am watching".
    const target = moduleOverride === ALL_MODULES ? null : moduleOverride ?? activeModuleId;
    if (!target) return sets;
    // A module with no practice of its own still shows the module chip row and
    // the honest empty state below — never another module's questions.
    return sets.filter((set) => set.moduleId === target);
  }, [sets, moduleOverride, activeModuleId]);

  /** Every state change that starts a set from scratch, in one place. */
  const openSet = useCallback((setId: string) => {
    setActiveSetId(setId);
    setMode("question");
    setCurrentIndex(0);
    setSelections({});
    setShowSubmitConfirm(false);
    setPassedNow(false);
  }, []);

  /**
   * A Brain resource tapped in the Modules list (or a deep link) opens its set.
   * The tapped set also PINS its own module, so the set opens even when the
   * learner was watching a lesson in another module.
   */
  useEffect(() => {
    if (!openSetId) return;
    const pinned = sets.find((set) => set.id === openSetId);
    if (!pinned) return;
    setModuleOverride(pinned.moduleId);
    openSet(pinned.id);
    onOpenedSet?.();
    // `sets`/`onOpenedSet` are intentionally not dependencies: opening a pinned
    // set must happen once per pin, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSetId]);

  const activeSet = useMemo(() => sets.find((set) => set.id === activeSetId) ?? null, [sets, activeSetId]);
  const questions = activeSet?.questions ?? [];
  const total = questions.length;
  const question = total ? questions[Math.min(currentIndex, total - 1)] : null;
  const unansweredCount = total - questions.filter((_, index) => selections[index] !== undefined).length;

  const stats = useMemo(() => {
    if (!total) return { correct: 0, wrong: 0, skipped: 0, score: 0, byTopic: [] as Array<{ topic: string; correct: number; total: number; accuracy: number }> };
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const topics = new Map<string, { correct: number; total: number }>();
    questions.forEach((item, index) => {
      const picked = selections[index];
      const topic = item.topic || "Practice";
      const bucket = topics.get(topic) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (picked === undefined) skipped += 1;
      else if (picked === item.correctIndex) {
        correct += 1;
        bucket.correct += 1;
      } else wrong += 1;
      topics.set(topic, bucket);
    });
    return {
      correct,
      wrong,
      skipped,
      score: Math.round((correct / total) * 100),
      byTopic: [...topics.entries()].map(([topic, value]) => ({
        topic,
        correct: value.correct,
        total: value.total,
        accuracy: Math.round((value.correct / value.total) * 100),
      })),
    };
  }, [questions, selections, total]);

  /* ── actions ─────────────────────────────────────────────────────────── */

  function startSet(setId: string) {
    openSet(setId);
  }

  function backToLibrary() {
    setActiveSetId(null);
    setMode("question");
    setCurrentIndex(0);
    setSelections({});
    setShowSubmitConfirm(false);
    setPassedNow(false);
  }

  function selectOption(optionIndex: number) {
    if (!question) return;
    setSelections((previous) => ({ ...previous, [currentIndex]: optionIndex }));
  }

  function goNext() {
    if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
    else setMode("review");
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }

  function handleSubmit() {
    if (!activeSet) return;
    const score = stats.score;
    const next = { ...scores, [activeSet.id]: { attempts: (scores[activeSet.id]?.attempts ?? 0) + 1, best: Math.max(score, scores[activeSet.id]?.best ?? 0), last: score, at: Date.now() } };
    setScores(next);
    saveScores(productId, next);
    setShowSubmitConfirm(false);
    setMode("result");
    // A pass marks the module's Brain resource complete in the player — once
    // per submitted attempt, never on a mere re-render.
    const passKey = `${activeSet.id}:${next[activeSet.id].attempts}`;
    if (score >= BRAIN_PASS_SCORE && scoredRef.current !== passKey) {
      scoredRef.current = passKey;
      setPassedNow(true);
      onPass?.(activeSet.id, score);
    } else {
      setPassedNow(false);
    }
  }

  function onTouchStart(event: ReactTouchEvent) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: ReactTouchEvent) {
    if (touchStartXRef.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (mode !== "question") return;
    if (delta > 0) goPrev();
    else goNext();
  }

  /* ── library — every practice set the admin imported for this course ─── */

  if (!activeSet) {
    return (
      <div
        className="flex h-full min-h-0 flex-col px-3 py-3"
        data-course-brain-panel=""
        data-brain-screen="library"
        style={{ fontSize: S(16) }}
      >
        {practiceModules.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1" data-brain-module-row>
            {practiceModules.length > 1 ? (
              <>
                <ModuleChip
                  label="All modules"
                  count={sets.length}
                  active={moduleOverride === ALL_MODULES}
                  onClick={() => {
                    setModuleOverride(ALL_MODULES);
                    setActiveSetId(null);
                  }}
                />
                {practiceModules.map((entry) => (
                  <ModuleChip
                    key={entry.id}
                    label={entry.title}
                    count={entry.count}
                    active={(moduleOverride === ALL_MODULES ? null : moduleOverride ?? activeModuleId) === entry.id}
                    onClick={() => {
                      setModuleOverride(entry.id);
                      setActiveSetId(null);
                    }}
                  />
                ))}
              </>
            ) : (
              <ModuleChip label={practiceModules[0].title} count={practiceModules[0].count} active />
            )}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ marginTop: practiceModules.length > 0 ? S(10) : 0 }}>
        {moduleSets.length === 0 ? (
          <Card className="brain-card" style={{ padding: S(16) } as CSSProperties}>
            <div className="flex flex-col items-center gap-2 py-6 text-center" data-brain-empty>
              <span className="flex items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300" style={{ height: S(56), width: S(56) }}>
                <Brain style={{ height: S(26), width: S(26) }} />
              </span>
              <p className="font-black text-white" style={{ fontSize: S(14) }}>Brain</p>
              <p className="font-semibold text-white/55" style={{ fontSize: S(11) }}>
                {sets.length === 0
                  ? "Practice sets for this course will appear here as soon as your teacher adds them."
                  : "No practice sets in this module yet. Open another module, or browse everything your teacher has added."}
              </p>
              {sets.length > 0 ? (
                <div style={{ marginTop: S(8) }}>
                  <SecondaryButton
                    onClick={() => {
                      setModuleOverride(ALL_MODULES);
                      setActiveSetId(null);
                    }}
                  >
                    Show all practice sets
                  </SecondaryButton>
                </div>
              ) : null}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {moduleSets.map((set) => {
              const record = scores[set.id];
              const done = completedFileIds?.has(set.id) ?? false;
              return (
                <Card key={set.id} className="brain-card" data-brain-set={set.id} style={{ padding: S(16) } as CSSProperties}>
                  <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: S(8) }}>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 font-semibold text-white/85" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                      {set.moduleTitle}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/20 font-semibold text-emerald-200" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                      {set.questions.length} question{set.questions.length === 1 ? "" : "s"}
                    </span>
                    {done ? (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-600 font-bold text-white" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                        <CheckIcon style={{ height: S(12), width: S(12) }} /> Done
                      </span>
                    ) : null}
                  </div>
                  <h2 className="font-semibold leading-snug text-white" style={{ fontSize: S(19) }}>{set.title}</h2>
                  {record ? (
                    <div className="flex items-center gap-2" style={{ marginTop: S(8) }}>
                      <ProgressBar value={record.best} />
                      <span className="shrink-0 font-bold text-indigo-200" style={{ fontSize: S(12) }}>Best {record.best}%</span>
                    </div>
                  ) : (
                    <p className="font-medium text-white/55" style={{ marginTop: S(6), fontSize: S(12) }}>
                      Not attempted yet.
                    </p>
                  )}
                  {record ? (
                    <p className="font-medium text-white/45" style={{ marginTop: S(6), fontSize: S(11) }}>
                      {record.attempts} attempt{record.attempts === 1 ? "" : "s"} · last {record.last}%
                    </p>
                  ) : null}
                  <div style={{ marginTop: S(12) }}>
                    <PrimaryButton onClick={() => startSet(set.id)}>
                      {record ? "Practice again" : "Start practice"}
                      <ChevronRightIcon style={{ height: S(16), width: S(16) }} />
                    </PrimaryButton>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </div>
    );
  }

  /* ── review — the revision review grid, exactly ──────────────────────── */

  if (mode === "review") {
    return (
      <div className="flex h-full min-h-0 flex-col" data-course-brain-panel="" data-brain-screen="review" style={{ fontSize: S(16) }}>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <Card className="brain-card" style={{ padding: S(16) } as CSSProperties}>
            <p className="text-white/75" style={{ fontSize: S(14), marginBottom: S(16) }}>
              Tap any question to jump back and change your answer before you submit.
            </p>
            <div className="grid grid-cols-5" style={{ gap: S(10) }}>
              {questions.map((item, index) => {
                const answered = selections[index] !== undefined;
                return (
                  <GlassTile
                    key={`${item.id}-${index}`}
                    onClick={() => {
                      setCurrentIndex(index);
                      setMode("question");
                    }}
                    className={`dc-tile aspect-auto rounded-xl font-bold ${
                      answered ? "ring-1 ring-indigo-400/50 text-indigo-200" : "ring-1 ring-amber-400/50 text-amber-200"
                    }`}
                    style={{ height: S(48), fontSize: S(14) }}
                  >
                    {index + 1}
                  </GlassTile>
                );
              })}
            </div>
            <div className="flex items-center gap-4 font-medium text-white/75" style={{ marginTop: S(20), fontSize: S(12) }}>
              <span className="flex items-center gap-1.5">
                <span className="rounded-full bg-indigo-400" style={{ height: S(10), width: S(10) }} /> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="rounded-full bg-amber-400" style={{ height: S(10), width: S(10) }} /> Unanswered
              </span>
            </div>
          </Card>
        </div>
        <div
          className="dc-scene-plate dc-scene-plate--bar flex border-t border-white/10 bg-[var(--dc-chrome-glass)] [backdrop-filter:var(--dc-chrome-glass-blur)]"
          style={{ gap: S(12), padding: `${S(12)} ${S(16)} calc(env(safe-area-inset-bottom) + ${S(12)})` }}
        >
          <SecondaryButton onClick={() => setMode("question")} className="flex-1">
            Back
          </SecondaryButton>
          <PrimaryButton onClick={() => setShowSubmitConfirm(true)} className="flex-1">
            Submit Practice
          </PrimaryButton>
        </div>
        {showSubmitConfirm ? (
          <BrainSubmitDialog
            title="Submit your practice?"
            unansweredCount={unansweredCount}
            confirmLabel="Submit"
            onCancel={() => setShowSubmitConfirm(false)}
            onConfirm={handleSubmit}
          />
        ) : null}
      </div>
    );
  }

  /* ── result — the revision result page, exactly ──────────────────────── */

  if (mode === "result") {
    const message =
      stats.score >= 90 ? "Outstanding work! 🎉" : stats.score >= 70 ? "Great job today! 👏" : stats.score >= 50 ? "Good effort, keep going! 💪" : "Every practice makes you sharper. Let's revise! 📘";
    return (
      <div className="h-full overflow-y-auto px-3 py-3" data-course-brain-panel="" data-brain-screen="result" style={{ fontSize: S(16) }}>
        <div className="space-y-4">
          <Card className="brain-card bg-indigo-600 text-center text-white" data-brain-score-card style={{ padding: S(16) } as CSSProperties}>
            <p className="font-semibold text-indigo-100" style={{ fontSize: S(12) }}>
              {activeSet.title}
            </p>
            <p className="font-bold uppercase text-indigo-200" style={{ fontSize: S(10), letterSpacing: "0.16em", marginTop: S(4) }}>
              {activeSet.moduleTitle}
            </p>
            <p className="font-semibold uppercase text-indigo-100" style={{ fontSize: S(12), marginTop: S(8) }}>
              Your Score
            </p>
            <p className="font-extrabold" style={{ fontSize: S(48), marginTop: S(4) }}>{stats.score}%</p>
            <p className="text-indigo-100" style={{ fontSize: S(14), marginTop: S(4) }}>{message}</p>
            {passedNow ? (
              <p className="mx-auto flex w-max items-center gap-1.5 rounded-full bg-white/20 font-bold text-white" style={{ fontSize: S(11), marginTop: S(10), padding: `${S(4)} ${S(12)}` }} data-brain-passed>
                <CheckIcon style={{ height: S(13), width: S(13) }} /> Module marked complete
              </p>
            ) : null}
          </Card>

          <Card className="brain-card" style={{ padding: S(12) } as CSSProperties}>
            <div className="grid grid-cols-3" style={{ gap: S(12) }} data-brain-result-grid>
              <ResultChip icon={<CheckIcon className="text-emerald-300" style={{ height: S(20), width: S(20) }} />} label="Correct" value={stats.correct} tone="bg-emerald-500/20" />
              <ResultChip icon={<XIcon className="text-rose-300" style={{ height: S(20), width: S(20) }} />} label="Wrong" value={stats.wrong} tone="bg-rose-500/20" />
              <ResultChip icon={<MinusIcon className="text-white/55" style={{ height: S(20), width: S(20) }} />} label="Skipped" value={stats.skipped} tone="border border-white/15" />
            </div>
          </Card>

          <Card className="brain-card" style={{ padding: S(16) } as CSSProperties}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white" style={{ fontSize: S(15) }}>Accuracy</h2>
              <span className="font-bold text-indigo-300" style={{ fontSize: S(14) }}>{stats.score}%</span>
            </div>
            <div style={{ marginTop: S(8) }}>
              <ProgressBar value={stats.score} />
            </div>
            <p className="font-medium text-white/55" style={{ fontSize: S(12), marginTop: S(8) }}>
              {stats.correct} correct out of {total} questions
            </p>
          </Card>

          {stats.byTopic.length > 1 ? (
            <Card className="brain-card" style={{ padding: S(16) } as CSSProperties}>
              <h2 className="font-bold text-white" style={{ fontSize: S(15), marginBottom: S(12) }}>Topic Breakdown</h2>
              <div style={{ display: "grid", gap: S(12) }}>
                {[...stats.byTopic].sort((a, b) => a.accuracy - b.accuracy).map((topic) => (
                  <div key={topic.topic} className="flex items-center" style={{ gap: S(12) }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium text-white/85" style={{ fontSize: S(14) }}>{topic.topic}</p>
                        <span className="font-semibold text-white/75" style={{ fontSize: S(12), marginLeft: S(8) }}>
                          {topic.correct}/{topic.total} · {topic.accuracy}%
                        </span>
                      </div>
                      <div style={{ marginTop: S(6) }}>
                        <ProgressBar value={topic.accuracy} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="space-y-3">
            <PrimaryButton onClick={() => setMode("answers")}>Review Answers</PrimaryButton>
            <div className="grid grid-cols-2" style={{ gap: S(8) }}>
              <SecondaryButton onClick={() => startSet(activeSet.id)}>
                <RotateCcw style={{ height: S(16), width: S(16) }} /> Practice again
              </SecondaryButton>
              <SecondaryButton onClick={backToLibrary}>All practice sets</SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── answers — the revision answer-review page, exactly ──────────────── */

  if (mode === "answers") {
    return (
      <div className="h-full overflow-y-auto px-3 py-3" data-course-brain-panel="" data-brain-screen="answers" style={{ fontSize: S(16) }}>
        <div className="space-y-4">
          {questions.map((item, index) => {
            const picked = selections[index];
            const status = picked === undefined ? "skipped" : picked === item.correctIndex ? "correct" : "wrong";
            const ring = status === "correct" ? "ring-1 ring-emerald-400/40" : status === "wrong" ? "ring-1 ring-rose-400/40" : "";
            return (
              <Card key={`${item.id}-${index}`} className={`brain-card ${ring}`} style={{ padding: S(16) } as CSSProperties}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white/55" style={{ fontSize: S(12) }}>Q{index + 1}</span>
                  <Badge tone={item.difficulty}>{item.difficulty}</Badge>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 font-semibold text-white/85" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                    {item.topic || activeSet.moduleTitle}
                  </span>
                  {status === "correct" ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-600 font-bold text-white" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                      <CheckIcon style={{ height: S(12), width: S(12) }} /> Correct
                    </span>
                  ) : status === "wrong" ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-rose-600 font-bold text-white" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                      <XIcon style={{ height: S(12), width: S(12) }} /> Incorrect
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 rounded-full border border-white/20 font-bold text-white/85" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                      <MinusIcon style={{ height: S(12), width: S(12) }} /> Skipped
                    </span>
                  )}
                </div>
                <p className="font-semibold leading-snug text-white" style={{ fontSize: S(15) }}>{item.prompt}</p>
                <div style={{ marginTop: S(12), display: "grid", gap: S(8) }}>
                  {item.options.map((option, optionIndex) => {
                    const isCorrect = optionIndex === item.correctIndex;
                    const isPicked = optionIndex === picked;
                    const tone = isCorrect
                      ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
                      : isPicked
                        ? "border-rose-400/30 bg-rose-500/20 text-rose-200"
                        : "border-white/15 text-white/85";
                    return (
                      <div key={optionIndex} className={`flex items-center rounded-xl border px-3 py-2.5 font-medium ${tone}`} style={{ gap: S(10), fontSize: S(14) }}>
                        <span className="flex shrink-0 items-center justify-center rounded-full border border-current/30 font-bold" style={{ height: S(24), width: S(24), fontSize: S(11) }}>
                          {OPTION_LETTERS[optionIndex]}
                        </span>
                        <span className="flex-1">{option}</span>
                        {isCorrect ? <CheckIcon className="shrink-0 text-emerald-300" style={{ height: S(16), width: S(16) }} /> : null}
                        {isPicked && !isCorrect ? <XIcon className="shrink-0 text-rose-300" style={{ height: S(16), width: S(16) }} /> : null}
                      </div>
                    );
                  })}
                </div>
                {item.explanation ? (
                  <div className="rounded-xl border border-white/10" style={{ marginTop: S(12), padding: S(12) }}>
                    <p className="font-bold text-white/75" style={{ fontSize: S(12) }}>Explanation</p>
                    <p className="leading-relaxed text-white/85" style={{ fontSize: S(14), marginTop: S(4) }}>{item.explanation}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
          <div className="space-y-3">
            <PrimaryButton onClick={() => setMode("result")}>Back to result</PrimaryButton>
            <div className="grid grid-cols-2" style={{ gap: S(8) }}>
              <SecondaryButton onClick={() => startSet(activeSet.id)}>
                <RotateCcw style={{ height: S(16), width: S(16) }} /> Practice again
              </SecondaryButton>
              <SecondaryButton onClick={backToLibrary}>All practice sets</SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── question — the revision test-taking page, exactly ───────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col" data-course-brain-panel="" data-brain-screen="question" style={{ fontSize: S(16) }}>
      <div className="flex items-center" style={{ padding: `${S(12)} ${S(16)} 0`, gap: S(8) }}>
        <button
          type="button"
          onClick={backToLibrary}
          className="shrink-0 rounded-full border border-white/15 font-semibold text-white/75 active:text-white"
          style={{ fontSize: S(11), padding: `${S(5)} ${S(10)}` }}
          data-brain-back
        >
          All sets
        </button>
        <p className="min-w-0 flex-1 truncate font-semibold text-white/60" style={{ fontSize: S(11) }}>
          {activeSet.title}
        </p>
      </div>
      <div style={{ padding: `${S(12)} ${S(16)} 0` }}>
        <ProgressBar value={total ? ((currentIndex + 1) / total) * 100 : 0} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: `${S(20)} ${S(16)}` }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {question ? (
          <Card key={currentIndex} className="brain-card animate-fade-in" style={{ padding: S(16) } as CSSProperties} data-brain-question={currentIndex}>
            <div className="flex flex-wrap items-center" style={{ gap: S(8), marginBottom: S(12) }}>
              <Badge tone={question.difficulty}>{question.difficulty}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 font-semibold text-white/85" style={{ fontSize: S(11), padding: `${S(4)} ${S(10)}` }}>
                {question.topic || activeSet.moduleTitle} · Question {currentIndex + 1} of {total}
              </span>
            </div>
            <h2 className="font-semibold leading-snug text-white" style={{ fontSize: S(19) }}>{question.prompt}</h2>

            <div style={{ marginTop: S(20), display: "grid", gap: S(12) }}>
              {question.options.map((option, optionIndex) => {
                const selected = selections[currentIndex] === optionIndex;
                return (
                  <GlassTile
                    key={optionIndex}
                    onClick={() => selectOption(optionIndex)}
                    selected={selected}
                    className={`dc-tile aspect-auto w-full text-left font-medium [&>span]:w-full [&>span]:justify-start [&>span]:gap-3 ${
                      selected ? "text-indigo-200" : "text-white/85"
                    }`}
                    style={{ minHeight: S(56), fontSize: S(15), padding: `${S(12)} ${S(16)}` }}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
                        selected ? "bg-indigo-600 text-white" : "border border-white/20 text-white/75"
                      }`}
                      style={{ height: S(28), width: S(28), fontSize: S(12) }}
                    >
                      {OPTION_LETTERS[optionIndex]}
                    </span>
                    <span className="flex-1">{option}</span>
                  </GlassTile>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="flex w-full items-center justify-center font-semibold text-white/55 active:text-white/75"
              style={{ marginTop: S(16), minHeight: S(44), fontSize: S(14) }}
            >
              Skip this question
            </button>
          </Card>
        ) : null}
      </div>

      <div
        className="dc-scene-plate dc-scene-plate--bar flex border-t border-white/10 bg-[var(--dc-chrome-glass)] [backdrop-filter:var(--dc-chrome-glass-blur)]"
        style={{ gap: S(12), padding: `${S(12)} ${S(16)} calc(env(safe-area-inset-bottom) + ${S(12)})` }}
      >
        <SecondaryButton onClick={goPrev} disabled={currentIndex === 0} className="flex-[1]">
          Previous
        </SecondaryButton>
        <PrimaryButton onClick={goNext} className="flex-[1.4]">
          {currentIndex === total - 1 ? "Review & Submit" : "Next"}
          <ChevronRightIcon style={{ height: S(16), width: S(16) }} />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result chip — the revision result page's own chip                    */
/* ------------------------------------------------------------------ */

function ResultChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl ${tone}`} style={{ gap: S(4), padding: `${S(12)} 0` }}>
      {icon}
      <span className="font-bold text-white" style={{ fontSize: S(18) }}>{value}</span>
      <span className="font-medium text-white/55" style={{ fontSize: S(10) }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Submit dialog — the revision SubmitConfirmModal, scoped to the pane  */
/* ------------------------------------------------------------------ */

function BrainSubmitDialog({
  title,
  unansweredCount,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  unansweredCount: number;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[90] flex items-end justify-center sm:items-center" data-brain-submit-overlay>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onCancel} aria-hidden="true" />
      <GlassSurface
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-submit-title"
        data-brain-submit-dialog
        tint={0.5}
        radius={24}
        className="dc-scene-plate custom-scrollbar relative w-full max-w-[min(100%,26rem)] overflow-hidden text-white"
        contentClassName="flex flex-col p-5 sm:p-6"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30 sm:hidden" />
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h3 id="brain-submit-title" className="text-center text-base font-semibold text-white sm:text-lg">{title}</h3>
        {unansweredCount > 0 ? (
          <p className="mt-2 text-center text-sm leading-relaxed text-white/75">
            You have <span className="font-semibold text-amber-300">{unansweredCount} unanswered question{unansweredCount === 1 ? "" : "s"}</span>{" "}
            that will be marked as skipped. This can&apos;t be undone.
          </p>
        ) : (
          <p className="mt-2 text-center text-sm leading-relaxed text-white/75">
            All questions are answered. Once submitted, you can&apos;t change your answers.
          </p>
        )}
        <div className="mt-5 flex min-w-0 gap-3">
          <SecondaryButton onClick={onCancel} className="min-w-0 flex-1">
            Keep Reviewing
          </SecondaryButton>
          <PrimaryButton onClick={onConfirm} className="min-w-0 flex-1">
            {confirmLabel}
          </PrimaryButton>
        </div>
      </GlassSurface>
    </div>
  );
}
