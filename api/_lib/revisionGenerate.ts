// api/_lib/revisionGenerate.ts
//
// Server-side revision-question generation. Browser calls to OpenAI /
// Anthropic / Groq / custom endpoints are blocked by CORS, and the Gemini
// URL was easy to get wrong (`/v1beta/{model}` instead of `/v1beta/models/{model}`),
// so generation silently fell back to dummy offline questions.
//
// This helper is served by the existing referral-leaderboard function via a
// vercel.json rewrite from `/api/revision/generate` — Hobby plan is already
// at the 12-function cap, so we must not add a new serverless entry.

import { randomUUID } from "node:crypto";
import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { normalisePlanDoc } from "../../utils/subscriptions.js";
import { aiAllowanceForCycle } from "../../utils/aiAllowances.js";
import { calculateAiCostMicros, estimateTokensFromText, findAiModelPrice, normalizeAiModelPricing, type AiModelPrice } from "../../utils/aiPolicy.js";
import { normalizeCompleteAiQuestions } from "../../utils/aiGeneratedTest.js";

const PROVIDERS = ["gemini", "openai", "openrouter", "anthropic", "groq", "custom"] as const;
type ProviderId = (typeof PROVIDERS)[number];

const DEFAULT_BASE: Record<ProviderId, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  groq: "https://api.groq.com/openai/v1",
  custom: "",
};

const FETCH_MS = 45000;
const MAX_COUNT = 20;
const MAX_STAMPS = 200;
const REVISION_CATALOG_DOC = "revisionCatalog";

export type RevisionSelectionRow = {
  className: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
};

export type RevisionSyllabus = {
  classNames: string[];
  subjectNames: string[];
  chapterNames: string[];
  topicNames: string[];
  /** Exact selected class → subject → chapter → topic rows, preserving relationships. */
  selectionRows?: RevisionSelectionRow[];
  /** Learner-local test date (YYYY-MM-DD) included in the AI prompt. */
  testDate?: string;
  /** ISO timestamp when generation was requested. */
  generatedAt?: string;
  /** Learner timezone label, when available. */
  timezone?: string;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  /** AI question type, separate from difficulty (default "mixed" = theory + application). */
  questionMode?: "mixed" | "theory" | "application";
  count: number;
  minutes: number;
};

type AiConfig = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

type GeneratedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
};

type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  source: "actual" | "estimated";
};

type ProviderGeneration = {
  questions: GeneratedQuestion[];
  usage: ProviderUsage;
};

type EffectiveAiPolicy = {
  hasAccess: boolean;
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  dailyLimit: number;
  windowHours: number;
  windowLimit: number;
  costEnabled: boolean;
  costBudgetMicros: number;
  termKey: string;
  termStartsAt: number;
  termEndsAt: number;
  pricing: AiModelPrice[];
  estimatedOutputTokensPerQuestion: number;
};

type UsageReservation = {
  id: string;
  estimatedCostMicros: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const readBody = (req: VercelRequest): Record<string, unknown> => {
  const raw = req.body as unknown;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asRecord(parsed);
    } catch {
      return {};
    }
  }
  return asRecord(raw);
};

