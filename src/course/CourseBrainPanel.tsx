// src/course/CourseBrainPanel.tsx
//
// The Course Player's BRAIN tab — practice sets imported by the admin on the
// Product / Course-content page (resource type "Brain · practice set").
//
// ── THE QUESTION SCREEN IS THE "PRODUCT CARD DECK" (owner brief, 2026-10-03) ─
//
//   "Course Player ke andar Mind/Brain page par jo Test/MCQ cards hain, unka
//    current design completely replace karo … reference ke card design,
//    stacked-card appearance aur animation ko exactly follow karo … Glass
//    design bilkul use nahi karna hai … user jis option per click kare vahi
//    submit ho jaaye aur card out ho slide hokar next per jaaye … user kisi
//    bhi direction mein swipe kar sake … top-right corner mein ek small
//    circular box jisme current question ka count show ho (1/10, 2/10)."
//
// The reference is https://aicanvas.me/components/product-card-deck, and the
// deck under the question screen is that component, ported card for card
// (stack geometry, drag-tilt, spring, flick thresholds, fly-off and all — see
// src/course/BrainQuestionDeck.tsx). What this panel owns is the practice
// itself:
//
//   · QUESTION   the deck. The top card carries the question, its answers and
//                the round `3/10` counter in its top-right corner. There is
//                NO button on the card: not Previous, not Next, not Skip and
//                not an extra action. Tapping an answer records it and the
//                card flicks itself away; flicking the card in ANY direction
//                (left / right / up / down / diagonal) skips the question.
//                Either way the question behind rises into the top slot and
//                the next question is simply there — nothing to press.
//   · REVIEW     when the last card has flown the practice moves on by
//                itself: the review grid (tap a question to go back to it),
//                the unanswered legend and the docked Submit Practice bar,
//                kept from the revision flow.
//   · SUBMIT     the same confirmation dialog as before, and the same
//                scoring — a pass (BRAIN_PASS_SCORE) still marks the module's
//                Brain resource complete exactly once per attempt.
//   · RESULT     score, correct / wrong / skipped, accuracy, topic breakdown,
//                then Review Answers / Practice again / All practice sets.
//   · ANSWERS    every question with the learner's answer, the correct one and
//                the explanation.
//
// ── NO GLASS ────────────────────────────────────────────────────────────────
//
// The question screen used to be the revision test-taking page: GlassSurface
// cards, GlassTile answers, a `dc-scene-plate` bar. All of it is gone from the
// Brain tab — every surface is now painted with the reference's own solid
// palette (rounded-22 #D3DDEE cards, #111111 ink, the #141312 / #F5F1E8 pill,
// the two reference shadows) through src/course/BrainCards.tsx, with no
// backdrop filter anywhere. The revision Test Player itself is untouched.
//
// ── THE SCALE FOLLOWS THE PANE, NOT THE SCREEN (owner brief, 2026-09-28) ───
//
//   "Course player ke andar jo Brain page ka design hai, itna flexible banao
//    ki vah screen size / jaise area ke according question, option aur jo bhi
//    button hai sab kuchh properly visible ho jaaye."
//
// The Study pane's size is not the screen's: the learner drags the Split Deck
// divider and the pane becomes any height and width, on any device. So the
// panel MEASURES ITSELF (`useFitTarget` + `brainFitScale`, src/course/
// panelFit.ts) and publishes `--brain-scale` on whichever screen is mounted,
// and the deck measures its own box too (`brainDeckSize`) and scales the cards
// with it. A wide pane grows the design; a short one shrinks it (floor 0.8,
// where an answer tile still clears a 44 px touch target) so the question, its
// options and the action bar stay visible instead of being cut.
//
// What the learner sees comes straight off the course tree: a `brain` file
// carries `practiceQuestions` (see utils/practiceSet.js). Nothing is fetched
// separately, and nothing is written to the revision engine — practice sets
// belong to their module, not to the revision Test Bank.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Brain, RotateCcw } from "lucide-react";
import { CheckIcon, MinusIcon, XIcon } from "../revision/components/icons";
import { collectBrainPracticeSets } from "../../utils/practiceSet.js";
import { BRAIN, BrainBadge, BrainPill, BrainProgress, BrainSurface } from "./BrainCards";
import BrainQuestionDeck, { type BrainDeckItem } from "./BrainQuestionDeck";
import { brainFitScale, publishVar, useFitTarget } from "./panelFit";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
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
  return (
    <button
      type="button"
      data-brain-module-chip=""
      data-brain-module-chip-active={active ? "true" : undefined}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition"
      style={{
        fontSize: S(11),
        padding: `${S(5)} ${S(11)}`,
        border: active ? "none" : "1px solid rgba(255,255,255,0.22)",
        background: active ? BRAIN.pill : "transparent",
        color: active ? BRAIN.pillInk : BRAIN.hint,
        cursor: "pointer",
      }}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      <span
        className="rounded-full px-1.5"
        style={{
          fontSize: S(10),
          background: active ? "rgba(245,241,232,0.22)" : "rgba(255,255,255,0.10)",
          color: active ? BRAIN.pillInk : BRAIN.hint,
        }}
      >
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
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [passedNow, setPassedNow] = useState(false);
  /**
   * The deck: the questions still to show, in order. `[0]` is the card on top.
   * `key` is unique per deal (see the token below) so a question that comes
   * back after the learner jumps to it from the review grid mounts as a new
   * card instead of reusing the DOM of the one that flew away.
   */
  const [deck, setDeck] = useState<BrainDeckItem[]>([]);
  const dealRef = useRef(0);
  /**
   * The module whose practice is on screen. It FOLLOWS the lesson the learner
   * is watching; picking another module in the chip row pins it until the
   * lesson changes again (which clears the pin below).
   */
  const [moduleOverride, setModuleOverride] = useState<string | null>(null);
  const scoredRef = useRef<string | null>(null);

  /**
   * The Brain page measures ITS OWN box (see `useFitTarget` / `brainFitScale`)
   * and publishes `--brain-scale` on the mounted screen's root. This is what
   * makes the page follow the Split Deck divider: the study pane's size IS the
   * panel root's size, so dragging the divider re-solves the scale and the
   * question, its options and the action bar re-fit instead of being cut. It
   * is written straight to the DOM (no state, no re-render per frame) and
   * synchronously on attach, so the first paint is already the right size; the
   * `@media` ladder in src/index.css only covers the frames before that.
   */
  const publishBrainFit = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    publishVar(node, "--brain-scale", String(brainFitScale(node.clientWidth, node.clientHeight)));
  }, []);
  const fitRef = useFitTarget(publishBrainFit);

  useEffect(() => {
    setScores(loadScores(productId));
  }, [productId]);

  // Switching lessons returns the Brain tab to that module's practice and
  // closes any half-played set — the tab is never left showing a stale module.
  useEffect(() => {
    setModuleOverride(null);
    setActiveSetId(null);
    setMode("question");
    setSelections({});
    setDeck([]);
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

  const activeSet = useMemo(() => sets.find((set) => set.id === activeSetId) ?? null, [sets, activeSetId]);
  const questions = activeSet?.questions ?? [];
  const total = questions.length;
  const unansweredCount = total - questions.filter((_, index) => selections[index] !== undefined).length;

  /** Deal a fresh deck from `from` to the end of the set. */
  const openDeck = useCallback(
    (from = 0) => {
      dealRef.current += 1;
      const deal = dealRef.current;
      const setId = activeSetId ?? "set";
      setDeck(
        questions.slice(from).map((_, offset) => {
          const index = from + offset;
          return { key: `${setId}:${deal}:${index}`, index };
        }),
      );
      setMode("question");
    },
    [questions, activeSetId],
  );

  /**
   * Back into the deck from the review grid — at the first question that has no
   * answer yet, not at the top of the set. A learner who comes back to finish
   * what they skipped lands straight on it instead of flicking through the
   * questions they already answered (every answered card leaves the deck for
   * good, so a card cannot be re-visited by flicking back anyway).
   */
  const resumeDeck = useCallback(() => {
    const firstUnanswered = questions.findIndex((_, index) => selections[index] === undefined);
    openDeck(firstUnanswered < 0 ? 0 : firstUnanswered);
  }, [questions, selections, openDeck]);

  /** Every state change that starts a set from scratch, in one place. */
  const openSet = useCallback(
    (setId: string) => {
      setActiveSetId(setId);
      setMode("question");
      setSelections({});
      setShowSubmitConfirm(false);
      setPassedNow(false);
      dealRef.current += 1;
      const deal = dealRef.current;
      const target = sets.find((set) => set.id === setId);
      setDeck((target?.questions ?? []).map((_, index) => ({ key: `${setId}:${deal}:${index}`, index })));
    },
    [sets],
  );

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
    setSelections({});
    setDeck([]);
    setShowSubmitConfirm(false);
    setPassedNow(false);
  }

  /** An answer tapped on the top card. Recorded at once — the card then leaves. */
  const answerQuestion = useCallback((questionIndex: number, optionIndex: number) => {
    setSelections((previous) => ({ ...previous, [questionIndex]: optionIndex }));
  }, []);

  /** The top card left the deck (answered or swiped): the next one rises. */
  const dismissTopCard = useCallback(() => {
    setDeck((previous) => previous.slice(1));
  }, []);

  /**
   * The LAST card finished its fly-off. The practice continues on its own —
   * the review grid, then Submit Practice, then the result — so a learner who
   * flicks the final question away still lands in the existing submit flow.
   */
  const finishDeck = useCallback(() => {
    setMode("review");
  }, []);

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

  /* ── library — every practice set the admin imported for this course ─── */

  if (!activeSet) {
    return (
      <div
        ref={fitRef}
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
            <BrainSurface data-brain-empty="" style={{ padding: S(16) }}>
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{ height: S(56), width: S(56), background: BRAIN.pill, color: BRAIN.pillInk }}
                >
                  <Brain style={{ height: S(26), width: S(26) }} />
                </span>
                <p className="font-bold" style={{ fontSize: S(15), color: BRAIN.ink }}>
                  Brain
                </p>
                <p className="font-semibold" style={{ fontSize: S(11), color: BRAIN.inkSoft }}>
                  {sets.length === 0
                    ? "Practice sets for this course will appear here as soon as your teacher adds them."
                    : "No practice sets in this module yet. Open another module, or browse everything your teacher has added."}
                </p>
                {sets.length > 0 ? (
                  <div style={{ marginTop: S(12) }}>
                    <BrainPill
                      onClick={() => {
                        setModuleOverride(ALL_MODULES);
                        setActiveSetId(null);
                      }}
                      style={{ fontSize: S(13), padding: `${S(9)} ${S(18)}` }}
                    >
                      Show all practice sets
                    </BrainPill>
                  </div>
                ) : null}
              </div>
            </BrainSurface>
          ) : (
            <div className="space-y-3">
              {moduleSets.map((set) => {
                const record = scores[set.id];
                const done = completedFileIds?.has(set.id) ?? false;
                return (
                  <BrainSurface key={set.id} data-brain-set={set.id} style={{ padding: S(16) }}>
                    <div className="flex flex-wrap items-center" style={{ gap: S(8), marginBottom: S(10) }}>
                      <BrainBadge tone="module">{set.moduleTitle}</BrainBadge>
                      <BrainBadge tone="count">
                        {set.questions.length} question{set.questions.length === 1 ? "" : "s"}
                      </BrainBadge>
                      {done ? (
                        <span className="ml-auto inline-flex">
                          <BrainBadge tone="done">
                            <CheckIcon style={{ height: S(12), width: S(12) }} /> Done
                          </BrainBadge>
                        </span>
                      ) : null}
                    </div>
                    <h2 className="font-semibold leading-snug" style={{ fontSize: S(19), color: BRAIN.ink }}>
                      {set.title}
                    </h2>
                    {record ? (
                      <div className="flex items-center" style={{ gap: S(10), marginTop: S(10) }}>
                        <BrainProgress value={record.best} style={{ flex: 1 }} />
                        <span className="shrink-0 font-bold" style={{ fontSize: S(12), color: BRAIN.ink }}>
                          Best {record.best}%
                        </span>
                      </div>
                    ) : (
                      <p className="font-medium" style={{ marginTop: S(6), fontSize: S(12), color: BRAIN.inkSoft }}>
                        Not attempted yet.
                      </p>
                    )}
                    {record ? (
                      <p className="font-medium" style={{ marginTop: S(6), fontSize: S(11), color: BRAIN.inkFaint }}>
                        {record.attempts} attempt{record.attempts === 1 ? "" : "s"} · last {record.last}%
                      </p>
                    ) : null}
                    <div style={{ marginTop: S(14) }}>
                      <BrainPill
                        onClick={() => startSet(set.id)}
                        style={{ fontSize: S(13), padding: `${S(9)} ${S(18)}` }}
                      >
                        {record ? "Practice again" : "Start practice"}
                      </BrainPill>
                    </div>
                  </BrainSurface>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── review — the submit step: the grid, the legend, the docked bar ──── */

  if (mode === "review") {
    return (
      <div ref={fitRef} className="flex h-full min-h-0 flex-col" data-course-brain-panel="" data-brain-screen="review" style={{ fontSize: S(16) }}>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <BrainSurface style={{ padding: S(16) }}>
            <p style={{ fontSize: S(14), color: BRAIN.inkSoft, marginBottom: S(16) }}>
              Tap any question to jump back and change your answer before you submit.
            </p>
            <div className="grid grid-cols-5" style={{ gap: S(10) }}>
              {questions.map((item, index) => {
                const answered = selections[index] !== undefined;
                return (
                  <button
                    key={`${item.id}-${index}`}
                    type="button"
                    data-brain-review-tile={index + 1}
                    onClick={() => openDeck(index)}
                    className="font-bold"
                    style={{
                      height: S(48),
                      borderRadius: S(14),
                      fontSize: S(14),
                      cursor: "pointer",
                      border: answered ? "none" : `1px solid ${BRAIN.line}`,
                      background: answered ? BRAIN.pill : BRAIN.plate,
                      color: answered ? BRAIN.pillInk : BRAIN.ink,
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center font-medium" style={{ marginTop: S(20), gap: S(16), fontSize: S(12), color: BRAIN.inkSoft }}>
              <span className="flex items-center" style={{ gap: S(6) }}>
                <span style={{ height: S(10), width: S(10), borderRadius: 9999, background: BRAIN.pill }} /> Answered
              </span>
              <span className="flex items-center" style={{ gap: S(6) }}>
                <span
                  style={{
                    height: S(10),
                    width: S(10),
                    borderRadius: 9999,
                    background: BRAIN.plate,
                    border: `1px solid ${BRAIN.line}`,
                  }}
                />{" "}
                Unanswered
              </span>
            </div>
          </BrainSurface>
        </div>
        {/* The bar is DOCKED: `shrink-0` (plus the scroller above owning the
            only `flex-1`) is what guarantees Back / Submit Practice are on
            screen at every pane height — the grid scrolls, the buttons never
            do. It is a solid plate, not a glass strip. */}
        <div
          className="flex shrink-0"
          data-brain-action-bar=""
          style={{
            gap: S(12),
            padding: `${S(12)} ${S(16)} calc(env(safe-area-inset-bottom) + ${S(12)})`,
            background: BRAIN.page,
            borderTopLeftRadius: BRAIN.radius,
            borderTopRightRadius: BRAIN.radius,
            boxShadow: "0 -14px 30px rgba(0,0,0,0.22)",
          }}
        >
          <BrainPill
            tone="outline"
            onClick={resumeDeck}
            className="min-w-0"
            style={{ flex: 1, fontSize: S(14), minHeight: S(46), padding: `${S(10)} ${S(16)}` }}
          >
            Back
          </BrainPill>
          <BrainPill
            onClick={() => setShowSubmitConfirm(true)}
            className="min-w-0"
            style={{ flex: 1.4, fontSize: S(14), minHeight: S(46), padding: `${S(10)} ${S(16)}` }}
          >
            Submit Practice
          </BrainPill>
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

  /* ── result — score, breakdown, and the way on ───────────────────────── */

  if (mode === "result") {
    const message =
      stats.score >= 90 ? "Outstanding work! 🎉" : stats.score >= 70 ? "Great job today! 👏" : stats.score >= 50 ? "Good effort, keep going! 💪" : "Every practice makes you sharper. Let's revise! 📘";
    return (
      <div ref={fitRef} className="h-full overflow-y-auto px-3 py-3" data-course-brain-panel="" data-brain-screen="result" style={{ fontSize: S(16) }}>
        <div className="space-y-4">
          <BrainSurface tone="dark" data-brain-score-card="" style={{ padding: S(16), textAlign: "center" }}>
            <p className="font-semibold" style={{ fontSize: S(12), color: "rgba(245,241,232,0.75)" }}>
              {activeSet.title}
            </p>
            <p className="font-bold uppercase" style={{ fontSize: S(10), letterSpacing: "0.16em", marginTop: S(4), color: "rgba(245,241,232,0.6)" }}>
              {activeSet.moduleTitle}
            </p>
            <p className="font-semibold uppercase" style={{ fontSize: S(12), marginTop: S(10), color: "rgba(245,241,232,0.75)" }}>
              Your Score
            </p>
            <p className="font-extrabold" style={{ fontSize: S(48), marginTop: S(4), color: BRAIN.pillInk }}>
              {stats.score}%
            </p>
            <p style={{ fontSize: S(14), marginTop: S(4), color: "rgba(245,241,232,0.85)" }}>{message}</p>
            {passedNow ? (
              <p
                data-brain-passed=""
                className="mx-auto flex w-max items-center font-bold"
                style={{
                  gap: S(6),
                  fontSize: S(11),
                  marginTop: S(12),
                  padding: `${S(5)} ${S(12)}`,
                  borderRadius: 9999,
                  background: "#1F7A54",
                  color: BRAIN.pillInk,
                }}
              >
                <CheckIcon style={{ height: S(13), width: S(13) }} /> Module marked complete
              </p>
            ) : null}
          </BrainSurface>

          <BrainSurface style={{ padding: S(12) }}>
            <div className="grid grid-cols-3" style={{ gap: S(12) }} data-brain-result-grid>
              <ResultChip icon={<CheckIcon style={{ height: S(20), width: S(20) }} />} label="Correct" value={stats.correct} tone="correct" />
              <ResultChip icon={<XIcon style={{ height: S(20), width: S(20) }} />} label="Wrong" value={stats.wrong} tone="wrong" />
              <ResultChip icon={<MinusIcon style={{ height: S(20), width: S(20) }} />} label="Skipped" value={stats.skipped} tone="skipped" />
            </div>
          </BrainSurface>

          <BrainSurface style={{ padding: S(16) }}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ fontSize: S(15), color: BRAIN.ink }}>
                Accuracy
              </h2>
              <span className="font-bold" style={{ fontSize: S(14), color: BRAIN.ink }}>
                {stats.score}%
              </span>
            </div>
            <div style={{ marginTop: S(10) }}>
              <BrainProgress value={stats.score} />
            </div>
            <p className="font-medium" style={{ fontSize: S(12), marginTop: S(8), color: BRAIN.inkSoft }}>
              {stats.correct} correct out of {total} questions
            </p>
          </BrainSurface>

          {stats.byTopic.length > 1 ? (
            <BrainSurface style={{ padding: S(16) }}>
              <h2 className="font-bold" style={{ fontSize: S(15), marginBottom: S(12), color: BRAIN.ink }}>
                Topic Breakdown
              </h2>
              <div style={{ display: "grid", gap: S(12) }}>
                {[...stats.byTopic].sort((a, b) => a.accuracy - b.accuracy).map((topic) => (
                  <div key={topic.topic} className="flex items-center" style={{ gap: S(12) }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium" style={{ fontSize: S(14), color: BRAIN.ink }}>
                          {topic.topic}
                        </p>
                        <span className="font-semibold" style={{ fontSize: S(12), marginLeft: S(8), color: BRAIN.inkSoft }}>
                          {topic.correct}/{topic.total} · {topic.accuracy}%
                        </span>
                      </div>
                      <div style={{ marginTop: S(6) }}>
                        <BrainProgress value={topic.accuracy} height={6} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </BrainSurface>
          ) : null}

          <div className="space-y-3">
            <BrainPill
              onClick={() => setMode("answers")}
              className="w-full"
              style={{ fontSize: S(14), minHeight: S(48), padding: `${S(11)} ${S(16)}` }}
            >
              Review Answers
            </BrainPill>
            <div className="grid grid-cols-2" style={{ gap: S(8) }}>
              <BrainPill
                tone="outline"
                onClick={() => startSet(activeSet.id)}
                className="min-w-0"
                style={{ fontSize: S(13), minHeight: S(46), padding: `${S(10)} ${S(12)}` }}
              >
                <span className="inline-flex items-center justify-center" style={{ gap: S(6) }}>
                  <RotateCcw style={{ height: S(16), width: S(16) }} /> Practice again
                </span>
              </BrainPill>
              <BrainPill
                tone="outline"
                onClick={backToLibrary}
                className="min-w-0"
                style={{ fontSize: S(13), minHeight: S(46), padding: `${S(10)} ${S(12)}` }}
              >
                All practice sets
              </BrainPill>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── answers — every question, the learner's pick and the explanation ── */

  if (mode === "answers") {
    return (
      <div ref={fitRef} className="h-full overflow-y-auto px-3 py-3" data-course-brain-panel="" data-brain-screen="answers" style={{ fontSize: S(16) }}>
        <div className="space-y-4">
          {questions.map((item, index) => {
            const picked = selections[index];
            const status = picked === undefined ? "skipped" : picked === item.correctIndex ? "correct" : "wrong";
            return (
              <BrainSurface key={`${item.id}-${index}`} style={{ padding: S(16) }}>
                <div className="mb-2 flex flex-wrap items-center" style={{ gap: S(8) }}>
                  <span className="font-bold" style={{ fontSize: S(12), color: BRAIN.inkFaint }}>
                    Q{index + 1}
                  </span>
                  <BrainBadge tone={item.difficulty}>{item.difficulty}</BrainBadge>
                  <BrainBadge tone="module">{item.topic || activeSet.moduleTitle}</BrainBadge>
                  <span className="ml-auto inline-flex">
                    {status === "correct" ? (
                      <BrainBadge tone="correct">
                        <CheckIcon style={{ height: S(12), width: S(12) }} /> Correct
                      </BrainBadge>
                    ) : status === "wrong" ? (
                      <BrainBadge tone="wrong">
                        <XIcon style={{ height: S(12), width: S(12) }} /> Incorrect
                      </BrainBadge>
                    ) : (
                      <BrainBadge tone="skipped">
                        <MinusIcon style={{ height: S(12), width: S(12) }} /> Skipped
                      </BrainBadge>
                    )}
                  </span>
                </div>
                <p className="font-semibold leading-snug" style={{ fontSize: S(15), color: BRAIN.ink }}>
                  {item.prompt}
                </p>
                <div style={{ marginTop: S(12), display: "grid", gap: S(8) }}>
                  {item.options.map((option, optionIndex) => {
                    const isCorrect = optionIndex === item.correctIndex;
                    const isPicked = optionIndex === picked;
                    const paint = isCorrect
                      ? { background: "rgba(31, 122, 84, 0.16)", border: "1px solid rgba(31, 122, 84, 0.45)", color: "#12543A" }
                      : isPicked
                        ? { background: "rgba(178, 58, 72, 0.14)", border: "1px solid rgba(178, 58, 72, 0.42)", color: "#7C2431" }
                        : { background: BRAIN.plate, border: `1px solid ${BRAIN.line}`, color: BRAIN.ink };
                    return (
                      <div
                        key={optionIndex}
                        className="flex items-center rounded-xl font-medium"
                        style={{ gap: S(10), fontSize: S(14), padding: `${S(10)} ${S(12)}`, borderRadius: S(14), ...paint }}
                      >
                        <span
                          className="flex shrink-0 items-center justify-center rounded-full font-bold"
                          style={{ height: S(24), width: S(24), fontSize: S(11), border: "1px solid currentColor" }}
                        >
                          {OPTION_LETTERS[optionIndex]}
                        </span>
                        <span className="flex-1">{option}</span>
                        {isCorrect ? <CheckIcon className="shrink-0" style={{ height: S(16), width: S(16) }} /> : null}
                        {isPicked && !isCorrect ? <XIcon className="shrink-0" style={{ height: S(16), width: S(16) }} /> : null}
                      </div>
                    );
                  })}
                </div>
                {item.explanation ? (
                  <div
                    style={{
                      marginTop: S(12),
                      padding: S(12),
                      borderRadius: S(14),
                      background: "rgba(20, 19, 18, 0.07)",
                    }}
                  >
                    <p className="font-bold" style={{ fontSize: S(12), color: BRAIN.inkSoft }}>
                      Explanation
                    </p>
                    <p className="leading-relaxed" style={{ fontSize: S(14), marginTop: S(4), color: BRAIN.ink }}>
                      {item.explanation}
                    </p>
                  </div>
                ) : null}
              </BrainSurface>
            );
          })}
          <div className="space-y-3">
            <BrainPill
              onClick={() => setMode("result")}
              className="w-full"
              style={{ fontSize: S(14), minHeight: S(48), padding: `${S(11)} ${S(16)}` }}
            >
              Back to result
            </BrainPill>
            <div className="grid grid-cols-2" style={{ gap: S(8) }}>
              <BrainPill
                tone="outline"
                onClick={() => startSet(activeSet.id)}
                className="min-w-0"
                style={{ fontSize: S(13), minHeight: S(46), padding: `${S(10)} ${S(12)}` }}
              >
                <span className="inline-flex items-center justify-center" style={{ gap: S(6) }}>
                  <RotateCcw style={{ height: S(16), width: S(16) }} /> Practice again
                </span>
              </BrainPill>
              <BrainPill
                tone="outline"
                onClick={backToLibrary}
                className="min-w-0"
                style={{ fontSize: S(13), minHeight: S(46), padding: `${S(10)} ${S(12)}` }}
              >
                All practice sets
              </BrainPill>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── question — the practice deck: the reference card, card for card ─── */

  return (
    <div ref={fitRef} className="flex h-full min-h-0 flex-col" data-course-brain-panel="" data-brain-screen="question" style={{ fontSize: S(16) }}>
      <div className="flex shrink-0 items-center" style={{ padding: `${S(12)} ${S(16)} 0`, gap: S(8) }}>
        <button
          type="button"
          onClick={backToLibrary}
          data-brain-back=""
          className="shrink-0 rounded-full font-semibold"
          style={{
            fontSize: S(11),
            padding: `${S(5)} ${S(10)}`,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "transparent",
            color: BRAIN.hint,
            cursor: "pointer",
          }}
        >
          All sets
        </button>
        <p className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: S(11), color: BRAIN.hint }}>
          {activeSet.title}
        </p>
      </div>

      {/* The deck owns the rest of the pane: no action bar, no Next, no Skip —
          the answers ARE the controls, and the swipe IS the skip. */}
      <BrainQuestionDeck
        items={deck}
        questions={questions}
        total={total}
        selections={selections}
        onAnswer={answerQuestion}
        onFlick={dismissTopCard}
        onEmpty={finishDeck}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result chip — solid tones on the light card                          */
/* ------------------------------------------------------------------ */

function ResultChip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "correct" | "wrong" | "skipped" }) {
  const paint =
    tone === "correct"
      ? { background: "rgba(31, 122, 84, 0.16)", color: "#12543A" }
      : tone === "wrong"
        ? { background: "rgba(178, 58, 72, 0.14)", color: "#7C2431" }
        : { background: "rgba(17, 17, 17, 0.10)", color: BRAIN.ink };
  return (
    <div className="flex flex-col items-center" style={{ ...paint, borderRadius: S(16), gap: S(4), padding: `${S(12)} 0` }}>
      {icon}
      <span className="font-bold" style={{ fontSize: S(18) }}>
        {value}
      </span>
      <span className="font-medium" style={{ fontSize: S(10), opacity: 0.8 }}>
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Submit dialog — the same confirmation, on the reference's plate      */
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
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <BrainSurface
        tone="plate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-submit-title"
        data-brain-submit-dialog=""
        className="relative w-full max-w-[min(100%,26rem)] overflow-hidden"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", padding: "1.25rem" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full sm:hidden" style={{ background: BRAIN.line }} />
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: BRAIN.pill, color: BRAIN.pillInk }}
        >
          <CheckIcon className="h-7 w-7" />
        </div>
        <h3 id="brain-submit-title" className="text-center text-base font-semibold sm:text-lg" style={{ color: BRAIN.ink }}>
          {title}
        </h3>
        {unansweredCount > 0 ? (
          <p className="mt-2 text-center text-sm leading-relaxed" style={{ color: BRAIN.inkSoft }}>
            You have <span className="font-semibold" style={{ color: "#B23A48" }}>{unansweredCount} unanswered question{unansweredCount === 1 ? "" : "s"}</span>{" "}
            that will be marked as skipped. This can&apos;t be undone.
          </p>
        ) : (
          <p className="mt-2 text-center text-sm leading-relaxed" style={{ color: BRAIN.inkSoft }}>
            All questions are answered. Once submitted, you can&apos;t change your answers.
          </p>
        )}
        <div className="mt-5 flex min-w-0 gap-3">
          <BrainPill
            tone="outline"
            onClick={onCancel}
            className="min-w-0"
            style={{ flex: 1, fontSize: S(14), minHeight: S(48), padding: `${S(10)} ${S(16)}` }}
          >
            Keep Reviewing
          </BrainPill>
          <BrainPill
            onClick={onConfirm}
            className="min-w-0"
            style={{ flex: 1, fontSize: S(14), minHeight: S(48), padding: `${S(10)} ${S(16)}` }}
          >
            {confirmLabel}
          </BrainPill>
        </div>
      </BrainSurface>
    </div>
  );
}
