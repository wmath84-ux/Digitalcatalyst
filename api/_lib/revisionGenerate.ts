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

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";

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

export type RevisionSyllabus = {
  classNames: string[];
  subjectNames: string[];
  chapterNames: string[];
  topicNames: string[];
  difficulty: "easy" | "medium" | "hard" | "mixed";
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

const firstHeader = (headers: VercelRequest["headers"] | undefined, name: string): string => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
};

const dayKey = (now = Date.now()): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    "- No markdown, no code fences, no extra text outside the JSON.",
  ].join("\n");
}

export function buildSyllabusPrompt(syllabus: RevisionSyllabus): string {
  const difficulty =
    syllabus.difficulty === "mixed" ? "a mix of easy, medium and hard" : syllabus.difficulty;
  return [
    `Generate ${syllabus.count} multiple-choice questions for a revision test.`,
    `Class: ${syllabus.classNames.join(", ") || "General"}`,
    `Subject: ${syllabus.subjectNames.join(", ") || "General"}`,
    `Chapter: ${syllabus.chapterNames.join(", ") || "General"}`,
    `Concepts / topics: ${syllabus.topicNames.join(", ") || "General"}`,
    `Difficulty: ${difficulty}`,
    `Exam duration to keep in mind: ${syllabus.minutes} minutes`,
    "Cover the listed concepts at the given class level. Every question must be distinct, unambiguous, and have one correct answer.",
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
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw).questions)
      ? (asRecord(raw).questions as unknown[])
      : [];
  const out: GeneratedQuestion[] = [];
  for (const item of source) {
    const row = asRecord(item);
    const options = (Array.isArray(row.options) ? row.options.map((o) => String(o ?? "").trim()) : []).filter((o) => o.length > 0);
    if (options.length < 2) continue;
    const prompt = String(row.prompt ?? "").trim().slice(0, 600);
    if (!prompt) continue;
    const correctIndex = Math.max(0, Math.min(options.length - 1, Math.round(Number(row.correctIndex ?? 0) || 0)));
    const difficulty = ["easy", "medium", "hard"].includes(String(row.difficulty))
      ? String(row.difficulty)
      : (["easy", "medium", "hard"].includes(requestedDifficulty) ? requestedDifficulty : "medium");
    out.push({
      prompt,
      options: options.slice(0, 6),
      correctIndex,
      explanation: String(row.explanation ?? "").trim().slice(0, 600),
      difficulty,
    });
  }
  return out;
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
  const classNames = cleanList(r.classNames);
  const subjectNames = cleanList(r.subjectNames);
  const chapterNames = cleanList(r.chapterNames);
  const topicNames = cleanList(r.topicNames);
  if (!classNames.length || !subjectNames.length || !chapterNames.length || !topicNames.length) {
    throw Object.assign(new Error("Select class, subject, chapter and topic before generating."), { statusCode: 400 });
  }
  return { classNames, subjectNames, chapterNames, topicNames, difficulty, count, minutes };
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
  return { provider, apiKey, baseUrl: DEFAULT_BASE[provider], model };
}

async function consumeUsage(uid: string, settings: Record<string, unknown>, opts: { dryRun: boolean }): Promise<void> {
  const dailyLimit = Math.max(0, Math.round(Number(settings.dailyLimit ?? 20) || 0));
  const windowHours = Math.max(1, Math.min(24, Math.round(Number(settings.windowHours ?? 5) || 5)));
  const windowLimitRaw = Number(settings.windowLimit);
  const windowLimit = Number.isFinite(windowLimitRaw) ? Math.max(-1, Math.min(10_000, Math.round(windowLimitRaw))) : 10;
  const now = Date.now();
  const ref = adminDb().collection("users").doc(uid).collection("aiUsage").doc("current");
  const snap = await ref.get();
  const data = asRecord(snap.data());
  const currentDay = dayKey(now);
  const storedDay = String(data.dayKey || "");
  const dayCount = storedDay === currentDay ? Math.max(0, Math.round(Number(data.dayCount) || 0)) : 0;
  const stamps = (Array.isArray(data.stamps) ? data.stamps : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  const windowMs = windowHours * 60 * 60 * 1000;
  const inWindow = stamps.filter((t) => now - t < windowMs);
  const effectiveWindow = windowLimit === -1 ? -1 : windowLimit > 0 ? windowLimit : dailyLimit;
  if (dailyLimit > 0 && dayCount >= dailyLimit) {
    throw Object.assign(new Error(`Daily AI limit reached (${dailyLimit} generations). Resets tomorrow.`), { statusCode: 429 });
  }
  if (effectiveWindow >= 0 && inWindow.length >= effectiveWindow) {
    throw Object.assign(new Error(`${windowHours}-hour window limit reached (${effectiveWindow} generations). Try again later.`), { statusCode: 429 });
  }
  if (opts.dryRun) return;
  const nextStamps = [...inWindow.filter((t) => now - t < windowMs * 2), now].slice(-MAX_STAMPS);
  await ref.set(
    {
      uid,
      dayKey: currentDay,
      dayCount: dayCount + 1,
      stamps: nextStamps,
      updatedAt: now,
    },
    { merge: true },
  );
}

async function callGemini(config: AiConfig, syllabus: RevisionSyllabus): Promise<GeneratedQuestion[]> {
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
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw Object.assign(new Error(`Gemini returned ${res.status}. Check the API key and model (${config.model}). ${detail}`), { statusCode: 502 });
  }
  const text = extractGeminiText(await res.json());
  if (!text) throw Object.assign(new Error("Gemini returned an empty response."), { statusCode: 502 });
  return normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty);
}

async function callAnthropic(config: AiConfig, syllabus: RevisionSyllabus): Promise<GeneratedQuestion[]> {
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
      system: systemPrompt(),
      messages: [{ role: "user", content: buildSyllabusPrompt(syllabus) }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw Object.assign(new Error(`Anthropic returned ${res.status}. Check the API key and model (${config.model}). ${detail}`), { statusCode: 502 });
  }
  const text = extractAnthropicText(await res.json());
  if (!text) throw Object.assign(new Error("Anthropic returned an empty response."), { statusCode: 502 });
  return normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty);
}

async function callOpenAiCompatible(config: AiConfig, syllabus: RevisionSyllabus, origin: string): Promise<GeneratedQuestion[]> {
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
        temperature: 0.7,
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
  const text = extractOpenAiText(await res.json());
  if (!text) throw Object.assign(new Error("The model returned an empty response."), { statusCode: 502 });
  return normalizeQuestions(extractJson(text), syllabus.difficulty === "mixed" ? "medium" : syllabus.difficulty);
}

async function generateWithProvider(config: AiConfig, syllabus: RevisionSyllabus, origin: string): Promise<GeneratedQuestion[]> {
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
    await consumeUsage(user.uid, aiSettings, { dryRun: true });

    const origin = firstHeader(req.headers, "origin") || firstHeader(req.headers, "referer") || "";
    const questions = await generateWithProvider(config, syllabus, origin);
    if (!questions.length) {
      res.status(502).json({ ok: false, error: "The AI returned no usable questions. Try again." });
      return;
    }
    await consumeUsage(user.uid, aiSettings, { dryRun: false });
    res.status(200).json({
      ok: true,
      provider: config.provider,
      model: config.model,
      source,
      questions: questions.slice(0, syllabus.count),
    });
  } catch (error) {
    errorResponse(res, error, "Could not generate questions with AI.");
  }
}