const cleanList = (value: unknown, maxItems = 40, maxLen = 80): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = String(item ?? "").trim().slice(0, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const cleanDate = (value: unknown): string => {
  const text = String(value ?? "").trim().slice(0, 32);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

const cleanIsoDateTime = (value: unknown): string => {
  const text = String(value ?? "").trim().slice(0, 80);
  if (!text) return "";
  const millis = Date.parse(text);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
};

const cleanTimezone = (value: unknown): string =>
  String(value ?? "").trim().replace(/[^A-Za-z0-9_+./:-]/g, "").slice(0, 80);

function cleanSelectionRows(value: unknown): RevisionSelectionRow[] {
  if (!Array.isArray(value)) return [];
  const out: RevisionSelectionRow[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = asRecord(item);
    const className = String(row.className ?? "").trim().slice(0, 80);
    const subjectName = String(row.subjectName ?? "").trim().slice(0, 80);
    const chapterName = String(row.chapterName ?? "").trim().slice(0, 120);
    const topicName = String(row.topicName ?? "").trim().slice(0, 160);
    if (!className || !subjectName || !chapterName || !topicName) continue;
    const key = `${className.toLowerCase()}|${subjectName.toLowerCase()}|${chapterName.toLowerCase()}|${topicName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ className, subjectName, chapterName, topicName });
    if (out.length >= 120) break;
  }
  return out;
}

const firstHeader = (headers: VercelRequest["headers"] | undefined, name: string): string => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
};

const normalizedTimezoneOffset = (tzOffsetMinutes = 0): number =>
  Math.max(-840, Math.min(840, Math.round(Number(tzOffsetMinutes) || 0)));

const dayKey = (now = Date.now(), tzOffsetMinutes = 0): string => {
  const offset = normalizedTimezoneOffset(tzOffsetMinutes);
  const d = new Date(now - offset * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** Next midnight in the learner timezone represented by JS getTimezoneOffset(). */
const nextDayResetAt = (now = Date.now(), tzOffsetMinutes = 0): number => {
  const offset = normalizedTimezoneOffset(tzOffsetMinutes);
  const local = new Date(now - offset * 60_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) + offset * 60_000;
};

const millis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export function geminiGenerateUrl(baseUrl: string, model: string): string {
  const root = String(baseUrl || DEFAULT_BASE.gemini).replace(/\/+$/, "");
  const modelsRoot = /\/models$/i.test(root) ? root : `${root}/models`;
  const id = String(model || "").trim().replace(/^models\//i, "");
  return `${modelsRoot}/${id}:generateContent`;
}

export function systemPrompt(): string {
  return [
    "You are an expert exam question writer for Indian school students.",
    "You generate multiple-choice questions (MCQs) with exactly 4 options.",
    "Return ONLY valid JSON in this exact shape:",
    '{"questions":[{"prompt":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","difficulty":"easy"}]}',
    "Rules:",
    "- correctIndex is the 0-based index of the single correct option.",
    "- options must be exactly 4 distinct, non-empty strings.",
    "- explanation must teach the concept in 1-2 sentences.",
    "- difficulty must be one of: easy, medium, hard.",
    "- Stay strictly inside the given class / subject / chapter / concepts.",
    "- The question-style rule in the user request is a hard constraint: never emit a question kind it forbids, even if a topic suggests it.",
    "- No markdown, no code fences, no extra text outside the JSON.",
  ].join("\n");
}

/**
 * Question-style instructions appended to the prompt.
 *
 * Question type (theory / application / mixed) is a SEPARATE setting from
 * difficulty and it is a hard rule, not a hint. Each mode lists exactly what
 * is allowed, what is forbidden and a same-style example, and ends with a
 * self-check the model must run before answering — learners were seeing
 * application/numerical questions even after selecting Theory only.
 */
function questionStyleLines(mode: RevisionSyllabus["questionMode"]): string[] {
  if (mode === "theory") {
    return [
      "STRICT QUESTION TYPE RULE — the learner selected: THEORY ONLY.",
      "Question style: THEORETICAL / CONCEPT-BASED ONLY.",
      "- Every question must test theory: definitions, concepts, laws, formulas, units, naming, symbols and conceptual comparisons.",
      "- Allowed forms: \"What is the definition of…\", \"State the law / principle of…\", \"Which formula correctly represents…\", \"The SI unit of … is\", \"Which of the following statements about … is correct\", term/symbol recall, classification, matching and conceptual comparison questions.",
      "- Do NOT include numerical problems or long application-based word problems.",
      "- Forbidden in theory mode: any question that gives values to plug in, asks to \"calculate / find / determine / how much\", or describes a real-life scenario that must be solved by applying a formula. Any MCQ whose options are computed answers is forbidden.",
      "- A formula may be the correct answer (e.g. \"Which of the following is the correct formula for stress?\"), but the question must never require computing with it.",
      "- Example to follow: \"What is the SI unit of force?\" — never \"Calculate the force on a 2 kg mass moving at 3 m/s².\"",
      "- Self-check before answering: re-read every question; silently rewrite any that breaks this theory-only rule.",
    ];
  }
  if (mode === "application") {
    return [
      "STRICT QUESTION TYPE RULE — the learner selected: APPLICATION ONLY.",
      "Question style: APPLICATION-BASED ONLY.",
      "- Every question must be an application problem: numerical calculations, real-world scenarios and situational questions that require using the listed concepts.",
      "- Allowed forms: \"Calculate…\", \"Find the value of…\", \"A 2 kg object … what is the…\", case- or scenario-based questions where a concept or formula must be applied to reach the answer, and MCQs whose options are computed values or applied conclusions.",
      "- Do NOT include pure definition, naming or formula-recall questions.",
      "- Forbidden in application mode: direct-recall questions such as \"Define…\", \"State the law of…\", \"What is the SI unit of…\", \"Which formula represents…\" — anything a student could answer from memory without solving. Every question must require working out a solution.",
      "- Example to follow: \"A 2 kg object accelerates at 3 m/s². The force acting on it is?\" — never \"State Newton's second law of motion.\"",
      "- Self-check before answering: re-read every question; silently rewrite any that can be answered without solving a problem.",
    ];
  }
  return [
    "STRICT QUESTION TYPE RULE — the learner selected: MIXED (theory + application).",
    "Question style: MIXED THEORY + APPLICATION.",
    "- Include a balanced blend of theory/concept questions and application/problem-based questions.",
    "- Roughly half of the questions must be theory (definitions, formulas, units, laws, concepts) and roughly half must be application (numerical or real-world problems to solve).",
    "- Every question must clearly belong to one of these two styles.",
    "- Self-check before answering: count theory vs application questions and rebalance if one style dominates.",
  ];
}

/** Short label of the selected question type, used in the final hard-check line. */
function questionModeLabelFor(mode: RevisionSyllabus["questionMode"]): string {
  if (mode === "theory") return "THEORY ONLY (definitions/concepts/formulas/units — zero numerical or application questions)";
  if (mode === "application") return "APPLICATION ONLY (numerical/problem-solving questions — zero pure definition or recall questions)";
  return "MIXED (about half theory, about half application)";
}

export function buildSyllabusPrompt(syllabus: RevisionSyllabus): string {
  const difficulty =
    syllabus.difficulty === "mixed" ? "a mix of easy, medium and hard" : syllabus.difficulty;
  const rows = (syllabus.selectionRows ?? []).filter((row) => row.className && row.subjectName && row.chapterName && row.topicName);
  return [
    `Generate exactly ${syllabus.count} multiple-choice questions for a revision test.`,
    `Total questions requested: ${syllabus.count}`,
    `Class: ${syllabus.classNames.join(", ") || "General"}`,
    `Subject: ${syllabus.subjectNames.join(", ") || "General"}`,
    `Chapter: ${syllabus.chapterNames.join(", ") || "General"}`,
    `Concepts / topics: ${syllabus.topicNames.join(", ") || "General"}`,
    ...(rows.length
      ? [
          "Exact selected syllabus combinations (preserve these class → subject → chapter → topic links):",
          ...rows.slice(0, 80).map((row, index) => `${index + 1}. ${row.className} → ${row.subjectName} → ${row.chapterName} → ${row.topicName}`),
        ]
      : []),
    ...(syllabus.testDate ? [`Requested test date: ${syllabus.testDate}`] : []),
    ...(syllabus.generatedAt ? [`Generation requested at: ${syllabus.generatedAt}${syllabus.timezone ? ` (${syllabus.timezone})` : ""}`] : []),
    `Difficulty: ${difficulty}`,
    ...(syllabus.difficulty === "mixed"
      ? ["- Balance the paper across difficulty: roughly one-third easy, one-third medium and one-third hard, and set each question's \"difficulty\" field correctly."]
      : [`- Every question must be at ${syllabus.difficulty} difficulty.`]),
    `Selected question type (hard rule): ${questionModeLabelFor(syllabus.questionMode)}`,
    ...questionStyleLines(syllabus.questionMode),
    `Exam duration to keep in mind: ${syllabus.minutes} minutes for ${syllabus.count} questions — every question must be short enough to be answered well within this time.`,
    "Cover the listed concepts at the given class level. Every question must be distinct, unambiguous, and have one correct answer.",
    `Return a complete set of exactly ${syllabus.count} usable questions; do not return fewer.`,
    `CRITICAL FINAL CHECK: The learner's selected question type is "${questionModeLabelFor(syllabus.questionMode)}". Verify each of the ${syllabus.count} questions follows that rule exactly before answering — if any question is of the wrong type, replace it with a compliant one.`,
  ].join("\n");
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    const arrStart = trimmed.indexOf("[");
    const arrEnd = trimmed.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) return JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
    throw new Error("AI response was not valid JSON.");
  }
}

