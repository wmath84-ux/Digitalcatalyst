// src/lumen/useLumenChats.ts
//
// COURSE-PLAYER AI CHAT persistence — the hook behind `src/lumen/App.tsx`.
//
// ── Why this exists ───────────────────────────────────────────────────────
// The chat list lived in React state only (`useState<Chat[]>`): a conversation
// survived exactly as long as the player stayed mounted. Closing the course,
// reloading the page, or opening the same lesson on another device threw the
// whole history away — the reported "course player ke andar jo AI chats hote
// hain vah save nahin ho rahe".
//
// ── Two layers, exactly like `useCourseNotes` / `useCourseMindMap` ────────
//   1. Firestore is the source of truth: one document per chat at
//      `users/{uid}/aiChats/{chatId}` (`src/lumen/cloudChats.ts`), read through
//      a LIVE listener so a chat saved on the phone appears on the laptop
//      without a refresh. Ownership is re-derived from the path by
//      firestore.rules, so one learner can never read or write another's chats.
//   2. `localStorage` mirrors every change (`src/lumen/chatStore.ts`) plus the
//      last-open chat id. A refused or failed write — offline, rules not
//      deployed yet, the player closed mid-save — can therefore never strand a
//      chat, and the next mount pushes the device copy up.
//
// Writes are debounced: a streaming answer updates the UI on every token while
// Firestore receives one save per quiet window. `flush()` (unmount, tab hide,
// page hide) forces whatever is pending out immediately, and failures retry
// with backoff while the UI names the actual Firestore code.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloudChatsUid,
  deleteCloudChats,
  describeChatsError,
  subscribeCloudChats,
  uploadCloudChats,
} from "./cloudChats";
import {
  loadActiveChatId,
  loadLocalChats,
  persistActiveChatId,
  persistLocalChats,
} from "./chatStore";
import {
  byLumenChatRecency,
  lumenChatTime,
  mergeLumenChatSets,
  newLumenChatId,
  sanitizeChatId,
  type CloudLumenChat,
} from "../../utils/lumenChats";
import type { Chat } from "./lib/types";

export type LumenChatSyncStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

/** A chat plus the timestamp the cloud merge orders on. */
type TrackedChat = Chat & { updatedAt: number };

export interface UseLumenChatsInput {
  /** Signed-in learner. A null uid keeps the chat device-only (guest). */
  uid?: string | null;
  /** Course scope — `String(product.id)`, or the learner's own course id. */
  productId?: string | number | null;
  /** Titles used for a brand-new draft chat. */
  courseTitle?: string;
  courseShort?: string;
  /** Milliseconds of quiet before pending edits are committed. */
  debounceMs?: number;
}

export interface UseLumenChatsResult {
  chats: Chat[];
  activeId: string;
  setChats: (next: Chat[] | ((current: Chat[]) => Chat[])) => void;
  setActiveId: (id: string) => void;
  removeChat: (id: string) => void;
  status: LumenChatSyncStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  /** True until the first cloud read settles (the device mirror paints first). */
  loading: boolean;
  /** True when nothing is waiting to reach Firestore. */
  synced: boolean;
  /** Write every pending change now (unmount / tab hide). */
  flush: () => void;
  /** Re-read the cloud copy (the UI's "Try again"). */
  reload: () => void;
}

/** Short enough to feel instant, long enough to coalesce a streaming answer. */
const DEFAULT_DEBOUNCE_MS = 800;
/** How long a burst of streamed tokens may stay only in memory. */
const MIRROR_DEBOUNCE_MS = 350;
const MAX_SYNC_ATTEMPTS = 8;

/**
 * A chat is only written once it has a message. An empty "New chat" is a
 * scratch pad, not history — persisting it would litter the cloud with blank
 * documents every time the player opens.
 */
const shouldPersist = (chat: Chat | null | undefined): boolean =>
  Boolean(chat && Array.isArray(chat.messages) && chat.messages.length > 0);

