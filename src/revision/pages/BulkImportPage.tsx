// Student-facing bulk importer (moved here from the admin panel).
//
// The learner pastes questions in plain text, the parser detects options and
// correct answers automatically, and one tap turns everything into a
// ready-to-take test on their dashboard. No subject/topic selection needed —
// the test is created directly.

import { useMemo, useState } from "react";
import { BookOpenIcon, CheckIcon, ChevronRightIcon, SparklesIcon, XIcon } from "../components/icons";
import { RecallBadge, RecallCard, RecallPage } from "../components/recall-ui";
import { useExitGuard } from "../components/ExitGuardContext";
import { Button } from "../recall/components/ui/button";
import { Input } from "../recall/components/ui/input";
import { Textarea } from "../recall/components/ui/textarea";
import {
  parseQuestionTextDetailed,
  stripCodeFenceLines,
  type ParseProblem,
  type ParsedQuestion,
} from "../engine/bulkParser";
import {
  buildPracticeAiPrompt,
  PRACTICE_PROMPT_LANGUAGES,
  PRACTICE_PROMPT_LEVELS,
} from "../../utils/practicePrompt";
import { MAX_PRACTICE_QUESTIONS } from "../../../utils/practiceSet.js";
import { createCustomTest, deleteCustomTestLocal } from "../engine/customTestService";
import {
  persistCustomTestToBank,
  releaseRevisionTestSlot,
  reserveRevisionTestSlotOrOffline,
  RevisionCloudError,
  type RevisionBankStatus,
} from "../engine/cloudRevisionService";
import TestBankLimitGate from "../components/TestBankLimitGate";

type Props = { uid: string; route: string; hasAccess?: boolean; onRequireAccess?: () => boolean };

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const SAMPLE = `1. What is the capital of France?
A. London
B. Paris ✓
C. Berlin
D. Madrid
Explanation: Paris is the capital.

2. Which gas do plants absorb?
A) Oxygen
B) Carbon dioxide *
C) Nitrogen
D) Hydrogen`;

type PreviewItem = ParsedQuestion & { key: string };

/**
 * Copy text to the clipboard. Tries the async Clipboard API first, then the
 * legacy execCommand path (some in-app browsers block the first one). Returns
 * false when both are blocked, so the caller can show the text to copy by hand.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** What an import without a subject label is filed under (never invented). */
const IMPORT_SUBJECT_LABEL = "My Imports";