export function normalizeQuestions(raw: unknown, requestedDifficulty: string): GeneratedQuestion[] {
  return normalizeCompleteAiQuestions(raw, requestedDifficulty);
}

function extractGeminiText(payload: unknown): string {
  const candidates = asRecord(payload).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const content = asRecord(asRecord(candidates[0]).content);
  const parts = Array.isArray(content.parts) ? (content.parts as Array<Record<string, unknown>>) : [];
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

function extractOpenAiText(payload: unknown): string {
  const choices = asRecord(payload).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = asRecord(asRecord(choices[0]).message);
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return (message.content as Array<Record<string, unknown>>)
      .map((part) => String(part.text ?? part.content ?? ""))
      .join("");
  }
  return "";
}

function extractAnthropicText(payload: unknown): string {
  const content = asRecord(payload).content;
  if (!Array.isArray(content)) return "";
  return (content as Array<Record<string, unknown>>).map((p) => String(p.text ?? "")).join("");
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (host === "metadata.google.internal" || host.endsWith(".internal")) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function assertSafeBaseUrl(raw: string, provider: ProviderId): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    if (provider === "custom") throw Object.assign(new Error("Enter your custom API base URL."), { statusCode: 400 });
    return DEFAULT_BASE[provider];
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw Object.assign(new Error("Custom API base URL is not valid."), { statusCode: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("Custom API base URL must be http(s)."), { statusCode: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("Custom API base URL must not include credentials."), { statusCode: 400 });
  }
  if (isPrivateHost(url.hostname)) {
    throw Object.assign(new Error("Custom API base URL cannot point at a private/local host."), { statusCode: 400 });
  }
  return trimmed;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = FETCH_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseSyllabus(raw: unknown): RevisionSyllabus {
  const r = asRecord(raw);
  const difficultyRaw = String(r.difficulty || "medium");
  const difficulty = (["easy", "medium", "hard", "mixed"].includes(difficultyRaw) ? difficultyRaw : "medium") as RevisionSyllabus["difficulty"];
  const count = Math.max(1, Math.min(MAX_COUNT, Math.round(Number(r.count) || 10)));
  const minutes = Math.max(1, Math.min(240, Math.round(Number(r.minutes) || 10)));
  const modeRaw = String(r.questionMode || "mixed");
  const questionMode = (["mixed", "theory", "application"].includes(modeRaw) ? modeRaw : "mixed") as RevisionSyllabus["questionMode"];
  const classNames = cleanList(r.classNames);
  const subjectNames = cleanList(r.subjectNames);
  const chapterNames = cleanList(r.chapterNames);
  const topicNames = cleanList(r.topicNames);
  const selectionRows = cleanSelectionRows(r.selectionRows);
  const testDate = cleanDate(r.testDate);
  const generatedAt = cleanIsoDateTime(r.generatedAt);
  const timezone = cleanTimezone(r.timezone);
  if (!classNames.length || !subjectNames.length || !chapterNames.length || !topicNames.length) {
    throw Object.assign(new Error("Select class, subject, chapter and topic before generating."), { statusCode: 400 });
  }
  return {
    classNames,
    subjectNames,
    chapterNames,
    topicNames,
    selectionRows,
    testDate,
    generatedAt,
    timezone,
    difficulty,
    questionMode,
    count,
    minutes,
  };
}

function parseOwnConfig(raw: unknown): AiConfig | null {
  const r = asRecord(raw);
  const provider = PROVIDERS.includes(r.provider as ProviderId) ? (r.provider as ProviderId) : null;
  const apiKey = String(r.apiKey ?? "").trim();
  const model = String(r.model ?? "").trim().replace(/^models\//i, "");
  if (!provider || !apiKey || !model) return null;
  const baseUrl = assertSafeBaseUrl(String(r.baseUrl ?? ""), provider);
  return { provider, apiKey, baseUrl, model };
}

async function loadSchoolConfig(): Promise<AiConfig> {
  const snap = await adminDb().collection("settings").doc(REVISION_CATALOG_DOC).get();
  const settings = asRecord(asRecord(snap.data()).aiSettings);
  const provider = PROVIDERS.includes(settings.provider as ProviderId) ? (settings.provider as ProviderId) : "gemini";
  const apiKey = String(settings.sharedApiKey ?? "").trim();
  const model = String(settings.model ?? "").trim().replace(/^models\//i, "");
  if (!apiKey || !model) {
    throw Object.assign(new Error("School-provided AI is not published yet. Ask your school to share a key, or use your own API key."), { statusCode: 409 });
  }
  return { provider, apiKey, baseUrl: String(settings.baseUrl || DEFAULT_BASE[provider]).trim(), model };
}

function normalizedReservations(raw: unknown, now = Date.now()): Record<string, Record<string, unknown>> {
  const source = asRecord(raw);
  const next: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(source).slice(0, 100)) {
    const row = asRecord(value);
    const expiresAt = Number(row.expiresAt || 0);
    if (id && Number.isFinite(expiresAt) && expiresAt > now) next[id] = row;
  }
  return next;
}

async function resolveEffectiveAiPolicy(uid: string, settingsInput?: Record<string, unknown>): Promise<EffectiveAiPolicy> {
  const db = adminDb();
  const [featureSnap, subscriptionSnap, catalogSnap] = await Promise.all([
    db.collection("subscriptionFeatures").doc("revision").get(),
    db.collection("users").doc(uid).collection("subscription").doc("current").get(),
    settingsInput ? Promise.resolve(null) : db.collection("settings").doc(REVISION_CATALOG_DOC).get(),
  ]);
  const settings = settingsInput ?? asRecord(asRecord(catalogSnap?.data()).aiSettings);
  const subscription = asRecord(subscriptionSnap.data());
  const now = Date.now();
  const active = subscriptionSnap.exists && subscription.status === "active" && millis(subscription.expiresAt) > now;
  const features = Array.isArray(subscription.features) ? subscription.features.map(String) : [];
  const featureConfigured = featureSnap.exists && featureSnap.data()?.active !== false;
  const hasAccess = !featureConfigured || (active && features.includes("revision"));
  const storedPlanId = String(subscription.planId || "").trim();
  const planId = active ? (storedPlanId || "basic") : "free";
  const cycle = subscription.cycle === "yearly" ? "yearly" : "monthly";
  const planSnap = active
    ? await db.collection("subscriptionPlans").doc(planId).get()
    : null;
  const plan = planSnap?.exists ? normalisePlanDoc(planSnap.data() || {}, planSnap.id) : null;
  const currentAllowance = aiAllowanceForCycle(plan ?? { aiAllowances: null }, cycle);
  const fallbackDaily = Math.max(0, Math.min(10_000, Math.round(Number(settings.dailyLimit ?? 20) || 0)));
  const snapshotDailyRaw = Number(subscription.aiDailyGenerationLimit);
  const snapshotDaily = Number.isFinite(snapshotDailyRaw)
    ? Math.max(0, Math.min(10_000, Math.round(snapshotDailyRaw)))
    : currentAllowance.dailyGenerationLimit;
  // A purchased benefit is never silently reduced mid-term. Admin increases
  // become useful immediately; 0 is the explicit unlimited value.
  const planDaily = snapshotDaily === 0 || currentAllowance.dailyGenerationLimit === 0
    ? 0
    : Math.max(snapshotDaily, currentAllowance.dailyGenerationLimit);
  const dailyLimit = active && plan ? planDaily : fallbackDaily;

  const snapshotCostRaw = Number(subscription.aiCostBudgetMicros);
  const snapshotCost = Number.isFinite(snapshotCostRaw)
    ? Math.max(-1, Math.min(1_000_000_000_000, Math.round(snapshotCostRaw)))
    : currentAllowance.costBudgetMicros;
  const currentCost = currentAllowance.costBudgetMicros;
  const costBudgetMicros = !active || !plan || snapshotCost < 0 || currentCost < 0
    ? -1
    : Math.max(snapshotCost, currentCost);
  const activatedAt = millis(subscription.activatedAt) || now;
  const expiresAt = millis(subscription.expiresAt) || now;
  const termKey = active
    ? `${planId}:${cycle}:${Math.round(activatedAt)}:${Math.round(expiresAt)}`
    : `free:${planId}:${cycle}`;
  const windowHours = Math.max(1, Math.min(24, Math.round(Number(settings.windowHours ?? 5) || 5)));
  const windowLimitRaw = Number(settings.windowLimit);
  const windowLimit = Number.isFinite(windowLimitRaw)
    ? Math.max(-1, Math.min(10_000, Math.round(windowLimitRaw)))
    : 10;
  return {
    hasAccess,
    planId,
    planName: active ? String(plan?.name || planId || "Basic") : "Free learner",
    cycle,
    dailyLimit,
    windowHours,
    windowLimit,
    costEnabled: settings.allowancePolicy === "hybrid",
    costBudgetMicros,
    termKey,
    termStartsAt: activatedAt,
    termEndsAt: expiresAt,
    pricing: normalizeAiModelPricing(settings.modelPricing),
    estimatedOutputTokensPerQuestion: Math.max(50, Math.min(10_000, Math.round(Number(settings.estimatedOutputTokensPerQuestion ?? 350) || 350))),
  };
}

function usageSnapshot(
  dataInput: Record<string, unknown>,
  policy: EffectiveAiPolicy,
  tzOffsetMinutes = 0,
  now = Date.now(),
) {
  const data = asRecord(dataInput);
  const currentDay = dayKey(now, tzOffsetMinutes);
  const dayCount = String(data.dayKey || "") === currentDay ? Math.max(0, Math.round(Number(data.dayCount) || 0)) : 0;
  const windowMs = policy.windowHours * 60 * 60 * 1000;
  const stamps = (Array.isArray(data.stamps) ? data.stamps : [])
    .map(Number)
    .filter((stamp) => Number.isFinite(stamp) && stamp > 0 && now - stamp < windowMs);
  const reservations = normalizedReservations(data.reservations, now);
  const pending = Object.values(reservations);
  const pendingToday = pending.filter((row) => row.dayKey === currentDay).length;
  const pendingWindow = pending.filter((row) => now - Number(row.createdAt || now) < windowMs).length;
  const termCostMicros = String(data.termKey || "") === policy.termKey
    ? Math.max(0, Math.round(Number(data.termCostMicros) || 0))
    : 0;
  const pendingCostMicros = pending
    .filter((row) => row.termKey === policy.termKey)
    .reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.estimatedCostMicros) || 0)), 0);
  const effectiveWindowLimit = policy.windowLimit === -1
    ? -1
    : policy.windowLimit > 0 ? policy.windowLimit : policy.dailyLimit > 0 ? policy.dailyLimit : -1;
  const dailyUsed = dayCount + pendingToday;
  const windowUsed = stamps.length + pendingWindow;
  const costUsedMicros = termCostMicros + pendingCostMicros;
  let blockedReason: string | null = null;
  if (!policy.hasAccess) blockedReason = "An active Revision Studio subscription is required to generate a new test.";
  else if (policy.dailyLimit > 0 && dailyUsed >= policy.dailyLimit) blockedReason = `Daily school-AI allowance reached (${policy.dailyLimit} successful tests). It resets tomorrow.`;
  else if (effectiveWindowLimit >= 0 && windowUsed >= effectiveWindowLimit) blockedReason = `${policy.windowHours}-hour school-AI limit reached (${effectiveWindowLimit} tests). Try again later.`;
  else if (policy.costEnabled && policy.costBudgetMicros >= 0 && costUsedMicros >= policy.costBudgetMicros) blockedReason = "Your school-AI model-cost allowance for this billing term has been used. Use your own API key or renew/upgrade your plan.";
  const oldest = stamps.length ? Math.min(...stamps) : now;
  return {
    planId: policy.planId,
    planName: policy.planName,
    cycle: policy.cycle,
    source: "school" as const,
    dailyLimit: policy.dailyLimit,
    dailyUsed: dayCount,
    dailyRemaining: policy.dailyLimit <= 0 ? null : Math.max(0, policy.dailyLimit - dailyUsed),
    dailyUnlimited: policy.dailyLimit <= 0,
    dailyResetsAt: nextDayResetAt(now, tzOffsetMinutes),
    windowHours: policy.windowHours,
    windowLimit: effectiveWindowLimit,
    windowUsed: stamps.length,
    windowRemaining: effectiveWindowLimit < 0 ? null : Math.max(0, effectiveWindowLimit - windowUsed),
    windowUnlimited: effectiveWindowLimit < 0,
    windowResetsAt: stamps.length ? oldest + windowMs : now,
    costEnabled: policy.costEnabled,
    costBudgetMicros: policy.costBudgetMicros,
    costUsedMicros: termCostMicros,
    costRemainingMicros: policy.costBudgetMicros < 0 ? null : Math.max(0, policy.costBudgetMicros - costUsedMicros),
    costUnlimited: policy.costBudgetMicros < 0,
    termKey: policy.termKey,
    termStartsAt: policy.termStartsAt,
    termEndsAt: policy.termEndsAt,
    allowed: !blockedReason,
    blockedReason,
  };
}

