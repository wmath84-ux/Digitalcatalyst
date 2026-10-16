// src/course/searchHistory.ts
//
// THE LEARNER'S RECENT SEARCHES — the YouTube search page's own little store.
//
// Owner brief (2026-10-16):
//
//   "uss search page per Jaise YouTube mein pahle search kiye Gaye result
//    history dekhte hain directly vaise hi uss search page per bhi dikhe exact
//    design jaisa YouTube search page hai."
//
// So a search the learner has RUN is remembered by name, newest first, and the
// search page shows that list the way YouTube does — each entry tappable, each
// entry removable, and a "Clear all" for the whole list.
//
// It is device-local and per NAMESPACE (the course library's search and the
// Music library's search each keep their own list), it is bounded (12), and it
// never throws: private-mode storage is a reason to show no history, never a
// reason to break a page.

/** How many recent searches a namespace keeps. */
export const SEARCH_HISTORY_LIMIT = 12;

/** The storage key for one namespace's list. */
export const searchHistoryKey = (namespace: string): string => `dc.searchHistory.v1.${namespace}`;

/** Queries are stored the way a person typed them: trimmed, single-spaced. */
export const normaliseSearchQuery = (query: string): string =>
  String(query ?? "").replace(/\s+/g, " ").trim();

const sameQuery = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The stored list, oldest problems repaired (dedupe, cap, drop blanks). */
export const readSearchHistory = (namespace: string): string[] => {
  try {
    const raw = window.localStorage.getItem(searchHistoryKey(namespace));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const entry of parsed) {
      const clean = normaliseSearchQuery(typeof entry === "string" ? entry : "");
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      rows.push(clean);
      if (rows.length >= SEARCH_HISTORY_LIMIT) break;
    }
    return rows;
  } catch {
    return [];
  }
};

const writeSearchHistory = (namespace: string, rows: string[]): string[] => {
  try {
    if (rows.length) window.localStorage.setItem(searchHistoryKey(namespace), JSON.stringify(rows));
    else window.localStorage.removeItem(searchHistoryKey(namespace));
  } catch {
    /* No storage (private mode, a locked-down shell): the page still works. */
  }
  return rows;
};

/**
 * Remember a query that was actually RUN — the newest one first, an older copy
 * of the same query moved up rather than duplicated (exactly how YouTube's own
 * history behaves).
 */
export const recordSearch = (namespace: string, query: string): string[] => {
  const clean = normaliseSearchQuery(query);
  if (!clean) return readSearchHistory(namespace);
  const next = [clean, ...readSearchHistory(namespace).filter((entry) => !sameQuery(entry, clean))];
  return writeSearchHistory(namespace, next.slice(0, SEARCH_HISTORY_LIMIT));
};

/** Forget ONE entry (the row's own ✕). */
export const forgetSearch = (namespace: string, query: string): string[] =>
  writeSearchHistory(
    namespace,
    readSearchHistory(namespace).filter((entry) => !sameQuery(entry, normaliseSearchQuery(query))),
  );

/** Forget the whole list ("Clear all"). */
export const clearSearchHistory = (namespace: string): string[] =>
  writeSearchHistory(namespace, []);
