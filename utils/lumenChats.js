// utils/lumenChats.js
//
// COURSE-PLAYER AI CHAT (Lumen) — the stored shape, the caps and the
// cloud ↔ device merge rule.
//
// ── Why this exists ───────────────────────────────────────────────────────
// The AI chat inside the Course Player kept its whole conversation list in
// React state (`src/lumen/App.tsx`): `useState<Chat[]>(...)` and nothing else.
// Closing the player, switching lessons, reloading or opening the app on
// another device threw every question and every answer away — the reported
// "course player ke andar jo AI chats hote hain vah save nahin ho rahe".
//
// Storage now mirrors the notes / mind-map design exactly:
//
//   users/{uid}/aiChats/{chatId}    one document per chat, owner-only
//
// with `localStorage` kept as an offline mirror (instant paint + a queue of
// work that never reached the cloud). This module holds the PURE part — id /
// payload normalisation, the caps the Firestore rules mirror, and the merge
// rule — so the Node test runner can drive it with no Firebase and no bundler,
// and so the client and the security rules can never disagree about a limit.
//
// ── What is NOT stored ────────────────────────────────────────────────────
// Attachments and AI-generated images carry `data:` URLs (screenshots, uploads,
// generated illustrations). Those bytes are NEVER written to Firestore: a
// handful of screenshots would push one document into the 1 MB limit and every
// later save would fail. Only text (and http(s) image references) is synced;
// an attachment whose bytes cannot be stored is dropped on read instead of
// rendering as a broken image.

/** Bumped whenever the stored chat shape changes, so readers can migrate. */
export const LUMEN_CHAT_SCHEMA_VERSION = 1;

/** Subcollection under `users/{uid}` that holds one document per chat. */
export const LUMEN_CHATS_COLLECTION = "aiChats";

/**
 * Caps mirrored 1:1 by firestore.rules (`users/{uid}/aiChats/{chatId}`).
 *
 * `MAX_CHAT_CHARS` is the document-level budget: a chat keeps its NEWEST
 * messages and drops the oldest ones until the whole conversation fits, so a
 * long-lived chat can never grow into Firestore's 1 MB document limit.
 */
export const MAX_CHATS_PER_COURSE = 40;
export const MAX_MESSAGES_PER_CHAT = 120;
export const MAX_MESSAGE_CHARS = 20000;
export const MAX_CHAT_CHARS = 180000;
export const MAX_TITLE_CHARS = 120;
export const MAX_COURSE_CHARS = 160;
export const MAX_PRODUCT_ID_CHARS = 120;
export const MAX_FOLLOW_UPS = 6;
export const MAX_FOLLOW_UP_CHARS = 160;
export const MAX_QUIZ_QUESTIONS = 12;
export const MAX_QUIZ_EXPLAIN_CHARS = 4000;
export const MAX_QUIZ_OPTION_CHARS = 600;
export const MAX_THINKING_STEPS = 10;
export const MAX_THINKING_LABEL_CHARS = 160;
export const MAX_THINKING_DETAIL_CHARS = 320;
export const MAX_ATTACHMENT_NAME_CHARS = 160;
/** A stored image reference must be a short URL — never an inline data URL. */
export const MAX_INLINE_SRC_CHARS = 600;

/** Firestore document ids allow almost anything; a predictable charset keeps
 *  the id readable in the console and safe inside a composite key. */
const ID_PATTERN = /[^A-Za-z0-9._-]/g;

export const sanitizeChatId = (value) =>
  String(value == null ? "" : value)
    .trim()
    .replace(ID_PATTERN, "-")
    .slice(0, 80);

export const sanitizeProductId = (value) =>
  String(value == null ? "" : value).trim().slice(0, MAX_PRODUCT_ID_CHARS);