async function getUsageStatus(uid: string, policy: EffectiveAiPolicy, tzOffsetMinutes: number) {
  const ref = adminDb().collection("users").doc(uid).collection("aiUsage").doc("current");
  const snap = await ref.get();
  const data = asRecord(snap.data());
  const status = usageSnapshot(data, policy, tzOffsetMinutes);
  await ref.set({
    uid,
    reservations: normalizedReservations(data.reservations),
    planId: policy.planId,
    planName: policy.planName,
    cycle: policy.cycle,
    hasAccess: policy.hasAccess,
    dailyLimit: policy.dailyLimit,
    windowHours: policy.windowHours,
    windowLimit: policy.windowLimit,
    costEnabled: policy.costEnabled,
    costBudgetMicros: policy.costBudgetMicros,
    termKey: policy.termKey,
    termStartsAt: policy.termStartsAt,
    termEndsAt: policy.termEndsAt,
    termCostMicros: String(data.termKey || "") === policy.termKey ? Math.max(0, Math.round(Number(data.termCostMicros) || 0)) : 0,
    updatedAt: Date.now(),
  }, { merge: true });
  return status;
}

async function reserveUsage(
  uid: string,
  policy: EffectiveAiPolicy,
  price: AiModelPrice | null,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  tzOffsetMinutes: number,
): Promise<UsageReservation> {
  if (!policy.hasAccess) throw Object.assign(new Error("An active Revision Studio subscription is required to generate a new test."), { statusCode: 403, code: "REVISION_SUBSCRIPTION_REQUIRED" });
  if (policy.costEnabled && !price) {
    throw Object.assign(new Error("School AI pricing is not configured for this model. Ask Admin to publish input/output token pricing, or use your own API key."), { statusCode: 409, code: "AI_MODEL_PRICE_MISSING" });
  }
  const estimatedCostMicros = policy.costEnabled
    ? calculateAiCostMicros(price, estimatedInputTokens, estimatedOutputTokens)
    : 0;
  const id = randomUUID();
  const db = adminDb();
  const ref = db.collection("users").doc(uid).collection("aiUsage").doc("current");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = asRecord(snap.data());
    const status = usageSnapshot(data, policy, tzOffsetMinutes, now);
    if (!status.allowed) throw Object.assign(new Error(status.blockedReason || "School AI allowance reached."), { statusCode: status.blockedReason?.includes("subscription") ? 403 : 429, code: "AI_ALLOWANCE_REACHED" });
    if (policy.costEnabled && policy.costBudgetMicros >= 0 && estimatedCostMicros > Number(status.costRemainingMicros || 0)) {
      throw Object.assign(new Error("This test's estimated model cost is above your remaining school-AI term allowance. Reduce the question count, use your own API key, or renew/upgrade."), { statusCode: 429, code: "AI_COST_ALLOWANCE_REACHED" });
    }
    const reservations = normalizedReservations(data.reservations, now);
    reservations[id] = {
      createdAt: now,
      expiresAt: now + 10 * 60_000,
      dayKey: dayKey(now, tzOffsetMinutes),
      termKey: policy.termKey,
      estimatedCostMicros,
    };
    tx.set(ref, {
      uid,
      reservations,
      planId: policy.planId,
      planName: policy.planName,
      cycle: policy.cycle,
      hasAccess: policy.hasAccess,
      dailyLimit: policy.dailyLimit,
      windowHours: policy.windowHours,
      windowLimit: policy.windowLimit,
      costEnabled: policy.costEnabled,
      costBudgetMicros: policy.costBudgetMicros,
      termKey: policy.termKey,
      termStartsAt: policy.termStartsAt,
      termEndsAt: policy.termEndsAt,
      termCostMicros: String(data.termKey || "") === policy.termKey ? Math.max(0, Math.round(Number(data.termCostMicros) || 0)) : 0,
      updatedAt: now,
    }, { merge: true });
  });
  return { id, estimatedCostMicros };
}

