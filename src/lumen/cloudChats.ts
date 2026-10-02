// src/lumen/cloudChats.ts
//
// The Firestore half of course-player AI chat persistence.
//
//   users/{uid}/aiChats/{chatId}    one document per chat, owner-only
//
// The AI chat inside the Course Player used to live entirely in React state
// (`src/lumen/App.tsx`), so a conversation existed only until the player
// unmounted: switching lessons, reloading, or opening the same course on a
// phone threw every question and answer away. This module is the single place
// that talks to Firestore for chats — `src/lumen/useLumenChats.ts` owns the
// state, the debounce, the offline mirror and the retry queue, and calls the
// functions below.
//
// Reads use a LIVE listener (so a chat saved on the phone appears on the
// laptop without a refresh) with a one-shot `getDocs` fallback; writes are
// batched, capped and validated by the same numbers `utils/lumenChats.js`
// applies, so firestore.rules can never reject a payload this file produced.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  writeBatch,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  LUMEN_CHATS_COLLECTION,
  MAX_CHATS_PER_COURSE,
  normalizeLumenChat,
  parseCloudLumenChat,
  sanitizeChatId,
  type CloudLumenChat,
} from "../../utils/lumenChats";

/** Firestore batches cap at 500 operations; stay well inside that. */
const WRITE_CHUNK = 400;

const chunk = <T,>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
};

/**
 * The uid a cloud write may use: Firestore rules derive ownership from the
 * PATH, so a write is only ever attempted for the signed-in learner's own
 * namespace. Anything else stays on the device mirror and retries later.
 */
export const cloudChatsUid = (uid: string | null | undefined): string | null => {
  const wanted = String(uid || "").trim();
  if (!wanted) return null;
  const signedIn = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  return signedIn && signedIn === wanted ? signedIn : null;
};

const chatsQuery = (uid: string, productId: string) =>
  query(
    collection(db, "users", uid, LUMEN_CHATS_COLLECTION),
    // Equality-only filter: Firestore needs no composite index for this.
    where("productId", "==", String(productId)),
  );

/** One-shot read of a course's cloud chats (used by the fallback + tests). */
export async function fetchCloudChats(uid: string, productId: string): Promise<CloudLumenChat[]> {
  const owner = cloudChatsUid(uid);
  if (!owner || !productId) return [];
  const snapshot = await getDocs(chatsQuery(owner, String(productId)));
  return snapshot.docs
    .map((entry) => parseCloudLumenChat(entry.id, entry.data()))
    .filter((chat): chat is CloudLumenChat => Boolean(chat))
    .slice(0, MAX_CHATS_PER_COURSE);
}

/** Live list of a course's cloud chats. Returns the unsubscribe function. */
export function subscribeCloudChats(
  uid: string,
  productId: string,
  onData: (chats: CloudLumenChat[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const owner = cloudChatsUid(uid);
  if (!owner || !productId) {
    // A restored app user can precede Firebase Auth's session hydration.
    // Report it so the hook retries instead of installing a permanent no-op
    // listener and treating an empty local result as a successful cloud read.
    onError?.(Object.assign(new Error("Firebase sign-in session is not ready"), { code: "unauthenticated" }));
    return () => undefined;
  }
  return onSnapshot(
    chatsQuery(owner, String(productId)),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((entry) => parseCloudLumenChat(entry.id, entry.data()))
          .filter((chat): chat is CloudLumenChat => Boolean(chat)),
      );
    },
    (error) => {
      // A refused listener must never strand the chat list: fall back to a
      // single read (which the offline cache can still answer) and report the
      // failure so the UI can name it instead of silently showing an empty list.
      void fetchCloudChats(owner, String(productId))
        .then((chats) => {
          if (chats.length) onData(chats);
          onError?.(error instanceof Error ? error : new Error(String(error)));
        })
        .catch(() => onError?.(error instanceof Error ? error : new Error(String(error))));
    },
  );
}

/** Create / overwrite chats. Resolves once every batch has committed. */
export async function uploadCloudChats(
  uid: string,
  productId: string,
  chats: unknown[],
): Promise<void> {
  const owner = cloudChatsUid(uid);
  const product = String(productId || "");
  if (!product || !chats.length) return;
  if (!owner) throw Object.assign(new Error("Firebase sign-in session is not ready"), { code: "unauthenticated" });
  const rows = chats
    .map((chat) => normalizeLumenChat(chat, { uid: owner, productId: product }))
    .filter((chat): chat is NonNullable<ReturnType<typeof normalizeLumenChat>> => Boolean(chat))
    .slice(0, MAX_CHATS_PER_COURSE);
  for (const group of chunk(rows, WRITE_CHUNK)) {
    const batch = writeBatch(db);
    for (const chat of group) {
      batch.set(doc(db, "users", owner, LUMEN_CHATS_COLLECTION, chat.id), chat, { merge: true });
    }
    await batch.commit();
  }
}

/** Delete chats by id. Missing documents are a no-op, so this is retry-safe. */
export async function deleteCloudChats(uid: string, chatIds: string[]): Promise<void> {
  const owner = cloudChatsUid(uid);
  const ids = Array.from(new Set((chatIds || []).map((id) => sanitizeChatId(id)).filter(Boolean)));
  if (!ids.length) return;
  if (!owner) throw Object.assign(new Error("Firebase sign-in session is not ready"), { code: "unauthenticated" });
  for (const group of chunk(ids, WRITE_CHUNK)) {
    const batch = writeBatch(db);
    for (const id of group) batch.delete(doc(db, "users", owner, LUMEN_CHATS_COLLECTION, id));
    await batch.commit();
  }
}

/** Single delete — used the moment a chat is removed, before any batching. */
export async function deleteCloudChat(uid: string, chatId: string): Promise<void> {
  const owner = cloudChatsUid(uid);
  const id = sanitizeChatId(chatId);
  if (!id) return;
  if (!owner) throw Object.assign(new Error("Firebase sign-in session is not ready"), { code: "unauthenticated" });
  await deleteDoc(doc(db, "users", owner, LUMEN_CHATS_COLLECTION, id));
}

/**
 * A message the learner can act on. Firestore's own text ("Missing or
 * insufficient permissions") says nothing about WHAT failed, which is how a
 * rules gap turns into "AI chat save nahi ho raha" with no clue anywhere.
 */
export const describeChatsError = (error: unknown): string => {
  const code = String((error as { code?: string } | null)?.code || "");
  if (code === "permission-denied") {
    return "Firebase ne is account ko AI chat likhne se roka (permission-denied). Chat is device par safe hai — cloud rules deploy hote hi apne aap sync ho jayega.";
  }
  if (code === "unauthenticated") return "Sign-in session expire ho gaya — dobara login karte hi AI chats sync ho jayenge.";
  if (code === "unavailable") return "Network/Firestore abhi unavailable hai. Chat device par save hai aur thodi der me dobara try hoga.";
  if (code === "resource-exhausted") return "Firestore quota khatam ho gaya hai — chat device par safe hai.";
  const message = String((error as { message?: string } | null)?.message || "");
  return message ? `Cloud save fail hua: ${message.slice(0, 160)}` : "Cloud save fail hua — chat is device par safe hai.";
};
