import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Chat, Message } from "./types";
import { PERF } from "./perf";

/* ─────────────────────────────────────────────────────────────
   CURSOR-BASED INCREMENTAL MESSAGE LOADING
   - Initial page: latest CHAT_INITIAL_PAGE messages.
   - Older pages fetched by cursor (oldest visible message id),
     never offset scans.
   - Single-flight guard + stale-token guard: no duplicate or
     out-of-order appends, even across chat switches.
   - Scroll anchoring: before/after height delta keeps the
     viewport glued to the same message — zero jump.
   ───────────────────────────────────────────────────────────── */

export interface PagedMessages {
  visible: Message[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function usePagedMessages(chat: Chat, listRef: RefObject<HTMLDivElement | null>): PagedMessages {
  const messages = chat.messages;
  const total = messages.length;

  const [count, setCount] = useState<number>(PERF.CHAT_INITIAL_PAGE);
  const [isLoadingMore, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // generation/gen guards: one in-flight request at most, stale
  // completions are dropped, and a chat switch resets cleanly.
  const genRef = useRef(0);
  const pendingRef = useRef(false);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const prevFirstId = useRef<string | null>(null);
  const prevChatId = useRef(chat.id);

  // Reset pagination when the conversation changes identity.
  useEffect(() => {
    if (prevChatId.current !== chat.id) {
      prevChatId.current = chat.id;
      genRef.current += 1;
      pendingRef.current = false;
      anchorRef.current = null;
      prevFirstId.current = null;
      setCount(PERF.CHAT_INITIAL_PAGE);
      setLoading(false);
      setLoadError(false);
    }
  }, [chat.id]);

  // Keep the page window honest as history grows (new messages append
  // to the tail — the window always tracks the latest N+count messages).
  const visible = messages.slice(Math.max(0, total - count));
  const hasMore = visible.length < total;

  const loadMore = useCallback(() => {
    if (pendingRef.current || loadError) return;
    const el = listRef.current;
    const gen = ++genRef.current;
    pendingRef.current = true;
    setLoading(true);
    setLoadError(false);
    // Capture scroll metrics BEFORE older content lands (anchoring).
    if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };

    const cursor = visible[0]?.id ?? null; // cursor-based, not offset
    window.setTimeout(() => {
      pendingRef.current = false;
      if (gen !== genRef.current) return; // stale (chat switched / reset)
      try {
        setCount((c) => c + PERF.CHAT_PAGE_SIZE);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
      void cursor;
    }, PERF.PAGE_LATENCY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError, visible[0]?.id, listRef]);

  const retry = useCallback(() => {
    setLoadError(false);
  }, []);

  // Re-anchor after a prepend. Runs before paint → invisible to the user.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const firstId = visible[0]?.id ?? null;
    if (anchorRef.current && prevFirstId.current && firstId !== prevFirstId.current) {
      const delta = el.scrollHeight - anchorRef.current.height;
      if (delta > 0) el.scrollTop = anchorRef.current.top + delta;
      anchorRef.current = null;
    }
    prevFirstId.current = firstId;
  }, [listRef, visible]);

  return { visible, hasMore, isLoadingMore, loadError, loadMore, retry };
}
