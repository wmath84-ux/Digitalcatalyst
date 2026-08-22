// Unified AI configuration engine for the revision feature.
//
// One module powers BOTH sides of the app:
//   - Students can connect their own AI provider (any API key) and use it to
//     generate questions for their revision bank.
//   - Admins can connect any provider for the admin question generator and
//     publish a default provider + model (optionally with a shared API key)
//     that is then offered to every user.
//
// Everything runs client-side: keys live in the visitor's own browser
// (localStorage) and requests go straight to the chosen provider. Keys are
// never baked into the public bundle.

import { auth } from "../../../firebase";
import type { ParsedQuestion } from "./bulkParser";
import {
  buildUserPrompt,
  DEFAULT_MODEL,
  extractGeminiText,
  extractJson,
  geminiGenerateUrl,
  generateWithGemini,
  normalizeQuestions,
  systemPrompt,
  type GenerateInput,
  type QuestionMode,
} from "./aiGenerate";
import { CURRICULUM_SYSTEM_PROMPT, normalizeCurriculumClass } from "./curriculumCatalog";
import type { CurriculumClass } from "../data/curriculum";
import { normalizeAiModelPricing, type AiModelPrice } from "../../../utils/aiPolicy.js";

export type { AiModelPrice } from "../../../utils/aiPolicy.js";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AIProviderId = "gemini" | "openai" | "openrouter" | "anthropic" | "groq" | "custom";

export type AiConfig = {
  provider: AIProviderId;
  apiKey: string;
  /** Custom base URL — used for "Custom API" and optional overrides. */
  baseUrl: string;
  model: string;
};

/** How the student wants AI questions powered. */
export type AiSource = "own" | "default" | "offline";

export type UserAiConfig = {
  source: AiSource;
  config: AiConfig;
};

export type ProviderModel = {
  id: string;
  name: string;
};

/** The provider + model (+ optional shared key) an admin publishes for users. */
export type CatalogAiSettings = {
  provider: AIProviderId;
  model: string;
  /** Published API root, required for Admin-configured custom OpenAI-compatible providers. */
  baseUrl: string;
  /** Models the admin saw when configuring — published so users see them too. */
  models: ProviderModel[];
  /** Optional key the admin explicitly chose to share with every user. */
  sharedApiKey: string;
  updatedAt: string;
  /** Max AI generations per calendar day for every learner (0 = unlimited). */
  dailyLimit: number;
  /** Rolling window length shown on the profile (default 5 hours). */
  windowHours: number;
  /** Max AI generations inside the rolling window (0 = same as daily, -1 unlimited). */
  windowLimit: number;
  /** Generation-only keeps legacy counting; hybrid also enforces the purchased term's model-cost budget. */
  allowancePolicy: "generation-only" | "hybrid";
  /** Admin-maintained dynamic pricing catalog. No source edit is needed when models or prices change. */
  modelPricing: AiModelPrice[];
  /** Conservative output-token reservation used before provider usage is available. */
  estimatedOutputTokensPerQuestion: number;
};

/* ------------------------------------------------------------------ */
/* Provider registry                                                   */
/* ------------------------------------------------------------------ */

export type AIProviderMeta = {
  id: AIProviderId;
  name: string;
  tagline: string;
  /** Short brand mark shown inside the provider tile. */
  mark: string;
  /** Gradient used for the brand tile. */
  gradient: string;
  /** Selected-card ring colour. */
  ring: string;
  /** Accent text colour. */
  accentText: string;
  /** Soft accent background colour. */
  accentBg: string;
  keyPlaceholder: string;
  keyHint: string;
  keyUrl: string;
  /** API root (without trailing slash). */
  baseUrl: string;
  /** True when the provider speaks the OpenAI /chat/completions dialect. */
  openAiCompatible: boolean;
};

