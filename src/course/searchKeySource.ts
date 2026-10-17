// src/course/searchKeySource.ts
//
// "KEY KAHAN SE AAYEGI?" — the learner's own switch, for BOTH search engines.
//
// The owner wanted two things at once:
//
//   1. a CHOICE, right in Settings: "meri apni key" ya "master ki key";
//   2. the background rule to keep running: the learner's own key first, and
//      the moment its quota is gone the MASTER's key takes over on its own —
//      no interruption, the search simply keeps working.
//
// So this module stores the CHOICE (per engine, per account, then per
// device), and each engine module (musicSearch.ts) reads it
// and does the handover.
//
// The choice is a PREFERENCE, never a trap: whichever way it is set, the
// search still finds a working key — the other one is used when the chosen
// one is not there at all.

/** Which key a search should burn. */
export type SearchKeySource = "mine" | "master";

/** The two engines that have a key to choose from. */
export type SearchEngineId = "youtube";

/** This browser's slot for the choice — one per engine. */
const SOURCE_STORAGE: Record<SearchEngineId, string> = {
  youtube: "dc.music.youtubeKey.source",
};

/** The per-account slots — "this learner's own choice". */
const SOURCE_USER_PREFIX: Record<SearchEngineId, string> = {
  youtube: "dc.music.youtubeKey.source.u.",
};

/** Fired after the choice is written, so a live page re-reads it. */
export const SEARCH_KEY_SOURCE_EVENT = "dc:search-key-source";

/** The slot the choice came from — the account's, else this device's. */
export const searchKeySourceSlot = (engine: SearchEngineId, uid?: string | null): string => {
  const user = typeof uid === "string" ? uid.trim() : "";
  if (user) return `${SOURCE_USER_PREFIX[engine]}${user}`;
  return SOURCE_STORAGE[engine];
};

const readSlot = (slot: string): string => {
  try {
    return String(globalThis.window?.localStorage.getItem(slot) || "").trim();
  } catch {
    return "";
  }
};

const writeSlot = (slot: string, value: string): boolean => {
  try {
    const store = globalThis.window?.localStorage;
    if (!store) return false;
    if (value) store.setItem(slot, value);
    else store.removeItem(slot);
    return true;
  } catch {
    return false;
  }
};

/**
 * The choice in effect. "mine" is the default — the learner's own key first,
 * the owner's as the background fallback. Anything unrecognised is "mine":
 * the app must never guess "master" and spend the school's quota by surprise.
 */
export function readSearchKeySource(engine: SearchEngineId, uid?: string | null): SearchKeySource {
  const user = typeof uid === "string" ? uid.trim() : "";
  if (user) {
    const own = readSlot(searchKeySourceSlot(engine, user));
    if (own === "master" || own === "mine") return own;
  }
  const device = readSlot(SOURCE_STORAGE[engine]);
  if (device === "master" || device === "mine") return device;
  return "mine";
}

/** Store the choice. */
export function writeSearchKeySource(
  engine: SearchEngineId,
  source: SearchKeySource,
  uid?: string | null,
): boolean {
  const value = source === "master" ? "master" : "mine";
  return writeSlot(searchKeySourceSlot(engine, uid), value);
}

/** Put the choice back to the default ("mine"). */
export function clearSearchKeySource(engine: SearchEngineId, uid?: string | null): void {
  writeSlot(searchKeySourceSlot(engine, uid), "");
}

/** Tell every open page that the choice changed. */
export function announceSearchKeySource(): void {
  const win = globalThis.window as (Window & typeof globalThis) | undefined;
  if (!win?.dispatchEvent) return;
  try {
    const EventCtor = win.Event;
    if (!EventCtor) return;
    win.dispatchEvent(new EventCtor(SEARCH_KEY_SOURCE_EVENT));
  } catch {
    // A host without events simply does not need them.
  }
}

/** Watch for the choice changing — here or in another tab. */
export function subscribeSearchKeySource(listener: () => void): () => void {
  const target = globalThis.window;
  if (!target?.addEventListener) return () => undefined;
  target.addEventListener("storage", listener);
  target.addEventListener(SEARCH_KEY_SOURCE_EVENT, listener);
  return () => {
    target.removeEventListener("storage", listener);
    target.removeEventListener(SEARCH_KEY_SOURCE_EVENT, listener);
  };
}
