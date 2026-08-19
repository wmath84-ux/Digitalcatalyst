import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, SecondaryButton } from "../components/ui";
import { GearIcon, SlidersIcon, SparklesIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import { defaultCatalogAiSettings } from "../engine/aiConfig";
import {
  DEFAULT_CUSTOMIZATION_LIMITS,
  DEFAULT_USER_CUSTOM_SETTINGS,
  loadDb,
  loadUserCustomSettings,
  saveUserCustomSettings,
  type CatalogClass,
  type CatalogSubject,
  type CatalogTopic,
  type CustomizationLimits,
  type Difficulty,
  type UserCustomSettings,
} from "../engine/store";

type Props = {
  uid: string;
  route: string;
};

const DIFFICULTIES: { value: Difficulty | "mixed"; label: string; emoji: string }[] = [
  { value: "mixed", label: "Mixed (All)", emoji: "🎯" },
  { value: "easy", label: "Easy", emoji: "🟢" },
  { value: "medium", label: "Medium", emoji: "🟡" },
  { value: "hard", label: "Hard", emoji: "🔴" },
];

export default function CustomizationPage({ uid, route }: Props) {
  const { navigate } = useExitGuard();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserCustomSettings>(DEFAULT_USER_CUSTOM_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const remote = await fetchRemoteCatalog();
        if (remote) {
          setCatalog(remote);
        } else {
          // Fallback: build a minimal catalog from local DB
          const db = loadDb(uid);
          setCatalog({
            version: 0,
            settings: db.settings,
            classes: [],
            customizationLimits: { ...DEFAULT_CUSTOMIZATION_LIMITS },
            subjects: db.subjects.map((s) => ({ name: s.name, slug: s.slug, icon: s.icon, color: s.color })),
            topics: db.topics.map((t) => ({ subjectSlug: t.slug, name: t.name, slug: t.slug })),
            questions: [],
            aiSettings: defaultCatalogAiSettings(),
          });
        }
      } catch {
        // Use defaults
        const db = loadDb(uid);
        setCatalog({
          version: 0,
          settings: db.settings,
          classes: [],
          customizationLimits: { ...DEFAULT_CUSTOMIZATION_LIMITS },
          subjects: db.subjects.map((s) => ({ name: s.name, slug: s.slug, icon: s.icon, color: s.color })),
          topics: db.topics.map((t) => ({ subjectSlug: t.slug, name: t.name, slug: t.slug })),
          questions: [],
          aiSettings: defaultCatalogAiSettings(),
        });
      }
      setLoading(false);
    };
    load();
  }, [uid]);

  useEffect(() => {
    const saved = loadUserCustomSettings(uid);
    setSettings(saved);
  }, [uid]);

  const limits = catalog?.customizationLimits ?? DEFAULT_CUSTOMIZATION_LIMITS;

  // Available classes
  const classes = catalog?.classes ?? [];

  // Available subjects filtered by selected class
  const availableSubjects = useMemo(() => {
    if (!catalog) return [];
    if (!settings.classSlug || classes.length === 0) return catalog.subjects;
    const cls = classes.find((c) => c.slug === settings.classSlug);
    if (!cls || cls.subjectSlugs.length === 0) return catalog.subjects;
    return catalog.subjects.filter((s) => cls.subjectSlugs.includes(s.slug));
  }, [catalog, settings.classSlug, classes]);

  // Available topics filtered by selected subjects
  const availableTopics = useMemo(() => {
    if (!catalog) return [];
    const subjectSlugs = settings.subjectSlugs.length > 0 ? settings.subjectSlugs : availableSubjects.map((s) => s.slug);
    return catalog.topics.filter((t) => subjectSlugs.includes(t.subjectSlug));
  }, [catalog, settings.subjectSlugs, availableSubjects]);

  const update = useCallback((patch: Partial<UserCustomSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    saveUserCustomSettings(uid, settings);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 400);
  }, [uid, settings]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_USER_CUSTOM_SETTINGS });
    saveUserCustomSettings(uid, DEFAULT_USER_CUSTOM_SETTINGS);
    setSaved(false);
  }, [uid]);

  const toggleSubject = (slug: string) => {
    const next = settings.subjectSlugs.includes(slug)
      ? settings.subjectSlugs.filter((s) => s !== slug)
      : [...settings.subjectSlugs, slug];
    // Reset topic selection when subjects change
    update({ subjectSlugs: next, topicSlugs: [] });
  };

  const toggleTopic = (slug: string) => {
    const next = settings.topicSlugs.includes(slug)
      ? settings.topicSlugs.filter((s) => s !== slug)
      : [...settings.topicSlugs, slug];
    update({ topicSlugs: next });
  };

  const clampNum = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(value)));

  if (loading) {
    return (
      <PageShell route={route} title="Customize" backHref="#/revision/profile">
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            <p className="text-sm text-slate-500">Loading settings…</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      route={route}
      title="Customize Revision"
      subtitle="Set up your perfect study plan"
      backHref="#/revision/profile"
      rightSlot={
        <button
          type="button"
          onClick={() => navigate("#/revision/customize/ai-config")}
          aria-label="AI Configuration"
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
        >
          <GearIcon className="h-5 w-5" />
        </button>
      }
    >
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        {/* Toggle Custom Mode */}
        <Card className="relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-indigo-50" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <SlidersIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Custom Settings</h3>
                <p className="text-xs text-slate-500">Override default revision plan</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => update({ enabled: !settings.enabled })}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                settings.enabled ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  settings.enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {!settings.enabled && (
            <p className="relative mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
              Turn on to customize tests per day, questions per test, difficulty, and more.
            </p>
          )}
        </Card>

        {settings.enabled && (
          <>
            {/* Class Selection */}
            {classes.length > 0 && (
              <Section title="🎓 Select Class" subtitle="Choose your academic level">
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => (
                    <ChipButton
                      key={cls.slug}
                      label={`${cls.icon} ${cls.name}`}
                      active={settings.classSlug === cls.slug}
                      onClick={() => {
                        const next = settings.classSlug === cls.slug ? "" : cls.slug;
                        update({ classSlug: next, subjectSlugs: [], topicSlugs: [] });
                      }}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Subject Selection */}
            <Section title="📚 Select Subjects" subtitle={settings.subjectSlugs.length > 0 ? `${settings.subjectSlugs.length} selected` : "Tap to select or leave empty for all"}>
              <div className="flex flex-wrap gap-2">
                {availableSubjects.map((s) => (
                  <ChipButton
                    key={s.slug}
                    label={`${s.icon} ${s.name}`}
                    active={settings.subjectSlugs.includes(s.slug)}
                    onClick={() => toggleSubject(s.slug)}
                  />
                ))}
                {availableSubjects.length === 0 && (
                  <p className="text-xs text-slate-400">No subjects available for this class.</p>
                )}
              </div>
            </Section>

            {/* Topic Selection */}
            {settings.subjectSlugs.length > 0 && availableTopics.length > 0 && (
              <Section title="📝 Select Topics" subtitle={settings.topicSlugs.length > 0 ? `${settings.topicSlugs.length} selected` : "All topics (tap to filter)"}>
                <div className="flex flex-wrap gap-2">
                  {availableTopics.slice(0, 20).map((t) => (
                    <ChipButton
                      key={t.slug}
                      label={t.name}
                      active={settings.topicSlugs.includes(t.slug)}
                      onClick={() => toggleTopic(t.slug)}
                    />
                  ))}
                  {availableTopics.length > 20 && (
                    <span className="self-center text-xs text-slate-400">+{availableTopics.length - 20} more</span>
                  )}
                </div>
              </Section>
            )}

            {/* Tests Per Day */}
            <Section title="📊 Tests Per Day" subtitle={limits.noLimitTestsPerDay ? "No upper limit set by admin" : "How many daily tests to generate"}>
              <NumberStepper
                value={settings.testsPerDay}
                min={limits.minTestsPerDay}
                max={limits.noLimitTestsPerDay ? null : limits.maxTestsPerDay}
                onChange={(v) => update({ testsPerDay: v })}
              />
            </Section>

            {/* Questions Per Test */}
            <Section title="❓ Questions Per Test" subtitle={limits.noLimitQuestionsPerTest ? "No upper limit set by admin" : "Number of questions in each test"}>
              <NumberStepper
                value={settings.questionsPerTest}
                min={limits.minQuestionsPerTest}
                max={limits.noLimitQuestionsPerTest ? null : limits.maxQuestionsPerTest}
                step={5}
                onChange={(v) => update({ questionsPerTest: v })}
              />
            </Section>

            {/* Estimated Minutes */}
            <Section title="⏱ Estimated Minutes" subtitle={limits.noLimitEstimatedMinutes ? "No upper limit set by admin" : "Your target study time per test"}>
              <NumberStepper
                value={settings.estimatedMinutes}
                min={limits.minEstimatedMinutes}
                max={limits.noLimitEstimatedMinutes ? null : limits.maxEstimatedMinutes}
                step={5}
                onChange={(v) => update({ estimatedMinutes: v })}
              />
            </Section>

            {/* Difficulty Selection */}
            <Section title="🎯 Difficulty Level" subtitle="Filter questions by difficulty">
              <div className="grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => update({ difficulty: d.value })}
                    className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                      settings.difficulty === d.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span className="text-base">{d.emoji}</span>
                    {d.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Summary Card */}
            <Card className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5" />
                <h3 className="text-sm font-bold">Your Custom Plan</h3>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-white/15 p-2">
                  <p className="text-xl font-black">{settings.testsPerDay}</p>
                  <p className="text-[10px] font-medium text-indigo-100">Tests/Day</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-2">
                  <p className="text-xl font-black">{settings.questionsPerTest}</p>
                  <p className="text-[10px] font-medium text-indigo-100">Q/Test</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-2">
                  <p className="text-xl font-black">{settings.estimatedMinutes}m</p>
                  <p className="text-[10px] font-medium text-indigo-100">Est. Time</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-indigo-100">
                <span className="rounded-full bg-white/10 px-2 py-0.5">
                  {settings.difficulty === "mixed" ? "All difficulties" : settings.difficulty}
                </span>
                {settings.subjectSlugs.length > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    {settings.subjectSlugs.length} subject{settings.subjectSlugs.length > 1 ? "s" : ""}
                  </span>
                )}
                {settings.classSlug && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    {classes.find((c) => c.slug === settings.classSlug)?.name ?? settings.classSlug}
                  </span>
                )}
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-2">
              <PrimaryButton onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : saved ? "✓ Saved Successfully" : "Save My Custom Plan"}
              </PrimaryButton>
              <SecondaryButton onClick={handleReset}>Reset to Defaults</SecondaryButton>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-3.5 py-2 text-xs font-semibold transition-all ${
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {active && <span className="mr-1">✓</span>}
      {label}
    </button>
  );
}

function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  /** Pass null for no upper limit. */
  max: number | null;
  step?: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(max === null ? value + step : Math.min(max, value + step));
  const atMax = max !== null && value >= max;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-slate-600 transition active:bg-slate-50 disabled:opacity-40"
      >
        −
      </button>
      <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3 text-center">
        <span className="text-2xl font-black text-slate-900">{value}</span>
        {max === null && (
          <span className="ml-1 text-xs font-medium text-amber-500">∞</span>
        )}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={atMax}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-slate-600 transition active:bg-slate-50 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