export const AI_PROVIDERS: AIProviderMeta[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Google's fast Flash models",
    mark: "✦",
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    ring: "ring-blue-500",
    accentText: "text-blue-600",
    accentBg: "bg-blue-50",
    keyPlaceholder: "AIza…",
    keyHint: "Get a free key at Google AI Studio",
    keyUrl: "https://aistudio.google.com/apikey",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    openAiCompatible: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "GPT models — ChatGPT's maker",
    mark: "◐",
    gradient: "from-emerald-400 via-teal-500 to-emerald-600",
    ring: "ring-emerald-500",
    accentText: "text-emerald-600",
    accentBg: "bg-emerald-50",
    keyPlaceholder: "sk-…",
    keyHint: "Get a key at platform.openai.com",
    keyUrl: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    openAiCompatible: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    tagline: "Claude — best-in-class reasoning",
    mark: "✳",
    gradient: "from-orange-400 via-amber-500 to-orange-600",
    ring: "ring-orange-500",
    accentText: "text-orange-600",
    accentBg: "bg-orange-50",
    keyPlaceholder: "sk-ant-…",
    keyHint: "Get a key at console.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    baseUrl: "https://api.anthropic.com/v1",
    openAiCompatible: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "One key for 300+ models",
    mark: "◈",
    gradient: "from-fuchsia-400 via-purple-500 to-violet-600",
    ring: "ring-purple-500",
    accentText: "text-purple-600",
    accentBg: "bg-purple-50",
    keyPlaceholder: "sk-or-…",
    keyHint: "One key for every major model — openrouter.ai",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    openAiCompatible: true,
  },
  {
    id: "groq",
    name: "Groq",
    tagline: "Blazing-fast open models",
    mark: "⚡",
    gradient: "from-amber-400 via-orange-500 to-red-500",
    ring: "ring-orange-500",
    accentText: "text-orange-600",
    accentBg: "bg-orange-50",
    keyPlaceholder: "gsk_…",
    keyHint: "Free tier at console.groq.com",
    keyUrl: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    openAiCompatible: true,
  },
  {
    id: "custom",
    name: "Custom API",
    tagline: "Any OpenAI-compatible endpoint",
    mark: "⚙",
    gradient: "from-slate-500 via-slate-600 to-slate-800",
    ring: "ring-slate-500",
    accentText: "text-slate-700",
    accentBg: "bg-slate-100",
    keyPlaceholder: "Your API key",
    keyHint: "Works with Ollama, LM Studio, vLLM, Together, Fireworks…",
    keyUrl: "",
    baseUrl: "",
    openAiCompatible: true,
  },
];

