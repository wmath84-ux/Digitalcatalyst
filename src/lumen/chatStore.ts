// src/lumen/chatStore.ts
//
// The DEVICE half of course-player AI chat persistence: `localStorage` as an
// offline mirror plus the last-open chat id.
//
// The mirror is what makes the chat feel instant and safe:
//   · the list paints from here before Firestore answers (stale-while-revalidate);
//   · a write that never reached the cloud — offline, rules not deployed yet,
//     the tab closed mid-save — is still on the device and is uploaded by the
//     next mount (`useLumenChats` merges and queues it);
//   · clearing site data cannot lose a chat that already reached Firestore.
//
// Keys are scoped by uid AND course, exactly like the notes store, so two
// learners on one device (or two courses) can never see each other's history.

import {
  byLumenChatRecency,
  normalizeLumenChat,
  parseCloudLumenChat,
  sanitizeChatId,
  sanitizeProductId,
  type CloudLumenChat,
} from "../../utils/lumenChats";

const CHAT_STORAGE_PREFIX = "eduvora.lumenChats.v1";
const ACTIVE_STORAGE_PREFIX = "eduvora.lumenChatActive.v1";

const safeParse = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Restricted storage (private mode, quota) — the cloud copy still exists.
  }
};

const safeRemove = (key: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
};

/** `undefined` when either half of the scope is missing — never a shared key. */
const scopeKey = (prefix: string, uid: string, productId: string): string | null => {
  const owner = String(uid || "").trim();
  const product = sanitizeProductId(productId);
  if (!owner || !product) return null;
  return `${prefix}:${owner}:${product}`;
};

/** Mirror every change for one course (called on each local edit). */
export const persistLocalChats = (uid: string, productId: string, chats: unknown[]): void => {
  const key = scopeKey(CHAT_STORAGE_PREFIX, uid, productId);
  if (!key) return;
  const rows = (Array.isArray(chats) ? chats : [])
    .map((chat) => normalizeLumenChat(chat, { productId }))
    .filter(Boolean);
  safeWrite(key, rows);
};

/** Read the mirrored list — already parsed into the app's chat shape. */
export const loadLocalChats = (uid: string, productId: string): CloudLumenChat[] => {
  const key = scopeKey(CHAT_STORAGE_PREFIX, uid, productId);
  if (!key) return [];
  const stored = safeParse<{ id?: string }[]>(key, []);
  if (!Array.isArray(stored)) return [];
  return byLumenChatRecency(
    stored
      .map((row) => parseCloudLumenChat(String(row?.id || ""), row))
      .filter((chat): chat is CloudLumenChat => Boolean(chat)),
  );
};

export const clearLocalChats = (uid: string, productId: string): void => {
  const key = scopeKey(CHAT_STORAGE_PREFIX, uid, productId);
  if (key) safeRemove(key);
};

export const persistActiveChatId = (uid: string, productId: string, chatId: string): void => {
  const key = scopeKey(ACTIVE_STORAGE_PREFIX, uid, productId);
  if (!key) return;
  const id = sanitizeChatId(chatId);
  if (!id) {
    safeRemove(key);
    return;
  }
  safeWrite(key, id);
};

export const loadActiveChatId = (uid: string, productId: string): string => {
  const key = scopeKey(ACTIVE_STORAGE_PREFIX, uid, productId);
  if (!key) return "";
  const stored = safeParse<string>(key, "");
  return typeof stored === "string" ? sanitizeChatId(stored) : "";
};