const draftChat = (courseTitle: string, courseShort: string): TrackedChat => ({
  id: newLumenChatId(),
  title: "New chat",
  course: courseTitle,
  courseShort: courseShort || courseTitle,
  modelId: "default",
  messages: [],
  updatedAt: Date.now(),
});

interface ChatSession {
  uid: string;
  productId: string;
  scoped: boolean;
  chats: TrackedChat[];
  activeId: string;
  dirty: Set<string>;
  deleted: Set<string>;
  writing: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  mirrorTimer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  inFlight: boolean;
  flushWanted: boolean;
  disposed: boolean;
  listenerFailed: boolean;
}

interface ChatView {
  session: ChatSession;
  chats: TrackedChat[];
  activeId: string;
  status: LumenChatSyncStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  loading: boolean;
}

const initialView = (session: ChatSession): ChatView => ({
  session,
  chats: session.chats,
  activeId: session.activeId,
  status: session.scoped ? "loading" : "idle",
  errorMessage: null,
  lastSavedAt: null,
  loading: session.scoped,
});

/** Cloud/local record → the tracked chat the app renders. */
const toTrackedChat = (chat: Chat | CloudLumenChat): TrackedChat => ({
  ...(chat as Chat),
  updatedAt: Math.max(lumenChatTime(chat), 1),
});

const byChatRecency = (chats: TrackedChat[]): TrackedChat[] =>
  byLumenChatRecency(chats) as TrackedChat[];

