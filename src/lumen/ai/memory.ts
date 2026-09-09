import type { Chat, Message } from "../lib/types";
import { detectTopic } from "../lib/engine";
import type { ChatMemory, Turn } from "./types";

/* ─────────────────────────────────────────────────────────────
   CONVERSATION MEMORY
   Compact per-chat store: a recency window of turn excerpts plus a
   rolling summary of everything older. Relevance beats volume —
   the pipeline asks memory questions; it doesn't get a firehose.
   ───────────────────────────────────────────────────────────── */

const TURN_WINDOW = 14;
const EXCERPT = 160;

const store = new Map<string, ChatMemory>();

export function getMemory(chatId: string): ChatMemory {
  let m = store.get(chatId);
  if (!m) {
    m = { turns: [], gist: "", gistTurns: 0, corrections: [], servedQuestions: [] };
    store.set(chatId, m);
  }
  return m;
}

function excerpt(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > EXCERPT ? `${one.slice(0, EXCERPT).trimEnd()}…` : one;
}

/** Ingest the chat's messages, rebuilding the compact window + gist. */
export function ingest(chat: Chat): ChatMemory {
  const m = getMemory(chat.id);
  const msgs = chat.messages.filter((msg) => msg.status === "complete" || msg.status === "error");
  const all: Turn[] = msgs.map((msg: Message) => ({
    role: msg.role,
    excerpt: msg.role === "user" ? excerpt(msg.content || (msg.attachments?.length ? "[image attached]" : "")) : excerpt(msg.content),
    topicId: detectTopic(msg.content || "", chat.courseShort).id,
    format: msg.format,
    at: msg.createdAt,
  }));
  const older = all.length > TURN_WINDOW ? all.slice(0, all.length - TURN_WINDOW) : [];
  m.turns = all.slice(-TURN_WINDOW);
  if (older.length > m.gistTurns) m.gistTurns = older.length;
  if (older.length) {
    const topics = Array.from(new Set(older.filter((t) => t.role === "user").map((t) => t.topicId))).filter((id) => id !== "generic");
    m.gist = topics.length
      ? `Earlier in this chat: ${topics.map((t) => (t === "photo" ? "photosynthesis" : t === "binary" ? "binary search" : t === "chain" ? "the chain rule" : "the French Revolution")).join(", ")}.`
      : "";
  }
  // Track quiz questions served here so practice stays fresh
  for (const msg of chat.messages) {
    if (msg.quiz) for (const q of msg.quiz.questions) if (!m.servedQuestions.includes(q.q)) m.servedQuestions.push(q.q);
    if (msg.role === "assistant" && msg.status === "complete" && msg.followUps) {
      // corrections memory lives on concept ids gathered at grading time
    }
  }
  return m;
}

export interface ReferenceResolution {
  resolved: boolean;
  word: string;
  topicId: string;
  topicLabel: string;
  sourceExcerpt: string;
}

/**
 * Resolve "that / this / the above / my previous question" against the
 * recency window: the referent is the last assistant subject (or the
 * student's own last question if they wrote last).
 */
export function resolveReference(text: string, memory: ChatMemory): ReferenceResolution | null {
  const t = text.toLowerCase();
  const word = ["that", "this", "the above", "it", "my previous question", "earlier"].find((w) => t.includes(w));
  if (!word || !memory.turns.length) return null;
  const lastAssistant = [...memory.turns].reverse().find((x) => x.role === "assistant" && x.excerpt.length > 8);
  const target = lastAssistant ?? memory.turns[memory.turns.length - 1];
  if (!target) return null;
  const label =
    target.topicId === "generic"
      ? "your earlier message"
      : target.topicId === "photo"
        ? "the photosynthesis explanation"
        : target.topicId === "binary"
          ? "the binary search walkthrough"
          : target.topicId === "chain"
            ? "the chain rule notes"
            : "the French Revolution timeline";
  return { resolved: true, word, topicId: target.topicId, topicLabel: label, sourceExcerpt: target.excerpt };
}

/** Last concept the student was corrected on in this chat — for gentle repair. */
export function noteCorrection(chatId: string, conceptId: string): void {
  const m = getMemory(chatId);
  if (!m.corrections.includes(conceptId)) m.corrections.push(conceptId);
  if (m.corrections.length > 8) m.corrections.shift();
}

export function setPendingClarify(chatId: string, about: string, question: string, intent: string): void {
  getMemory(chatId).pendingClarify = { about, question, intent };
}

export function clearPendingClarify(chatId: string): void {
  getMemory(chatId).pendingClarify = undefined;
}
