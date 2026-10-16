// src/course/searchExperience.tsx
//
// THE STUDY SEARCH EXPERIENCE — one set of pieces, shared by the COURSE
// LIBRARY's search page and the MUSIC library's search box, so the two behave
// identically by construction.
//
// Owner brief (2026-10-16):
//
//   · the header's search box is fully rounded, and the long sentence inside it
//     is never shrunk — it SLIDES left and right, forever, at full size in a
//     faded ink;
//   · pressing Enter (or the box's own Enter button, which sits INSIDE the box
//     on its right) runs the search;
//   · the loading state is a FLASH SCAN: at least one second of it on a fast
//     connection, and for as long as it takes on a slow one — the results
//     appear the moment they are really here;
//   · the search page shows what was searched BEFORE, exactly like YouTube's
//     search history (each entry tappable, removable, and a "Clear all").
//
// Everything here is deliberately small and dependency-free: the history store
// (./searchHistory.ts) and the library matcher (./resourceSearch.ts) are the
// pure halves, this file is the React half, and ./searchExperience.css is the
// look of all three.

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from "react";
import { Clock, History, X } from "lucide-react";
import {
  clearSearchHistory, forgetSearch, normaliseSearchQuery, readSearchHistory, recordSearch,
} from "./searchHistory";
import "./searchExperience.css";

/**
 * The sentence that slides inside a search box. The owner dictated it, and both
 * libraries show the same one ("dono libraries ke box me bilkul ek jaisa bada
 * faded text slide karta rahe").
 */
export const STUDY_SEARCH_SENTENCE =
  "Search your favourite lecture on YouTube or listen songs, while sketching, note taking, mind mapping, brain carding, talking to AI, even while doing a live experiment and while annotating PDFs.";

/**
 * The flash scan's floor: ONE second, even on the fastest connection ("ek
 * second ka ho normally bhale hi kisi ka kitna bhi internet fast ho"). A slow
 * search keeps animating past it, for as long as it really takes.
 */
export const SEARCH_MIN_LOADING_MS = 1000;

/* ── The results page's footer handshake ─────────────────────────────────── */

/**
 * How far a results page must travel before the footer navigation steps away,
 * in CSS pixels. Small enough that the first deliberate scroll is heard, big
 * enough that a stranded pixel (a rubber-band, a reflow) never hides it.
 */
export const SEARCH_FOOTER_SCROLL_AWAY_PX = 28;

/**
 * The decision itself, pure and therefore testable without a DOM: given the
 * page's current answer, where it is now and where it was a moment ago, say
 * whether the footer navigation should be away.
 */
export function nextScrollAwayHidden(
  current: boolean,
  top: number,
  previous: number,
  threshold = SEARCH_FOOTER_SCROLL_AWAY_PX,
): boolean {
  if (top <= threshold) return false;   // at the top: always there
  if (top > previous) return true;      // travelling down: step away
  if (top < previous) return false;     // travelling up: come back
  return current;                       // no movement: keep the answer
}

/**
 * ONE scroll rule for both search result pages (the owner, 2026-10-16):
 *
 *   "search result page par footer dikhe, scroll down kare to hide ho jaye aur
 *    wapas top par aate hi dikh jaye — music library ke search page aur result
 *    page par bhi same behaviour."
 *
 * `enabled` is the caller's "there are results on screen right now". While it
 * is true the hook watches the page's own scroll host and answers:
 *
 *   · scrolled DOWN from a position past the top → hidden;
 *   · scrolled UP → shown again (immediately, so the footer is reachable the
 *     moment the learner reaches for it), and
 *   · at (or within `SEARCH_FOOTER_SCROLL_AWAY_PX` of) the top → shown, which
 *     is the owner's own sentence: back at the top, it is there.
 *
 * The decision is read once per frame — `requestAnimationFrame` where the host
 * has it, a 16 ms timer where it does not — and the listener is removed the
 * moment the results are gone, so the state can never outlive its page.
 *
 * Hand `scrollerRef` to the scrolling element (the library's `.library-body`,
 * the music page's `[data-music-body]`).
 */
