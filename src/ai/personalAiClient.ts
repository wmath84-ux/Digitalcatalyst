// src/ai/personalAiClient.ts
//
// Typed client for the Personal Module AI Study Engine ("Ask this Module").
//
// It talks to the SAME authenticated multiplexer the rest of the app uses
// (`/api/personal-ai` → api/_lib/personalAi.ts) and sends the learner's
// resolved AI provider exactly like the existing revision generator does:
// `source: "own"` + the learner's own key, or `source: "default"` for the
// admin-published school AI. No second AI backend, no second quota system —
// the server owns entitlement, allowance and provenance.
//
// Ownership is never asserted from the browser: the request carries only
// module/resource ids, and the server re-derives the owner from the verified
// ID token.

import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { fetchRemoteCatalog } from "../revision/engine/catalogService";
import {
  loadUserAiConfig,
  resolveEffectiveAi,
  type AiConfig,
  type AiSource,
  type CatalogAiSettings,
} from "../revision/engine/aiConfig";
import { personalAiFailure, type PersonalAiFailure } from "../../utils/personalAi";
import type {
  PersonalAiAnswerResult,
  PersonalAiEvidenceKind,
  PersonalAiGenerationKind,
  PersonalAiGenerationResult,
  PersonalAiNoteInput,
  PersonalAiStateSnapshot,
  PersonalAiThreadMessage,
} from "../types/personalAi";

export class PersonalAiApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  upgrade: boolean;
  kind: PersonalAiFailure["kind"];
  details?: unknown;

  constructor(failure: PersonalAiFailure, status = 400, details?: unknown) {
    super(failure.message);
    this.name = "PersonalAiApiError";
    this.code = failure.code;
    this.status = status;
    this.retryable = failure.retryable;
    this.upgrade = failure.upgrade;
    this.kind = failure.kind;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

/** Which provider the AI should run on, resolved through the existing engine. */
export interface PersonalAiProvider {
  source: AiSource;
  config: AiConfig | null;
  label: string;
  /** False when neither the learner nor the institute has published a usable AI. */
  available: boolean;
  settings: CatalogAiSettings | null;
}

let cachedSettings: { at: number; settings: CatalogAiSettings | null } | null = null;
const SETTINGS_TTL_MS = 60_000;

/** Admin-published AI settings, briefly cached so opening a module is cheap. */
export async function loadAiSettingsCached(force = false): Promise<CatalogAiSettings | null> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedSettings.at < SETTINGS_TTL_MS) return cachedSettings.settings;
  try {
    const catalog = await fetchRemoteCatalog();
    cachedSettings = { at: now, settings: catalog?.aiSettings || null };
  } catch {
    cachedSettings = { at: now, settings: cachedSettings?.settings || null };
  }
  return cachedSettings.settings;
}

/**
 * Resolve the AI the study engine will use: the learner's own key when they
 * connected one, otherwise the school-published AI. Mirrors
 * `resolveEffectiveAi` from the revision engine — one rule, every surface.
 */
export async function resolvePersonalAiProvider(uid: string): Promise<PersonalAiProvider> {
  const settings = await loadAiSettingsCached();
  const userConfig = loadUserAiConfig(uid);
  const effective = resolveEffectiveAi(userConfig, settings);
  return {
    source: effective.mode === "offline" ? "default" : effective.mode,
    config: effective.config,
    label: effective.label,
    available: effective.mode !== "offline" && Boolean(effective.config),
    settings,
  };
}

export interface PersonalAiScopeInput {
  /** Public module id, or the internal storage id for Saved-for-Later. */
  moduleId?: string | null;
  storageModuleId?: string | null;
  /** Scope the request to ONE resource (resource-level Ask / Summarize). */
  resourceId?: string | null;
}

const scopePayload = (scope: PersonalAiScopeInput) => ({
  moduleId: scope.moduleId || undefined,
  storageModuleId: scope.storageModuleId || undefined,
  resourceId: scope.resourceId || undefined,
});

interface RequestOptions {
  signal?: AbortSignal;
  /** Long-running AI calls get a generous client timeout, never an infinite one. */
  timeoutMs?: number;
}

