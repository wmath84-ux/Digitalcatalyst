// src/ai/useModuleAi.ts
//
// Controller hook for the Personal Module AI Study Engine.
//
// One hook owns the whole AI surface for ONE module scope so the workspace
// views never fetch independently (no duplicate context reads, no duplicate
// allowance checks) and so every view sees the same honest availability,
// coverage and provenance data.
//
// The hook is deliberately lazy: nothing is requested until `active` is true
// (the workspace is open), and every request is abortable so closing the panel
// mid-flight can never land a stale answer into a reopened module.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aggregatePersonalAiWeakTopics,
  personalAiFailure,
  type PersonalAiWeakTopic,
} from "../../utils/personalAi";
import {
  PersonalAiApiError,
  askModuleAi,
  clearModuleAiThread,
  deleteModuleAiArtifact,
  fetchModuleAiContext,
  generateModuleAi,
  recordModuleAiEvidence,
  resolvePersonalAiProvider,
  type PersonalAiProvider,
} from "./personalAiClient";
import { trackAiEvent } from "../utils/featureAnalytics";
import type { PersonalAiGenerationResult, PersonalAiSource } from "./types";
import type {
  PersonalAiAnswerResult,
  PersonalAiEvidenceKind,
  PersonalAiExplanation,
  PersonalAiFlashcards,
  PersonalAiGenerationKind,
  PersonalAiNoteInput,
  PersonalAiOrientation,
  PersonalAiPlan,
  PersonalAiQuestions,
  PersonalAiStateSnapshot,
  PersonalAiSummary,
  PersonalAiThreadMessage,
} from "./types";

export type ModuleAiPhase = "idle" | "loading" | "ready" | "error";

/** The single in-flight AI operation, so the UI can label its spinner. */
export interface ModuleAiBusy {
  kind: "context" | "ask" | PersonalAiGenerationKind | "evidence" | "thread";
  label: string;
}

export interface ModuleAiScope {
  moduleId?: string | null;
  storageModuleId?: string | null;
  resourceId?: string | null;
}

export interface UseModuleAiInput extends ModuleAiScope {
  uid: string | null;
  active: boolean;
  notes?: PersonalAiNoteInput[];
}

export interface ModuleAiFailure {
  code: string;
  message: string;
  retryable: boolean;
  upgrade: boolean;
  kind: string;
  /** Which operation failed, so only that view shows the error. */
  scope: ModuleAiBusy["kind"];
}

const asFailure = (error: unknown, scope: ModuleAiBusy["kind"]): ModuleAiFailure => {
  if (error instanceof PersonalAiApiError) {
    return { code: error.code, message: error.message, retryable: error.retryable, upgrade: error.upgrade, kind: error.kind, scope };
  }
  const mapped = personalAiFailure({ message: error instanceof Error ? error.message : "" });
  return { ...mapped, scope };
};

export interface ModuleAiController {
  uid: string | null;
  phase: ModuleAiPhase;
  snapshot: PersonalAiStateSnapshot | null;
  failure: ModuleAiFailure | null;
  busy: ModuleAiBusy | null;
  provider: PersonalAiProvider | null;
  messages: PersonalAiThreadMessage[];
  answer: PersonalAiAnswerResult | null;
  summary: { payload: PersonalAiSummary; reused: boolean; authoredOnly: boolean; at: number; sources: PersonalAiSource[] } | null;
  questions: { payload: PersonalAiQuestions; reused: boolean; authoredOnly: boolean; at: number; sources: PersonalAiSource[] } | null;
  flashcards: { payload: PersonalAiFlashcards; reused: boolean; authoredOnly: boolean; at: number; sources: PersonalAiSource[] } | null;
  plan: { payload: PersonalAiPlan; reused: boolean; at: number; sources: PersonalAiSource[] } | null;
  orientation: { payload: PersonalAiOrientation; reused: boolean; at: number; sources: PersonalAiSource[] } | null;
  explanation: PersonalAiExplanation | null;
  weakTopics: { topics: PersonalAiWeakTopic[]; state: "ready" | "insufficient"; message: string; totalEvents: number };
  reload: (options?: { refresh?: boolean }) => Promise<void>;
  ask: (question: string) => Promise<PersonalAiAnswerResult | null>;
  generate: <T = unknown>(kind: PersonalAiGenerationKind, options?: Partial<Parameters<typeof generateModuleAi>[0]>) => Promise<T | null>;
  explainAgain: (input: { question: string; answer?: string; explanation?: string; learnerAnswer?: string; mode?: "simple" | "steps" | "example" | "exam" }) => Promise<PersonalAiExplanation | null>;
  recordEvidence: (kind: PersonalAiEvidenceKind, topic: string, resourceId?: string | null) => Promise<void>;
  clearThread: () => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  hasReadableContent: boolean;
  coverageSentence: string;
}

