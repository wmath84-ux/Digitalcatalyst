// api/ai/generate-revision.ts
//
// Admin-only AI question generation endpoint. Generates structured MCQ
// questions for the Daily Test & Revision system from a subject + topic.
//
// Provider auto-detection (no AI_PROVIDER flag needed):
//
//   Option A — Google Gemini (native API)
//     GEMINI_API_KEY                 (required) — any of these names work:
//       GEMINI_API_KEY | GOOGLE_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY
//     GEMINI_MODEL                   (optional, default gemini-2.0-flash)
//
//   Option B — any OpenAI-compatible chat completions API
//     (OpenAI, Groq, OpenRouter, together.ai, Gemini via OpenAI-compat, …)
//     AI_API_KEY   (required)
//     AI_BASE_URL  (optional, default https://api.openai.com/v1)
//     AI_MODEL     (optional, default gpt-4o-mini)
//
// If neither is configured the endpoint returns code `ai_not_configured`
// so the admin UI can fall back to its built-in offline generator.

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
const OPENAI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL = (process.env.AI_MODEL || "gpt-4o-mini").trim();

type GeneratedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function readGeminiKey(): string | null {
  const candidates = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"];
  for (const name of candidates) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

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

function normalizeQuestions(raw: unknown, requestedDifficulty: string): GeneratedQuestion[] {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.questions)
      ? (raw as Record<string, unknown>).questions
      : [];
  const out: GeneratedQuestion[] = [];
  for (const item of source as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const options = (Array.isArray(item.options) ? item.options.map((o) => clean(o, 300)) : []).filter((o) => o.length > 0);
    if (options.length < 2) continue;
    const prompt = clean(item.prompt, 600);
    if (!prompt) continue;
    const correctIndex = Math.max(0, Math.min(options.length - 1, Math.round(Number(item.correctIndex ?? 0) || 0)));
    const difficulty = ["easy", "medium", "hard"].includes(String(item.difficulty))
      ? (String(item.difficulty) as GeneratedQuestion["difficulty"])
      : (["easy", "medium", "hard"].includes(requestedDifficulty) ? (requestedDifficulty as GeneratedQuestion["difficulty"]) : "medium");
    out.push({
      prompt,
      options: options.slice(0, 6),
      correctIndex,
      explanation: clean(item.explanation, 600),
      difficulty,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Google Gemini (native generateContent)                               */
/* ------------------------------------------------------------------ */

function extractGeminiText(payload: unknown): string {
  const candidates = (payload as Record<string, unknown>)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const content = (candidates[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Array<Record<string, unknown>>) : [];
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

async function generateWithGemini(
  apiKey: string,
  userPrompt: string,
  requestedDifficulty: string,
): Promise<GeneratedQuestion[]> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  };

  const upstream = await fetch(`${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[api] gemini upstream ${upstream.status}`, detail.slice(0, 600));
    throw Object.assign(
      new Error(`Gemini returned ${upstream.status}. Check GEMINI_API_KEY and GEMINI_MODEL (currently "${GEMINI_MODEL}").`),
      { statusCode: 502 },
    );
  }

  const payload = (await upstream.json()) as unknown;
  const text = extractGeminiText(payload);
  if (!text) {
    throw Object.assign(new Error("Gemini returned an empty response."), { statusCode: 502 });
  }

  return normalizeQuestions(extractJson(text), requestedDifficulty);
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible chat completions                                   */
/* ------------------------------------------------------------------ */

async function generateWithOpenAiCompatible(
  apiKey: string,
  userPrompt: string,
  requestedDifficulty: string,
): Promise<GeneratedQuestion[]> {
  const upstream = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[api] openai-compat upstream ${upstream.status}`, detail.slice(0, 600));
    throw Object.assign(
      new Error(`AI provider returned ${upstream.status}. Check AI_MODEL (currently "${OPENAI_MODEL}") and AI_BASE_URL.`),
      { statusCode: 502 },
    );
  }

  const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content) {
    throw Object.assign(new Error("AI provider returned an empty response."), { statusCode: 502 });
  }

  return normalizeQuestions(extractJson(content), requestedDifficulty);
}

/* ------------------------------------------------------------------ */
/* Handler                                                              */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const geminiKey = readGeminiKey();
  const openAiKey = process.env.AI_API_KEY?.trim();
  if (!geminiKey && !openAiKey) {
    return res.status(503).json({
      ok: false,
      code: "ai_not_configured",
      error:
        "AI is not configured. Add GEMINI_API_KEY (for Google Gemini) or AI_API_KEY (+ optional AI_BASE_URL / AI_MODEL) to enable question generation.",
    });
  }

  try {
    const user = await requireFirebaseUser(req);
    const userDoc = await adminDb().collection("users").doc(user.uid).get();
    const role = userDoc.exists ? String(userDoc.data()?.role ?? "") : "";
    if (role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required." });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const subject = clean(body.subject, 120);
    const topic = clean(body.topic, 120);
    const count = Math.max(1, Math.min(20, Math.round(Number(body.count || 5))));
    const difficulty = ["easy", "medium", "hard"].includes(String(body.difficulty))
      ? String(body.difficulty)
      : "medium";

    const userPrompt = [
      `Generate ${count} multiple-choice questions for a revision test.`,
      `Subject: ${subject || "General"}`,
      `Topic: ${topic || "General"}`,
      `Difficulty: ${difficulty}`,
      `Make every question distinct. Prefer clear, unambiguous options and a single correct answer.`,
    ].join("\n");

    let questions: GeneratedQuestion[] = [];
    let failure: string | null = null;
    try {
      if (geminiKey) {
        questions = await generateWithGemini(geminiKey, userPrompt, difficulty);
        if (questions.length === 0 && openAiKey) {
          // Gemini succeeded but returned nothing parseable — try the fallback.
          questions = await generateWithOpenAiCompatible(openAiKey, userPrompt, difficulty);
        }
      } else {
        questions = await generateWithOpenAiCompatible(openAiKey!, userPrompt, difficulty);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "AI generation failed.";
      console.error("[api] question generation failed", error);
    }

    if (questions.length === 0) {
      return res.status(502).json({
        ok: false,
        error: failure ?? "The AI provider returned a response that could not be parsed into questions.",
      });
    }

    return res.status(200).json({ ok: true, questions: questions.slice(0, count) });
  } catch (error) {
    return errorResponse(res, error, "Could not generate questions.");
  }
}
