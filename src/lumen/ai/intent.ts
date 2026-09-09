import type { Attachment } from "../lib/types";
import type { ChatMemory, IntentId, SessionState } from "./types";

/* ─────────────────────────────────────────────────────────────
   INTENT DETECTION
   Ordered, evidence-tagged rules. Runs before retrieval so the
   pipeline knows *what kind of pedagogical move* this turn is.
   ───────────────────────────────────────────────────────────── */

export interface IntentResult {
  intent: IntentId;
  confidence: number;
  signals: string[];
}

const has = (t: string, re: RegExp) => re.test(t);

export function detectIntent(text: string, attachments: Attachment[], session: SessionState | undefined, memory: ChatMemory): IntentResult {
  const t = text.trim().toLowerCase();
  const signals: string[] = [];
  const pick = (intent: IntentId, confidence: number, signal: string): IntentResult => ({ intent, confidence, signals: [...signals, signal] });

  // Session commitments first — context overrules surface words.
  if (memory.pendingClarify && t.length > 0) return pick("clarify-reply", 0.9, "answering our clarification");
  if (session?.recall) return pick("recall-answer", 0.85, "replying to a recall prompt");
  if (session?.problem) {
    if (/cancel|stop|forget it|never ?mind|just tell me|give me the (answer|solution)|show me the (answer|solution)/.test(t))
      return pick("answer-please", 0.9, "bailing out of guided solve");
    return pick("continue-problem", 0.8, "continuing the guided solution");
  }

  if (!t && attachments.length) return pick("image-analysis", 0.9, "image without words");
  if (!t) return pick("statement", 0.3, "empty");

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(t) && t.length < 30) return pick("greeting", 0.95, "greeting");
  if (/^(thanks|thank you|thx|got it|makes sense|perfect|great,? thanks)\b/.test(t)) return pick("thanks", 0.9, "acknowledgement");

  // Emotional / cognitive state signals (from evidence, not vibes)
  if (/(still (don'?t|do not) (get|understand)|don'?t (get|understand) (it|this|that)|makes no sense|i'?m (so )?(lost|confused)|confused (again|still)|hate this|ugh)/.test(t))
    return pick("confusion", 0.92, "persistent confusion signal");

  if (/(explain (that|this|it) again|again please|one more time|repeat (that|it)|say that again|re-?explain|run that by me again|simpler|dumb it down|explain like)/.test(t))
    return pick("reexplain", 0.92, "re-explanation requested");

  if (/(exam|midterm|final|test (is )?(tomorrow|next week)|cram|revision for the)/.test(t)) return pick("exam", 0.85, "exam pressure");

  if (/(practice|quiz|test me|drill|check-?up|harder set|fresh set|another set|more questions|keep them coming)/.test(t)) return pick("practice", 0.93, "practice request");

  if (/(visuali[sz]e|illustrate|draw|sketch|diagram it|as a diagram|as a picture|show me a)\b/.test(t) || /(diagram|image|picture|illustration)\s*(of|for|please)?$/.test(t))
    return pick("visual", 0.88, "visual request");

  if (/(essay|feedback on my|my (draft|paragraph|opening)|critique|review my (work|answer|attempt))/.test(t)) return pick("feedback", 0.88, "work review");

  if (/(just tell me|the answer is\??|what'?s the answer|bottom line|final answer|skip the explanation)/.test(t)) return pick("answer-please", 0.9, "explicit answer request");

  if (/(help me solve|stuck on|how do i (solve|do|work out)|work through|solve this|walk me through solving)/.test(t)) return pick("solve", 0.85, "problem-solving request");

  // Reference / follow-up signals — requires an active thread
  const referential = /^(explain|what about|why|how about|and (the|what|how|why)|but (what|why|how)|so |ok(ay)?,? (then|so)|that|this|it|the above|my previous)/.test(t);
  if (has(t, /\b(that|this|the above|it|earlier|before|previous|same)\b/) && (referential || t.split(/\s+/).length <= 10))
    return pick("followup", 0.75, "referential follow-up");
  if (referential && t.split(/\s+/).length <= 6) return pick("followup", 0.7, "minimal follow-up");

  if (attachments.length) return pick("image-analysis", 0.75, "words + image");

  if (t.endsWith("?") || /^(what|why|how|when|where|which|who|can you|could you|is|are|does|do)\b/.test(t)) return pick("question", 0.7, "direct question");

  return pick("statement", 0.5, "statement");
}