export function useScrollAwayHidden(enabled: boolean): {
  scrollerRef: (node: HTMLElement | null) => void;
  hidden: boolean;
} {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled || !scroller) {
      setHidden(false);
      return undefined;
    }
    let previous = scroller.scrollTop;
    let queued = false;
    let cancelQueued: (() => void) | null = null;
    const settle = () => {
      queued = false;
      cancelQueued = null;
      const top = scroller.scrollTop;
      // Both facts are captured BEFORE the update: React may run the updater
      // during a later render, and by then `previous` would already be `top` —
      // the page would be compared with itself and the rule would answer
      // "unchanged" for a real scroll (the assert-eager render `useState`
      // does for an empty queue hid that, which is exactly why it must never
      // read anything mutable).
      const travelledFrom = previous;
      previous = top;
      setHidden((current) => nextScrollAwayHidden(current, top, travelledFrom));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      // One read per frame. `requestAnimationFrame` where it exists (every
      // browser); a plain timer where it does not (a bare DOM used by tests),
      // so the rule can never depend on the host having animation frames.
      if (typeof window.requestAnimationFrame === "function") {
        const id = window.requestAnimationFrame(settle);
        cancelQueued = () => window.cancelAnimationFrame(id);
      } else {
        const id = window.setTimeout(settle, 16);
        cancelQueued = () => window.clearTimeout(id);
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Coming back to a results page that is already scrolled: stand by its
    // position, so the footer never lands on top of a long list.
    setHidden(scroller.scrollTop > SEARCH_FOOTER_SCROLL_AWAY_PX);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (cancelQueued) cancelQueued();
    };
  }, [enabled, scroller]);

  return { scrollerRef: setScroller, hidden };
}

/* ── The sliding sentence ────────────────────────────────────────────────── */

/**
 * The box's placeholder text, at FULL size, sliding left and right for as long
 * as the page is open. It measures itself: a sentence that already fits stays
 * still (there is nothing to read beyond the edge), and one that does not gets
 * exactly its own overflow as the travel distance, so the whole sentence is
 * read on every pass — no clipped words, no shrunken type.
 *
 * The input keeps its own `aria-label`, so this is decorative to a screen
 * reader and is marked as such.
 */
export function SlidingSearchText({ text, className = "" }: { text: string; className?: string }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return undefined;
    const measure = () => {
      const overflow = Math.max(0, Math.round(inner.scrollWidth - host.clientWidth));
      setDistance((current) => (current === overflow ? current : overflow));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);

  // ~22px a second, never faster than an 8s pass: readable at any width.
  const seconds = distance ? Math.max(8, Math.round((distance / 22) * 10) / 10) : 0;
  const style = distance
    ? ({ "--dc-slide-distance": `${distance}px`, animationDuration: `${seconds}s` } as CSSProperties)
    : undefined;

  return (
    <span
      ref={hostRef}
      className={`dc-slide ${className}`.trim()}
      data-dc-slide
      data-dc-slide-active={distance ? "true" : "false"}
      data-dc-slide-distance={distance}
      aria-hidden="true"
    >
      <span ref={innerRef} className="dc-slide__inner" data-dc-slide-inner style={style}>
        {text}
      </span>
    </span>
  );
}

/* ── The flash scan ──────────────────────────────────────────────────────── */

/**
 * The loading state: a bright band sweeping down a column of skeleton rows —
 * the "flash scan". It is the ONLY thing the results area shows while a search
 * is in flight, and it is announced politely for anyone not watching it.
 */