async function releaseUsage(uid: string, reservationId: string): Promise<void> {
  if (!reservationId) return;
  const db = adminDb();
  const ref = db.collection("users").doc(uid).collection("aiUsage").doc("current");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = asRecord(snap.data());
    const reservations = normalizedReservations(data.reservations);
    if (!reservations[reservationId]) return;
    delete reservations[reservationId];
    tx.set(ref, { reservations, updatedAt: Date.now() }, { merge: true });
  });
}

async function finalizeUsage(
  uid: string,
  policy: EffectiveAiPolicy,
  reservation: UsageReservation,
  usage: ProviderUsage,
  price: AiModelPrice | null,
  config: AiConfig,
  tzOffsetMinutes: number,
) {
  const db = adminDb();
  const ref = db.collection("users").doc(uid).collection("aiUsage").doc("current");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = asRecord(snap.data());
    const reservations = normalizedReservations(data.reservations, now);
    if (!reservations[reservation.id]) {
      throw Object.assign(new Error("AI allowance reservation expired before completion. No additional generation was recorded."), { statusCode: 409, code: "AI_RESERVATION_EXPIRED" });
    }
    delete reservations[reservation.id];
    const currentDay = dayKey(now, tzOffsetMinutes);
    const dayCount = String(data.dayKey || "") === currentDay ? Math.max(0, Math.round(Number(data.dayCount) || 0)) : 0;
    const windowMs = policy.windowHours * 60 * 60 * 1000;
    const stamps = (Array.isArray(data.stamps) ? data.stamps : [])
      .map(Number)
      .filter((stamp) => Number.isFinite(stamp) && stamp > 0 && now - stamp < windowMs * 2);
    const previousCost = String(data.termKey || "") === policy.termKey ? Math.max(0, Math.round(Number(data.termCostMicros) || 0)) : 0;
    const actualCostMicros = policy.costEnabled
      ? calculateAiCostMicros(price, usage.inputTokens, usage.outputTokens)
      : 0;
    tx.set(ref, {
      uid,
      dayKey: currentDay,
      dayCount: dayCount + 1,
      stamps: [...stamps, now].slice(-MAX_STAMPS),
      reservations,
      planId: policy.planId,
      planName: policy.planName,
      cycle: policy.cycle,
      hasAccess: policy.hasAccess,
      dailyLimit: policy.dailyLimit,
      windowHours: policy.windowHours,
      windowLimit: policy.windowLimit,
      costEnabled: policy.costEnabled,
      costBudgetMicros: policy.costBudgetMicros,
      termKey: policy.termKey,
      termStartsAt: policy.termStartsAt,
      termEndsAt: policy.termEndsAt,
      termCostMicros: previousCost + actualCostMicros,
      lastUsage: {
        provider: config.provider,
        model: config.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        usageSource: usage.source,
        estimatedReservedCostMicros: reservation.estimatedCostMicros,
        actualCostMicros,
        completedAt: now,
      },
      updatedAt: now,
    }, { merge: true });
  });
  const snap = await ref.get();
  return usageSnapshot(asRecord(snap.data()), policy, tzOffsetMinutes);
}