export function getProvider(id: AIProviderId | string): AIProviderMeta {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

/* ------------------------------------------------------------------ */
/* Known models (fallback list so the dropdown always has choices)     */
/* ------------------------------------------------------------------ */

export const KNOWN_MODELS: Record<AIProviderId, ProviderModel[]> = {
  gemini: [
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash — newest, best reasoning" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash — recommended default" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite — fastest / cheapest" },
    { id: "gemini-flash-latest", name: "Gemini Flash (latest alias)" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o mini — fast & cheap" },
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 nano — fastest" },
    { id: "o3-mini", name: "o3-mini — strong reasoning" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku — fastest" },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto — OpenRouter picks the best model" },
    { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },
    { id: "anthropic/claude-sonnet-4", name: "Anthropic Claude Sonnet 4" },
    { id: "openai/gpt-4o", name: "OpenAI GPT-4o" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta Llama 3.3 70B" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant — fastest" },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
  ],
  custom: [],
};

/** Known + fetched models merged, fetched first, duplicates removed. */
export function mergeModelLists(provider: AIProviderId, fetched: ProviderModel[]): ProviderModel[] {
  const seen = new Set<string>();
  const out: ProviderModel[] = [];
  for (const m of [...fetched, ...KNOWN_MODELS[provider]]) {
    const id = String(m.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(m.name ?? id).trim() || id });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const userKey = (uid: string) => `dc_ai_user_config_${uid}`;
const ADMIN_STORAGE_KEY = "dc_ai_admin_config";

/** Keys used by the pre-multi-provider build (migrated on first load). */
const LEGACY_KEY_STORAGE = "dc_gemini_api_key";
const LEGACY_MODEL_STORAGE = "dc_gemini_model";

function emptyConfig(): AiConfig {
  return { provider: "gemini", apiKey: "", baseUrl: "", model: DEFAULT_MODEL };
}

/** Blank slate for "My own API key" — no school values, no pre-filled model. */
export function blankOwnAiConfig(): AiConfig {
  return { provider: "gemini", apiKey: "", baseUrl: "", model: "" };
}

function emptyUserConfig(): UserAiConfig {
  return { source: "offline", config: blankOwnAiConfig() };
}

function emptyAdminConfig(): UserAiConfig {
  return { source: "own", config: emptyConfig() };
}

function sanitizeConfig(raw: unknown): AiConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const provider = AI_PROVIDERS.some((p) => p.id === r.provider) ? (r.provider as AIProviderId) : "gemini";
  const known = mergeModelLists(provider, []);
  const apiKey = String(r.apiKey ?? "").trim();
  // Own-key with no secret stays model-empty so the student form does not
  // inherit the school's published model. A key without a model still gets a
  // sensible fallback so generation can run.
  const model = String(r.model ?? "").trim() || (apiKey ? known[0]?.id || DEFAULT_MODEL : "");
  return {
    provider,
    apiKey,
    baseUrl: String(r.baseUrl ?? "").trim().replace(/\/+$/, ""),
    model,
  };
}

function sanitizeUserConfig(raw: unknown): UserAiConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const source = r.source === "own" || r.source === "default" ? r.source : "offline";
  return { source, config: sanitizeConfig(r.config) };
}

/** Migrate the old single-provider Gemini keys into the unified shape. */
function legacyGeminiConfig(): AiConfig | null {
  try {
    const key = localStorage.getItem(LEGACY_KEY_STORAGE)?.trim();
    if (!key) return null;
    const model = localStorage.getItem(LEGACY_MODEL_STORAGE)?.trim() || DEFAULT_MODEL;
    return { provider: "gemini", apiKey: key, baseUrl: "", model };
  } catch {
    return null;
  }
}

export function loadUserAiConfig(uid: string): UserAiConfig {
  try {
    const raw = localStorage.getItem(userKey(uid));
    if (raw) return sanitizeUserConfig(JSON.parse(raw));
    const legacy = legacyGeminiConfig();
    if (legacy) {
      const migrated: UserAiConfig = { source: "own", config: legacy };
      saveUserAiConfig(uid, migrated);
      return migrated;
    }
  } catch {
    // fall through to defaults
  }
  return emptyUserConfig();
}

/** True when the user has explicitly saved an AI preference before. */
export function hasStoredUserAiConfig(uid: string): boolean {
  try {
    return Boolean(localStorage.getItem(userKey(uid)));
  } catch {
    return false;
  }
}

export function saveUserAiConfig(uid: string, cfg: UserAiConfig): void {
  try {
    localStorage.setItem(userKey(uid), JSON.stringify(cfg));
  } catch {
    // Persistence is best-effort — private mode etc.
  }
}

export function loadAdminAiConfig(): UserAiConfig {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) return sanitizeUserConfig(JSON.parse(raw));
    const legacy = legacyGeminiConfig();
    if (legacy) {
      const migrated: UserAiConfig = { source: "own", config: legacy };
      saveAdminAiConfig(migrated);
      return migrated;
    }
  } catch {
    // fall through
  }
  return emptyAdminConfig();
}

export function saveAdminAiConfig(cfg: UserAiConfig): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Resolve what a student should actually use                          */
/* ------------------------------------------------------------------ */

export type EffectiveAi = {
  mode: AiSource;
  config: AiConfig | null;
  label: string;
};

/** True when the admin has published a usable school-provided AI (shared key + model). */
export function isSchoolAiAvailable(settings: CatalogAiSettings | null | undefined): boolean {
  const hasKeyAndModel = Boolean(settings?.sharedApiKey?.trim() && settings?.model?.trim());
  return hasKeyAndModel && Boolean(settings?.provider !== "custom" || settings.baseUrl?.trim());
}

/** True when the admin has published *something* the school option can display. */
export function isSchoolAiPublished(settings: CatalogAiSettings | null | undefined): boolean {
  if (!settings) return false;
  // Default catalog always has a fallback model id — only updatedAt / a shared
  // key prove the admin actually published.
  return Boolean(settings.updatedAt?.trim() || settings.sharedApiKey?.trim());
}