/** A collision-free id for a brand-new chat. Already id-safe by construction. */
export const newLumenChatId = () =>
  `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const text = (value) => String(value == null ? "" : value);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampText = (value, max) => text(value).slice(0, max);

/**
 * Only a short non-inline URL survives storage. `data:` URLs are the whole
 * reason this guard exists — they are megabytes of base64 masquerading as a
 * string field.
 */
const storableSrc = (src) => {
  const value = text(src).trim();
  if (!value || value.length > MAX_INLINE_SRC_CHARS) return "";
  if (value.startsWith("data:")) return "";
  return value;
};

const normalizeAttachment = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = clampText(source.id, 80).trim();
  const src = storableSrc(source.src);
  if (!id || !src) return null;
  const out = {
    id,
    kind: source.kind === "screenshot" ? "screenshot" : "upload",
    name: clampText(source.name, MAX_ATTACHMENT_NAME_CHARS),
    src,
  };
  const w = Math.round(asNumber(source.w, 0));
  const h = Math.round(asNumber(source.h, 0));
  const size = Math.round(asNumber(source.size, 0));
  if (w > 0) out.w = w;
  if (h > 0) out.h = h;
  if (size > 0) out.size = size;
  return out;
};

const normalizeQuiz = (raw) => {
  const source = raw && typeof raw === "object" ? raw : null;
  if (!source || !Array.isArray(source.questions)) return undefined;
  const questions = source.questions.slice(0, MAX_QUIZ_QUESTIONS).map((row) => {
    const question = row && typeof row === "object" ? row : {};
    const options = Array.isArray(question.options)
      ? question.options.slice(0, 8).map((option) => clampText(option, MAX_QUIZ_OPTION_CHARS))
      : [];
    return {
      q: clampText(question.q, MAX_QUIZ_EXPLAIN_CHARS),
      options,
      correct: Math.max(0, Math.round(asNumber(question.correct, 0))),
      explain: clampText(question.explain, MAX_QUIZ_EXPLAIN_CHARS),
      difficulty: question.difficulty === 1 || question.difficulty === 3 ? question.difficulty : 2,
      concept: clampText(question.concept, 120),
    };
  });
  if (!questions.length) return undefined;
  const answers = Array.isArray(source.answers)
    ? source.answers.slice(0, MAX_QUIZ_QUESTIONS).map((answer) => (answer == null ? null : Math.round(asNumber(answer, 0))))
    : [];
  return {
    topic: clampText(source.topic, 160),
    questions,
    answers,
    submitted: source.submitted === true,
    ...(source.level === 1 || source.level === 2 || source.level === 3 ? { level: source.level } : {}),
  };
};

const normalizeThinking = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const steps = raw.slice(0, MAX_THINKING_STEPS).map((row) => {
    const step = row && typeof row === "object" ? row : {};
    const status = step.status === "done" || step.status === "active" ? step.status : "pending";
    const out = { label: clampText(step.label, MAX_THINKING_LABEL_CHARS), status };
    const detail = clampText(step.detail, MAX_THINKING_DETAIL_CHARS);
    if (detail) out.detail = detail;
    return out;
  });
  return steps.length ? steps : undefined;
};

/**
 * The message as it is stored. A run that was still streaming when the app
 * closed is written as `complete` — otherwise reopening the chat would show a
 * spinner for a request that no longer exists.
 */
export const normalizeLumenMessage = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = clampText(source.id, 80).trim();
  if (!id) return null;
  const role = source.role === "user" ? "user" : "assistant";
  const content = clampText(source.content, MAX_MESSAGE_CHARS);
  const status = source.status === "error" ? "error" : "complete";
  const stored = {
    id,
    role,
    content,
    createdAt: Math.round(asNumber(source.createdAt, Date.now())),
    status,
  };
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.map(normalizeAttachment).filter(Boolean).slice(0, 4)
    : [];
  if (attachments.length) stored.attachments = attachments;
  const thinking = normalizeThinking(source.thinking);
  if (thinking) stored.thinking = thinking;
  if (source.thinkingOpen === true && status !== "error") stored.thinkingOpen = true;
  if (Number.isFinite(Number(source.thinkingMs))) stored.thinkingMs = Math.round(asNumber(source.thinkingMs, 0));
  const modelLabel = clampText(source.modelLabel, 80);
  if (modelLabel) stored.modelLabel = modelLabel;
  const quiz = normalizeQuiz(source.quiz);
  if (quiz) stored.quiz = quiz;
  const quizRef = clampText(source.quizRef, 80);
  if (quizRef) stored.quizRef = quizRef;
  const format = clampText(source.format, 40);
  if (format) stored.format = format;
  if (Array.isArray(source.followUps)) {
    const followUps = source.followUps.slice(0, MAX_FOLLOW_UPS).map((item) => clampText(item, MAX_FOLLOW_UP_CHARS)).filter(Boolean);
    if (followUps.length) stored.followUps = followUps;
  }
  const errorMessage = clampText(source.errorMessage, 600);
  if (errorMessage) stored.errorMessage = errorMessage;
  if (source.errorRetryable === true) stored.errorRetryable = true;
  const errorKind = clampText(source.errorKind, 60);
  if (errorKind) stored.errorKind = errorKind;
  // A run that never produced a word (and has no quiz or error to explain it)
  // is not a message — storing it would paint an empty answer bubble forever.
  if (role === "assistant" && !content.trim() && !stored.quiz && !errorMessage) return null;
  return stored;
};

/**
 * Normalise ANY chat record (cloud document, localStorage row, in-memory chat)
 * into the exact shape that is written and compared.
 *
 * The newest messages win when the document-level character budget is reached:
 * a chat is a conversation, and losing the first question of a year-old thread
 * is a far smaller failure than being unable to save today's answer at all.
 */
export const normalizeLumenChat = (raw, options = {}) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = sanitizeChatId(source.id || options.id);
  const productId = sanitizeProductId(options.productId || source.productId);
  if (!id || !productId) return null;
  const messages = (Array.isArray(source.messages) ? source.messages : [])
    .map(normalizeLumenMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES_PER_CHAT);
  let kept = messages;
  let used = kept.reduce((total, message) => total + message.content.length, 0);
  while (kept.length > 2 && used > MAX_CHAT_CHARS) {
    used -= kept[0].content.length;
    kept = kept.slice(1);
  }
  const createdAt = Math.round(asNumber(source.createdAt, kept.length ? kept[0].createdAt : Date.now()));
  const updatedAt = Math.max(
    Math.round(asNumber(source.updatedAt, 0)),
    createdAt,
    kept.length ? kept[kept.length - 1].createdAt : 0,
  );
  return {
    id,
    uid: String(options.uid || source.uid || ""),
    productId,
    title: clampText(source.title, MAX_TITLE_CHARS) || "New chat",
    course: clampText(source.course, MAX_COURSE_CHARS),
    courseShort: clampText(source.courseShort, MAX_COURSE_CHARS),
    pinned: source.pinned === true,
    modelId: clampText(source.modelId, 80) || "default",
    createdAt,
    updatedAt,
    schemaVersion: LUMEN_CHAT_SCHEMA_VERSION,
    messages: kept,
  };
};

/** Newest first — the order the chat list has always shown. */
export const lumenChatTime = (chat) => {
  const source = chat && typeof chat === "object" ? chat : {};
  return Math.max(asNumber(source.updatedAt, 0), asNumber(source.createdAt, 0));
};

export const byLumenChatRecency = (chats) =>
  [...(Array.isArray(chats) ? chats : [])].sort((left, right) => lumenChatTime(right) - lumenChatTime(left));

/**
 * A cloud document → the app's chat record. Malformed rows return `null`
 * instead of a half-built chat, so one bad document can never blank the list.
 */
export const parseCloudLumenChat = (id, data) => {
  const row = data && typeof data === "object" ? data : null;
  if (!row) return null;
  const chat = normalizeLumenChat({ ...row, id }, { productId: row.productId });
  if (!chat) return null;
  return {
    id: chat.id,
    title: chat.title,
    course: chat.course,
    courseShort: chat.courseShort,
    pinned: chat.pinned,
    modelId: chat.modelId,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: chat.messages,
  };
};

/**
 * The cloud ↔ device merge.
 *
 * For every chat id the newer record wins (an old server snapshot must never
 * undo an edit that has not been acknowledged yet); chats that exist only on
 * the device are queued for upload so nothing written offline is lost.
 */
export const mergeLumenChatSets = (cloudChats = [], localChats = [], protectedIds = []) => {
  const protectedSet = new Set(protectedIds);
  const byId = new Map();
  for (const chat of byLumenChatRecency(cloudChats)) byId.set(sanitizeChatId(chat.id), { chat, fromCloud: true });
  const uploads = [];
  for (const chat of byLumenChatRecency(localChats)) {
    const id = sanitizeChatId(chat.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { chat, fromCloud: false });
      uploads.push(id);
      continue;
    }
    const localTime = lumenChatTime(chat);
    const cloudTime = lumenChatTime(existing.chat);
    if (protectedSet.has(id) || localTime > cloudTime) {
      byId.set(id, { chat, fromCloud: false });
      uploads.push(id);
    }
  }
  return {
    chats: byLumenChatRecency(Array.from(byId.values()).map((entry) => entry.chat)),
    pendingUploads: Array.from(new Set(uploads)),
  };
};
