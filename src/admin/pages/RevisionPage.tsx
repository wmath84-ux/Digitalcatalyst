"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  LoadingState,
  Pill,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  Sheet,
  Tabs,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/admin/ui";
import { useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { type RevisionCatalog } from "@/revision/engine/catalogService";
import {
  DEFAULT_SETTINGS,
  DEFAULT_CUSTOMIZATION_LIMITS,
  type CatalogClass,
  type CatalogQuestion,
  type CatalogSubject,
  type CatalogTopic,
  type CustomizationLimits,
  type RevisionSettings,
} from "@/revision/engine/store";
import { parseQuestionText, type ParsedQuestion } from "@/revision/engine/bulkParser";
import { generateOfflineQuestions } from "@/revision/engine/offlineGenerator";
import {
  DEFAULT_MODEL as DEFAULT_GEMINI_MODEL,
  MODEL_OPTIONS as GEMINI_MODEL_OPTIONS,
  generateWithGeminiClient,
  getGeminiKey,
  getGeminiModel,
  setGeminiKey,
  setGeminiModel,
} from "@/revision/engine/aiGenerate";

const REVISION_TABS = [
  { key: "settings", label: "Settings" },
  { key: "questions", label: "Questions" },
  { key: "subjects", label: "Subjects & Topics" },
  { key: "classes", label: "Classes" },
  { key: "customization", label: "Customization" },
  { key: "ai", label: "AI Generate" },
  { key: "bulk", label: "Bulk Import" },
];

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  `item-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const genId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type TabProps = {
  catalog: RevisionCatalog;
  saving: boolean;
  update: (patch: Partial<RevisionCatalog>) => void;
  persist: (next: RevisionCatalog) => Promise<void>;
  notify: ReturnType<typeof useToast>["notify"];
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function RevisionPage() {
  const [tab, setTab] = useState("settings");
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ catalog: RevisionCatalog; isDefault: boolean }>("/api/admin/revision");
      setCatalog(res.catalog);
      if (res.isDefault) notify("info", "Using the built-in starter bank. Save to publish your own.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revision catalog.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<RevisionCatalog>) => {
    setCatalog((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const persist = async (next: RevisionCatalog) => {
    setSaving(true);
    try {
      const res = await adminFetch<{ catalog: RevisionCatalog }>("/api/admin/revision", {
        method: "POST",
        body: JSON.stringify(next),
      });
      setCatalog(res.catalog);
      setDirty(false);
      notify("success", "Saved & published to learners.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <SectionCard title="Revision & Daily Tests">
        <p className="text-sm text-red-500">{error}</p>
        <PrimaryButton className="mt-3" onClick={load}>Retry</PrimaryButton>
      </SectionCard>
    );
  }
  if (!catalog) return <LoadingState label="Loading revision catalog…" />;

  const props: TabProps = { catalog, saving, update, persist, notify };

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={REVISION_TABS} active={tab} onChange={setTab} />
      <div className="mt-3">
        {tab === "settings" && <SettingsTab {...props} />}
        {tab === "questions" && <QuestionsTab {...props} />}
        {tab === "subjects" && <SubjectsTab {...props} />}
        {tab === "classes" && <ClassesTab {...props} />}
        {tab === "customization" && <CustomizationTab {...props} />}
        {tab === "ai" && <AiTab {...props} />}
        {tab === "bulk" && <BulkTab {...props} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings tab                                                        */
/* ------------------------------------------------------------------ */

function SettingsTab({ catalog, saving, update, persist }: TabProps) {
  const settings = catalog.settings;
  const limits = catalog.customizationLimits ?? { ...DEFAULT_CUSTOMIZATION_LIMITS };
  const patch = (partial: Partial<RevisionSettings>) => update({ settings: { ...settings, ...partial } });

  const num = (v: string, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title="Daily test configuration"
        description="Controls how the Daily Test is built for every learner."
      >
        <div className="space-y-3">
          <Field label="Tests per day" hint="How many distinct tests each learner gets every day (1–20).">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={20}
              value={settings.testsPerDay}
              onChange={(e) => patch({ testsPerDay: num(e.target.value, DEFAULT_SETTINGS.testsPerDay) })}
            />
          </Field>
          <Field label="Questions per test" hint="How many questions each daily test contains (1–100).">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={100}
              value={settings.questionsPerTest}
              onChange={(e) => patch({ questionsPerTest: num(e.target.value, DEFAULT_SETTINGS.questionsPerTest) })}
            />
          </Field>
          <Field label="Estimated minutes" hint="Shown on the test card as the expected completion time.">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={240}
              value={settings.estimatedMinutes}
              onChange={(e) => patch({ estimatedMinutes: num(e.target.value, DEFAULT_SETTINGS.estimatedMinutes) })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="User customization limits"
        description="Control what users can customize on their revision plan."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={limits.allowUserCustomization}
              onChange={(e) => update({ customizationLimits: { ...limits, allowUserCustomization: e.target.checked } })}
              className="h-4 w-4 accent-indigo-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-900">Allow user customization</span>
              <p className="text-xs text-slate-500">Users can override default test settings</p>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={limits.requireClassSelection}
              onChange={(e) => update({ customizationLimits: { ...limits, requireClassSelection: e.target.checked } })}
              className="h-4 w-4 accent-indigo-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-900">Require class selection</span>
              <p className="text-xs text-slate-500">Users must pick a class before customizing</p>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min tests/day">
              <input className={inputClass} type="number" min={1} max={10} value={limits.minTestsPerDay}
                onChange={(e) => update({ customizationLimits: { ...limits, minTestsPerDay: num(e.target.value, 1) } })} />
            </Field>
            <Field label="Max tests/day">
              <input className={inputClass} type="number" min={1} max={20} value={limits.maxTestsPerDay}
                onChange={(e) => update({ customizationLimits: { ...limits, maxTestsPerDay: num(e.target.value, 5) } })} />
            </Field>
            <Field label="Min questions/test">
              <input className={inputClass} type="number" min={1} max={50} value={limits.minQuestionsPerTest}
                onChange={(e) => update({ customizationLimits: { ...limits, minQuestionsPerTest: num(e.target.value, 5) } })} />
            </Field>
            <Field label="Max questions/test">
              <input className={inputClass} type="number" min={1} max={100} value={limits.maxQuestionsPerTest}
                onChange={(e) => update({ customizationLimits: { ...limits, maxQuestionsPerTest: num(e.target.value, 50) } })} />
            </Field>
            <Field label="Min minutes">
              <input className={inputClass} type="number" min={1} max={60} value={limits.minEstimatedMinutes}
                onChange={(e) => update({ customizationLimits: { ...limits, minEstimatedMinutes: num(e.target.value, 5) } })} />
            </Field>
            <Field label="Max minutes">
              <input className={inputClass} type="number" min={5} max={240} value={limits.maxEstimatedMinutes}
                onChange={(e) => update({ customizationLimits: { ...limits, maxEstimatedMinutes: num(e.target.value, 120) } })} />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Bank overview">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Subjects" value={catalog.subjects.length} />
          <MiniStat label="Topics" value={catalog.topics.length} />
          <MiniStat label="Classes" value={(catalog.classes ?? []).length} />
          <MiniStat label="Total questions" value={catalog.questions.length} />
          <MiniStat label="Active questions" value={catalog.questions.filter((q) => q.isActive).length} />
        </div>
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={() => persist(catalog)}>
        Save settings
      </PrimaryButton>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Questions tab                                                       */
/* ------------------------------------------------------------------ */

type QuestionDraft = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  subjectSlug: string;
  topicSlug: string;
  isActive: boolean;
};

function emptyDraft(catalog: RevisionCatalog): QuestionDraft {
  return {
    prompt: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    explanation: "",
    difficulty: "medium",
    subjectSlug: catalog.subjects[0]?.slug ?? "",
    topicSlug: catalog.topics.find((t) => t.subjectSlug === catalog.subjects[0]?.slug)?.slug ?? "",
    isActive: true,
  };
}

function subjectOfQuestion(catalog: RevisionCatalog, q: CatalogQuestion): string {
  const topic = catalog.topics.find((t) => t.slug === q.topicSlug);
  return topic ? topic.subjectSlug : "";
}

function QuestionsTab({ catalog, update, persist }: TabProps) {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        const subjectSlug = subjectOfQuestion(catalog, question);
        if (subjectFilter !== "all" && subjectSlug !== subjectFilter) return false;
        if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) return false;
        if (q && !(`${question.prompt} ${question.options.join(" ")}`.toLowerCase().includes(q))) return false;
        return true;
      });
  }, [catalog, search, subjectFilter, difficultyFilter]);

  return (
    <div className="space-y-3">
      <SectionCard
        title={`Questions (${filtered.length})`}
        description="Create, edit and delete questions. Mark the correct option with the radio button."
        action={
          <SecondaryButton className="h-9 text-xs" onClick={() => { setEditingIndex(null); setEditing(emptyDraft(catalog)); }}>
            + Add
          </SecondaryButton>
        }
      >
        <div className="space-y-2">
          <input className={inputClass} placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex gap-2">
            <select className={selectClass} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="all">All subjects</option>
              {catalog.subjects.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
            <select className={selectClass} value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
              <option value="all">All difficulty</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {filtered.length === 0 ? (
        <EmptyState title="No questions match" description="Add a question or adjust the filters." />
      ) : (
        filtered.map((item) => {
          const q = item.question;
          const index = item.index;
          const subjectSlug = subjectOfQuestion(catalog, q);
          const subject = catalog.subjects.find((s) => s.slug === subjectSlug);
          const topic = catalog.topics.find((t) => t.slug === q.topicSlug);
          return (
            <QuestionCard
              key={index}
              question={q}
              subjectName={subject?.name ?? subjectSlug}
              topicName={topic?.name ?? q.topicSlug}
              onEdit={() => {
                setEditingIndex(index);
                setEditing({
                  prompt: q.prompt,
                  options: [...q.options],
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  difficulty: q.difficulty,
                  subjectSlug,
                  topicSlug: q.topicSlug,
                  isActive: q.isActive,
                });
              }}
              onDelete={() => {
                const next = { ...catalog, questions: catalog.questions.filter((_, i) => i !== index) };
                update(next);
                void persist(next);
              }}
            />
          );
        })
      )}

      {editing && (
        <QuestionEditorSheet
          draft={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            const cleanOptions = draft.options.map((o) => o.trim());
            const nextQ: CatalogQuestion = {
              topicSlug: draft.topicSlug,
              difficulty: draft.difficulty,
              prompt: draft.prompt.trim(),
              options: cleanOptions,
              correctIndex: Math.max(0, Math.min(cleanOptions.length - 1, draft.correctIndex)),
              explanation: draft.explanation.trim(),
              isActive: draft.isActive,
            };
            const questions =
              editingIndex === null
                ? [...catalog.questions, nextQ]
                : catalog.questions.map((q, i) => (i === editingIndex ? nextQ : q));
            const next = { ...catalog, questions };
            setEditing(null);
            void persist(next);
          }}
        />
      )}
    </div>
  );
}

function QuestionCard({
  question,
  subjectName,
  topicName,
  onEdit,
  onDelete,
}: {
  question: CatalogQuestion;
  subjectName: string;
  topicName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-slate-900">{question.prompt}</p>
        <span className="flex shrink-0 gap-1">
          <button type="button" onClick={onEdit} className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 active:bg-slate-100">Edit</button>
          <button type="button" onClick={onDelete} className="h-8 rounded-lg border border-red-200 px-2 text-xs font-medium text-red-600 active:bg-red-50">Delete</button>
        </span>
      </div>
      <div className="mt-2 space-y-0.5">
        {question.options.map((opt, i) => (
          <p key={i} className={`text-xs ${i === question.correctIndex ? "font-semibold text-emerald-700" : "text-slate-500"}`}>
            {i === question.correctIndex ? "✓" : ""} {OPTION_LETTERS[i]}. {opt}
          </p>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone="info">{subjectName}</Pill>
        <Pill tone="default">{topicName}</Pill>
        <Pill tone={question.difficulty === "hard" ? "danger" : question.difficulty === "medium" ? "warn" : "success"}>{question.difficulty}</Pill>
        {!question.isActive && <Pill tone="danger">inactive</Pill>}
      </div>
    </div>
  );
}

function QuestionEditorSheet({
  draft,
  catalog,
  onClose,
  onSave,
}: {
  draft: QuestionDraft;
  catalog: RevisionCatalog;
  onClose: () => void;
  onSave: (draft: QuestionDraft) => void;
}) {
  const [d, setD] = useState<QuestionDraft>(draft);
  const topics = catalog.topics.filter((t) => t.subjectSlug === d.subjectSlug);

  const setSubject = (subjectSlug: string) => {
    const firstTopic = catalog.topics.find((t) => t.subjectSlug === subjectSlug);
    setD({ ...d, subjectSlug, topicSlug: firstTopic?.slug ?? "" });
  };

  const setOption = (i: number, value: string) => {
    const options = [...d.options];
    options[i] = value;
    setD({ ...d, options });
  };
  const addOption = () => {
    if (d.options.length >= 6) return;
    setD({ ...d, options: [...d.options, ""] });
  };
  const removeOption = (i: number) => {
    if (d.options.length <= 2) return;
    const options = d.options.filter((_, idx) => idx !== i);
    setD({ ...d, options, correctIndex: Math.min(d.correctIndex, options.length - 1) });
  };

  const valid = d.prompt.trim().length > 0 && d.options.filter((o) => o.trim()).length >= 2;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Question"
      footer={
        <div className="flex gap-2">
          <SecondaryButton className="flex-1" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton className="flex-1" disabled={!valid} onClick={() => onSave(d)}>Save question</PrimaryButton>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Subject" required>
          <select className={selectClass} value={d.subjectSlug} onChange={(e) => setSubject(e.target.value)}>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Topic" required>
          <select className={selectClass} value={d.topicSlug} onChange={(e) => setD({ ...d, topicSlug: e.target.value })}>
            {topics.length === 0 && <option value="">No topics — add one first</option>}
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Difficulty">
          <select className={selectClass} value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value as QuestionDraft["difficulty"] })}>
            {DIFFICULTIES.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Question" required>
          <textarea className={textareaClass} value={d.prompt} placeholder="Type the question…" onChange={(e) => setD({ ...d, prompt: e.target.value })} />
        </Field>
        <div>
          <span className="text-xs font-medium text-slate-700">Options — select the correct one</span>
          <div className="mt-1.5 space-y-2">
            {d.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-option"
                  checked={d.correctIndex === i}
                  onChange={() => setD({ ...d, correctIndex: i })}
                  className="h-4 w-4 shrink-0 accent-emerald-600"
                  aria-label={`Mark option ${OPTION_LETTERS[i]} correct`}
                />
                <span className="w-5 shrink-0 text-xs font-bold text-slate-500">{OPTION_LETTERS[i]}</span>
                <input className={inputClass} value={opt} placeholder={`Option ${OPTION_LETTERS[i]}`} onChange={(e) => setOption(i, e.target.value)} />
                {d.options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)} className="h-8 w-8 shrink-0 rounded-lg text-slate-400 active:bg-slate-100">✕</button>
                )}
              </div>
            ))}
          </div>
          {d.options.length < 6 && (
            <button type="button" onClick={addOption} className="mt-2 text-xs font-medium text-indigo-600">+ Add option</button>
          )}
        </div>
        <Field label="Explanation">
          <textarea className={textareaClass} value={d.explanation} placeholder="Why is the correct answer correct?" onChange={(e) => setD({ ...d, explanation: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={d.isActive} onChange={(e) => setD({ ...d, isActive: e.target.checked })} className="h-4 w-4 accent-slate-900" />
          Active (included in tests)
        </label>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Subjects & Topics                                                   */
/* ------------------------------------------------------------------ */

function SubjectsTab({ catalog, update, persist, notify }: TabProps) {
  const [newSubject, setNewSubject] = useState("");
  const [topicName, setTopicName] = useState("");
  const [topicSubject, setTopicSubject] = useState(catalog.subjects[0]?.slug ?? "");

  const addSubject = () => {
    const name = newSubject.trim();
    if (!name) return;
    if (catalog.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      notify("error", "That subject already exists.");
      return;
    }
    const next: CatalogSubject = { name, slug: slugify(name), icon: "📘", color: "indigo" };
    void persist({ ...catalog, subjects: [...catalog.subjects, next] });
    update({ subjects: [...catalog.subjects, next] });
    setNewSubject("");
  };

  const addTopic = () => {
    const name = topicName.trim();
    if (!name || !topicSubject) return;
    if (catalog.topics.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.subjectSlug === topicSubject)) {
      notify("error", "That topic already exists under this subject.");
      return;
    }
    const next: CatalogTopic = { subjectSlug: topicSubject, name, slug: slugify(name) };
    void persist({ ...catalog, topics: [...catalog.topics, next] });
    update({ topics: [...catalog.topics, next] });
    setTopicName("");
  };

  return (
    <div className="space-y-3">
      <SectionCard title="Add subject" description="Subjects are the top-level groups shown on the dashboard.">
        <div className="flex gap-2">
          <input className={inputClass} placeholder="e.g. Physics" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
          <SecondaryButton onClick={addSubject}>Add</SecondaryButton>
        </div>
      </SectionCard>

      <SectionCard title="Add topic" description="Topics live inside a subject and group questions.">
        <div className="space-y-2">
          <select className={selectClass} value={topicSubject} onChange={(e) => setTopicSubject(e.target.value)}>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input className={inputClass} placeholder="e.g. Thermodynamics" value={topicName} onChange={(e) => setTopicName(e.target.value)} />
            <SecondaryButton onClick={addTopic}>Add</SecondaryButton>
          </div>
        </div>
      </SectionCard>

      {catalog.subjects.length === 0 ? (
        <EmptyState title="No subjects yet" description="Add a subject to get started." />
      ) : (
        catalog.subjects.map((s) => {
          const topics = catalog.topics.filter((t) => t.subjectSlug === s.slug);
          const qCount = catalog.questions.filter((q) => topics.some((t) => t.slug === q.topicSlug)).length;
          return (
            <SectionCard key={s.slug} title={`${s.icon} ${s.name}`} description={`${topics.length} topics · ${qCount} questions`}>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <span key={t.slug} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {t.name}
                    <button
                      type="button"
                      aria-label={`Delete topic ${t.name}`}
                      onClick={() => {
                        const next = { ...catalog, topics: catalog.topics.filter((x) => x.slug !== t.slug) };
                        void persist(next);
                        update(next);
                      }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {topics.length === 0 && <p className="text-xs text-slate-400">No topics yet.</p>}
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

function ClassesTab({ catalog, update, persist, notify }: TabProps) {
  const [newClassName, setNewClassName] = useState("");
  const [newClassIcon, setNewClassIcon] = useState("🎓");
  const [editingClass, setEditingClass] = useState<CatalogClass | null>(null);

  const classes = catalog.classes ?? [];

  const addClass = () => {
    const name = newClassName.trim();
    if (!name) return;
    if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      notify("error", "That class already exists.");
      return;
    }
    const next: CatalogClass = { name, slug: slugify(name), icon: newClassIcon, subjectSlugs: [] };
    const updated = { ...catalog, classes: [...classes, next] };
    void persist(updated);
    update(updated);
    setNewClassName("");
    setNewClassIcon("🎓");
  };

  const removeClass = (slug: string) => {
    const updated = { ...catalog, classes: classes.filter((c) => c.slug !== slug) };
    void persist(updated);
    update(updated);
  };

  const toggleSubjectForClass = (classSlug: string, subjectSlug: string) => {
    const updated = {
      ...catalog,
      classes: classes.map((c) => {
        if (c.slug !== classSlug) return c;
        const has = c.subjectSlugs.includes(subjectSlug);
        return {
          ...c,
          subjectSlugs: has
            ? c.subjectSlugs.filter((s) => s !== subjectSlug)
            : [...c.subjectSlugs, subjectSlug],
        };
      }),
    };
    void persist(updated);
    update(updated);
  };

  const CLASS_ICONS = ["🎓", "📚", "🏫", "🎒", "✏️", "📖", "🎒", "🔟", "⓫", "⓬"];

  return (
    <div className="space-y-3">
      <SectionCard
        title="Add class"
        description="Classes are academic levels (e.g., Class 9, Class 10). Users can select which class they belong to."
      >
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              className={selectClass + " w-20"}
              value={newClassIcon}
              onChange={(e) => setNewClassIcon(e.target.value)}
            >
              {CLASS_ICONS.map((ic) => (
                <option key={ic} value={ic}>{ic}</option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="e.g., Class 10"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
            />
            <SecondaryButton onClick={addClass}>Add</SecondaryButton>
          </div>
        </div>
      </SectionCard>

      {classes.length === 0 ? (
        <EmptyState title="No classes yet" description="Add a class to let users filter by academic level." />
      ) : (
        classes.map((cls) => {
          const assignedSubjects = catalog.subjects.filter((s) => cls.subjectSlugs.includes(s.slug));
          return (
            <SectionCard
              key={cls.slug}
              title={`${cls.icon} ${cls.name}`}
              description={`${assignedSubjects.length} subjects assigned`}
              action={
                <div className="flex gap-1">
                  <SecondaryButton className="h-8 text-xs" onClick={() => setEditingClass(editingClass?.slug === cls.slug ? null : cls)}>
                    {editingClass?.slug === cls.slug ? "Close" : "Edit"}
                  </SecondaryButton>
                  <button
                    type="button"
                    onClick={() => removeClass(cls.slug)}
                    className="h-8 rounded-lg border border-red-200 px-2 text-xs font-medium text-red-600 active:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              }
            >
              {editingClass?.slug === cls.slug && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {catalog.subjects.map((s) => {
                    const assigned = cls.subjectSlugs.includes(s.slug);
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => toggleSubjectForClass(cls.slug, s.slug)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          assigned
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {assigned ? "✓ " : ""}{s.icon} {s.name}
                      </button>
                    );
                  })}
                  {catalog.subjects.length === 0 && (
                    <p className="text-xs text-slate-400">Add subjects first in the Subjects tab.</p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {assignedSubjects.map((s) => (
                  <span key={s.slug} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    {s.icon} {s.name}
                  </span>
                ))}
                {assignedSubjects.length === 0 && (
                  <p className="text-xs text-slate-400">Click Edit to assign subjects to this class.</p>
                )}
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Customization (admin control panel)                                 */
/* ------------------------------------------------------------------ */

function CustomizationTab({ catalog, saving, update, persist }: TabProps) {
  const limits = catalog.customizationLimits ?? { ...DEFAULT_CUSTOMIZATION_LIMITS };

  const patchLimits = (partial: Partial<CustomizationLimits>) => {
    update({ customizationLimits: { ...limits, ...partial } });
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title="User Customization Control"
        description="Configure how much control users have over their revision plan. Changes here affect what users see in their Customization page."
      >
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <span className="text-sm font-medium text-slate-900">Enable User Customization</span>
              <p className="text-xs text-slate-500">Allow users to override admin defaults</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={limits.allowUserCustomization}
              onClick={() => patchLimits({ allowUserCustomization: !limits.allowUserCustomization })}
              className={`relative h-7 w-12 rounded-full ${limits.allowUserCustomization ? "bg-indigo-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${limits.allowUserCustomization ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <span className="text-sm font-medium text-slate-900">Require Class Selection</span>
              <p className="text-xs text-slate-500">Force users to pick a class before customizing</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={limits.requireClassSelection}
              onClick={() => patchLimits({ requireClassSelection: !limits.requireClassSelection })}
              className={`relative h-7 w-12 rounded-full ${limits.requireClassSelection ? "bg-indigo-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${limits.requireClassSelection ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title="Range Limits"
        description="Define the min and max values users can set for each parameter."
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Tests Per Day</h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minimum">
                <input className={inputClass} type="number" min={1} max={10} value={limits.minTestsPerDay}
                  onChange={(e) => patchLimits({ minTestsPerDay: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
              </Field>
              <Field label="Maximum">
                <input className={inputClass} type="number" min={1} max={20} value={limits.maxTestsPerDay}
                  onChange={(e) => patchLimits({ maxTestsPerDay: Math.max(1, Math.round(Number(e.target.value) || 5)) })} />
              </Field>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Questions Per Test</h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minimum">
                <input className={inputClass} type="number" min={1} max={50} value={limits.minQuestionsPerTest}
                  onChange={(e) => patchLimits({ minQuestionsPerTest: Math.max(1, Math.round(Number(e.target.value) || 5)) })} />
              </Field>
              <Field label="Maximum">
                <input className={inputClass} type="number" min={1} max={100} value={limits.maxQuestionsPerTest}
                  onChange={(e) => patchLimits({ maxQuestionsPerTest: Math.max(1, Math.round(Number(e.target.value) || 50)) })} />
              </Field>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Estimated Minutes</h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minimum">
                <input className={inputClass} type="number" min={1} max={60} value={limits.minEstimatedMinutes}
                  onChange={(e) => patchLimits({ minEstimatedMinutes: Math.max(1, Math.round(Number(e.target.value) || 5)) })} />
              </Field>
              <Field label="Maximum">
                <input className={inputClass} type="number" min={5} max={240} value={limits.maxEstimatedMinutes}
                  onChange={(e) => patchLimits({ maxEstimatedMinutes: Math.max(1, Math.round(Number(e.target.value) || 120)) })} />
              </Field>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Current Classes" description="Classes available for user selection. Manage them in the Classes tab.">
        {(catalog.classes ?? []).length === 0 ? (
          <p className="text-xs text-slate-400">No classes configured. Add classes in the Classes tab.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(catalog.classes ?? []).map((c) => (
              <span key={c.slug} className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
                {c.icon} {c.name} ({c.subjectSlugs.length} subjects)
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={() => persist(catalog)}>
        Save customization settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI Generate                                                         */
/* ------------------------------------------------------------------ */

type AiGenerated = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

function AiTab({ catalog, update, persist, notify }: TabProps) {
  const [subjectSlug, setSubjectSlug] = useState(catalog.subjects[0]?.slug ?? "");
  const [topicSlug, setTopicSlug] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [apiKey, setApiKey] = useState(() => getGeminiKey() ?? "");
  const [model, setModel] = useState(() => getGeminiModel());

  const topics = catalog.topics.filter((t) => t.subjectSlug === subjectSlug);
  const subject = catalog.subjects.find((s) => s.slug === subjectSlug);
  const topic = catalog.topics.find((t) => t.slug === topicSlug);

  const setSubject = (slug: string) => {
    setSubjectSlug(slug);
    const first = catalog.topics.find((t) => t.subjectSlug === slug);
    setTopicSlug(first?.slug ?? "");
  };

  const generate = async () => {
    if (!topic) {
      notify("error", "Choose a topic first.");
      return;
    }
    setGenerating(true);
    setNotice(null);
    setPreview([]);

    let source: "ai" | "offline" = "ai";
    let generated: AiGenerated[] = [];
    if (apiKey.trim()) {
      setGeminiKey(apiKey);
      setGeminiModel(model);
      try {
        const questions = await generateWithGeminiClient({
          subject: subject?.name ?? "",
          topic: topic.name,
          difficulty,
          count,
        });
        // generateWithGeminiClient may auto-upgrade a retired model — mirror
        // whatever it settled on back into the form.
        setModel(getGeminiModel());
        if (questions.length > 0) {
          generated = questions.map((q) => ({
            prompt: q.prompt,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            difficulty,
          }));
        } else {
          setNotice("Gemini returned no usable questions — used the built-in offline generator instead.");
          source = "offline";
        }
      } catch (err) {
        setModel(getGeminiModel());
        setNotice(`${err instanceof Error ? err.message : "Gemini request failed"} — used the built-in offline generator instead.`);
        source = "offline";
      }
    } else {
      setNotice("No Gemini API key set — used the built-in offline generator instead. Add your key below for real AI questions.");
      source = "offline";
    }

    if (source === "offline") {
      generated = generateOfflineQuestions({
        subjectName: subject?.name ?? "",
        topicName: topic.name,
        count,
        difficulty,
      }).map((q) => ({
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty,
      }));
    }

    setPreview(
      generated.map((q) => ({
        key: genId(),
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: q.difficulty,
        source,
      })),
    );
    setGenerating(false);
  };

  const addAll = () => {
    if (preview.length === 0) return;
    const questions: CatalogQuestion[] = preview.map((p) => ({
      topicSlug: topic?.slug ?? topicSlug,
      difficulty: p.difficulty,
      prompt: p.prompt,
      options: p.options,
      correctIndex: Math.max(0, Math.min(p.options.length - 1, p.correctIndex)),
      explanation: p.explanation,
      isActive: true,
    }));
    const next = { ...catalog, questions: [...catalog.questions, ...questions] };
    update(next);
    void persist(next);
    setPreview([]);
    setNotice(null);
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title="Gemini API key"
        description="Your key is stored only in this browser (localStorage) and sent directly to Google's Gemini API — it never touches the public app bundle."
      >
        <Field label="Gemini API key" hint="Get one at aistudio.google.com → Get API key. Leave blank to use the offline generator.">
          <input
            className={inputClass}
            type="password"
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>
        <div className="mt-2">
          <Field label="Model" hint={`Defaults to ${DEFAULT_GEMINI_MODEL} — the current Gemini Flash model. Older 1.5/2.x models were retired by Google and now return 404.`}>
            <select
              className={selectClass}
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setGeminiModel(e.target.value);
              }}
            >
              {GEMINI_MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
              {!GEMINI_MODEL_OPTIONS.some((m) => m.value === model) && (
                <option value={model}>{model} (custom)</option>
              )}
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="AI question generator" description="Generate ready-to-use MCQs for a topic in one click. Choose the correct answer on any item before adding.">
        <div className="space-y-2">
          <select className={selectClass} value={subjectSlug} onChange={(e) => setSubject(e.target.value)}>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <select className={selectClass} value={topicSlug} onChange={(e) => setTopicSlug(e.target.value)}>
            {topics.length === 0 && <option value="">No topics — add one first</option>}
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select className={selectClass} value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select className={selectClass} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}>
              {[1, 3, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n} questions</option>
              ))}
            </select>
          </div>
        </div>
        <PrimaryButton className="mt-3 w-full" loading={generating} onClick={generate}>
          ✨ Generate with AI
        </PrimaryButton>
        {notice && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{notice}</p>}
      </SectionCard>

      {preview.length > 0 && (
        <>
          <SectionCard
            title={`Generated (${preview.length})`}
            action={<PrimaryButton className="h-9" onClick={addAll}>Add all to bank</PrimaryButton>}
          >
            <PreviewList questions={preview} onChange={(items) => setPreview(items)} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk import                                                         */
/* ------------------------------------------------------------------ */

function BulkTab({ catalog, update, persist, notify }: TabProps) {
  const [text, setText] = useState("");
  const [subjectSlug, setSubjectSlug] = useState(catalog.subjects[0]?.slug ?? "");
  const [topicSlug, setTopicSlug] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [preview, setPreview] = useState<(ParsedQuestion & { key: string })[]>([]);

  const topics = catalog.topics.filter((t) => t.subjectSlug === subjectSlug);

  const parse = () => {
    const parsed = parseQuestionText(text);
    if (parsed.length === 0) {
      notify("error", "No questions found. Check the format and try again.");
      return;
    }
    setPreview(parsed.map((p) => ({ ...p, key: genId() })));
    const undetected = parsed.filter((p) => !p.detected).length;
    if (undetected > 0) {
      notify("info", `${undetected} question(s) had no detected correct answer — pick one below before adding.`);
    } else {
      notify("success", `${parsed.length} questions parsed. Review and add.`);
    }
  };

  const setSubject = (slug: string) => {
    setSubjectSlug(slug);
    const first = catalog.topics.find((t) => t.subjectSlug === slug);
    setTopicSlug(first?.slug ?? "");
  };

  const addAll = () => {
    if (preview.length === 0) return;
    if (!topicSlug) {
      notify("error", "Choose a topic for these questions.");
      return;
    }
    const missing = preview.filter((p) => p.correctIndex < 0);
    if (missing.length > 0) {
      notify("error", `${missing.length} question(s) still have no correct answer marked.`);
      return;
    }
    const questions: CatalogQuestion[] = preview.map((p) => ({
      topicSlug,
      difficulty,
      prompt: p.prompt.trim(),
      options: p.options,
      correctIndex: p.correctIndex,
      explanation: p.explanation,
      isActive: true,
    }));
    const next = { ...catalog, questions: [...catalog.questions, ...questions] };
    update(next);
    void persist(next);
    setPreview([]);
    setText("");
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title="Bulk import from plain text"
        description="Paste any number of questions in normal text — correct answers and options are detected automatically, then everything is added in one click."
      >
        <Field
          label="Paste questions"
          hint="Format: '1. Question?' then 'A. …', 'B. …' etc. Mark the right answer with ✓ / * / (correct), or add an 'Answer: B' line."
        >
          <textarea
            className={`${textareaClass} min-h-[180px] font-mono text-xs`}
            placeholder={"1. What is the capital of France?\nA. London\nB. Paris ✓\nC. Berlin\nD. Madrid\nExplanation: Paris is the capital.\n\n2. Which gas do plants absorb?\nA) Oxygen\nB) Carbon dioxide *\nC) Nitrogen\nD) Hydrogen"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="mt-2 space-y-2">
          <select className={selectClass} value={subjectSlug} onChange={(e) => setSubject(e.target.value)}>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <select className={selectClass} value={topicSlug} onChange={(e) => setTopicSlug(e.target.value)}>
            {topics.length === 0 && <option value="">No topics — add one first</option>}
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          <select className={selectClass} value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <SecondaryButton className="flex-1" onClick={parse}>Parse questions</SecondaryButton>
          <PrimaryButton className="flex-1" disabled={preview.length === 0} onClick={addAll}>
            Add all ({preview.length})
          </PrimaryButton>
        </div>
      </SectionCard>

      {preview.length > 0 && (
        <SectionCard title={`Preview (${preview.length})`}>
          <PreviewList
            questions={preview.map((p) => ({
              key: p.key,
              prompt: p.prompt,
              options: p.options,
              correctIndex: p.correctIndex,
              explanation: p.explanation,
              difficulty,
              source: p.detected ? "offline" : "ai",
              detected: p.detected,
            }))}
            onChange={(items) =>
              setPreview(
                items.map((it) => ({
                  key: it.key,
                  prompt: it.prompt,
                  options: it.options,
                  correctIndex: it.correctIndex,
                  explanation: it.explanation,
                  detected: it.correctIndex >= 0,
                })),
              )
            }
          />
        </SectionCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared preview list (AI + bulk)                                     */
/* ------------------------------------------------------------------ */

type PreviewItem = {
  key: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  source?: "ai" | "offline";
  detected?: boolean;
};

function PreviewList({ questions, onChange }: { questions: PreviewItem[]; onChange: (items: PreviewItem[]) => void }) {
  const patch = (key: string, partial: Partial<PreviewItem>) => {
    onChange(questions.map((q) => (q.key === key ? { ...q, ...partial } : q)));
  };
  const remove = (key: string) => onChange(questions.filter((q) => q.key !== key));

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{qi + 1}</span>
            <div className="min-w-0 flex-1">
              <input className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-white" value={q.prompt} onChange={(e) => patch(q.key, { prompt: e.target.value })} />
            </div>
            <button type="button" onClick={() => remove(q.key)} className="h-7 w-7 shrink-0 rounded-lg text-slate-400 active:bg-slate-100">✕</button>
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
                  className={`w-full rounded-lg border px-2 py-1 text-sm outline-none ${i === q.correctIndex ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700 focus:border-slate-400"}`}
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
          <div className="mt-2 flex items-center gap-2">
            <input className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-slate-400" placeholder="Explanation (optional)" value={q.explanation} onChange={(e) => patch(q.key, { explanation: e.target.value })} />
            <select className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs" value={q.difficulty} onChange={(e) => patch(q.key, { difficulty: e.target.value as PreviewItem["difficulty"] })}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          {q.detected === false && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">Correct answer not auto-detected — pick it above.</p>
          )}
        </div>
      ))}
    </div>
  );
}