async function request<T>(action: string, payload: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new PersonalAiApiError(personalAiFailure({ code: "AUTH_REQUIRED" }), 401);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 75_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await apiFetch("/api/personal-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload, tzOffsetMinutes: new Date().getTimezoneOffset() }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = options.signal?.aborted === true;
    if (aborted) throw new PersonalAiApiError(personalAiFailure({ code: "CANCELLED", message: "Cancelled." }), 0);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const timedOut = (error as Error)?.name === "AbortError";
    throw new PersonalAiApiError(
      personalAiFailure({
        code: "NETWORK_ERROR",
        message: offline
          ? "You're offline, so the AI couldn't be reached. Reconnect and try again."
          : timedOut
            ? "The AI took too long to answer. Nothing was charged — please try again."
            : undefined,
      }),
      0,
      error,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
  const raw = await response.text();
  let body: Envelope<T> = {};
  try {
    body = JSON.parse(raw) as Envelope<T>;
  } catch {
    const html = /^\s*</.test(raw) || /text\/html/i.test(response.headers.get("content-type") || "");
    throw new PersonalAiApiError(
      personalAiFailure({
        code: html ? "NO_PROXY" : "AI_INVALID_JSON",
        message: html
          ? "The AI service isn't available in this environment."
          : `The AI service returned an unreadable response (${response.status}).`,
        status: response.status,
      }),
      response.status,
    );
  }
  if (!response.ok || body.ok !== true || body.data === undefined) {
    throw new PersonalAiApiError(
      personalAiFailure({ code: body.code, message: body.message || body.error, status: response.status }),
      response.status,
      body.details,
    );
  }
  return body.data;
}

/** Attach the learner's resolved AI provider to a generation/ask request. */
const withProvider = async (uid: string, payload: Record<string, unknown>) => {
  const provider = await resolvePersonalAiProvider(uid);
  return {
    ...payload,
    source: provider.source === "own" ? "own" : "default",
    config: provider.source === "own" && provider.config
      ? {
          provider: provider.config.provider,
          apiKey: provider.config.apiKey,
          baseUrl: provider.config.baseUrl,
          model: provider.config.model,
        }
      : undefined,
  };
};

export interface FetchModuleAiContextInput extends PersonalAiScopeInput {
  uid: string;
  notes?: PersonalAiNoteInput[];
  /** Force a re-read of files (used by "Try reading again"). */
  refresh?: boolean;
  signal?: AbortSignal;
}

/** What the AI can actually read in this module + allowance + stored artifacts. */
export const fetchModuleAiContext = (input: FetchModuleAiContextInput) =>
  request<PersonalAiStateSnapshot>(
    "personalAi.context",
    { ...scopePayload(input), notes: input.notes || [], refresh: input.refresh === true },
    { signal: input.signal, timeoutMs: 60_000 },
  );

export interface AskModuleAiInput extends PersonalAiScopeInput {
  uid: string;
  question: string;
  notes?: PersonalAiNoteInput[];
  history?: { role: "user" | "assistant"; text: string }[];
  signal?: AbortSignal;
}

/** One grounded answer, with server-resolved provenance. */
export const askModuleAi = async (input: AskModuleAiInput): Promise<PersonalAiAnswerResult> => {
  const payload = await withProvider(input.uid, {
    ...scopePayload(input),
    question: input.question,
    notes: input.notes || [],
    history: (input.history || []).slice(-8),
  });
  return request<PersonalAiAnswerResult>("personalAi.ask", payload, { signal: input.signal, timeoutMs: 90_000 });
};

export interface GenerateModuleAiInput extends PersonalAiScopeInput {
  uid: string;
  kind: PersonalAiGenerationKind;
  notes?: PersonalAiNoteInput[];
  count?: number;
  types?: ("mcq" | "short" | "boolean")[];
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  days?: number;
  minutesPerDay?: number;
  mode?: "simple" | "steps" | "example" | "exam";
  question?: string;
  answer?: string;
  explanation?: string;
  learnerAnswer?: string;
  /** Ignore a cached artifact and regenerate. */
  force?: boolean;
  refresh?: boolean;
  signal?: AbortSignal;
}

/** Summaries / questions / flashcards / study plans / orientation / explain-again. */
export const generateModuleAi = async <T = unknown>(input: GenerateModuleAiInput): Promise<PersonalAiGenerationResult<T>> => {
  const payload = await withProvider(input.uid, {
    ...scopePayload(input),
    kind: input.kind,
    notes: input.notes || [],
    count: input.count,
    types: input.types,
    difficulty: input.difficulty,
    days: input.days,
    minutesPerDay: input.minutesPerDay,
    mode: input.mode,
    question: input.question,
    answer: input.answer,
    explanation: input.explanation,
    learnerAnswer: input.learnerAnswer,
    force: input.force === true,
    refresh: input.refresh === true,
  });
  return request<PersonalAiGenerationResult<T>>("personalAi.generate", payload, { signal: input.signal, timeoutMs: 120_000 });
};

export const fetchModuleAiThread = (input: PersonalAiScopeInput) =>
  request<{ messages: PersonalAiThreadMessage[]; storageModuleId: string; moduleId: string | null }>("personalAi.thread", scopePayload(input));

export const clearModuleAiThread = (input: PersonalAiScopeInput) =>
  request<{ cleared: boolean }>("personalAi.thread.clear", scopePayload(input));

export interface RecordAiEvidenceInput extends PersonalAiScopeInput {
  kind: PersonalAiEvidenceKind;
  topic: string;
  resourceId?: string | null;
  weight?: number;
}

/** Weak-topic evidence: always the learner's own answer, never a guess. */
export const recordModuleAiEvidence = (input: RecordAiEvidenceInput) =>
  request<{ id: string; recorded: boolean; evidence: { id: string; kind: string; topic: string; weight: number; at: number }[] }>(
    "personalAi.evidence.record",
    { ...scopePayload(input), kind: input.kind, topic: input.topic, resourceId: input.resourceId || undefined, weight: input.weight ?? 0 },
  );

export const deleteModuleAiArtifact = (artifactId: string) =>
  request<{ deleted: boolean; id: string }>("personalAi.artifact.delete", { artifactId });
