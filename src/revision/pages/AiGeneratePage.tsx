// Student-facing AI question generator.
//
// Uses the learner's configured AI (their own key or the app-provided one)
// to create fresh MCQs for any subject/topic in their revision plan and adds
// them straight to their revision bank — where they flow into daily tests and
// revision sessions automatically.

import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, EmptyState, PrimaryButton, SecondaryButton } from "../components/ui";
import { SparklesIcon, CheckIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import { defaultCatalogAiSettings } from "../engine/aiConfig";
import { DEFAULT_CUSTOMIZATION_LIMITS, loadDb } from "../engine/store";
import {
  getProvider,
  loadUserAiConfig,
  generateQuestionsWithAi,
  resolveEffectiveAi,
} from "../engine/aiConfig";
import { generateOfflineQuestions } from "../engine/offlineGenerator";
import { addAiQuestionsToBank } from "../engine/aiBankService";
import { consumeAiGeneration } from "../engine/aiUsage";
import { defaultCatalogAiSettings } from "../engine/aiConfig";
import type { ParsedQuestion } from "../engine/bulkParser";

type Props = { uid: string; route: string };

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const COUNTS = [1, 3, 5, 10];

type PreviewItem = ParsedQuestion & { key: string };

export default function AiGeneratePage({ uid, route }: Props) {
  const { navigate } = useExitGuard();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchRemoteCatalog>>>(null);
  const [subjectSlug, setSubjectSlug] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("medium");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "err">("info");
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [addedIds, setAddedIds] = useState<number[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRemoteCatalog().then((c) => {
      if (cancelled) return;
      // No published catalog? Build one from the learner's local DB so the
      // generator still has subjects/topics to work with.
      const resolved: RevisionCatalog =
        c ??
        (() => {
          const db = loadDb(uid);
          return {
            version: 0,
            settings: db.settings,
            classes: [],
            customizationLimits: { ...DEFAULT_CUSTOMIZATION_LIMITS },
            subjects: db.subjects.map((s) => ({ name: s.name, slug: s.slug, icon: s.icon, color: s.color })),
            topics: db.topics.map((t) => ({ subjectSlug: t.slug, name: t.name, slug: t.slug })),
            questions: [],
            aiSettings: defaultCatalogAiSettings(),
          };
        })();
      setCatalog(resolved);
      setSubjectSlug((prev) => prev || resolved.subjects[0]?.slug || "");
      setTopicSlug((prev) => prev || resolved.topics.find((t) => t.subjectSlug === resolved.subjects[0]?.slug)?.slug || "");
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const userCfg = useMemo(() => loadUserAiConfig(uid), [uid]);
  const effective = useMemo(() => resolveEffectiveAi(userCfg, catalog?.aiSettings ?? null), [userCfg, catalog]);
  const activeConfig = effective.config;

  const subjects = catalog?.subjects ?? [];
  const topics = useMemo(
    () => (catalog?.topics ?? []).filter((t) => t.subjectSlug === subjectSlug),
    [catalog, subjectSlug],
  );
  const subject = subjects.find((s) => s.slug === subjectSlug);
  const topic = topics.find((t) => t.slug === topicSlug);

  const setSubject = (slug: string) => {
    setSubjectSlug(slug);
    setTopicSlug(catalog?.topics.find((t) => t.subjectSlug === slug)?.slug ?? "");
  };

  const patch = (key: string, partial: Partial<ParsedQuestion>) => {
    setPreview((items) => items.map((q) => (q.key === key ? { ...q, ...partial } : q)));
  };
  const removeItem = (key: string) => setPreview((items) => items.filter((q) => q.key !== key));

  const runGenerate = async (offline = false) => {
    if (!topic) return;
    setGenerating(true);
    setNotice(null);
    setAddedIds(null);
    setPreview([]);
    try {
      if (!offline) {
        // Pre-check + reserve a slot so two tabs cannot overshoot the published cap.
        await consumeAiGeneration(uid, catalog?.aiSettings ?? defaultCatalogAiSettings());
      }
      const questions = offline
        ? generateOfflineQuestions({ subjectName: subject?.name ?? "", topicName: topic.name, count, difficulty })
        : await generateQuestionsWithAi(activeConfig!, {
            subject: subject?.name ?? "",
            topic: topic.name,
            difficulty,
            count,
          });
      if (questions.length === 0) {
        setNotice("The AI returned no usable questions. Try a different topic or model.");
        setNoticeTone("err");
        return;
      }
      setPreview(questions.map((q) => ({ ...q, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })));
      if (offline) {
        setNotice("Generated from the built-in offline engine (no AI used).");
        setNoticeTone("info");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Generation failed. Check your AI settings and try again.");
      setNoticeTone("err");
    } finally {
      setGenerating(false);
    }
  };

  const addAll = () => {
    if (preview.length === 0 || !topic) return;
    setAdding(true);
    try {
      const ids = addAiQuestionsToBank(uid, {
        questions: preview,
        subjectSlug,
        topicSlug: topic.slug,
        difficulty,
      });
      setAddedIds(ids);
      setPreview([]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not add questions to your bank.");
      setNoticeTone("err");
    } finally {
      setAdding(false);
    }
  };

  const effProvider = activeConfig ? getProvider(activeConfig.provider) : null;

  return (
    <PageShell route={route} title="AI Generate" subtitle="Fresh questions in one tap">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-10">
        {/* Generator card */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <SparklesIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold text-slate-900">AI Question Generator</h2>
              <p className="text-xs text-slate-500">
                {activeConfig
                  ? `Powered by ${effProvider?.name} · ${activeConfig.model}`
                  : "Connect an AI provider to enable generation"}
              </p>
            </div>
            {activeConfig && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                AI on
              </span>
            )}
          </div>

          {activeConfig ? (
            <>
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
                    value={subjectSlug}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.icon} {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
                    value={topicSlug}
                    onChange={(e) => setTopicSlug(e.target.value)}
                  >
                    {topics.length === 0 && <option value="">No topics</option>}
                    {topics.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) || 5)}
                  >
                    {COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n} question{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <PrimaryButton
                className="mt-3"
                disabled={!topic || generating}
                onClick={() => void runGenerate(false)}
              >
                <SparklesIcon className="h-4 w-4" /> {generating ? "Generating…" : "Generate with AI"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => void runGenerate(true)}
                className="mt-2 w-full text-center text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              >
                or generate offline (no AI)
              </button>
            </>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={<SparklesIcon className="h-8 w-8" />}
                title="No AI connected yet"
                description="Connect your own API key — Gemini, ChatGPT, Claude, Groq, OpenRouter or any custom API — and see every available model instantly."
                action={
                  <PrimaryButton className="w-auto px-6" onClick={() => navigate("#/revision/ai-settings")}>
                    Open AI Settings
                  </PrimaryButton>
                }
              />
            </div>
          )}

          {notice && (
            <div
              className={`mt-3 rounded-xl px-3 py-2.5 text-xs font-medium leading-relaxed ${
                noticeTone === "err" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"
              }`}
            >
              {notice}
            </div>
          )}
        </Card>

        {/* Added confirmation */}
        {addedIds && (
          <Card className="border-emerald-200 bg-emerald-50/60">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <CheckIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-800">
                  {addedIds.length} question{addedIds.length === 1 ? "" : "s"} added to your bank
                </p>
                <p className="text-xs text-emerald-700">
                  They&apos;ll appear in the Revision Bank and future daily tests.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <SecondaryButton className="flex-1" onClick={() => navigate("#/revision/bank")}>
                View bank
              </SecondaryButton>
              <PrimaryButton
                className="flex-1 !bg-emerald-600"
                onClick={() => {
                  setAddedIds(null);
                  setNotice(null);
                }}
              >
                Generate more
              </PrimaryButton>
            </div>
          </Card>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Generated ({preview.length})</h3>
              <span className="text-[11px] text-slate-400">Tap the correct answer before adding</span>
            </div>
            <div className="space-y-3">
              {preview.map((q, qi) => (
                <div key={q.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                      {qi + 1}
                    </span>
                    <textarea
                      rows={2}
                      className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-white"
                      value={q.prompt}
                      onChange={(e) => patch(q.key, { prompt: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(q.key)}
                      className="h-7 w-7 shrink-0 rounded-lg text-slate-400 active:bg-slate-100"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${q.key}`}
                          checked={q.correctIndex === i}
                          onChange={() => patch(q.key, { correctIndex: i })}
                          className="h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span className="w-5 shrink-0 text-xs font-bold text-slate-500">{OPTION_LETTERS[i]}</span>
                        <input
                          className={`w-full rounded-lg border px-2 py-1 text-sm outline-none ${
                            i === q.correctIndex
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 bg-white text-slate-700 focus:border-slate-400"
                          }`}
                          value={opt}
                          onChange={(e) => {
                            const options = [...q.options];
                            options[i] = e.target.value;
                            patch(q.key, { options });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-slate-400"
                    placeholder="Explanation (optional)"
                    value={q.explanation}
                    onChange={(e) => patch(q.key, { explanation: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <PrimaryButton className="mt-3" disabled={adding} onClick={addAll}>
              <CheckIcon className="h-4 w-4" /> {adding ? "Adding…" : `Add all ${preview.length} to my bank`}
            </PrimaryButton>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