function providerUsage(raw: unknown, fallbackInputText: string, fallbackOutputText: string, kind: ProviderId): ProviderUsage {
  const payload = asRecord(raw);
  const source = kind === "gemini" ? asRecord(payload.usageMetadata) : asRecord(payload.usage);
  const input = Number(kind === "gemini" ? source.promptTokenCount : kind === "anthropic" ? source.input_tokens : source.prompt_tokens);
  const output = Number(kind === "gemini" ? source.candidatesTokenCount : kind === "anthropic" ? source.output_tokens : source.completion_tokens);
  const actual = Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output >= 0;
  const inputTokens = actual ? Math.round(input) : estimateTokensFromText(fallbackInputText);
  const outputTokens = actual ? Math.round(output) : estimateTokensFromText(fallbackOutputText);
  const totalRaw = Number(kind === "gemini" ? source.totalTokenCount : source.total_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number.isFinite(totalRaw) && totalRaw >= 0 ? Math.round(totalRaw) : inputTokens + outputTokens,
    source: actual ? "actual" : "estimated",
  };
}

async function callGemini(config: AiConfig, syllabus: RevisionSyllabus): Promise<ProviderGeneration> {
  const url = geminiGenerateUrl(config.baseUrl || DEFAULT_BASE.gemini, config.model);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: buildSyllabusPrompt(syllabus) }] }],
      // Lower temperature keeps the model closer to the strict question-type
      // rules (theory vs application) instead of drifting to generic exam items.
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw Object.assign(new Error(`Gemini returned ${res.status}. Check the API key and model (${config.model}). ${detail}`), { statusCode: 502 });
  }
  const payload = await res.json();
  const text = extractGeminiText(payload);
  if (!text) throw Object.assign(new Error("Gemini returned an empty response."), { statusCode: 502 });
  return {
    questions: normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty),
    usage: providerUsage(payload, `${systemPrompt()}\n${buildSyllabusPrompt(syllabus)}`, text, "gemini"),
  };
}

