import { GlassButton } from "../../components/ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import { GlassTile } from "../../components/ui/glass-tile";
// Student-facing AI test generator.
//
// The learner picks Class → Subject → Chapter → Topic from four cascading
// multi-select dropdowns (checkboxes + "select all"), sets difficulty, the
// number of questions and the total time, and hits Generate. Every selection
// is sent to the configured AI, a live generating animation plays while the
// model works, and the finished exam lands on the dashboard as a ready-to-take
// test.
//
// Difficulty and question type are separate planning settings. Question type
// defaults to Mixed and switches the AI's style — Mixed (theory + application),
// Theory only (definitions/concepts/formulas/units), or Application only
// (numerical/problem-based/situational questions). The choice is sent to the
// server, which instructs the model with an exact per-type quota and a
// mandatory per-question type tag, then deterministically verifies every
// returned question and regenerates any wrong-type ones before the test is
// delivered (see utils/questionTypeGuard.js).

import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, SecondaryButton } from "../components/ui";
import { CheckIcon, ChevronRightIcon, ClockIcon, SparklesIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { CURRICULUM, type CurriculumClass } from "../data/curriculum";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import {
  generateRevisionQuestions,
  getProvider,
  hasStoredUserAiConfig,
  loadUserAiConfig,
  resolveEffectiveAi,
  type CatalogAiSettings,
} from "../engine/aiConfig";
import type { QuestionMode } from "../engine/aiGenerate";
import { generateOfflineQuestions } from "../engine/offlineGenerator";
import { createCustomTest, deleteCustomTestLocal, type CustomTestQuestion } from "../engine/customTestService";
import {
  persistCustomTestToBank,
  releaseRevisionTestSlot,
  reserveRevisionTestSlotOrOffline,
  RevisionCloudError,
  type RevisionBankStatus,
} from "../engine/cloudRevisionService";
import TestBankLimitGate from "../components/TestBankLimitGate";
import type { Difficulty } from "../engine/store";

type Props = { uid: string; route: string; hasAccess?: boolean; onRequireAccess?: () => boolean };

type Option = { key: string; name: string; icon?: string };

const DIFFICULTY_OPTIONS: { value: Difficulty | "mixed"; label: string; emoji: string; desc: string }[] = [
  { value: "mixed", label: "Mixed", emoji: "🎚️", desc: "Balanced easy, medium and hard" },
  { value: "easy", label: "Easy", emoji: "🌱", desc: "Confidence-building questions" },
  { value: "medium", label: "Medium", emoji: "⚡", desc: "Standard exam practice" },
  { value: "hard", label: "Hard", emoji: "🔥", desc: "Challenging questions" },
];

/**
 * AI question style is intentionally separate from difficulty:
 *   - mixed       → blend of theory + application (default)
 *   - theory      → only theoretical concept questions (definitions,
 *                   formulas, units, laws, concept recall)
 *   - application → only application-based problems on the concept
 */
const QUESTION_MODE_OPTIONS: { value: QuestionMode; label: string; emoji: string; desc: string }[] = [
  {
    value: "mixed",
    label: "Mixed",
    emoji: "🎲",
    desc: "Theory + application questions (default)",
  },
  {
    value: "theory",
    label: "Theory only",
    emoji: "📖",
    desc: "Definitions, concepts, laws, formulas, units & conceptual questions",
  },
  {
    value: "application",
    label: "Application only",
    emoji: "🧮",
    desc: "Numerical, solution/problem-based, real-world & situational questions",
  },
];

const QUESTION_PRESETS = [5, 10, 15, 20];
const TIME_PRESETS = [5, 10, 15, 30];

const learnerLocalDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const learnerTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};

const GENERATING_MESSAGES = [
  "Reading your selections…",
  "Asking the AI for fresh questions…",
  "Crafting the perfect options…",
  "Checking answers & explanations…",
  "Assembling your exam…",
];

type PickerKey = "class" | "subject" | "chapter" | "topic";

/* ------------------------------------------------------------------ */
/* Multi-select picker row                                             */
/* ------------------------------------------------------------------ */

