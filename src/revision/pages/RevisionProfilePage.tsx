/**
 * Plan & AI — the Revision profile hub.
 *
 * Preserves what the retired profile screen owned: the snapshot (accuracy,
 * tests done, streak), the AI entry points, the bulk importer, the usage-limits
 * destination and the tips. It also restores the study-plan editor
 * (class → subjects → topics → tests per day) that writes the very same
 * `saveUserCustomSettings` record the Daily Test generator reads, bounded by the
 * admin's published customization limits.
 *
 * Everything is rendered in the ported Recall language; Recall's own Settings
 * screen owns the memory-side preferences (theme, accent, goals, retention,
 * TTS, sync, data export) and is linked from here.
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { Input } from "../recall/components/ui/input";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallPage, RecallRow, RecallStat, SectionTitle } from "../components/recall-ui";
import { CURRICULUM } from "../data/curriculum";
import {
  DEFAULT_CUSTOMIZATION_LIMITS,
  DEFAULT_SETTINGS,
  DEFAULT_USER_CUSTOM_SETTINGS,
  loadDb,
  loadUserCustomSettings,
  saveUserCustomSettings,
  type CustomizationLimits,
  type UserCustomSettings,
} from "../engine/store";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import { hasStoredUserAiConfig, loadUserAiConfig, resolveEffectiveAi } from "../engine/aiConfig";
import { getRevisionOverview } from "../engine/statsService";

export default function RevisionProfilePage({ uid, userName }: { uid: string; userName: string }) {
  const { navigate } = useRevisionRoute();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<UserCustomSettings>(() => loadUserCustomSettings(uid));

  useEffect(() => {
    let cancelled = false;
    void fetchRemoteCatalog()
      .then((remote) => {
        if (!cancelled && remote) setCatalog(remote);
      })
      .catch(() => {
        /* offline — the local defaults stand in */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const state = useMemo(() => {
    void reloadKey;
    const db = loadDb(uid);
    const limits: CustomizationLimits = catalog?.customizationLimits
      ? { ...DEFAULT_CUSTOMIZATION_LIMITS, ...catalog.customizationLimits }
      : DEFAULT_CUSTOMIZATION_LIMITS;
    const ai = resolveEffectiveAi(loadUserAiConfig(uid), catalog?.aiSettings ?? null);
    return {
      settings: db.settings ?? DEFAULT_SETTINGS,
      limits,
      ai,
      overview: getRevisionOverview(uid),
    };
  }, [catalog, reloadKey, uid]);

  useEffect(() => {
    setDraft(loadUserCustomSettings(uid));
  }, [uid, reloadKey]);

  const persist = (next: Partial<UserCustomSettings>) => {
    const merged: UserCustomSettings = { ...draft, ...next, enabled: true };
    setDraft(merged);
    try {
      saveUserCustomSettings(uid, merged);
      setReloadKey((key) => key + 1);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your plan.");
    }
  };

  const effective = draft.enabled ? draft : null;
  const testsPerDay = effective?.testsPerDay ?? state.settings.testsPerDay;
  const questionsPerTest = effective?.questionsPerTest ?? state.settings.questionsPerTest;
  const difficulty = effective?.difficulty ?? DEFAULT_USER_CUSTOM_SETTINGS.difficulty;

  const activeClass = CURRICULUM.find((entry) => entry.key === draft.classSlug) ?? null;
  const subjects = activeClass ? activeClass.subjects : Array.from(
    new Map(CURRICULUM.flatMap((entry) => entry.subjects).map((subject) => [subject.key, subject])).values(),
  );
  const selectedSubject = subjects.find((subject) => draft.subjectSlugs.includes(subject.key)) ?? null;
  const topics = selectedSubject
    ? selectedSubject.chapters.flatMap((chapter) => chapter.topics.map((topic) => ({ ...topic, chapter: chapter.name })))
    : [];

  const clamp = (value: number, min: number, max: number, unlimited: boolean) =>
    unlimited ? Math.max(1, Math.round(value) || 1) : Math.min(max, Math.max(min, Math.round(value) || min));

  return (
    <RecallPage
      title={`${userName}'s plan`}
      subtitle="What your Daily Test is generated from — and where the AI lives."
      onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.settings)}>
            Study settings
          </Button>
          <Button onClick={() => navigate(REVISION_DEEP_LINKS.aiGenerate)}>Generate a test</Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-2">
        <RecallStat label="Accuracy" value={`${state.overview.quickStats.overallAccuracy}%`} tone="brand" />
        <RecallStat label="Tests done" value={state.overview.quickStats.testsCompleted} />
        <RecallStat label="Streak" value={`${state.overview.quickStats.streak}d`} tone="motivation" />
      </div>

      <section>
        <SectionTitle
          hint={
            <RecallBadge tone={draft.enabled ? "brand" : "neutral"}>
              {draft.enabled ? "Your own plan" : "Using school defaults"}
            </RecallBadge>
          }
        >
          Study plan
        </SectionTitle>
        <RecallCard className="space-y-4">
          <div>
            <span className={cn(typeClass["label-lg"])}>Class</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => persist({ classSlug: "", subjectSlugs: [], topicSlugs: [] })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-semibold",
                  !draft.classSlug ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                All classes
              </button>
              {CURRICULUM.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => persist({ classSlug: entry.key, subjectSlugs: [], topicSlugs: [] })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold",
                    draft.classSlug === entry.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {entry.icon} {entry.name}
                </button>
              ))}
            </div>
            {state.limits.requireClassSelection && !draft.classSlug ? (
              <p className={cn(typeClass.caption, "mt-2 text-error")}>This school requires a class selection.</p>
            ) : null}
          </div>

          <div>
            <span className={cn(typeClass["label-lg"])}>
              Subjects <span className="text-on-surface-variant">({draft.subjectSlugs.length || "all"})</span>
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {subjects.map((subject) => {
                const selected = draft.subjectSlugs.includes(subject.key);
                return (
                  <button
                    key={subject.key}
                    type="button"
                    onClick={() =>
                      persist({
                        subjectSlugs: selected
                          ? draft.subjectSlugs.filter((slug) => slug !== subject.key)
                          : [...draft.subjectSlugs, subject.key],
                        topicSlugs: [],
                      })
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-semibold",
                      selected ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface-variant",
                    )}
                  >
                    {subject.icon} {subject.name}
                  </button>
                );
              })}
            </div>
          </div>

          {topics.length > 0 ? (
            <div>
              <span className={cn(typeClass["label-lg"])}>
                Topics <span className="text-on-surface-variant">({draft.topicSlugs.length} selected)</span>
              </span>
              <div className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {topics.map((topic) => {
                  const selected = draft.topicSlugs.includes(topic.key);
                  return (
                    <button
                      key={topic.key}
                      type="button"
                      title={topic.chapter}
                      onClick={() =>
                        persist({
                          topicSlugs: selected
                            ? draft.topicSlugs.filter((slug) => slug !== topic.key)
                            : [...draft.topicSlugs, topic.key],
                        })
                      }
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold",
                        selected ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface-variant",
                      )}
                    >
                      {topic.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={cn(typeClass["label-lg"])}>Tests per day</span>
              <Input
                type="number"
                min={state.limits.minTestsPerDay}
                max={state.limits.noLimitTestsPerDay ? undefined : state.limits.maxTestsPerDay}
                value={testsPerDay}
                onChange={(event) =>
                  persist({
                    testsPerDay: clamp(
                      Number(event.target.value),
                      state.limits.minTestsPerDay,
                      state.limits.maxTestsPerDay,
                      state.limits.noLimitTestsPerDay,
                    ),
                  })
                }
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className={cn(typeClass["label-lg"])}>Questions per test</span>
              <Input
                type="number"
                min={state.limits.minQuestionsPerTest}
                max={state.limits.noLimitQuestionsPerTest ? undefined : state.limits.maxQuestionsPerTest}
                value={questionsPerTest}
                onChange={(event) =>
                  persist({
                    questionsPerTest: clamp(
                      Number(event.target.value),
                      state.limits.minQuestionsPerTest,
                      state.limits.maxQuestionsPerTest,
                      state.limits.noLimitQuestionsPerTest,
                    ),
                  })
                }
                className="mt-1"
              />
            </label>
          </div>

          <div>
            <span className={cn(typeClass["label-lg"])}>Difficulty</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["mixed", "easy", "medium", "hard"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => persist({ difficulty: level })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold capitalize",
                    difficulty === level
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {draft.enabled ? (
            <Button variant="ghost" size="sm" onClick={() => persist({ ...DEFAULT_USER_CUSTOM_SETTINGS, enabled: false })}>
              Reset to school defaults
            </Button>
          ) : null}
        </RecallCard>
      </section>

      <section className="mt-6">
        <SectionTitle>AI</SectionTitle>
        <RecallCard className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <RecallBadge tone={state.ai.mode === "offline" ? "warning" : "brand"}>{state.ai.label}</RecallBadge>
            {state.ai.config?.model ? (
              <span className={cn(typeClass.caption, "text-on-surface-variant")}>{state.ai.config.model}</span>
            ) : null}
            {hasStoredUserAiConfig(uid) ? <RecallBadge tone="success">Key saved</RecallBadge> : null}
          </div>
          <p className={cn(typeClass["body-md"], "text-on-surface-variant")}>
            School-provided AI runs on the allowance the school published; your own key is used only when you pick it.
            With no key at all the offline generator still builds questions from the catalog.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.aiSettings)}>
              AI provider settings
            </Button>
            <Button size="sm" onClick={() => navigate(REVISION_DEEP_LINKS.aiGenerate)}>
              Generate questions
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.bulkImport)}>
              Bulk import
            </Button>
          </div>
        </RecallCard>
      </section>

      <section className="mt-6">
        <SectionTitle>Account & data</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecallRow
            icon="📊"
            title="Usage limits"
            meta="School AI allowance and reset details"
            onClick={() => navigate("#/usage-limits")}
          />
          <RecallRow
            icon="💳"
            title="Subscription"
            meta="Manage your plan"
            onClick={() => navigate("#/subscription")}
          />
          <RecallRow
            icon="🧠"
            title="Study settings"
            meta="Theme, accent, daily goal, FSRS retention, TTS"
            onClick={() => navigate(REVISION_DEEP_LINKS.settings)}
          />
          <RecallRow
            icon="📤"
            title="Import & export"
            meta="Recall packages, CSV, Markdown, Anki text"
            onClick={() => navigate(REVISION_DEEP_LINKS.importHub)}
          />
          <RecallRow
            icon="⏱"
            title="Focus timer"
            meta="A timed, distraction-free study block"
            onClick={() => navigate(REVISION_DEEP_LINKS.focusTimer)}
          />
          <RecallRow
            icon="🗂"
            title="Test Bank"
            meta="Saved tests, attempts and results"
            onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}
          />
        </div>
      </section>

      {saved ? (
        <p className={cn(typeClass.caption, "mt-4 text-tertiary")} role="status">
          Plan saved.
        </p>
      ) : null}
      {error ? (
        <p className={cn(typeClass.caption, "mt-4 text-error")} role="alert">
          {error}
        </p>
      ) : null}
    </RecallPage>
  );
}