export default function BulkImportPage({ uid, route, hasAccess = true, onRequireAccess }: Props) {
  const { navigate } = useExitGuard();
  const [title, setTitle] = useState("");
  /**
   * The chapter the learner types in for the imported plan. It is stored on
   * the test's own `planDetails.chapterNames` and is what the Revision
   * Dashboard's slide card prints as the card's supporting information, so an
   * imported test is labelled with the chapter the learner entered — not with
   * a name derived from the questions.
   */
  const [chapterName, setChapterName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "err">("info");
  const [saving, setSaving] = useState(false);
  const [bankGate, setBankGate] = useState<RevisionBankStatus | null>(null);
  const [ready, setReady] = useState<{ testId: number; count: number; pendingSync: boolean } | null>(null);
  /** Blocks the parser could not read, each with the line it starts on. */
  const [problems, setProblems] = useState<ParseProblem[]>([]);

  // AI command inputs. Nothing here is saved; they only shape the command text.
  const [aiLevel, setAiLevel] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState("");
  const [aiLanguage, setAiLanguage] = useState("");
  const [aiCopy, setAiCopy] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [showCommand, setShowCommand] = useState(false);

  /** Topic falls back to the chapter, then the test name, so the command is never generic by accident. */
  const fallbackTopic = chapterName.trim() || title.trim();
  const aiPrompt = useMemo(
    () =>
      buildPracticeAiPrompt({
        topic: aiTopic.trim() || fallbackTopic,
        level: aiLevel.trim(),
        count: aiCount.trim() ? Number(aiCount) : undefined,
        language: aiLanguage,
        explanation: "optional",
      }),
    [aiTopic, fallbackTopic, aiLevel, aiCount, aiLanguage],
  );

  const copyCommand = async () => {
    const ok = await copyText(aiPrompt);
    if (ok) {
      setAiCopy({
        tone: "ok",
        message:
          "Copied. Paste it into ChatGPT, Gemini or Claude, then paste the AI’s reply into the box below and tap Parse questions.",
      });
    } else {
      setShowCommand(true);
      setAiCopy({
        tone: "err",
        message:
          "Your browser blocked automatic copying. The command is shown below — tap inside it, select all and copy it by hand.",
      });
    }
  };

  const undetected = useMemo(() => preview.filter((p) => p.correctIndex < 0).length, [preview]);

  const parse = () => {
    setNotice(null);
    // Same shared parser as the admin importer; AI code-fence lines are dropped first.
    const { questions: parsed, problems: found } = parseQuestionTextDetailed(stripCodeFenceLines(text));
    setProblems(found);
    if (parsed.length === 0) {
      setNotice(
        found.length > 0
          ? `No questions could be read. ${found.length} block${found.length === 1 ? "" : "s"} need fixing — see the reasons below.`
          : "No questions found. Each question needs a numbered prompt (1.) and lettered options (A. B. …).",
      );
      setNoticeTone("err");
      return;
    }
    const accepted = parsed.slice(0, 100);
    setPreview(accepted.map((p) => ({ ...p, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })));
    const missing = accepted.filter((p) => !p.detected).length;
    if (parsed.length > 100) {
      setNotice(`The Test Bank supports up to 100 questions per saved test. The first 100 were imported for review.`);
      setNoticeTone("info");
    } else if (missing > 0) {
      setNotice(`${missing} question(s) had no detected correct answer — mark them below before creating the test.`);
      setNoticeTone("info");
    } else {
      setNotice(`${accepted.length} questions parsed. Review below, then create your test.`);
      setNoticeTone("info");
    }
  };

  const patch = (key: string, partial: Partial<ParsedQuestion>) => {
    setPreview((items) => items.map((q) => (q.key === key ? { ...q, ...partial } : q)));
  };
  const removeItem = (key: string) => setPreview((items) => items.filter((q) => q.key !== key));

  const createTest = async () => {
    if (preview.length === 0 || saving) return;
    if (onRequireAccess && !onRequireAccess()) return;
    if (!hasAccess) return;
    if (undetected > 0) {
      setNotice(`${undetected} question(s) still have no correct answer marked. Tap the right option on each.`);
      setNoticeTone("err");
      return;
    }
    setSaving(true);
    setNotice(null);
    let reservationId = "";
    let createdTestId: number | null = null;
    try {
      const reservation = await reserveRevisionTestSlotOrOffline(uid);
      reservationId = reservation.reservationId;
      const cleanTitle = title.trim() || "My Imported Test";
      // The chapter type-in is saved with the test so the dashboard card can
      // show it as the plan's supporting information. Legacy plans without
      // planDetails keep deriving their labels from the questions.
      const cleanChapter = chapterName.trim();
      const created = createCustomTest(uid, {
        title: cleanTitle,
        estimatedMinutes: Math.max(2, Math.ceil(preview.length * 0.75)),
        source: "bulk",
        questions: preview.map((p) => ({
          prompt: p.prompt,
          options: p.options,
          correctIndex: p.correctIndex,
          explanation: p.explanation,
          difficulty: "medium",
          subjectName: IMPORT_SUBJECT_LABEL,
          topicName: cleanChapter || cleanTitle,
        })),
        planDetails: {
          // An import has no class picker, so it carries no class labels; the
          // subject stays the importer's own bucket and the chapter is exactly
          // what the learner typed.
          classNames: [],
          subjectNames: [IMPORT_SUBJECT_LABEL],
          chapterNames: cleanChapter ? [cleanChapter] : [],
          topicNames: [],
          difficulty: "medium",
          questionMode: "mixed",
        },
      });
      createdTestId = created.testId;
      const persisted = await persistCustomTestToBank(uid, created.testId, reservationId);
      setReady({ testId: created.testId, count: preview.length, pendingSync: persisted.status === "local" });
      setPreview([]);
      setText("");
      setNotice(null);
    } catch (err) {
      if (createdTestId !== null) deleteCustomTestLocal(uid, createdTestId);
      if (reservationId) await releaseRevisionTestSlot(uid, reservationId);
      if (err instanceof RevisionCloudError && err.code === "TEST_BANK_FULL" && err.bank) {
        setBankGate(err.bank);
      } else {
        setNotice(err instanceof Error ? err.message : "Could not save the test securely.");
        setNoticeTone("err");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecallPage
      title="Bulk Import"
      subtitle="Paste a full revision plan"
      onBack={() => navigate("#/revision/profile")}
    >
      <div
        data-rev-layout="bulkimport"
        data-revision-route={route}
        className="mx-auto w-full max-w-[900px] space-y-4 animate-fade-in"
      >
        {ready ? (
          <RecallCard className="flex flex-col items-center gap-3 overflow-hidden py-6 text-center sm:py-8">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-tertiary-container text-on-tertiary-container">
              <CheckIcon className="h-8 w-8" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-on-surface">Test created! 🎉</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {ready.count} questions imported — saved to your Test Bank and live on your dashboard.
              </p>
              {ready.pendingSync ? (
                <p className="mt-2 text-sm font-medium text-secondary">
                  Saved on this device. Cloud sync will finish automatically when you are online.
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
              <Button type="button" size="lg" onClick={() => navigate("#/revision")}>
                Start your test <ChevronRightIcon className="h-5 w-5" />
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={() => navigate("#/revision/bank")}>
                Open Test Bank
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="text-sm text-on-surface-variant"
              onClick={() => setReady(null)}
            >
              Import more questions
            </Button>
          </RecallCard>
        ) : (
          <>
            <RecallCard className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-on-primary-container">
                  <BookOpenIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-on-surface">Paste your revision plan</h2>
                  <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                    Drop in a complete test — questions, options and correct answers. Generate them in ChatGPT,
                    Claude or anywhere else, then paste here to create a revision plan in one go.
                  </p>
                </div>
              </div>

              {/* Test name + chapter name travel together: the name is what
                  the dashboard card prints under its count, the chapter is
                  the card's supporting information. Both are optional. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="block text-sm font-semibold text-on-surface-variant">Test name</span>
                  <Input
                    className="h-11 rounded-xl"
                    placeholder="Test name (optional)"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-sm font-semibold text-on-surface-variant">Chapter name</span>
                  <Input
                    data-rev-import-chapter
                    className="h-11 rounded-xl"
                    placeholder="e.g. Electrostatics"
                    value={chapterName}
                    onChange={(event) => setChapterName(event.target.value)}
                  />
                </label>
              </div>

              {/* Step 1 — the AI command. It is built from the shared practice prompt,
                  so the format it asks for is exactly what the parser below reads. */}
              <section
                data-rev-ai-command
                aria-labelledby="rev-ai-command-title"
                className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-low p-3 sm:p-4"
              >
                <div className="flex items-start gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-on-primary-container">
                    <SparklesIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 id="rev-ai-command-title" className="text-sm font-bold text-on-surface">
                      1. Get questions from an AI
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
                      Fill in what you need, copy the command, and paste it into ChatGPT, Gemini or Claude. Fields you
                      leave empty are left out of the command.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-semibold text-on-surface-variant">Class / level</span>
                    <Input
                      data-rev-ai-level
                      className="h-11 rounded-xl"
                      placeholder="e.g. Class 10 (CBSE) — optional"
                      value={aiLevel}
                      onChange={(event) => setAiLevel(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-semibold text-on-surface-variant">Topic</span>
                    <Input
                      data-rev-ai-topic
                      className="h-11 rounded-xl"
                      placeholder={fallbackTopic ? `Uses “${fallbackTopic}”` : "e.g. Photosynthesis"}
                      value={aiTopic}
                      onChange={(event) => setAiTopic(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-semibold text-on-surface-variant">Number of questions</span>
                    <Input
                      data-rev-ai-count
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_PRACTICE_QUESTIONS}
                      className="h-11 rounded-xl"
                      placeholder="Default 10"
                      value={aiCount}
                      onChange={(event) => setAiCount(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-semibold text-on-surface-variant">Language of questions</span>
                    <select
                      data-rev-ai-language
                      className="h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      value={aiLanguage}
                      onChange={(event) => setAiLanguage(event.target.value)}
                    >
                      <option value="">Not set (English)</option>
                      {PRACTICE_PROMPT_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5" aria-label="Class quick-fill">
                  {PRACTICE_PROMPT_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAiLevel(level)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        aiLevel === level
                          ? "border-primary bg-primary-soft text-on-primary-container"
                          : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" className="flex-1" onClick={() => void copyCommand()} data-rev-copy-ai-command>
                    <SparklesIcon className="h-4 w-4" /> Copy AI command
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    aria-expanded={showCommand}
                    onClick={() => setShowCommand((open) => !open)}
                  >
                    {showCommand ? "Hide command" : "Show command"}
                  </Button>
                </div>

                {aiCopy ? (
                  <p
                    role={aiCopy.tone === "err" ? "alert" : "status"}
                    className={`rounded-xl px-3 py-2 text-xs font-medium leading-relaxed ${
                      aiCopy.tone === "err"
                        ? "bg-error-container text-on-error-container"
                        : "bg-tertiary-container text-on-tertiary-container"
                    }`}
                  >
                    {aiCopy.message}
                  </p>
                ) : null}

                {showCommand ? (
                  <label className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-on-surface-variant">
                      AI command (tap inside, select all, copy)
                    </span>
                    <Textarea
                      readOnly
                      rows={8}
                      data-rev-ai-command-text
                      className="resize-y rounded-xl font-mono text-xs leading-relaxed"
                      value={aiPrompt}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label="AI command text"
                    />
                  </label>
                ) : null}
              </section>

              {/* Step 2 — the AI's reply (or any questions) goes here. */}
              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-on-surface-variant">
                  2. Paste the AI reply or your questions
                </span>
                <Textarea
                  data-rev-import-paste
                  rows={9}
                  className="min-h-56 resize-y rounded-xl font-mono text-xs leading-relaxed"
                  placeholder={SAMPLE}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setProblems([]);
                  }}
                  aria-label="Paste questions and answers"
                />
              </label>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                Format: “1. Question?” then “A. …”, “B. …”. Mark the right answer with ✓ / * / (correct) or an
                “Answer: B” line.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="flex-1" onClick={parse} disabled={!text.trim()}>
                  Parse questions
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={preview.length === 0 || saving}
                  onClick={() => void createTest()}
                >
                  <SparklesIcon className="h-4 w-4" /> Create test ({preview.length})
                </Button>
              </div>

              {notice ? (
                <div
                  role={noticeTone === "err" ? "alert" : "status"}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium leading-relaxed ${
                    noticeTone === "err"
                      ? "bg-error-container text-on-error-container"
                      : "bg-primary-soft text-on-primary-container"
                  }`}
                >
                  {notice}
                </div>
              ) : null}

              {problems.length > 0 ? (
                <div role="alert" data-rev-import-problems className="rounded-xl bg-error-container px-3 py-2.5 text-sm text-on-error-container">
                  <p className="font-semibold">Fix these blocks, then parse again:</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                    {problems.map((problem, index) => (
                      <li key={`${problem.line}-${index}`}>
                        <span className="font-semibold">Line {problem.line}:</span> {problem.message}.
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </RecallCard>

            {preview.length > 0 ? (
              <RecallCard className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Question preview</h2>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      Review each card and tap the correct answer where needed.
                    </p>
                  </div>
                  <RecallBadge tone={undetected > 0 ? "warning" : "success"}>
                    {undetected > 0 ? `${undetected} answer${undetected === 1 ? "" : "s"} needed` : `${preview.length} ready`}
                  </RecallBadge>
                </div>

                <div className="space-y-3">
                  {preview.map((question, questionIndex) => (
                    <article
                      key={question.key}
                      className="rounded-2xl border border-outline-variant bg-surface-container-low p-3 sm:p-4"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-container-high text-xs font-bold text-on-surface-variant">
                          {questionIndex + 1}
                        </span>
                        <Textarea
                          rows={2}
                          className="min-h-16 flex-1 resize-y border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-on-surface focus-visible:border-outline-variant"
                          aria-label={`Question ${questionIndex + 1}`}
                          value={question.prompt}
                          onChange={(event) => patch(question.key, { prompt: event.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(question.key)}
                          aria-label={`Remove question ${questionIndex + 1}`}
                          className="h-9 w-9 shrink-0 text-on-surface-variant"
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {question.options.map((option, optionIndex) => {
                          const isCorrect = question.correctIndex === optionIndex;
                          return (
                            <div
                              key={`${question.key}-${optionIndex}`}
                              className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 ${
                                isCorrect
                                  ? "border-tertiary/40 bg-tertiary-container/30"
                                  : "border-outline-variant bg-surface"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`correct-${question.key}`}
                                checked={isCorrect}
                                onChange={() => patch(question.key, { correctIndex: optionIndex, detected: true })}
                                className="h-4 w-4 shrink-0 accent-primary"
                                aria-label={`Mark option ${OPTION_LETTERS[optionIndex] ?? optionIndex + 1} as correct`}
                              />
                              <span className="w-5 shrink-0 text-xs font-bold text-on-surface-variant">
                                {OPTION_LETTERS[optionIndex] ?? optionIndex + 1}
                              </span>
                              <Input
                                className={`h-9 min-w-0 flex-1 rounded-lg ${
                                  isCorrect
                                    ? "border-transparent bg-transparent font-semibold text-on-tertiary-container"
                                    : ""
                                }`}
                                aria-label={`Question ${questionIndex + 1}, option ${OPTION_LETTERS[optionIndex] ?? optionIndex + 1}`}
                                value={option}
                                onChange={(event) => {
                                  const options = [...question.options];
                                  options[optionIndex] = event.target.value;
                                  patch(question.key, { options });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {question.correctIndex < 0 ? (
                        <p className="mt-2 text-sm font-semibold text-secondary">
                          Correct answer not detected — tap it above.
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>

                <Button
                  type="button"
                  disabled={preview.length === 0 || saving}
                  onClick={() => void createTest()}
                  className="w-full sm:w-auto"
                >
                  <CheckIcon className="h-4 w-4" />
                  {saving
                    ? "Saving securely…"
                    : `Create test with ${preview.length} question${preview.length === 1 ? "" : "s"}`}
                </Button>
              </RecallCard>
            ) : null}
          </>
        )}
      </div>

      <TestBankLimitGate
        open={Boolean(bankGate)}
        bank={bankGate}
        onClose={() => setBankGate(null)}
        onManageBank={() => navigate("#/revision/bank")}
        onExplorePlans={() => navigate("#/subscription")}
      />
    </RecallPage>
  );
}