function PickerButton({
  label,
  count,
  total,
  open,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  total: number;
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition ${
        open
          ? "border-indigo-500 bg-indigo-500/15 ring-2 ring-indigo-400/30"
          : count > 0
            ? "border-indigo-400/30 bg-indigo-500/15"
            : "border-white/10 bg-white/[0.08]"
      } ${disabled ? "opacity-40" : "active:scale-[0.97]"}`}
    >
      <span className="text-[11px] font-bold text-white/85">{label}</span>
      <span className={`text-[10px] font-semibold ${count > 0 ? "text-indigo-200" : "text-white/55"}`}>
        {count > 0 ? `${count}/${total}` : "Select ▾"}
      </span>
    </button>
  );
}

function CheckBox({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
        checked || partial ? "border-indigo-600 bg-indigo-600" : "border-white/10 bg-white/[0.08]"
      }`}
    >
      {checked && <CheckIcon className="h-3.5 w-3.5 text-white" />}
      {!checked && partial && <span className="h-0.5 w-2.5 rounded bg-white/[0.08]" />}
    </span>
  );
}

function PickerPanel({
  title,
  options,
  selected,
  onToggle,
  onToggleAll,
  onDone,
  emptyHint,
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onDone: () => void;
  emptyHint: string;
}) {
  const allSelected = options.length > 0 && options.every((o) => selected.has(o.key));
  const someSelected = options.some((o) => selected.has(o.key));
  return (
    <div className="animate-fade-in mt-2 overflow-hidden rounded-2xl border border-indigo-400/30 bg-white/[0.08] shadow-lg">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.06] px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-white/75">{title}</span>
        <button type="button" onClick={onDone} className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white active:scale-95">
          Done
        </button>
      </div>
      {options.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-white/55">{emptyHint}</p>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {/* Select-all master checkbox */}
          <button
            type="button"
            onClick={onToggleAll}
            className="flex w-full items-center gap-2.5 border-b border-white/10 bg-indigo-500/15 px-3 py-2.5 text-left active:bg-indigo-500/15"
          >
            <CheckBox checked={allSelected} partial={!allSelected && someSelected} />
            <span className="text-[13px] font-bold text-indigo-200">
              Select all <span className="font-medium text-indigo-400">({options.length})</span>
            </span>
          </button>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onToggle(o.key)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-white/[0.06]"
            >
              <CheckBox checked={selected.has(o.key)} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">
                {o.icon ? `${o.icon} ` : ""}
                {o.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AiGeneratePage({ uid, route, hasAccess = true, onRequireAccess }: Props) {
  const { navigate } = useExitGuard();

  // Selections (keys)
  const [classSel, setClassSel] = useState<Set<string>>(new Set());
  const [subjectSel, setSubjectSel] = useState<Set<string>>(new Set());
  const [chapterSel, setChapterSel] = useState<Set<string>>(new Set());
  const [topicSel, setTopicSel] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [questionMode, setQuestionMode] = useState<QuestionMode>("mixed");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [totalMinutes, setTotalMinutes] = useState(10);

  const [phase, setPhase] = useState<"idle" | "generating" | "ready">("idle");
  const [genMessage, setGenMessage] = useState(GENERATING_MESSAGES[0]);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankGate, setBankGate] = useState<RevisionBankStatus | null>(null);
  const [readyInfo, setReadyInfo] = useState<{ testId: number; count: number; usedAi: boolean; pendingSync: boolean } | null>(null);

  // AI config (own key or admin-published default)
  const [aiSettings, setAiSettings] = useState<CatalogAiSettings | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumClass[]>(CURRICULUM);
  const [curriculumMeta, setCurriculumMeta] = useState<{ board: string; yearLabel: string } | null>(null);
  const [syllabusSource, setSyllabusSource] = useState<"loading" | "published" | "builtin">("loading");
  useEffect(() => {
    let cancelled = false;
    const apply = (c: RevisionCatalog | null) => {
      if (cancelled) return;
      if (c?.aiSettings) setAiSettings(c.aiSettings);
      if (c?.planningCurriculum?.classes?.length) {
        setCurriculum(c.planningCurriculum.classes);
        setCurriculumMeta({ board: c.planningCurriculum.board, yearLabel: c.planningCurriculum.yearLabel });
        setSyllabusSource("published");
      } else {
        setSyllabusSource("builtin");
      }
    };
    void (async () => {
      // Read the admin-published catalog. One retry guards against a transient
      // network/timing failure so a single blip never leaves the generator
      // stuck on the built-in fallback syllabus for the whole session.
      const first = await fetchRemoteCatalog();
      if (first) {
        apply(first);
        return;
      }
      const second = await fetchRemoteCatalog();
      apply(second);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const userCfg = useMemo(() => loadUserAiConfig(uid), [uid]);
  const effective = useMemo(() => resolveEffectiveAi(userCfg, aiSettings), [userCfg, aiSettings]);
  const activeConfig = effective.config;
  const providerMeta = activeConfig ? getProvider(activeConfig.provider) : null;

  // Rotate the generating message while the AI works.
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase === "generating") {
      let i = 0;
      setGenMessage(GENERATING_MESSAGES[0]);
      msgTimer.current = setInterval(() => {
        i = (i + 1) % GENERATING_MESSAGES.length;
        setGenMessage(GENERATING_MESSAGES[i]);
      }, 2200);
    }
    return () => {
      if (msgTimer.current) clearInterval(msgTimer.current);
    };
  }, [phase]);

  /* ------------------------- cascading options ------------------------- */

  const classOptions: Option[] = useMemo(
    () => curriculum.map((c) => ({ key: c.key, name: c.name, icon: c.icon })),
    [curriculum],
  );

  const selectedClasses = useMemo(() => curriculum.filter((c) => classSel.has(c.key)), [classSel, curriculum]);

  // Subjects: union across selected classes, deduped by subject name.
  const subjectOptions: Option[] = useMemo(() => {
    const seen = new Map<string, Option>();
    for (const cls of selectedClasses) {
      for (const s of cls.subjects) {
        if (!seen.has(s.key)) seen.set(s.key, { key: s.key, name: s.name, icon: s.icon });
      }
    }
    return Array.from(seen.values());
  }, [selectedClasses]);

  // Chapters: union across (selected classes × selected subjects).
  const chapterOptions: Option[] = useMemo(() => {
    const seen = new Map<string, Option>();
    for (const cls of selectedClasses) {
      for (const s of cls.subjects) {
        if (!subjectSel.has(s.key)) continue;
        for (const chp of s.chapters) {
          const key = `${s.key}|${chp.key}`;
          if (!seen.has(key)) seen.set(key, { key, name: chp.name, icon: s.icon });
        }
      }
    }
    return Array.from(seen.values());
  }, [selectedClasses, subjectSel]);

  // Topics (concepts): union across selected chapters.
  const topicOptions: Option[] = useMemo(() => {
    const seen = new Map<string, Option>();
    for (const cls of selectedClasses) {
      for (const s of cls.subjects) {
        if (!subjectSel.has(s.key)) continue;
        for (const chp of s.chapters) {
          if (!chapterSel.has(`${s.key}|${chp.key}`)) continue;
          for (const t of chp.topics) {
            const key = `${s.key}|${chp.key}|${t.key}`;
            if (!seen.has(key)) seen.set(key, { key, name: t.name });
          }
        }
      }
    }
    return Array.from(seen.values());
  }, [selectedClasses, subjectSel, chapterSel]);

  // Effective (pruned) downstream selections — anything upstream deselected
  // silently drops out.
  const effSubjects = useMemo(
    () => new Set(subjectOptions.filter((o) => subjectSel.has(o.key)).map((o) => o.key)),
    [subjectOptions, subjectSel],
  );
  const effChapters = useMemo(
    () => new Set(chapterOptions.filter((o) => chapterSel.has(o.key)).map((o) => o.key)),
    [chapterOptions, chapterSel],
  );
  const effTopics = useMemo(
    () => new Set(topicOptions.filter((o) => topicSel.has(o.key)).map((o) => o.key)),
    [topicOptions, topicSel],
  );

  const toggle = (set: Set<string>, key: string, apply: (n: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  const toggleAll = (options: Option[], set: Set<string>, apply: (n: Set<string>) => void) => {
    const allSelected = options.length > 0 && options.every((o) => set.has(o.key));
    apply(allSelected ? new Set<string>() : new Set(options.map((o) => o.key)));
  };

  const canGenerate =
    classSel.size > 0 && effSubjects.size > 0 && effChapters.size > 0 && effTopics.size > 0 &&
    totalQuestions >= 1 && totalMinutes >= 1 && phase !== "generating";

  /**
   * When the learner has not configured ANY AI (no school-provided key, no
   * own key) we must never silently fall back to the offline engine — that
   * generated study-skill prompts that looked like real topic questions and
   * confused learners who picked a chapter/topic. Surface a clear "configure
   * AI or use bulk import" gate instead of letting the offline fallback run.
   * If the learner explicitly chose "No AI (offline)" in AI Configuration
   * (i.e. they saved a choice of `source: "offline"`), we honour that.
   */
  const userHasStoredChoice = useMemo(() => hasStoredUserAiConfig(uid), [uid]);
  const userChoseOffline = userCfg.source === "offline" && userHasStoredChoice;
  const aiNotConfigured = !activeConfig;
  const generateBlockedByNoAi = aiNotConfigured && !userChoseOffline;

  /* ----------------------------- generate ------------------------------ */

  const runGenerate = async () => {
    if (!canGenerate) return;
    if (onRequireAccess && !onRequireAccess()) return;
    if (!hasAccess) return;
    setPhase("generating");
    setNotice(null);
    setReadyInfo(null);
    setOpenPicker(null);

    // Reserve cloud capacity before calling a paid AI provider. This prevents
    // a full Test Bank from consuming AI quota/cost for a test that cannot be
    // saved, and the server transaction prevents multi-device overbooking.
    let reservationId = "";
    try {
      const reservation = await reserveRevisionTestSlotOrOffline(uid);
      reservationId = reservation.reservationId;
    } catch (error) {
      if (error instanceof RevisionCloudError && error.code === "TEST_BANK_FULL" && error.bank) {
        setBankGate(error.bank);
      } else {
        setNotice(error instanceof Error ? error.message : "Could not reserve cloud space for this test.");
      }
      setPhase("idle");
      return;
    }

    // Resolve selections into { className, subjectName, chapterName, topicName } rows.
    type Row = { className: string; subjectName: string; chapterName: string; topicName: string };
    const rows: Row[] = [];
    const seen = new Set<string>();
    for (const cls of selectedClasses) {
      for (const s of cls.subjects) {
        if (!effSubjects.has(s.key)) continue;
        for (const chp of s.chapters) {
          if (!effChapters.has(`${s.key}|${chp.key}`)) continue;
          for (const t of chp.topics) {
            const key = `${s.key}|${chp.key}|${t.key}`;
            if (!effTopics.has(key) || seen.has(key)) continue;
            seen.add(key);
            rows.push({ className: cls.name, subjectName: s.name, chapterName: chp.name, topicName: t.name });
          }
        }
      }
    }

    const classNames = Array.from(new Set(rows.map((row) => row.className)));
    const subjectNames = Array.from(new Set(rows.map((row) => row.subjectName)));
    const chapterNames = Array.from(new Set(rows.map((row) => row.chapterName)));
    const topicNames = Array.from(new Set(rows.map((row) => row.topicName)));
    const total = Math.max(1, Math.min(20, Math.round(totalQuestions)));
    const testDate = learnerLocalDate();
    const generatedAt = new Date().toISOString();
    const timezone = learnerTimezone();
    const pickDifficulty = (): Difficulty =>
      difficulty === "mixed" ? "medium" : difficulty;

    const collected: CustomTestQuestion[] = [];
    let usedAi = false;
    const liveCfg = loadUserAiConfig(uid);
    const liveEffective = resolveEffectiveAi(liveCfg, aiSettings);
    const liveConfig = liveEffective.config;

    try {
      if (liveEffective.mode === "own" || liveEffective.mode === "default") {
        const parsed = await generateRevisionQuestions({
          source: liveEffective.mode,
          config: liveConfig,
          syllabus: {
            classNames,
            subjectNames,
            chapterNames,
            topicNames,
            selectionRows: rows,
            testDate,
            generatedAt,
            timezone,
            difficulty,
            questionMode,
            count: total,
            minutes: totalMinutes,
          },
        });
        const labelSubject = subjectNames[0] || "General";
        const labelTopic = chapterNames[0] || topicNames[0] || labelSubject;
        collected.push(
          ...parsed.map<CustomTestQuestion>((q) => ({
            prompt: q.prompt,
            options: q.options,
            correctIndex: Math.max(0, q.correctIndex),
            explanation: q.explanation,
            difficulty: pickDifficulty(),
            subjectName: labelSubject,
            topicName: labelTopic,
          })),
        );
        usedAi = collected.length > 0;
        if (collected.length === 0) {
          await releaseRevisionTestSlot(uid, reservationId);
          setNotice("The AI returned no usable questions. Check your key and try again.");
          setPhase("idle");
          return;
        }
      }
    } catch (err) {
      await releaseRevisionTestSlot(uid, reservationId);
      setNotice(err instanceof Error ? err.message : "AI request failed. Check your configuration and try again.");
      setPhase("idle");
      return;
    }

    /**
     * Offline engine ONLY runs when the learner explicitly turned AI off in
     * AI Configuration (saved a "No AI (offline)" choice, not just defaulted).
     * If no AI is configured AND the user did not pick "No AI (offline)", we
     * never silently fabricate study-skill questions — we release the slot,
     * show a clear instruction, and let them choose to configure AI or use
     * Bulk Import. This is the rule the user explicitly asked us to enforce.
     */
    const liveHasStoredChoice = hasStoredUserAiConfig(uid);
    const liveUserChoseOffline = liveEffective.mode === "offline" && liveHasStoredChoice;
    try {
      if (collected.length === 0) {
        if (!liveUserChoseOffline) {
          await releaseRevisionTestSlot(uid, reservationId);
          setNotice(
            "No AI is configured. Connect an AI provider in AI Configuration, or use Bulk Import to paste a complete revision plan.",
          );
          setPhase("idle");
          return;
        }
        const qs = generateOfflineQuestions({
          subjectName: subjectNames[0] || "General",
          topicName: topicNames.join(", ") || chapterNames[0] || "General",
          count: total,
          difficulty: pickDifficulty() as "easy" | "medium" | "hard",
          questionMode,
        });
        collected.push(
          ...qs.map<CustomTestQuestion>((q) => ({
            prompt: q.prompt,
            options: q.options,
            correctIndex: Math.max(0, q.correctIndex),
            explanation: q.explanation,
            difficulty: pickDifficulty(),
            subjectName: subjectNames[0] || "General",
            topicName: chapterNames[0] || topicNames[0] || "General",
          })),
        );
      }
    } catch (error) {
      await releaseRevisionTestSlot(uid, reservationId);
      setNotice(error instanceof Error ? error.message : "Could not prepare the test questions.");
      setPhase("idle");
      return;
    }

    // Trim overshoot (AI sometimes returns extras).
    const finalQuestions = collected.slice(0, total);

    let createdTestId: number | null = null;
    try {
      const subjectNames = Array.from(new Set(finalQuestions.map((q) => q.subjectName)));
      const title =
        subjectNames.length === 1 ? `Revision · ${subjectNames[0]}` : `Revision · ${subjectNames.length} subjects`;
      const created = createCustomTest(uid, {
        title,
        estimatedMinutes: Math.max(1, Math.min(240, Math.round(totalMinutes))),
        source: "ai",
        questions: finalQuestions,
        planDetails: {
          classNames: Array.from(new Set(rows.map((row) => row.className))),
          subjectNames: Array.from(new Set(rows.map((row) => row.subjectName))),
          chapterNames: Array.from(new Set(rows.map((row) => row.chapterName))),
          topicNames: Array.from(new Set(rows.map((row) => row.topicName))),
          difficulty,
          questionMode,
        },
      });
      createdTestId = created.testId;
      const persisted = await persistCustomTestToBank(uid, created.testId, reservationId);
      setReadyInfo({
        testId: created.testId,
        count: finalQuestions.length,
        usedAi,
        pendingSync: persisted.status === "local",
      });
      setPhase("ready");
    } catch (err) {
      if (createdTestId !== null) deleteCustomTestLocal(uid, createdTestId);
      await releaseRevisionTestSlot(uid, reservationId);
      if (err instanceof RevisionCloudError && err.code === "TEST_BANK_FULL" && err.bank) {
        setBankGate(err.bank);
      } else {
        setNotice(err instanceof Error ? err.message : "Could not save the test securely. Try again.");
      }
      setPhase("idle");
    }
  };

  /* ------------------------------ render -------------------------------- */

  const pickers: { key: PickerKey; label: string; options: Option[]; selected: Set<string>; disabled: boolean }[] = [
    { key: "class", label: "Class", options: classOptions, selected: classSel, disabled: false },
    { key: "subject", label: "Subject", options: subjectOptions, selected: effSubjects, disabled: classSel.size === 0 },
    { key: "chapter", label: "Chapter", options: chapterOptions, selected: effChapters, disabled: effSubjects.size === 0 },
    { key: "topic", label: "Topic", options: topicOptions, selected: effTopics, disabled: effChapters.size === 0 },
  ];

  const setterFor = (key: PickerKey) =>
    key === "class" ? setClassSel : key === "subject" ? setSubjectSel : key === "chapter" ? setChapterSel : setTopicSel;

  const openMeta = pickers.find((p) => p.key === openPicker) ?? null;

  // Currently selected question-style option (drives the 4th tile label + dropdown check).
  const modeOption = QUESTION_MODE_OPTIONS.find((m) => m.value === questionMode) ?? QUESTION_MODE_OPTIONS[0];

  return (
    <PageShell route={route} title="AI Revision Generator" subtitle="Build a focused revision plan" backHref="#/revision/profile">
      <div data-rev-layout="aigenerate" className="animate-fade-in space-y-4 px-4 py-4 pb-10 lg:space-y-3 lg:px-0 lg:py-0 lg:pb-6 lg:max-w-[900px] lg:mx-auto">
        {/* Provider strip */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white">
              {activeConfig ? `${providerMeta?.name} · ${activeConfig.model}` : "No AI connected"}
            </p>
            <p className="truncate text-[11px] text-white/75">
              {effective.mode === "own"
                ? "Your provider account is used · school/plan AI allowance is not deducted"
                : effective.mode === "default"
                  ? "One complete test uses one school-AI generation and any enabled model-cost allowance"
                  : "Questions will use the built-in engine — connect AI for better results"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("#/revision/ai-settings")}
            className="shrink-0 rounded-full bg-white/[0.12] px-3 py-1.5 text-[11px] font-bold text-white/85 active:bg-white/25"
          >
            Configure
          </button>
        </div>

        {phase !== "ready" && (
          <>
            {/**
             * Hard block: if no AI is configured AND the learner did not pick
             * the explicit "No AI (offline)" path, surface clear instructions
             * before they can hit Generate. Two CTAs:
             *   1) Configure AI — opens AI Configuration.
             *   2) Use Bulk Import — pastes a complete revision plan.
             * These CTAs are the explicit "either / or" instruction the
             * learner asked us to enforce so they never get stuck.
             */}
            {aiNotConfigured && (
              <Card
                data-rev-no-ai-gate
                className="overflow-hidden border-amber-400/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
                    <SparklesIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-bold text-white">No AI is configured</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/85">
                      Connect an AI provider to generate fresh, syllabus-aligned questions for the
                      topic you picked. Without an AI, the test can&apos;t be generated here — pick one
                      of the two options below.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => navigate("#/revision/ai-settings")}
                    className="flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-2xl bg-indigo-600 px-4 py-2 text-left text-white shadow-md active:scale-[0.98]"
                  >
                    <span className="text-[13px] font-bold">Configure AI →</span>
                    <span className="text-[10px] font-medium opacity-90">
                      School-provided key or paste your own
                    </span>
                  </button>
                  <GlassButton
                    variant="capsule"
                    onClick={() => navigate("#/revision/bulk-import")}
                    className="w-full [&>span>div]:h-auto [&>span>div]:min-h-[56px] [&>span>div]:w-full [&>span>div]:justify-start [&>span>div]:px-4 [&>span>div]:py-2"
                  >
                    <span className="flex flex-col items-start gap-0.5 text-left text-emerald-200">
                      <span className="text-[13px] font-bold">Use Bulk Import →</span>
                      <span className="text-[10px] font-medium text-emerald-300">Paste a full revision plan with answers</span>
                    </span>
                  </GlassButton>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-white/55">
                  After configuration, come back here and your saved selections (class, subject,
                  chapter, topic, question type) will be used to generate the test automatically.
                </p>
              </Card>
            )}

            {/* Step 1 — the 4-dropdown selection row */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">1 · What to test</h3>
              <p className="mt-0.5 text-[11px] text-white/55">
                Each list filters the next: Class → Subject → Chapter → Topic
              </p>
              {curriculumMeta && (
                <p className="mt-1 text-[11px] font-semibold text-indigo-300">
                  {curriculumMeta.board} · {curriculumMeta.yearLabel} included syllabus
                </p>
              )}
              {!curriculumMeta && syllabusSource === "builtin" && (
                <p className="mt-1 text-[11px] font-medium text-amber-300">
                  Using the built-in syllabus — the school has not published a custom syllabus yet.
                </p>
              )}
              <div data-rev-choice-grid className="mt-3 grid grid-cols-4 gap-1.5">
                {pickers.map((p) => (
                  <PickerButton
                    key={p.key}
                    label={p.label}
                    count={p.selected.size}
                    total={p.options.length}
                    open={openPicker === p.key}
                    disabled={p.disabled || phase === "generating"}
                    onClick={() => setOpenPicker(openPicker === p.key ? null : p.key)}
                  />
                ))}
              </div>
              {openMeta && (
                <PickerPanel
                  title={`Select ${openMeta.label.toLowerCase()}${openMeta.label === "Class" ? "es" : "s"}`}
                  options={openMeta.options}
                  selected={openMeta.key === "class" ? classSel : openMeta.selected}
                  onToggle={(key) => {
                    const current =
                      openMeta.key === "class"
                        ? classSel
                        : openMeta.key === "subject"
                          ? subjectSel
                          : openMeta.key === "chapter"
                            ? chapterSel
                            : topicSel;
                    toggle(current, key, setterFor(openMeta.key));
                  }}
                  onToggleAll={() => {
                    const current =
                      openMeta.key === "class"
                        ? classSel
                        : openMeta.key === "subject"
                          ? subjectSel
                          : openMeta.key === "chapter"
                            ? chapterSel
                            : topicSel;
                    toggleAll(openMeta.options, current, setterFor(openMeta.key));
                  }}
                  onDone={() => setOpenPicker(null)}
                  emptyHint={
                    openMeta.key === "class"
                      ? "No classes available."
                      : `Pick a ${openMeta.key === "subject" ? "class" : openMeta.key === "chapter" ? "subject" : "chapter"} first.`
                  }
                />
              )}
            </Card>

            {/* Step 2 — difficulty and question type are separate settings */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">2 · Difficulty</h3>
              <p className="mt-0.5 text-[11px] text-white/55">
                Difficulty controls level only. Question type is selected separately below.
              </p>
              <div data-rev-choice-grid className="mt-3 grid grid-cols-4 gap-1.5">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    disabled={phase === "generating"}
                    onClick={() => setDifficulty(d.value)}
                    className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center transition active:scale-[0.97] ${
                      phase === "generating" ? "opacity-40" : ""
                    } ${
                      difficulty === d.value
                        ? "border-indigo-500 bg-indigo-500/15 ring-2 ring-indigo-400/30"
                        : "border-white/10 bg-white/[0.08]"
                    }`}
                  >
                    <span className="text-sm">{d.emoji}</span>
                    <span className={`text-[11px] font-bold ${difficulty === d.value ? "text-indigo-200" : "text-white/75"}`}>
                      {d.label}
                    </span>
                    <span className="line-clamp-1 text-[9px] font-medium text-white/55">{d.desc}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-[12px] font-bold uppercase tracking-wide text-white/75">Question type</h4>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                      Default is Mixed. The AI tags every question by type and the server re-checks each one — wrong-type questions are regenerated automatically. (Offline built-in questions are not dynamically transformed.)
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] font-bold text-indigo-300">
                    {modeOption.label}
                  </span>
                </div>
                <div data-rev-question-mode-grid className="mt-3 grid grid-cols-3 gap-1.5">
                  {/* Wave 4: selectable cells -> registry glass-tile (frost, press gel,
                      shared selected ring); aria-pressed comes from the pack. */}
                  {QUESTION_MODE_OPTIONS.map((m) => (
                    <GlassTile
                      key={m.value}
                      type="button"
                      disabled={phase === "generating"}
                      onClick={() => setQuestionMode(m.value)}
                      selected={questionMode === m.value}
                      className={`dc-tile min-h-[72px] aspect-auto rounded-xl px-2 py-2 text-center ${
                        phase === "generating" ? "opacity-40" : ""
                      }`}
                    >
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-base">{m.emoji}</span>
                        <span className="text-[11px] font-extrabold leading-tight">{m.label}</span>
                        <span className="line-clamp-2 text-[9px] font-medium leading-tight text-white/55">{m.desc}</span>
                      </span>
                    </GlassTile>
                  ))}
                </div>
              </div>
            </Card>

            {/* Step 3 — questions & time */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">3 · Questions & time</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/85">Total questions</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={totalQuestions}
                      onChange={(e) => setTotalQuestions(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))}
                      className="dc-field h-9 w-20 rounded-lg border px-2 text-center text-sm font-bold outline-none"
                    />
                  </div>
                  <GlassToggleGroup className="dc-segment mt-2 flex w-full" data-stretch value={String(totalQuestions)} onValueChange={(v) => setTotalQuestions(Number(v))} aria-label="Question presets">
                    {QUESTION_PRESETS.map((n) => (
                      <GlassToggleItem key={n} value={String(n)} className="flex-1 justify-center py-1.5 text-xs font-bold">
                        {n}
                      </GlassToggleItem>
                    ))}
                  </GlassToggleGroup>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-semibold text-white/85">
                      <ClockIcon className="h-3.5 w-3.5" /> Total time (minutes)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={totalMinutes}
                      onChange={(e) => setTotalMinutes(Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1))))}
                      className="dc-field h-9 w-20 rounded-lg border px-2 text-center text-sm font-bold outline-none"
                    />
                  </div>
                  <GlassToggleGroup className="dc-segment mt-2 flex w-full" data-stretch value={String(totalMinutes)} onValueChange={(v) => setTotalMinutes(Number(v))} aria-label="Time presets">
                    {TIME_PRESETS.map((n) => (
                      <GlassToggleItem key={n} value={String(n)} className="flex-1 justify-center py-1.5 text-xs font-bold">
                        {n}m
                      </GlassToggleItem>
                    ))}
                  </GlassToggleGroup>
                </div>
              </div>
            </Card>

            {notice && (
              <div className="rounded-xl bg-amber-500/15 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-200">
                {notice}
              </div>
            )}

            {/* Generate button / animation */}
            {phase === "generating" ? (
              <Card className="overflow-hidden border-indigo-400/30">
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200/60" />
                    <span className="absolute inset-2 animate-pulse rounded-full bg-indigo-500/20" />
                    <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                      <SparklesIcon className="h-7 w-7 animate-pulse" />
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">Generating your exam…</p>
                    <p className="mt-1 animate-pulse text-xs font-medium text-indigo-500">{genMessage}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <PrimaryButton
                  disabled={!canGenerate || generateBlockedByNoAi}
                  onClick={() => void runGenerate()}
                >
                  <SparklesIcon className="h-5 w-5" /> Generate revision plan
                </PrimaryButton>
                {!canGenerate && (
                  <p className="text-center text-[11px] text-white/55">
                    Select at least one class, subject, chapter and topic to generate.
                  </p>
                )}
                {canGenerate && generateBlockedByNoAi && (
                  <p className="text-center text-[11px] font-semibold text-amber-200">
                    Configure AI or use Bulk Import above to continue.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* Ready state */}
        {phase === "ready" && readyInfo && (
          <Card className="overflow-hidden border-emerald-400/30">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                <CheckIcon className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Your revision plan is ready! 🎉</h2>
                <p className="mt-1 text-xs text-white/75">
                  {readyInfo.count} questions saved to your Test Bank · ~{totalMinutes} min ·{" "}
                  {readyInfo.usedAi ? `generated by ${providerMeta?.name ?? "AI"}` : "built-in engine"}
                </p>
                {readyInfo.pendingSync && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-200">
                    Saved on this device. Cloud sync will finish automatically when you are online.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate("#/revision")}
                className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[15px] font-bold text-white transition active:scale-[0.98]"
              >
                Go to Revision Dashboard <ChevronRightIcon className="h-5 w-5" />
              </button>
              <SecondaryButton onClick={() => navigate("#/revision/bank")}>
                <span className="text-xs text-emerald-200">Open Test Bank</span>
              </SecondaryButton>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setReadyInfo(null);
                  setNotice(null);
                }}
                className="text-xs font-semibold text-white/55 underline-offset-2 hover:underline"
              >
                Create another revision plan
              </button>
            </div>
          </Card>
        )}
      </div>
      <TestBankLimitGate
        open={Boolean(bankGate)}
        bank={bankGate}
        onClose={() => setBankGate(null)}
        onManageBank={() => navigate("#/revision/bank")}
        onExplorePlans={() => navigate("#/subscription")}
      />
    </PageShell>
  );
}