async function callAnthropic(config: AiConfig, syllabus: RevisionSyllabus): Promise<ProviderGeneration> {
  const base = (config.baseUrl || DEFAULT_BASE.anthropic).replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      // Anthropic defaults to temperature 1.0, which drifts from the strict
      // question-type rules — pin it low for reliable rule-following.
      temperature: 0.4,
      system: systemPrompt(),
      messages: [{ role: "user", content: buildSyllabusPrompt(syllabus) }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw Object.assign(new Error(`Anthropic returned ${res.status}. Check the API key and model (${config.model}). ${detail}`), { statusCode: 502 });
  }
  const payload = await res.json();
  const text = extractAnthropicText(payload);
  if (!text) throw Object.assign(new Error("Anthropic returned an empty response."), { statusCode: 502 });
  return {
    questions: normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty),
    usage: providerUsage(payload, `${systemPrompt()}\n${buildSyllabusPrompt(syllabus)}`, text, "anthropic"),
  };
}

async function callOpenAiCompatible(config: AiConfig, syllabus: RevisionSyllabus, origin: string): Promise<ProviderGeneration> {
  const base = assertSafeBaseUrl(config.baseUrl || DEFAULT_BASE[config.provider], config.provider);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = origin || "https://eduvora.app";
    headers["X-Title"] = "Digital Catalyst";
  }
  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: buildSyllabusPrompt(syllabus) },
  ];
  const call = (withJson: boolean) =>
    fetchWithTimeout(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.4,
        ...(withJson ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  let res = await call(true);
  if (res.status === 400) {
    const detail = await res.text().catch(() => "");
    if (/response_format|json_object/i.test(detail)) res = await call(false);
    else throw Object.assign(new Error(`${config.provider} returned 400. Check the key and model. ${detail.slice(0, 200)}`), { statusCode: 502 });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw Object.assign(new Error(`${config.provider} returned ${res.status}. Check the API key and model (${config.model}). ${detail}`), { statusCode: 502 });
  }
  const payload = await res.json();
  const text = extractOpenAiText(payload);
  if (!text) throw Object.assign(new Error("The model returned an empty response."), { statusCode: 502 });
  return {
    questions: normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty),
    usage: providerUsage(payload, `${systemPrompt()}\n${buildSyllabusPrompt(syllabus)}`, text, config.provider),
  };
}

async function generateWithProvider(config: AiConfig, syllabus: RevisionSyllabus, origin: string): Promise<ProviderGeneration> {
  if (config.provider === "gemini") return callGemini(config, syllabus);
  if (config.provider === "anthropic") return callAnthropic(config, syllabus);
  return callOpenAiCompatible(config, syllabus, origin);
}

const FALLBACK_CURRICULUM_SYSTEM = "You output only JSON for a school exam syllabus. No markdown, no commentary.";

