// Student-facing AI test generator.
//
// The learner picks Class → Subject → Chapter → Topic from four cascading
// multi-select dropdowns (checkboxes + "select all"), sets difficulty, the
// number of questions and the total time, and hits Generate. Every selection
// is sent to the configured AI, a live generating animation plays while the
// model works, and the finished exam lands on the dashboard as a ready-to-take
// test.

import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton } from "../components/ui";
import { CheckIcon, ChevronRightIcon, ClockIcon, SparklesIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { CURRICULUM, type CurriculumClass } from "../data/curriculum";
import { fetchRemoteCatalog } from "../engine/catalogService";
import {
  generateRevisionQuestions,
  getProvider,
  loadUserAiConfig,
  resolveEffectiveAi,
  type CatalogAiSettings,
} from "../engine/aiConfig";
import { generateOfflineQuestions } from "../engine/offlineGenerator";
import { createCustomTest, type CustomTestQuestion } from "../engine/customTestService";
import type { Difficulty } from "../engine/store";

type Props = { uid: string; route: string };

type Option = { key: string; name: string; icon?: string };

const DIFFICULTY_OPTIONS: { value: Difficulty | "mixed"; label: string; emoji: string }[] = [
  { value: "easy", label: "Easy", emoji: "🌱" },
  { value: "medium", label: "Medium", emoji: "⚡" },
  { value: "hard", label: "Hard", emoji: "🔥" },
  { value: "mixed", label: "Mixed", emoji: "🎲" },
];

const QUESTION_PRESETS = [5, 10, 15, 20];
const TIME_PRESETS = [5, 10, 15, 30];

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
          ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
          : count > 0
            ? "border-indigo-200 bg-indigo-50/50"
            : "border-slate-200 bg-white"
      } ${disabled ? "opacity-40" : "active:scale-[0.97]"}`}
    >
      <span className="text-[11px] font-bold text-slate-700">{label}</span>
      <span className={`text-[10px] font-semibold ${count > 0 ? "text-indigo-600" : "text-slate-400"}`}>
        {count > 0 ? `${count}/${total}` : "Select ▾"}
      </span>
    </button>
  );
}

function CheckBox({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
        checked || partial ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
      }`}
    >
      {checked && <CheckIcon className="h-3.5 w-3.5 text-white" />}
      {!checked && partial && <span className="h-0.5 w-2.5 rounded bg-white" />}
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
    <div className="animate-fade-in mt-2 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/60">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</span>
        <button type="button" onClick={onDone} className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white active:scale-95">
          Done
        </button>
      </div>
      {options.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyHint}</p>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {/* Select-all master checkbox */}
          <button
            type="button"
            onClick={onToggleAll}
            className="flex w-full items-center gap-2.5 border-b border-slate-100 bg-indigo-50/40 px-3 py-2.5 text-left active:bg-indigo-50"
          >
            <CheckBox checked={allSelected} partial={!allSelected && someSelected} />
            <span className="text-[13px] font-bold text-indigo-700">
              Select all <span className="font-medium text-indigo-400">({options.length})</span>
            </span>
          </button>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onToggle(o.key)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50"
            >
              <CheckBox checked={selected.has(o.key)} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">
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