/** Runtime config learners use when they pick School-provided AI. */
export function schoolAiConfig(settings: CatalogAiSettings | null | undefined): AiConfig | null {
  if (!isSchoolAiAvailable(settings) || !settings) return null;
  return {
    provider: settings.provider,
    apiKey: settings.sharedApiKey,
    baseUrl: settings.baseUrl || getProvider(settings.provider).baseUrl,
    model: settings.model,
  };
}

export function resolveEffectiveAi(userCfg: UserAiConfig, adminSettings: CatalogAiSettings | null): EffectiveAi {
  if (userCfg.source === "own" && userCfg.config.apiKey.trim()) {
    return { mode: "own", config: { ...userCfg.config }, label: "Your own API key" };
  }
  const school = schoolAiConfig(adminSettings);
  if (userCfg.source === "default" && school) {
    return { mode: "default", config: school, label: "School-provided AI" };
  }
  return { mode: "offline", config: null, label: "Offline question bank" };
}

/* ------------------------------------------------------------------ */
/* Model discovery                                                     */
/* ------------------------------------------------------------------ */

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** List every model a provider exposes for this API key. */
export async function fetchProviderModels(config: AiConfig): Promise<ProviderModel[]> {
  const key = config.apiKey.trim();
  if (!key) throw new Error("Enter an API key first.");
  const meta = getProvider(config.provider);
  const base = (config.baseUrl || meta.baseUrl).replace(/\/+$/, "");
  if (!base) throw new Error("Enter your API base URL first.");

  if (config.provider === "gemini") {
    const res = await fetchWithTimeout(
      `${base}/models?key=${encodeURIComponent(key)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } },
      20000,
    );
    if (!res.ok) {
      throw new Error(`Gemini returned ${res.status}. Check your API key. ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const payload = (await res.json()) as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
    return (payload.models ?? [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => ({
        id: (m.name ?? "").replace(/^models\//, ""),
        name: m.displayName || (m.name ?? "").replace(/^models\//, ""),
      }))
      .filter((m) => m.id);
  }

  if (config.provider === "anthropic") {
    const res = await fetchWithTimeout(`${base}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    }, 20000);
    if (!res.ok) {
      throw new Error(`Anthropic returned ${res.status}. Check your API key. ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const payload = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> };
    return (payload.data ?? []).map((m) => ({ id: m.id ?? "", name: m.display_name || m.id || "" })).filter((m) => m.id);
  }

  // OpenAI-compatible (OpenAI, OpenRouter, Groq, custom)
  const res = await fetchWithTimeout(`${base}/models`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(config.provider === "openrouter" ? { "HTTP-Referer": window.location.origin, "X-Title": "Digital Catalyst" } : {}),
    },
  }, 20000);
  if (!res.ok) {
    throw new Error(`${meta.name} returned ${res.status}. Check your API key. ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const payload = (await res.json()) as { data?: Array<{ id?: string; name?: string }> };
  const skip = /embedding|whisper|tts|dall-e|moderation|realtime|rerank|speech|transcription/i;
  return (payload.data ?? [])
    .map((m) => ({ id: m.id ?? "", name: m.name || m.id || "" }))
    .filter((m) => m.id && !skip.test(m.id));
}

export type TestResult = { ok: boolean; message: string; modelCount: number };

/** Quick connectivity + key check; also warms up the model list. */
export async function testAiConfig(config: AiConfig): Promise<TestResult> {
  try {
    const models = await fetchProviderModels(config);
    return {
      ok: true,
      message: `Connected ✓ — ${models.length} model${models.length === 1 ? "" : "s"} available`,
      modelCount: models.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed. Check your key and try again.",
      modelCount: 0,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Question generation (unified across providers)                      */
/* ------------------------------------------------------------------ */

function parseModelOutput(text: string, input: GenerateInput): ParsedQuestion[] {
  return normalizeQuestions(extractJson(text), input.difficulty).map((q) => ({
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    detected: true,
  }));
}

function normalizeOpenAiChoice(payload: unknown): string {
  const choices = (payload as Record<string, unknown>)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

async function generateOpenAiCompatible(config: AiConfig, input: GenerateInput): Promise<ParsedQuestion[]> {
  const meta = getProvider(config.provider);
  const base = (config.baseUrl || meta.baseUrl).replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey.trim()}`,
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "https://eduvora.app";
    headers["X-Title"] = "Digital Catalyst";
  }
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: buildUserPrompt(input) },
  ];

  const call = (withJsonMode: boolean) =>
    fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      45000,
    );

  let res = await call(true);
  if (res.status === 400) {
    const detail = await res.text().catch(() => "");
    // Some OpenAI-compatible servers don't understand response_format —
    // retry without it rather than failing the whole request.
    if (/response_format|json_object/i.test(detail)) {
      res = await call(false);
    } else {
      throw new Error(`${meta.name} returned 400. Check your key and model. ${detail.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${meta.name} returned ${res.status}. Check your key and model (${config.model}). ${detail.slice(0, 200)}`);
  }
  const payload = (await res.json()) as unknown;
  const text = normalizeOpenAiChoice(payload);
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  return parseModelOutput(text, input);
}

async function generateAnthropic(config: AiConfig, input: GenerateInput): Promise<ParsedQuestion[]> {
  const meta = getProvider("anthropic");
  const base = (config.baseUrl || meta.baseUrl).replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${base}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt(),
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      }),
    },
    45000,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic returned ${res.status}. Check your key and model (${config.model}). ${detail.slice(0, 200)}`);
  }
  const payload = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = Array.isArray(payload.content) ? payload.content.map((p) => p.text ?? "").join("") : "";
  if (!text) throw new Error("Anthropic returned an empty response.");
  return parseModelOutput(text, input);
}

/** Generate MCQs using whatever provider the user configured (direct, browser). */
export async function generateQuestionsWithAi(config: AiConfig, input: GenerateInput): Promise<ParsedQuestion[]> {
  if (!config.apiKey.trim()) throw new Error("No API key configured.");
  if (!config.model.trim()) throw new Error("Choose a model first.");

  if (config.provider === "gemini") {
    return generateWithGemini(
      { apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl || undefined },
      input,
    );
  }
  if (config.provider === "anthropic") return generateAnthropic(config, input);
  return generateOpenAiCompatible(config, input);
}

export type RevisionSyllabus = {
  classNames: string[];
  subjectNames: string[];
  chapterNames: string[];
  topicNames: string[];
  difficulty: "easy" | "medium" | "hard" | "mixed";
  /** AI question type, separate from difficulty (default "mixed" = theory + application). */
  questionMode?: QuestionMode;
  count: number;
  minutes: number;
};

export type RevisionGenerateArgs = {
  source: AiSource;
  config: AiConfig | null;
  syllabus: RevisionSyllabus;
};

function syllabusToInput(syllabus: RevisionSyllabus): GenerateInput {
  const difficulty = syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty;
  return {
    subject: syllabus.subjectNames.join(", ") || "General",
    topic: `${syllabus.chapterNames.join(", ")} — ${syllabus.topicNames.join(", ")}`,
    difficulty,
    count: syllabus.count,
    classNames: syllabus.classNames,
    subjectNames: syllabus.subjectNames,
    chapterNames: syllabus.chapterNames,
    topicNames: syllabus.topicNames,
    minutes: syllabus.minutes,
    questionMode: syllabus.questionMode,
  };
}

function isSpaFallback(res: Response, text: string): boolean {
  if (res.status === 404 || res.status === 501) return true;
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) return true;
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

async function generateViaServer(args: RevisionGenerateArgs): Promise<ParsedQuestion[]> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw Object.assign(new Error("Please log in to generate with AI."), { code: "auth" });
  const token = await firebaseUser.getIdToken(true);
  const res = await fetch("/api/revision/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: "revision.generate",
      source: args.source === "own" ? "own" : "default",
      config: args.source === "own" && args.config
        ? {
            provider: args.config.provider,
            apiKey: args.config.apiKey,
            baseUrl: args.config.baseUrl,
            model: args.config.model,
          }
        : undefined,
      syllabus: args.syllabus,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    }),
  });
  const raw = await res.text();
  if (isSpaFallback(res, raw)) {
    throw Object.assign(new Error("AI proxy is not available in this environment."), { code: "no_proxy" });
  }
  let payload: { ok?: boolean; error?: string; questions?: unknown } = {};
  try {
    payload = JSON.parse(raw) as { ok?: boolean; error?: string; questions?: unknown };
  } catch {
    throw new Error("AI server returned an invalid response.");
  }
  if (!res.ok || !payload.ok) {
    throw Object.assign(new Error(payload.error || `AI server returned ${res.status}.`), { code: "provider", status: res.status });
  }
  const parsed = normalizeQuestions(payload.questions, args.syllabus.difficulty === "mixed" ? "medium" : args.syllabus.difficulty);
  if (!parsed.length) throw new Error("The AI returned no usable questions. Try again.");
  return parsed.map((q) => ({
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    detected: true,
  }));
}

/**
 * Real generation path used by the student generator.
 * Prefers the server proxy (no CORS, school key stays server-side, custom
 * OpenAI-compatible endpoints work). Falls back to a direct browser call
 * only when the serverless route is missing (local Vite).
 */
export async function generateRevisionQuestions(args: RevisionGenerateArgs): Promise<ParsedQuestion[]> {
  const count = Math.max(1, Math.min(20, Math.round(args.syllabus.count || 10)));
  const syllabus = { ...args.syllabus, count };
  try {
    return await generateViaServer({ ...args, syllabus });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
    if (code !== "no_proxy") throw err;
  }
  if (!args.config?.apiKey.trim()) {
    throw new Error("No API key configured. Add your own key or wait for school-provided AI.");
  }
  return generateQuestionsWithAi(args.config, syllabusToInput(syllabus));
}

/* ------------------------------------------------------------------ */
/* Admin-published defaults (stored in the revision catalog)           */
/* ------------------------------------------------------------------ */

export function defaultCatalogAiSettings(): CatalogAiSettings {
  return {
    provider: "gemini",
    model: DEFAULT_MODEL,
    baseUrl: getProvider("gemini").baseUrl,
    models: [...KNOWN_MODELS.gemini],
    sharedApiKey: "",
    updatedAt: "",
    dailyLimit: 20,
    windowHours: 5,
    windowLimit: 10,
    allowancePolicy: "generation-only",
    modelPricing: [],
    estimatedOutputTokensPerQuestion: 350,
  };
}

function cleanStr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function cleanUpdatedAt(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const v = value as { toDate?: () => Date };
    if (typeof v.toDate === "function") {
      try {
        return v.toDate().toISOString();
      } catch {
        return "";
      }
    }
  }
  return "";
}

/** Sanitize a Firestore `aiSettings` field into a usable shape. */
export function normalizeCatalogAiSettings(raw: unknown): CatalogAiSettings {
  const d = defaultCatalogAiSettings();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const provider = AI_PROVIDERS.some((p) => p.id === r.provider) ? (r.provider as AIProviderId) : d.provider;
  const models = Array.isArray(r.models)
    ? r.models
        .map((m) => {
          const item = (m ?? {}) as Record<string, unknown>;
          return { id: cleanStr(item.id).trim(), name: cleanStr(item.name).trim() || cleanStr(item.id).trim() };
        })
        .filter((m) => m.id)
        .slice(0, 300)
    : [...KNOWN_MODELS[provider]];
  const dailyLimit = clampLimit(r.dailyLimit, d.dailyLimit, 0, 10_000);
  const windowHours = clampLimit(r.windowHours, d.windowHours, 1, 24);
  const windowLimitRaw = Number(r.windowLimit);
  const windowLimit = Number.isFinite(windowLimitRaw)
    ? Math.max(-1, Math.min(10_000, Math.round(windowLimitRaw)))
    : d.windowLimit;
  return {
    provider,
    model: cleanStr(r.model).trim() || models[0]?.id || d.model,
    baseUrl: cleanStr(r.baseUrl).trim() || getProvider(provider).baseUrl,
    models: models.length > 0 ? models : [...KNOWN_MODELS[provider]],
    sharedApiKey: cleanStr(r.sharedApiKey),
    updatedAt: cleanUpdatedAt(r.updatedAt),
    dailyLimit,
    windowHours,
    windowLimit,
    allowancePolicy: r.allowancePolicy === "hybrid" ? "hybrid" : "generation-only",
    modelPricing: normalizeAiModelPricing(r.modelPricing),
    estimatedOutputTokensPerQuestion: clampLimit(
      r.estimatedOutputTokensPerQuestion,
      d.estimatedOutputTokensPerQuestion,
      50,
      10_000,
    ),
  };
}

function clampLimit(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ */
/* Admin: latest-year planning curriculum                              */
/* ------------------------------------------------------------------ */

async function completeJsonViaServer(config: AiConfig, system: string, user: string, className: string): Promise<unknown> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw Object.assign(new Error("Please log in as admin."), { code: "auth" });
  const token = await firebaseUser.getIdToken(true);
  const res = await fetch("/api/revision/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: "revision.curriculum",
      source: "own",
      config: { provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model },
      system,
      prompt: user,
      className,
    }),
  });
  const raw = await res.text();
  if (isSpaFallback(res, raw)) throw Object.assign(new Error("AI proxy is not available in this environment."), { code: "no_proxy" });
  let payload: { ok?: boolean; error?: string; json?: unknown; class?: unknown } = {};
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new Error("AI server returned an invalid response.");
  }
  if (!res.ok || !payload.ok) {
    throw Object.assign(new Error(payload.error || `AI server returned ${res.status}.`), { code: "provider", status: res.status });
  }
  return payload.class ?? payload.json;
}

async function completeJsonDirect(config: AiConfig, system: string, user: string): Promise<unknown> {
  if (!config.apiKey.trim() || !config.model.trim()) throw new Error("Connect an AI provider and pick a model first.");
  const meta = getProvider(config.provider);
  if (config.provider === "gemini") {
    const res = await fetchWithTimeout(
      geminiGenerateUrl(config.baseUrl, config.model),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
      45000,
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const text = extractGeminiText(await res.json());
    if (!text) throw new Error("Gemini returned an empty response.");
    return extractJson(text);
  }
  if (config.provider === "anthropic") {
    const base = (config.baseUrl || meta.baseUrl).replace(/\/+$/, "");
    const res = await fetchWithTimeout(
      `${base}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey.trim(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: user }],
        }),
      },
      45000,
    );
    if (!res.ok) throw new Error(`Anthropic returned ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const payload = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = Array.isArray(payload.content) ? payload.content.map((p) => p.text ?? "").join("") : "";
    if (!text) throw new Error("Anthropic returned an empty response.");
    return extractJson(text);
  }
  const base = (config.baseUrl || meta.baseUrl).replace(/\/+$/, "");
  if (!base) throw new Error("Enter your custom API base URL first.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey.trim()}`,
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "https://eduvora.app";
    headers["X-Title"] = "Digital Catalyst";
  }
  const call = (withJson: boolean) =>
    fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          ...(withJson ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      45000,
    );
  let res = await call(true);
  if (res.status === 400) {
    const detail = await res.text().catch(() => "");
    if (/response_format|json_object/i.test(detail)) res = await call(false);
    else throw new Error(`${meta.name} returned 400. ${detail.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${meta.name} returned ${res.status}. ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const payload = (await res.json()) as unknown;
  const text = normalizeOpenAiChoice(payload);
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  return extractJson(text);
}

export async function generatePlanningCurriculumClass(args: {
  config: AiConfig;
  prompt: string;
  className: string;
}): Promise<CurriculumClass> {
  let json: unknown;
  try {
    json = await completeJsonViaServer(args.config, CURRICULUM_SYSTEM_PROMPT, args.prompt, args.className);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
    if (code !== "no_proxy") throw err;
    json = await completeJsonDirect(args.config, CURRICULUM_SYSTEM_PROMPT, args.prompt);
  }
  const parsed = normalizeCurriculumClass(json, args.className);
  if (!parsed) throw new Error(`AI did not return a usable syllabus for ${args.className}. Try again or edit the prompt.`);
  const key = args.className.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || parsed.key;
  return { ...parsed, name: args.className, key };
}
