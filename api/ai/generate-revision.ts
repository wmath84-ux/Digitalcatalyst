// api/ai/generate-revision.ts
//
// Admin-only AI question generation endpoint. Generates structured MCQ
// questions for the Daily Test & Revision system from a subject + topic.
//
// Provider-agnostic: talks to any OpenAI-compatible chat completions API
// (OpenAI, Groq, OpenRouter, together.ai, Gemini via OpenAI-compat, …) using:
//   AI_API_KEY   (required)            — provider secret
//   AI_BASE_URL  (optional, default https://api.openai.com/v1)
//   AI_MODEL     (optional, default gpt-4o-mini)
//
// If AI_API_KEY is missing it returns code `ai_not_configured` so the admin
// UI can fall back to its offline generator.

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";

const BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.AI_MODEL || "gpt-4o-mini";

type GeneratedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      code: "ai_not_configured",
      error: "AI is not configured. Add AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) to enable question generation.",
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

    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`[api] ai upstream ${upstream.status}`, detail.slice(0, 500));
      return res.status(502).json({ ok: false, error: `AI provider returned ${upstream.status}. Check AI_MODEL and AI_BASE_URL.` });
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content) return res.status(502).json({ ok: false, error: "AI provider returned an empty response." });

    const questions = normalizeQuestions(extractJson(content), difficulty);
    if (questions.length === 0) {
      return res.status(502).json({ ok: false, error: "AI response could not be parsed into questions." });
    }

    return res.status(200).json({ ok: true, questions: questions.slice(0, count) });
  } catch (error) {
    return errorResponse(res, error, "Could not generate questions.");
  }
}
