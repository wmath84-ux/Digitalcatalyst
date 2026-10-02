// Type declarations for `utils/lumenChats.js`. The runtime lives in the sibling
// `.js` file so the Node test runner can import it without a TS toolchain — the
// same split `utils/courseNotes.js` / `.d.ts` uses.
//
// Consumers:
//   · src/lumen/cloudChats.ts      — the Firestore I/O layer
//   · src/lumen/chatStore.ts       — the localStorage mirror
//   · src/lumen/useLumenChats.ts   — the persistence hook behind the player's AI chat

export const LUMEN_CHAT_SCHEMA_VERSION: 1;
export const LUMEN_CHATS_COLLECTION: "aiChats";
export const MAX_CHATS_PER_COURSE: number;
export const MAX_MESSAGES_PER_CHAT: number;
export const MAX_MESSAGE_CHARS: number;
export const MAX_CHAT_CHARS: number;
export const MAX_TITLE_CHARS: number;
export const MAX_COURSE_CHARS: number;
export const MAX_PRODUCT_ID_CHARS: number;
export const MAX_FOLLOW_UPS: number;
export const MAX_FOLLOW_UP_CHARS: number;
export const MAX_QUIZ_QUESTIONS: number;
export const MAX_QUIZ_EXPLAIN_CHARS: number;
export const MAX_QUIZ_OPTION_CHARS: number;
export const MAX_THINKING_STEPS: number;
export const MAX_THINKING_LABEL_CHARS: number;
export const MAX_THINKING_DETAIL_CHARS: number;
export const MAX_ATTACHMENT_NAME_CHARS: number;
export const MAX_INLINE_SRC_CHARS: number;

/** A stored message — the app's `Message` minus everything that cannot sync. */
export interface StoredLumenMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "complete" | "error";
  attachments?: {
    id: string;
    kind: "upload" | "screenshot";
    name: string;
    src: string;
    w?: number;
    h?: number;
    size?: number;
  }[];
  thinking?: { label: string; detail?: string; status: "pending" | "active" | "done" }[];
  thinkingOpen?: boolean;
  thinkingMs?: number;
  modelLabel?: string;
  quiz?: {
    topic: string;
    questions: {
      q: string;
      options: string[];
      correct: number;
      explain: string;
      difficulty: 1 | 2 | 3;
      concept: string;
    }[];
    answers: (number | null)[];
    submitted: boolean;
    level?: 1 | 2 | 3;
  };
  quizRef?: string;
  format?: string;
  followUps?: string[];
  errorMessage?: string;
  errorRetryable?: boolean;
  errorKind?: string;
}

/** The document stored at `users/{uid}/aiChats/{chatId}`. */
export interface StoredLumenChat {
  id: string;
  uid: string;
  productId: string;
  title: string;
  course: string;
  courseShort: string;
  pinned: boolean;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
  messages: StoredLumenMessage[];
}

/** The app-facing chat record (src/lumen/lib/types.ts `Chat` is a superset). */
export interface CloudLumenChat {
  id: string;
  title: string;
  course: string;
  courseShort: string;
  pinned: boolean;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredLumenMessage[];
}

export function sanitizeChatId(value: unknown): string;
export function sanitizeProductId(value: unknown): string;
export function newLumenChatId(): string;
export function normalizeLumenMessage(raw: unknown): StoredLumenMessage | null;
export function normalizeLumenChat(
  raw: unknown,
  options?: { id?: string; uid?: string; productId?: string },
): StoredLumenChat | null;
export function lumenChatTime(chat: unknown): number;
export function byLumenChatRecency<T extends { updatedAt?: number; createdAt?: number }>(chats: T[]): T[];
export function parseCloudLumenChat(id: string, data: unknown): CloudLumenChat | null;
export function mergeLumenChatSets(
  cloudChats: { id?: string; updatedAt?: number; createdAt?: number }[],
  localChats: { id?: string; updatedAt?: number; createdAt?: number }[],
  protectedIds?: string[],
): { chats: CloudLumenChat[]; pendingUploads: string[] };