async function completeJsonText(config: AiConfig, system: string, user: string, origin: string): Promise<string> {
  if (config.provider === "gemini") {
    const url = geminiGenerateUrl(config.baseUrl || DEFAULT_BASE.gemini, config.model);
    const gRes = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    if (!gRes.ok) {
      throw Object.assign(new Error(`Gemini returned ${gRes.status}. ${(await gRes.text().catch(() => "")).slice(0, 200)}`), { statusCode: 502 });
    }
    const text = extractGeminiText(await gRes.json());
    if (!text) throw Object.assign(new Error("Gemini returned an empty response."), { statusCode: 502 });
    return text;
  }
  if (config.provider === "anthropic") {
    const base = (config.baseUrl || DEFAULT_BASE.anthropic).replace(/\/+$/, "");
    const aRes = await fetchWithTimeout(`${base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: 8192, system, messages: [{ role: "user", content: user }] }),
    });
    if (!aRes.ok) {
      throw Object.assign(new Error(`Anthropic returned ${aRes.status}. ${(await aRes.text().catch(() => "")).slice(0, 200)}`), { statusCode: 502 });
    }
    const text = extractAnthropicText(await aRes.json());
    if (!text) throw Object.assign(new Error("Anthropic returned an empty response."), { statusCode: 502 });
    return text;
  }
  const base = assertSafeBaseUrl(config.baseUrl || DEFAULT_BASE[config.provider], config.provider);
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = origin || "https://eduvora.app";
    headers["X-Title"] = "Digital Catalyst";
  }
  const call = (withJson: boolean) =>
    fetchWithTimeout(`${base}/chat/completions`, {
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
    });
  let oRes = await call(true);
  if (oRes.status === 400) {
    const detail = await oRes.text().catch(() => "");
    if (/response_format|json_object/i.test(detail)) oRes = await call(false);
    else throw Object.assign(new Error(`${config.provider} returned 400. ${detail.slice(0, 200)}`), { statusCode: 502 });
  }
  if (!oRes.ok) {
    throw Object.assign(new Error(`${config.provider} returned ${oRes.status}. ${(await oRes.text().catch(() => "")).slice(0, 200)}`), { statusCode: 502 });
  }
  const text = extractOpenAiText(await oRes.json());
  if (!text) throw Object.assign(new Error("The model returned an empty response."), { statusCode: 502 });
  return text;
}

export async function handleRevisionGenerate(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const user = await requireFirebaseUser(req);
    const body = readBody(req);
    const action = String(body.action || "");
    if (action === "revision.curriculum") {
      const own = parseOwnConfig(body.config);
      if (!own) {
        res.status(400).json({ ok: false, error: "Connect an AI provider in Revision · AI Configuration first." });
        return;
      }
      const prompt = String(body.prompt || "").trim().slice(0, 8000);
      const className = String(body.className || "").trim().slice(0, 40);
      const system = String(body.system || "").trim().slice(0, 4000) || FALLBACK_CURRICULUM_SYSTEM;
      if (!prompt) {
        res.status(400).json({ ok: false, error: "Curriculum prompt is empty." });
        return;
      }
      const origin = firstHeader(req.headers, "origin") || firstHeader(req.headers, "referer") || "";
      const text = await completeJsonText(own, system, prompt, origin);
      if (!text) throw Object.assign(new Error("AI returned an empty syllabus."), { statusCode: 502 });
      const json = extractJson(text);
      const row = asRecord(json);
      const nested = asRecord(row.class);
      const subjects = Array.isArray(row.subjects) ? row.subjects : Array.isArray(nested.subjects) ? nested.subjects : [];
      if (!subjects.length) {
        res.status(502).json({ ok: false, error: `AI did not return a usable syllabus${className ? ` for ${className}` : ""}.` });
        return;
      }
      res.status(200).json({ ok: true, json, className, provider: own.provider, model: own.model });
      return;
    }
    const tzOffsetMinutes = Math.max(-840, Math.min(840, Math.round(Number(body.tzOffsetMinutes) || 0)));
    if (action === "revision.usage.status") {
      const policy = await resolveEffectiveAiPolicy(user.uid);
      const usage = await getUsageStatus(user.uid, policy, tzOffsetMinutes);
      res.status(200).json({ ok: true, usage });
      return;
    }
    if (action && action !== "revision.generate") {
      res.status(400).json({ ok: false, error: "Unknown action." });
      return;
    }
    const syllabus = parseSyllabus(body.syllabus ?? body);
    const source = body.source === "own" ? "own" : "default";
    let config: AiConfig;
    if (source === "own") {
      const own = parseOwnConfig(body.config);
      if (!own) {
        res.status(400).json({ ok: false, error: "Paste your API key and pick a model in AI Configuration." });
        return;
      }
      config = own;
    } else {
      config = await loadSchoolConfig();
    }

    const catalogSnap = await adminDb().collection("settings").doc(REVISION_CATALOG_DOC).get();
    const aiSettings = asRecord(asRecord(catalogSnap.data()).aiSettings);
    const policy = await resolveEffectiveAiPolicy(user.uid, aiSettings);
    if (!policy.hasAccess) {
      throw Object.assign(new Error("An active Revision Studio subscription is required to generate a new test. Your saved tests and results remain available."), { statusCode: 403, code: "REVISION_SUBSCRIPTION_REQUIRED" });
    }

    const origin = firstHeader(req.headers, "origin") || firstHeader(req.headers, "referer") || "";
    const promptText = `${systemPrompt()}\n${buildSyllabusPrompt(syllabus)}`;
    const price = findAiModelPrice(policy.pricing, config.provider, config.model);
    let reservation: UsageReservation | null = null;
    if (source !== "own") {
      reservation = await reserveUsage(
        user.uid,
        policy,
        price,
        estimateTokensFromText(promptText),
        syllabus.count * policy.estimatedOutputTokensPerQuestion,
        tzOffsetMinutes,
      );
    }

    let generated: ProviderGeneration;
    try {
      generated = await generateWithProvider(config, syllabus, origin);
      if (generated.questions.length < syllabus.count) {
        throw Object.assign(new Error(`The AI returned only ${generated.questions.length} usable question(s), but a complete ${syllabus.count}-question test was requested. No generation allowance was used; please try again.`), { statusCode: 502, code: "INCOMPLETE_AI_TEST" });
      }
    } catch (error) {
      if (reservation) await releaseUsage(user.uid, reservation.id).catch(() => undefined);
      throw error;
    }

    let allowance: Awaited<ReturnType<typeof finalizeUsage>> | { unmetered: true; source: "own"; message: string };
    if (reservation) {
      try {
        allowance = await finalizeUsage(user.uid, policy, reservation, generated.usage, price, config, tzOffsetMinutes);
      } catch (error) {
        // A provider-complete test is not delivered unless its authoritative
        // usage transaction also completes. Best-effort release prevents a
        // failed finalisation from leaving a phantom in-flight generation that
        // temporarily reduces the learner's remaining allowance.
        await releaseUsage(user.uid, reservation.id).catch(() => undefined);
        throw error;
      }
    } else {
      allowance = { unmetered: true, source: "own", message: "Your API key does not use the school/plan AI allowance." };
    }
    res.status(200).json({
      ok: true,
      provider: config.provider,
      model: config.model,
      source,
      questions: generated.questions.slice(0, syllabus.count),
      usage: generated.usage,
      allowance,
    });
  } catch (error) {
    errorResponse(res, error, "Could not generate questions with AI.");
  }
}