export function SearchFlashScan({
  rows = 4,
  label = "Searching",
  className = "",
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`dc-flashscan ${className}`.trim()}
      data-dc-flash-scan
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="dc-flashscan__beam" aria-hidden="true" data-dc-flash-beam />
      {Array.from({ length: Math.max(1, rows) }, (_, row) => (
        <span className="dc-flashscan__row" aria-hidden="true" key={row} data-dc-flash-row={row}>
          <span className="dc-flashscan__plate" />
          <span className="dc-flashscan__lines">
            <span className="dc-flashscan__line dc-flashscan__line--wide" />
            <span className="dc-flashscan__line" />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ── Recent searches (YouTube's own search page) ─────────────────────────── */

/**
 * One picked action on a pointer-first control: the row answers the press
 * immediately (so a tap can never be lost to the input's blur) and ignores the
 * click that follows it — while a keyboard Enter still works, because it never
 * sends a pointer event at all.
 */
export function usePointerFirstAction() {
  const lastPointer = useRef(0);
  return useCallback((action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      event.preventDefault();
      lastPointer.current = Date.now();
      action();
    },
    onClick: () => {
      if (Date.now() - lastPointer.current < 600) return;
      action();
    },
  }), []);
}

function HistoryRow({
  entry,
  onPick,
  onRemove,
}: {
  entry: string;
  onPick: (entry: string) => void;
  onRemove: (entry: string) => void;
}) {
  const pointerFirst = usePointerFirstAction();
  return (
    <li className="dc-history__row" data-dc-history-entry={entry}>
      <button
        type="button"
        className="dc-history__pick"
        data-dc-history-pick
        {...pointerFirst(() => onPick(entry))}
      >
        <Clock size={15} aria-hidden="true" className="dc-history__glyph" />
        <span className="dc-history__text">{entry}</span>
      </button>
      <button
        type="button"
        className="dc-history__forget"
        data-dc-history-remove
        aria-label={`Remove “${entry}” from recent searches`}
        title="Remove from recent searches"
        {...pointerFirst(() => onRemove(entry))}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The recent searches, in YouTube's own shape: a heading with the clearing
 * action on its right, then one row per query — a clock, the words, and the ✕
 * that forgets just that one.
 */
export function SearchHistoryList({
  entries,
  onPick,
  onRemove,
  onClear,
  heading = "Recent searches",
}: {
  entries: string[];
  onPick: (entry: string) => void;
  onRemove: (entry: string) => void;
  onClear: () => void;
  heading?: string;
}) {
  const pointerFirst = usePointerFirstAction();
  if (!entries.length) return null;
  return (
    <section className="dc-history" data-dc-search-history aria-label={heading}>
      <header className="dc-history__head">
        <History size={13} aria-hidden="true" />
        <span>{heading}</span>
        <button
          type="button"
          className="dc-history__clear"
          data-dc-history-clear
          {...pointerFirst(onClear)}
        >
          Clear all
        </button>
      </header>
      <ul className="dc-history__list">
        {entries.map((entry) => (
          <HistoryRow key={entry} entry={entry} onPick={onPick} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

/* ── The run itself: history + a one-second floor on the loading state ───── */

export type SearchPhase = "idle" | "loading" | "results";

export interface StudySearch<T> {
  phase: SearchPhase;
  /** The query the current results belong to ("" until something is run). */
  query: string;
  results: T | null;
  history: string[];
  /** Run a search: remembers the query, then waits for `run` AND the floor. */
  search: (text: string) => Promise<void>;
  /** Re-run a remembered query (a history row). */
  rerun: (text: string) => Promise<void>;
  forget: (entry: string) => void;
  clearHistory: () => void;
}

/**
 * ONE search, from the box to the results.
 *
 * `run` is the caller's own search (the library matcher, the key-gated YouTube
 * call, or both). Whatever it does, the flash scan stays up for at least
 * `minLoadingMs`, and a search the learner starts while an older one is still
 * in flight always wins — the older answer can never overwrite the newer one.
 */
export function useStudySearch<T>({
  namespace,
  run,
  minLoadingMs = SEARCH_MIN_LOADING_MS,
}: {
  namespace: string;
  run: (query: string) => Promise<T>;
  minLoadingMs?: number;
}): StudySearch<T> {
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T | null>(null);
  const [history, setHistory] = useState<string[]>(() => readSearchHistory(namespace));
  const requestRef = useRef(0);

  // A different namespace means a different list (the panel can host one at a
  // time, but a remount must never show the other library's searches).
  useEffect(() => { setHistory(readSearchHistory(namespace)); }, [namespace]);

  const runRef = useRef(run);
  runRef.current = run;

  const search = useCallback(async (text: string) => {
    const clean = normaliseSearchQuery(text);
    const request = requestRef.current + 1;
    requestRef.current = request;
    if (!clean) {
      setPhase("idle");
      setQuery("");
      setResults(null);
      return;
    }
    setQuery(clean);
    setHistory(recordSearch(namespace, clean));
    setPhase("loading");
    setResults(null);
    const startedAt = Date.now();
    let rows: T | null = null;
    try {
      rows = await runRef.current(clean);
    } catch {
      rows = null;
    }
    const remaining = Math.max(0, minLoadingMs - (Date.now() - startedAt));
    if (remaining) await new Promise<void>((resolve) => { window.setTimeout(resolve, remaining); });
    if (requestRef.current !== request) return;
    setResults(rows);
    setPhase("results");
  }, [namespace, minLoadingMs]);

  const forget = useCallback((entry: string) => {
    setHistory(forgetSearch(namespace, entry));
  }, [namespace]);

  const clearHistory = useCallback(() => {
    setHistory(clearSearchHistory(namespace));
  }, [namespace]);

  return { phase, query, results, history, search, rerun: search, forget, clearHistory };
}