export default function AiGeneratePage({ uid, route }: Props) {
  const { navigate } = useExitGuard();

  // Selections (keys)
  const [classSel, setClassSel] = useState<Set<string>>(new Set());
  const [subjectSel, setSubjectSel] = useState<Set<string>>(new Set());
  const [chapterSel, setChapterSel] = useState<Set<string>>(new Set());
  const [topicSel, setTopicSel] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [totalMinutes, setTotalMinutes] = useState(10);

  const [phase, setPhase] = useState<"idle" | "generating" | "ready">("idle");
  const [genMessage, setGenMessage] = useState(GENERATING_MESSAGES[0]);
  const [notice, setNotice] = useState<string | null>(null);
  const [readyInfo, setReadyInfo] = useState<{ testId: number; count: number; usedAi: boolean } | null>(null);

  // AI config (own key or admin-published default)
  const [aiSettings, setAiSettings] = useState<CatalogAiSettings | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumClass[]>(CURRICULUM);
  const [curriculumMeta, setCurriculumMeta] = useState<{ board: string; yearLabel: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchRemoteCatalog().then((c) => {
      if (cancelled) return;
      if (c?.aiSettings) setAiSettings(c.aiSettings);
      if (c?.planningCurriculum?.classes?.length) {
        setCurriculum(c.planningCurriculum.classes);
        setCurriculumMeta({ board: c.planningCurriculum.board, yearLabel: c.planningCurriculum.yearLabel });
      }
    });
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

  /* ----------------------------- generate ------------------------------ */

  const runGenerate = async () => {
    if (!canGenerate) return;
    setPhase("generating");
    setNotice(null);
    setReadyInfo(null);
    setOpenPicker(null);

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
            difficulty,
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
          setNotice("The AI returned no usable questions. Check your key and try again.");
          setPhase("idle");
          return;
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "AI request failed. Check your configuration and try again.");
      setPhase("idle");
      return;
    }

    // Offline engine only when the student explicitly chose No AI.
    if (collected.length === 0) {
      const qs = generateOfflineQuestions({
        subjectName: subjectNames[0] || "General",
        topicName: topicNames.join(", ") || chapterNames[0] || "General",
        count: total,
        difficulty: pickDifficulty() as "easy" | "medium" | "hard",
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

    // Trim overshoot (AI sometimes returns extras).
    const finalQuestions = collected.slice(0, total);

    try {
      const subjectNames = Array.from(new Set(finalQuestions.map((q) => q.subjectName)));
      const title =
        subjectNames.length === 1 ? `Revision · ${subjectNames[0]}` : `Revision · ${subjectNames.length} subjects`;
      const { testId } = createCustomTest(uid, {
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
        },
      });
      setReadyInfo({ testId, count: finalQuestions.length, usedAi });
      setPhase("ready");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create the test. Try again.");
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

  return (
    <PageShell route={route} title="AI Revision Generator" subtitle="Build a focused revision plan" backHref="#/revision/profile">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-10">
        {/* Provider strip */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-900">
              {activeConfig ? `${providerMeta?.name} · ${activeConfig.model}` : "No AI connected"}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {activeConfig
                ? "Your selections below are sent to the AI"
                : "Questions will use the built-in engine — connect AI for better results"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("#/revision/ai-settings")}
            className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 active:bg-slate-200"
          >
            Configure
          </button>
        </div>

        {phase !== "ready" && (
          <>
            {/* Step 1 — the 4-dropdown selection row */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">1 · What to test</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Each list filters the next: Class → Subject → Chapter → Topic
              </p>
              {curriculumMeta && (
                <p className="mt-1 text-[11px] font-semibold text-indigo-600">
                  {curriculumMeta.board} · {curriculumMeta.yearLabel} included syllabus
                </p>
              )}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
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

            {/* Step 2 — difficulty */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">2 · Difficulty level</h3>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition active:scale-[0.97] ${
                      difficulty === d.value
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="text-sm">{d.value === "mixed" ? "🎲" : d.emoji}</span>
                    <span className={`text-[11px] font-bold ${difficulty === d.value ? "text-indigo-700" : "text-slate-600"}`}>
                      {d.label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Step 3 — questions & time */}
            <Card>
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">3 · Questions & time</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">Total questions</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={totalQuestions}
                      onChange={(e) => setTotalQuestions(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))}
                      className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {QUESTION_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTotalQuestions(n)}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition ${
                          totalQuestions === n
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                      <ClockIcon className="h-3.5 w-3.5" /> Total time (minutes)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={totalMinutes}
                      onChange={(e) => setTotalMinutes(Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1))))}
                      className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {TIME_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTotalMinutes(n)}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition ${
                          totalMinutes === n
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {n}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {notice && (
              <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-700">
                {notice}
              </div>
            )}

            {/* Generate button / animation */}
            {phase === "generating" ? (
              <Card className="overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200/60" />
                    <span className="absolute inset-2 animate-pulse rounded-full bg-indigo-100" />
                    <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-300">
                      <SparklesIcon className="h-7 w-7 animate-pulse" />
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">Generating your exam…</p>
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
                <PrimaryButton disabled={!canGenerate} onClick={() => void runGenerate()}>
                  <SparklesIcon className="h-5 w-5" /> Generate revision plan
                </PrimaryButton>
                {!canGenerate && (
                  <p className="text-center text-[11px] text-slate-400">
                    Select at least one class, subject, chapter and topic to generate.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* Ready state */}
        {phase === "ready" && readyInfo && (
          <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                <CheckIcon className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Your revision plan is ready! 🎉</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {readyInfo.count} questions · ~{totalMinutes} min ·{" "}
                  {readyInfo.usedAi ? `generated by ${providerMeta?.name ?? "AI"}` : "built-in engine"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("#/revision")}
                className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-[15px] font-bold text-white shadow-lg shadow-emerald-200 transition active:scale-[0.98]"
              >
                Go to Revision Dashboard <ChevronRightIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setReadyInfo(null);
                  setNotice(null);
                }}
                className="text-xs font-semibold text-slate-400 underline-offset-2 hover:underline"
              >
                Create another revision plan
              </button>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