export function useModuleAi(input: UseModuleAiInput): ModuleAiController {
  const { uid, active, moduleId, storageModuleId, resourceId } = input;
  const [phase, setPhase] = useState<ModuleAiPhase>("idle");
  const [snapshot, setSnapshot] = useState<PersonalAiStateSnapshot | null>(null);
  const [failure, setFailure] = useState<ModuleAiFailure | null>(null);
  const [busy, setBusy] = useState<ModuleAiBusy | null>(null);
  const [provider, setProvider] = useState<PersonalAiProvider | null>(null);
  const [answer, setAnswer] = useState<PersonalAiAnswerResult | null>(null);
  const [summary, setSummary] = useState<ModuleAiController["summary"]>(null);
  const [questions, setQuestions] = useState<ModuleAiController["questions"]>(null);
  const [flashcards, setFlashcards] = useState<ModuleAiController["flashcards"]>(null);
  const [plan, setPlan] = useState<ModuleAiController["plan"]>(null);
  const [orientation, setOrientation] = useState<ModuleAiController["orientation"]>(null);
  const [explanation, setExplanation] = useState<PersonalAiExplanation | null>(null);
  const [evidence, setEvidence] = useState<PersonalAiStateSnapshot["evidence"]>([]);

  const scope = useMemo<ModuleAiScope>(() => ({ moduleId, storageModuleId, resourceId }), [moduleId, resourceId, storageModuleId]);
  const scopeKey = `${moduleId || ""}|${storageModuleId || ""}|${resourceId || ""}`;
  // Notes are re-created by the caller on every render; keep a stable
  // reference so the load effect does not re-run (and re-read files) needlessly.
  const notesKey = JSON.stringify(input.notes || []);
  const notesRef = useRef<PersonalAiNoteInput[]>(input.notes || []);
  notesRef.current = input.notes || [];
  const abortRef = useRef<AbortController | null>(null);
  const loadedScopeRef = useRef<string>("");
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const runBusy = useCallback(async <T,>(next: ModuleAiBusy, task: () => Promise<T>): Promise<T | null> => {
    setBusy(next);
    try {
      return await task();
    } catch (error) {
      const mapped = asFailure(error, next.kind);
      setFailure(mapped);
      if (mapped.kind === "limit" || mapped.kind === "entitlement") {
        trackAiEvent("limit_reached", { code: mapped.code, surface: "module_ai" });
      }
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const load = useCallback(async (options: { refresh?: boolean; force?: boolean } = {}) => {
    const userId = uidRef.current;
    if (!userId) return;
    if (!options.force && loadedScopeRef.current === `${scopeKey}:${notesKey}` && !options.refresh) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase(snapshotRef.current ? "ready" : "loading");
    setFailure(null);
    const result = await runBusy({ kind: "context", label: "Reading your module" }, () =>
      fetchModuleAiContext({
        uid: userId,
        moduleId: scope.moduleId,
        storageModuleId: scope.storageModuleId,
        resourceId: scope.resourceId,
        notes: notesRef.current,
        refresh: options.refresh === true,
        signal: controller.signal,
      }));
    if (controller.signal.aborted) return;
    if (!result) {
      setPhase(snapshotRef.current ? "ready" : "error");
      return;
    }
    loadedScopeRef.current = `${scopeKey}:${notesKey}`;
    snapshotRef.current = result;
    setSnapshot(result);
    setEvidence(result.evidence);
    setPhase("ready");
    trackAiEvent("module_opened", {
      surface: result.scope.resourceId ? "resource" : "module",
      readable: result.coverage.readable,
      total: result.coverage.total,
    });
    if (result.coverage.total > 0 && result.coverage.readable < result.coverage.total) {
      trackAiEvent("unreadable_content_shown", { unreadable: result.coverage.total - result.coverage.readable, total: result.coverage.total });
    }
  }, [runBusy, scope.moduleId, scope.resourceId, scope.storageModuleId, scopeKey, notesKey]);

  // `snapshot` is read inside `load` without being a dependency (that would
  // re-trigger the load on every snapshot change) — a ref keeps it current.
  const snapshotRef = useRef<PersonalAiStateSnapshot | null>(null);
  snapshotRef.current = snapshot;

  // Resolve the provider once per open so the gate copy is instant.
  useEffect(() => {
    if (!active || !uid) return;
    let cancelled = false;
    void resolvePersonalAiProvider(uid).then((resolved) => { if (!cancelled) setProvider(resolved); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [active, uid]);

  // Reset + load whenever the scope changes or the workspace opens.
  useEffect(() => {
    if (!active || !uid) return;
    loadedScopeRef.current = "";
    void load();
    return () => { abortRef.current?.abort(); };
  }, [active, uid, load]);

  // Closing the workspace must not leave a request in flight.
  useEffect(() => {
    if (active) return;
    abortRef.current?.abort();
    setBusy(null);
  }, [active]);

  const ask = useCallback(async (question: string) => {
    const userId = uidRef.current;
    if (!userId || !question.trim()) return null;
    setFailure(null);
    const history = (snapshotRef.current?.thread || []).slice(-8).map((message) => ({ role: message.role, text: message.text }));
    const result = await runBusy({ kind: "ask", label: "Reading your module and thinking" }, () =>
      askModuleAi({
        uid: userId,
        moduleId: scope.moduleId,
        storageModuleId: scope.storageModuleId,
        resourceId: scope.resourceId,
        question,
        notes: notesRef.current,
        history: [...history, ...(answer ? [{ role: "user" as const, text: answer.question }, { role: "assistant" as const, text: answer.answer }] : [])],
      }));
    if (!result) return null;
    setAnswer(result);
    setSnapshot((current) => (current
      ? { ...current, thread: [...current.thread, {
          id: `local_u_${Date.now()}`, role: "user" as const, text: question, sources: [], grounded: true, resourceId: scope.resourceId || null, at: Date.now(),
        }, {
          id: `local_a_${Date.now()}`, role: "assistant" as const, text: result.answer, grounded: result.grounded, resourceId: scope.resourceId || null, at: Date.now(),
          sources: result.sourceDetails.map((source) => ({ unitId: source.unitId, label: source.label, provenance: source.provenance })),
        }].slice(-40) }
      : current));
    trackAiEvent(scope.resourceId ? "resource_question_asked" : "module_question_asked", {
      grounded: result.grounded,
      sources: result.sourceDetails.length,
      readable: result.coverage.readable,
    });
    return result;
  }, [answer, runBusy, scope.moduleId, scope.resourceId, scope.storageModuleId]);

  const generate = useCallback(async <T = unknown>(
    kind: PersonalAiGenerationKind,
    options: Partial<Parameters<typeof generateModuleAi>[0]> = {},
  ): Promise<T | null> => {
    const userId = uidRef.current;
    if (!userId) return null;
    const labels: Record<PersonalAiGenerationKind, string> = {
      summary: "Writing your summary",
      "resource-summary": "Summarizing this resource",
      questions: "Writing questions from your material",
      flashcards: "Making flashcards from your material",
      plan: "Building your study plan",
      orientation: "Preparing your study session",
      explain: "Explaining it again",
    };
    setFailure(null);
    const result = await runBusy<PersonalAiGenerationResult<T>>({ kind, label: labels[kind] }, () =>
      generateModuleAi<T>({
        uid: userId,
        moduleId: scope.moduleId,
        storageModuleId: scope.storageModuleId,
        resourceId: scope.resourceId,
        kind,
        notes: notesRef.current,
        ...options,
      } as Parameters<typeof generateModuleAi>[0]));
    if (!result) return null;
    const at = Date.now();
    const sources = result.sources || [];
    if (kind === "summary" || kind === "resource-summary") {
      setSummary({ payload: result.payload as PersonalAiSummary, reused: result.reused, authoredOnly: Boolean(result.authoredOnly), at, sources });
      trackAiEvent("summary_generated", { scope: kind, reused: result.reused, readable: result.coverage.readable });
    } else if (kind === "questions") {
      setQuestions({ payload: result.payload as PersonalAiQuestions, reused: result.reused, authoredOnly: Boolean(result.authoredOnly), at, sources });
      trackAiEvent("questions_generated", { count: (result.payload as PersonalAiQuestions)?.questions?.length || 0, reused: result.reused });
    } else if (kind === "flashcards") {
      setFlashcards({ payload: result.payload as PersonalAiFlashcards, reused: result.reused, authoredOnly: Boolean(result.authoredOnly), at, sources });
      trackAiEvent("flashcards_generated", { count: (result.payload as PersonalAiFlashcards)?.cards?.length || 0, reused: result.reused });
    } else if (kind === "plan") {
      setPlan({ payload: result.payload as PersonalAiPlan, reused: result.reused, at, sources });
      trackAiEvent("study_plan_generated", { days: (result.payload as PersonalAiPlan)?.days?.length || 0, reused: result.reused });
    } else if (kind === "orientation") {
      setOrientation({ payload: result.payload as PersonalAiOrientation, reused: result.reused, at, sources });
    } else if (kind === "explain") {
      setExplanation(result.payload as PersonalAiExplanation);
      trackAiEvent("explain_again_used", { mode: String(options.mode || "simple") });
    }
    return result.payload as T;
  }, [runBusy, scope.moduleId, scope.resourceId, scope.storageModuleId]);

  const explainAgain = useCallback(async (options: { question: string; answer?: string; explanation?: string; learnerAnswer?: string; mode?: "simple" | "steps" | "example" | "exam" }) =>
    generate<PersonalAiExplanation>("explain", options), [generate]);

  const recordEvidence = useCallback(async (kind: PersonalAiEvidenceKind, topic: string, evidenceResourceId?: string | null) => {
    const userId = uidRef.current;
    if (!userId || !topic.trim()) return;
    const result = await runBusy({ kind: "evidence", label: "Noting this topic" }, () =>
      recordModuleAiEvidence({
        moduleId: scope.moduleId,
        storageModuleId: scope.storageModuleId,
        resourceId: evidenceResourceId || scope.resourceId,
        kind,
        topic,
      }));
    if (!result) return;
    setEvidence(result.evidence as PersonalAiStateSnapshot["evidence"]);
    const aggregated = aggregatePersonalAiWeakTopics(result.evidence);
    if (aggregated.state === "ready" && aggregated.topics.some((row) => row.topic.toLowerCase() === topic.toLowerCase())) {
      trackAiEvent("weak_topic_detected", { kind, score: aggregated.topics[0]?.score || 0 });
    }
  }, [runBusy, scope.moduleId, scope.resourceId, scope.storageModuleId]);

  const clearThread = useCallback(async () => {
    const result = await runBusy({ kind: "thread", label: "Clearing the conversation" }, () =>
      clearModuleAiThread({ moduleId: scope.moduleId, storageModuleId: scope.storageModuleId, resourceId: scope.resourceId }));
    if (!result) return;
    setSnapshot((current) => (current ? { ...current, thread: [] } : current));
    setAnswer(null);
  }, [runBusy, scope.moduleId, scope.resourceId, scope.storageModuleId]);

  const deleteArtifact = useCallback(async (artifactId: string) => {
    await runBusy({ kind: "thread", label: "Removing this AI result" }, () => deleteModuleAiArtifact(artifactId));
    setSnapshot((current) => (current ? { ...current, artifacts: current.artifacts.filter((row) => row.id !== artifactId) } : current));
  }, [runBusy]);

  const weakTopics = useMemo(() => aggregatePersonalAiWeakTopics(evidence), [evidence]);
  const coverage = snapshot?.coverage;
  const hasReadableContent = Boolean(coverage && (coverage.readable > 0 || (snapshot?.unitCount || 0) > 0));

  return {
    uid,
    phase,
    snapshot,
    failure,
    busy,
    provider,
    messages: snapshot?.thread || [],
    answer,
    summary,
    questions,
    flashcards,
    plan,
    orientation,
    explanation,
    weakTopics,
    reload: (options) => load({ refresh: options?.refresh, force: true }),
    ask,
    generate,
    explainAgain,
    recordEvidence,
    clearThread,
    deleteArtifact,
    hasReadableContent,
    coverageSentence: coverage?.sentence || "",
  };
}

export type { PersonalAiWeakTopic };
