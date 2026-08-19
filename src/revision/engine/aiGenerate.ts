// Client-side AI question generation for the admin revision panel.
//
// This runs entirely in the browser (no serverless function) so the project
// stays within Vercel's 12-function Hobby-plan limit. The Gemini API key is
// kept in the admin's own browser (localStorage) — never baked into the
// public bundle — so it cannot be scraped by other visitors.
//
// The admin can also set a default model. If no key is configured (or the
// call fails), the admin panel falls back to the built-in offline generator.

import type { ParsedQuestion } from "./bulkParser";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Current default model.
 *
 * Google retired `gemini-2.0-flash` (and the other 1.5/2.x aliases) — calling
 * them now returns 404 "This model is no longer available", which used to push
 * the admin panel silently onto the offline generator. Keep this pointed at a
 * live model.
 */
export const DEFAULT_MODEL = "gemini-3.6-flash";

/** Models offered in the admin dropdown (newest first). */
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash — newest, best reasoning" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash — recommended default" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite — fastest / cheapest" },
  { value: "gemini-flash-latest", label: "Gemini Flash (latest alias)" },
];

/**
 * Models that Google has retired. Anything stored in an admin's browser from
 * an older build is silently upgraded to DEFAULT_MODEL instead of 404-ing.
 */
const RETIRED_MODEL_PATTERNS: RegExp[] = [
  /^models\//i, // stored with the "models/" prefix — normalised away below
  /^gemini-1\.0/i,
  /^gemini-1\.5/i,
  /^gemini-2\.0/i,
  /^gemini-2\.5/i,
  /^gemini-pro$/i,
  /^gemini-pro-vision$/i,
];

const STORAGE_KEY = "dc_gemini_api_key";
const MODEL_STORAGE_KEY = "dc_gemini_model";

/** Strip an accidental "models/" prefix and surrounding whitespace. */
function normalizeModelName(model: string): string {
  return model.trim().replace(/^models\//i, "").trim();
}

/** True when the model id is a known-retired one that would 404. */
export function isRetiredModel(model: string): boolean {
  const name = model.trim();
  if (!name) return true;
  const bare = normalizeModelName(name);
  if (!bare) return true;
  return RETIRED_MODEL_PATTERNS.some((re) => re.test(name) || re.test(bare)) && !/^gemini-3/i.test(bare);
}

/**
 * Google's 404 body tells us exactly what to migrate to:
 *   "models/gemini-2.0-flash is no longer available. Please update your code
 *    to use models/gemini-3.6-flash …"
 * Pull that replacement out so we can retry automatically.
 */
export function extractSuggestedModel(detail: string): string | null {
  const match = detail.match(/use\s+models\/([a-z0-9._-]+)/i);
  if (match?.[1]) return normalizeModelName(match[1]);
  return null;
}

export function getGeminiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setGeminiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode) — the key just won't persist.
  }
}

export function getGeminiModel(): string {
  try {
    const stored = normalizeModelName(localStorage.getItem(MODEL_STORAGE_KEY) ?? "");
    if (!stored) return DEFAULT_MODEL;
    // An older build defaulted to gemini-2.0-flash and persisted it — upgrade
    // that stale value instead of failing every generation with a 404.
    if (isRetiredModel(stored)) {
      setGeminiModel(DEFAULT_MODEL);
      return DEFAULT_MODEL;
    }
    return stored;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setGeminiModel(model: string): void {
  try {
    const trimmed = normalizeModelName(model);
    if (trimmed) localStorage.setItem(MODEL_STORAGE_KEY, trimmed);
    else localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type GenerateInput = {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  count: number;
};

type RawGenerated = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
};

function systemPrompt(): string {
  return [
    "You are an expert exam question writer for a student revision app.",
    "You generate multiple-choice questions (MCQs) with exactly 4 options.",
    "Return ONLY valid JSON in this exact shape:",
    '{"questions":[{"prompt":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","difficulty":"easy"}]}',
    "Rules:",
    "- correctIndex is the 0-based index of the single correct option.",
    "- options must be exactly 4 distinct, non-empty strings.",
    "- explanation must teach the concept in 1-2 sentences.",
    "- difficulty must be one of: easy, medium, hard.",
    "- No markdown, no code fences, no extra text outside the JSON.",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    const arrStart = trimmed.indexOf("[");
    const arrEnd = trimmed.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      return JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function extractGeminiText(payload: unknown): string {
  const candidates = (payload as Record<string, unknown>)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const content = (candidates[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Array<Record<string, unknown>>) : [];
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

function normalizeQuestions(raw: unknown, requestedDifficulty: string): RawGenerated[] {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.questions)
      ? (raw as Record<string, unknown>).questions
      : [];
  const out: RawGenerated[] = [];
  for (const item of source as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const options = (Array.isArray(item.options) ? item.options.map((o) => String(o ?? "").trim()) : []).filter((o) => o.length > 0);
    if (options.length < 2) continue;
    const prompt = String(item.prompt ?? "").trim().slice(0, 600);
    if (!prompt) continue;
    const correctIndex = Math.max(0, Math.min(options.length - 1, Math.round(Number(item.correctIndex ?? 0) || 0)));
    const difficulty = ["easy", "medium", "hard"].includes(String(item.difficulty))
      ? String(item.difficulty)
      : (["easy", "medium", "hard"].includes(requestedDifficulty) ? requestedDifficulty : "medium");
    out.push({
      prompt,
      options: options.slice(0, 6),
      correctIndex,
      explanation: String(item.explanation ?? "").trim().slice(0, 600),
      difficulty,
    });
  }
  return out;
}

/** Call the Gemini generateContent endpoint directly from the browser. */
export async function generateWithGeminiClient(input: GenerateInput): Promise<ParsedQuestion[]> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("No Gemini API key configured.");

  const userPrompt = [
    `Generate ${input.count} multiple-choice questions for a revision test.`,
    `Subject: ${input.subject || "General"}`,
    `Topic: ${input.topic || "General"}`,
    `Difficulty: ${input.difficulty}`,
    `Make every question distinct. Prefer clear, unambiguous options and a single correct answer.`,
  ].join("\n");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const call = (model: string) =>
    fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
    });

  let model = getGeminiModel();
  let res = await call(model);

  // A retired model answers 404 and names its replacement — switch to it,
  // remember the choice, and retry once so the admin never has to hand-edit
  // the model field.
  if (res.status === 404) {
    const detail = await res.text().catch(() => "");
    const suggested = extractSuggestedModel(detail);
    const fallback = suggested && suggested !== model ? suggested : model !== DEFAULT_MODEL ? DEFAULT_MODEL : null;
    if (fallback) {
      const retry = await call(fallback);
      if (retry.ok) {
        setGeminiModel(fallback);
        model = fallback;
        res = retry;
      } else {
        const retryDetail = await retry.text().catch(() => "");
        throw new Error(
          `Gemini returned ${retry.status} for both ${model} and ${fallback}. Check your API key and model. ${retryDetail.slice(0, 240)}`,
        );
      }
    } else {
      throw new Error(`Gemini returned 404. Check your API key and model (${model}). ${detail.slice(0, 240)}`);
    }
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini returned ${res.status}. Check your API key and model (${model}). ${detail.slice(0, 240)}`);
  }

  const payload = (await res.json()) as unknown;
  const text = extractGeminiText(payload);
  if (!text) throw new Error("Gemini returned an empty response.");

  return normalizeQuestions(extractJson(text), input.difficulty).map((q) => ({
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    detected: true,
  }));
}