export default function useLumenChats(input: UseLumenChatsInput): UseLumenChatsResult {
  const { uid, productId, courseTitle = "", courseShort = "", debounceMs = DEFAULT_DEBOUNCE_MS } = input;
  const scoped = Boolean(uid) && productId != null && String(productId).length > 0;
  const uidText = String(uid || "");
  const productText = String(productId ?? "");
  const title = courseTitle || "Course";
  const short = courseShort || title;

  const session = useMemo<ChatSession>(() => {
    if (!scoped) {
      const chat = draftChat(title, short);
      return {
        uid: uidText, productId: productText, scoped: false,
        chats: [chat], activeId: chat.id, dirty: new Set(), deleted: new Set(), writing: new Set(),
        timer: null, mirrorTimer: null, retry: null, attempts: 0, inFlight: false, flushWanted: false,
        disposed: false, listenerFailed: false,
      };
    }
    const mirrored = byChatRecency(loadLocalChats(uidText, productText).map(toTrackedChat));
    const chats: TrackedChat[] = mirrored.length ? mirrored : [draftChat(title, short)];
    const storedActive = loadActiveChatId(uidText, productText);
    return {
      uid: uidText, productId: productText, scoped: true,
      chats,
      activeId: storedActive && chats.some((chat) => chat.id === storedActive) ? storedActive : chats[0].id,
      dirty: new Set(), deleted: new Set(), writing: new Set(),
      timer: null, mirrorTimer: null, retry: null, attempts: 0, inFlight: false, flushWanted: false,
      disposed: false, listenerFailed: false,
    };
  }, [uidText, productText, scoped, title, short]);

  const scopeRef = useRef(session);
  scopeRef.current = session;
  const [state, setState] = useState<ChatView>(() => initialView(session));
  const view = state.session === session ? state : initialView(session);
  const [reloadToken, setReloadToken] = useState(0);
  const flushRef = useRef<(scope: ChatSession) => void>(() => undefined);

  // Async results for an outgoing course/account must never change the new list.
  const publish = useCallback((scope: ChatSession, patch: Partial<ChatView>) => {
    if (scopeRef.current !== scope || scope.disposed) return;
    setState((current) => ({ ...(current.session === scope ? current : initialView(scope)), ...patch }));
  }, []);

  const scheduleRetry = useCallback((scope: ChatSession, delayMs: number, run: () => void) => {
    if (scope.disposed) return;
    if (scope.retry) clearTimeout(scope.retry);
    scope.retry = setTimeout(() => {
      scope.retry = null;
      if (!scope.disposed) run();
    }, delayMs);
  }, []);

  /**
   * The device mirror is written on a short delay: a streaming answer commits
   * every few milliseconds, and stringifying the whole conversation list on
   * each commit would burn main-thread time for no benefit. Anything that
   * leaves the screen (unmount, pagehide, cloud commit) flushes it immediately.
   */
  const mirrorNow = useCallback((scope: ChatSession) => {
    if (!scope.scoped) return;
    if (scope.mirrorTimer) { clearTimeout(scope.mirrorTimer); scope.mirrorTimer = null; }
    persistLocalChats(scope.uid, scope.productId, scope.chats);
  }, []);

  const scheduleMirror = useCallback((scope: ChatSession) => {
    if (!scope.scoped || scope.disposed) return;
    if (scope.mirrorTimer) clearTimeout(scope.mirrorTimer);
    scope.mirrorTimer = setTimeout(() => {
      scope.mirrorTimer = null;
      if (!scope.disposed) persistLocalChats(scope.uid, scope.productId, scope.chats);
    }, MIRROR_DEBOUNCE_MS);
  }, []);

  const scheduleFlush = useCallback((scope: ChatSession) => {
    if (!scope.scoped || scope.disposed) return;
    if (scope.timer) clearTimeout(scope.timer);
    scope.timer = setTimeout(() => {
      scope.timer = null;
      flushRef.current(scope);
    }, debounceMs);
  }, [debounceMs]);

  const flushNow = useCallback((scope: ChatSession) => {
    if (!scope.scoped) return;
    if (scope.timer) { clearTimeout(scope.timer); scope.timer = null; }
    mirrorNow(scope);
    if (scope.inFlight) { scope.flushWanted = true; return; }
    const uploads = Array.from(scope.dirty)
      .map((id) => scope.chats.find((chat) => chat.id === id && scope.deleted.has(id) === false))
      .filter((chat): chat is TrackedChat => shouldPersist(chat));
    const deletes = Array.from(scope.deleted);
    if (!uploads.length && !deletes.length) { scope.dirty.clear(); return; }

    const owner = cloudChatsUid(scope.uid);
    if (!owner) {
      publish(scope, { status: "error", errorMessage: "Sign-in session confirm nahi hua — AI chat is device par safe hai aur login ke baad sync ho jayega." });
      if (scope.attempts < MAX_SYNC_ATTEMPTS) {
        scope.attempts += 1;
        scheduleRetry(scope, Math.min(15000, 900 * scope.attempts), () => flushRef.current(scope));
      }
      return;
    }

    scope.inFlight = true;
    const capturedTimes = new Map(uploads.map((chat) => [chat.id, chat.updatedAt]));
    scope.writing = new Set([...scope.writing, ...uploads.map((chat) => chat.id)]);
    publish(scope, { status: "saving", errorMessage: null });

    void (async () => {
      let succeeded = false;
      try {
        if (uploads.length) await uploadCloudChats(owner, scope.productId, uploads);
        if (deletes.length) await deleteCloudChats(owner, deletes);
        succeeded = true;
        scope.attempts = 0;
        for (const chat of uploads) {
          // A save that raced an edit stays dirty; the newest content is what
          // the next commit sends.
          if (scope.chats.some((row) => row.id === chat.id && row.updatedAt > (capturedTimes.get(chat.id) || 0))) continue;
          scope.dirty.delete(chat.id);
        }
        for (const id of deletes) scope.deleted.delete(id);
        publish(scope, {
          status: scope.dirty.size || scope.deleted.size ? "saving" : "saved",
          errorMessage: null,
          lastSavedAt: Date.now(),
        });
      } catch (error) {
        // Retry the LATEST version, never the captured pre-edit upload.
        for (const chat of uploads) {
          if (!scope.deleted.has(chat.id) && scope.chats.some((row) => row.id === chat.id)) scope.dirty.add(chat.id);
        }
        publish(scope, { status: "error", errorMessage: describeChatsError(error) });
        if (scope.attempts < MAX_SYNC_ATTEMPTS) {
          scope.attempts += 1;
          scheduleRetry(scope, Math.min(20000, 700 * 2 ** Math.min(scope.attempts, 5)), () => flushRef.current(scope));
        }
      } finally {
        scope.inFlight = false;
        scope.writing.clear();
        if (succeeded && (scope.dirty.size || scope.deleted.size)) {
          if (scope.disposed || scope.flushWanted) flushRef.current(scope);
          else scheduleFlush(scope);
        }
        scope.flushWanted = false;
      }
    })();
  }, [publish, scheduleRetry, scheduleFlush, mirrorNow]);
  flushRef.current = flushNow;

  /**
   * The one state setter the chat UI talks to. It keeps the in-memory objects
   * (so data-URL attachments and generated images still render this session),
   * marks only the chats that actually changed as dirty, and mirrors the list.
   */
  const setChats = useCallback((next: Chat[] | ((current: Chat[]) => Chat[])) => {
    const scope = session;
    if (scope.disposed) return;
    const raw = typeof next === "function" ? next(scope.chats) : next;
    const now = Date.now();
    const previous = new Map(scope.chats.map((chat) => [chat.id, chat]));
    const seen = new Set<string>();
    const rows: TrackedChat[] = [];
    for (const chat of Array.isArray(raw) ? raw : []) {
      if (!chat || typeof chat !== "object") continue;
      const id = sanitizeChatId((chat as Chat).id) || newLumenChatId();
      if (seen.has(id)) continue;
      seen.add(id);
      const before = previous.get(id);
      const changed = !before
        || before !== chat
        || before.title !== (chat as Chat).title
        || before.pinned !== (chat as Chat).pinned
        || before.messages !== (chat as Chat).messages;
      rows.push({
        ...(chat as Chat),
        id,
        updatedAt: changed ? Math.max(now, (before?.updatedAt || 0) + 1) : (before?.updatedAt || now),
      });
      if (changed && shouldPersist(chat as Chat)) scope.dirty.add(id);
      scope.deleted.delete(id);
    }
    for (const [id, before] of previous) {
      if (seen.has(id)) continue;
      scope.dirty.delete(id);
      // Only a chat that actually reached (or was queued for) the cloud can be
      // deleted there; an empty draft simply disappears.
      if (scope.writing.has(id) || shouldPersist(before)) scope.deleted.add(id);
    }
    scope.chats = byChatRecency(rows.map((chat) => ({ ...chat, course: title, courseShort: short })));
    if (!scope.chats.some((chat) => chat.id === scope.activeId)) {
      scope.activeId = scope.chats[0]?.id || "";
      persistActiveChatId(scope.uid, scope.productId, scope.activeId);
    }
    scheduleMirror(scope);
    publish(scope, { chats: scope.chats, activeId: scope.activeId, status: scope.dirty.size ? "saving" : "ready", errorMessage: null });
    if (scope.scoped && (scope.dirty.size || scope.deleted.size)) {
      if (scope.disposed) flushRef.current(scope);
      else scheduleFlush(scope);
    }
  }, [session, publish, scheduleFlush, scheduleMirror, title, short]);

  const setActiveId = useCallback((id: string) => {
    const scope = session;
    const chatId = sanitizeChatId(id);
    if (!chatId || scope.activeId === chatId) return;
    scope.activeId = chatId;
    persistActiveChatId(scope.uid, scope.productId, chatId);
    publish(scope, { activeId: chatId });
  }, [session, publish]);

  const removeChat = useCallback((id: string) => {
    const scope = session;
    const chatId = sanitizeChatId(id);
    if (!chatId) return;
    const before = scope.chats.find((chat) => chat.id === chatId);
    const remaining = scope.chats.filter((chat) => chat.id !== chatId);
    scope.dirty.delete(chatId);
    if (scope.writing.has(chatId) || shouldPersist(before)) scope.deleted.add(chatId);
    if (!remaining.length) {
      const fresh = draftChat(title, short);
      remaining.push(fresh);
    }
    scope.chats = byChatRecency(remaining);
    if (!scope.chats.some((chat) => chat.id === scope.activeId)) {
      scope.activeId = scope.chats[0].id;
      persistActiveChatId(scope.uid, scope.productId, scope.activeId);
    }
    mirrorNow(scope);
    publish(scope, { chats: scope.chats, activeId: scope.activeId });
    flushRef.current(scope);
  }, [session, publish, mirrorNow, title, short]);

  // Load local-first, then merge the live cloud copy. The queue survives
  // listener retries; only a new course/account creates a new session.
  useEffect(() => {
    if (!session.scoped) { setState(initialView(session)); return undefined; }
    let cancelled = false;
    session.listenerFailed = false;
    publish(session, { chats: session.chats, activeId: session.activeId, loading: true, status: "loading", errorMessage: null });
    const unsubscribe = subscribeCloudChats(uidText, productText, (cloud) => {
      if (cancelled || scopeRef.current !== session) return;
      const protectedIds = [...session.dirty, ...session.writing];
      const merged = mergeLumenChatSets(cloud, session.chats, protectedIds);
      let chats = merged.chats.map(toTrackedChat);
      if (!chats.length) chats = [draftChat(title, short)];
      session.chats = byChatRecency(chats);
      for (const id of merged.pendingUploads) if (!session.writing.has(id)) session.dirty.add(id);
      if (!session.chats.some((chat) => chat.id === session.activeId)) {
        session.activeId = session.chats[0].id;
      }
      if (session.scoped) {
        mirrorNow(session);
        persistActiveChatId(session.uid, session.productId, session.activeId);
      }
      if (session.dirty.size || session.deleted.size) scheduleFlush(session);
      publish(session, { chats: session.chats, activeId: session.activeId, loading: false, errorMessage: null });
      // Preserve the acknowledgement instead of downgrading "saved" on every
      // server echo; never claim cloud success just because the mirror painted.
      setState((current) => current.session !== session ? current : {
        ...current,
        status: session.inFlight || session.dirty.size || session.deleted.size
          ? "saving"
          : current.status === "saved" ? "saved" : "ready",
      });
    }, (error) => {
      if (cancelled || scopeRef.current !== session) return;
      session.listenerFailed = true;
      publish(session, { loading: false, status: "error", errorMessage: describeChatsError(error) });
      if (session.attempts < MAX_SYNC_ATTEMPTS) {
        session.attempts += 1;
        scheduleRetry(session, Math.min(20000, 1200 * session.attempts), () => {
          if (scopeRef.current === session) setReloadToken((token) => token + 1);
        });
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [session, uidText, productText, reloadToken, publish, scheduleFlush, scheduleRetry, mirrorNow, title, short]);

  const flush = useCallback(() => flushRef.current(session), [session]);
  const reload = useCallback(() => {
    const scope = session;
    scope.attempts = 0;
    if (scope.retry) { clearTimeout(scope.retry); scope.retry = null; }
    if (scopeRef.current === scope && !scope.disposed) setReloadToken((token) => token + 1);
  }, [session]);

  useEffect(() => {
    session.disposed = false;
    const onLeave = () => flushRef.current(session);
    const onOnline = () => {
      if (session.listenerFailed) reload();
      flushRef.current(session);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && session.listenerFailed) reload();
      onLeave();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onOnline);
    return () => {
      session.disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      if (session.mirrorTimer) { clearTimeout(session.mirrorTimer); session.mirrorTimer = null; }
      if (session.retry) { clearTimeout(session.retry); session.retry = null; }
      // Flush the OUTGOING scope. No retry timer or UI update can outlive it.
      flushRef.current(session);
      mirrorNow(session);
    };
  }, [session, reload, mirrorNow]);

  const { chats, activeId, status, errorMessage, lastSavedAt, loading } = view;
  const synced = session.dirty.size === 0 && session.deleted.size === 0 && !session.inFlight && status !== "error";
  return useMemo(() => ({
    chats, activeId, setChats, setActiveId, removeChat, status, errorMessage, lastSavedAt, loading, synced, flush, reload,
  }), [chats, activeId, setChats, setActiveId, removeChat, status, errorMessage, lastSavedAt, loading, synced, flush, reload]);
}
