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
const DEFAULT_MODEL = "gemini-2.0-flash";

const STORAGE_KEY = "dc_gemini_api_key";
const MODEL_STORAGE_KEY = "dc_gemini_model";

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
    return localStorage.getItem(MODEL_STORAGE_KEY)?.trim() || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setGeminiModel(model: string): void {
  try {
    const trimmed = model.trim();
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

  const model = getGeminiModel();
  const userPrompt = [
    `Generate ${input.count} multiple-choice questions for a revision test.`,
    `Subject: ${input.subject || "General"}`,
    `Topic: ${input.topic || "General"}`,
    `Difficulty: ${input.difficulty}`,
    `Make every question distinct. Prefer clear, unambiguous options and a single correct answer.`,
  ].join("\n");

  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    }),
  });

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
