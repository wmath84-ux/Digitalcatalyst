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

/**
 * Question style chosen by the learner in the AI Revision Generator
 * (the "Mixed" dropdown in the difficulty row):
 *   - mixed       → blend of theory + application (default)
 *   - theory      → only theoretical/concept questions (definitions,
 *                   formulas, units, laws, concept recall)
 *   - application → only application-based questions (numerical &
 *                   real-world problems that use the concept)
 */
export type QuestionMode = "mixed" | "theory" | "application";

export type GenerateInput = {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  count: number;
  classNames?: string[];
  subjectNames?: string[];
  chapterNames?: string[];
  topicNames?: string[];
  selectionRows?: Array<{ className: string; subjectName: string; chapterName: string; topicName: string }>;
  testDate?: string;
  generatedAt?: string;
  timezone?: string;
  minutes?: number;
  questionMode?: QuestionMode;
};

/** Resolve `…/v1beta/models/{model}:generateContent` even if baseUrl omitted `/models`. */
export function geminiGenerateUrl(baseUrl: string | undefined, model: string): string {
  const root = String(baseUrl || GEMINI_ENDPOINT).replace(/\/+$/, "");
  const modelsRoot = /\/models$/i.test(root) ? root : `${root}/models`;
  const id = normalizeModelName(model) || DEFAULT_MODEL;
  return `${modelsRoot}/${id}:generateContent`;
}

type RawGenerated = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: string;
};

export function systemPrompt(): string {
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
    "- The question-style rule in the user request is a hard constraint: never emit a question kind it forbids, even if a topic suggests it.",
    "- No markdown, no code fences, no extra text outside the JSON.",
  ].join("\n");
}

export function extractJson(text: string): unknown {
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

export function extractGeminiText(payload: unknown): string {
  const candidates = (payload as Record<string, unknown>)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const content = (candidates[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Array<Record<string, unknown>>) : [];
  return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

export function normalizeQuestions(raw: unknown, requestedDifficulty: string): RawGenerated[] {
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

/** Explicit runtime settings for a Gemini call (no localStorage involved). */
export type GeminiRuntimeConfig = {
  apiKey: string;
  model: string;
  /** Override for the API root (defaults to Google's public endpoint). */
  baseUrl?: string;
  /** Called when a retired model was auto-upgraded to a working one. */
  onModelMigrated?: (model: string) => void;
};

/**
 * Question-style instructions appended to the prompt.
 *
 * Question type (theory / application / mixed) is a SEPARATE setting from
 * difficulty and it is a hard rule, not a hint. Each mode lists exactly what
 * is allowed, what is forbidden and a same-style example, and ends with a
 * self-check the model must run before answering — learners were seeing
 * application/numerical questions even after selecting Theory only.
 *
 * Keep this wording in sync with api/_lib/revisionGenerate.ts so the direct
 * and server-proxied paths follow identical rules.
 */
export function questionStyleLines(mode: QuestionMode | undefined): string[] {
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
export function questionModeLabelFor(mode: QuestionMode | undefined): string {
  if (mode === "theory") return "THEORY ONLY (definitions/concepts/formulas/units — zero numerical or application questions)";
  if (mode === "application") return "APPLICATION ONLY (numerical/problem-solving questions — zero pure definition or recall questions)";
  return "MIXED (about half theory, about half application)";
}

/** Build the user prompt that asks the model for MCQs. */
export function buildUserPrompt(input: GenerateInput): string {
  const classes = (input.classNames ?? []).filter(Boolean);
  const subjects = (input.subjectNames ?? []).filter(Boolean);
  const chapters = (input.chapterNames ?? []).filter(Boolean);
  const topics = (input.topicNames ?? []).filter(Boolean);
  const exactRows = (input.selectionRows ?? [])
    .filter((row) => row.className && row.subjectName && row.chapterName && row.topicName)
    .slice(0, 80);
  const lines = [
    `Generate exactly ${input.count} multiple-choice questions for a revision test.`,
    `Total questions requested: ${input.count}`,
    `Class: ${classes.join(", ") || "General"}`,
    `Subject: ${subjects.join(", ") || input.subject || "General"}`,
    `Chapter: ${chapters.join(", ") || "General"}`,
    `Concepts / topics: ${topics.join(", ") || input.topic || "General"}`,
    ...(exactRows.length
      ? [
          "Exact selected syllabus combinations (preserve these class → subject → chapter → topic links):",
          ...exactRows.map((row, index) => `${index + 1}. ${row.className} → ${row.subjectName} → ${row.chapterName} → ${row.topicName}`),
        ]
      : []),
    ...(input.testDate ? [`Requested test date: ${input.testDate}`] : []),
    ...(input.generatedAt ? [`Generation requested at: ${input.generatedAt}${input.timezone ? ` (${input.timezone})` : ""}`] : []),
    `Difficulty: ${input.difficulty}`,
    `Selected question type (hard rule): ${questionModeLabelFor(input.questionMode)}`,
    ...questionStyleLines(input.questionMode),
  ];
  if (input.minutes && input.minutes > 0) {
    lines.push(`Exam duration to keep in mind: ${input.minutes} minutes for ${input.count} questions — every question must be short enough to be answered well within this time.`);
  }
  lines.push("Cover the listed concepts at the given class level. Every question must be distinct, unambiguous, and have one correct answer.");
  lines.push(`CRITICAL FINAL CHECK: The learner's selected question type is "${questionModeLabelFor(input.questionMode)}". Verify each of the ${input.count} questions follows that rule exactly before answering — if any question is of the wrong type, replace it with a compliant one.`);
  return lines.join("\n");
}

/** Call the Gemini generateContent endpoint directly from the browser. */
export async function generateWithGemini(config: GeminiRuntimeConfig, input: GenerateInput): Promise<ParsedQuestion[]> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("No Gemini API key configured.");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      // Lower temperature keeps the model closer to the strict question-type
      // rules (theory vs application) instead of drifting to generic exam items.
      temperature: 0.4,
    },
  });

  const call = (model: string) =>
    fetch(geminiGenerateUrl(config.baseUrl, model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
    });

  let model = config.model;
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
        model = fallback;
        res = retry;
        config.onModelMigrated?.(fallback);
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

/**
 * Legacy helper used by the admin panel: reads the key + model from
 * localStorage (the old `dc_gemini_*` keys) and mirrors any model migration
 * back into storage.
 */
export async function generateWithGeminiClient(input: GenerateInput): Promise<ParsedQuestion[]> {
  const apiKey = getGeminiKey();
  const model = getGeminiModel();
  return generateWithGemini(
    {
      apiKey: apiKey ?? "",
      model,
      onModelMigrated: (next) => setGeminiModel(next),
    },
    input,
  );
}
