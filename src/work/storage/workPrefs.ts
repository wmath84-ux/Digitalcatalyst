// src/work/storage/workPrefs.ts
//
// WORK MODE's device preferences — ONE module, ONE pattern.
//
// Owner brief (2026-10-14):
//
//   "Feature pura storage based hoga, sab storage mein save hoga, kuchh bhi
//    cloud per nahin."
//   "User ke pass setting mein option bhi hona chahiye ki vah app open hote hi
//    yah dekhna chahta hai ki nahin."
//   "Default last opened page dikhega."
//
// Every value here is a device preference, so none of it goes through the
// account preference API (`/api/account/preferences` + `PreferenceKey`) that
// src/settings/useUserPreferences.ts owns — that path writes Firestore, which
// the brief excludes. The pattern is the one this repo already proved for a
// device-only UI preference: `src/utils/footerNavigationStyle.ts`
// (localStorage + a change event + `useSyncExternalStore`, defensive reads).
//
// Rules honoured by every key below:
//
//   · a missing key, a truncated value, a hand-edited string or a denied
//     storage (private mode) always reads as the documented DEFAULT — Work must
//     never fail to open because of its own storage;
//   · writes never throw;
//   · each hook re-renders on our own change event AND on the cross-tab
//     `storage` event, so two tabs of the app agree.

import { useSyncExternalStore } from "react";
import { WORK_PAGE_ORDER, isWorkPageId, type WorkPageId } from "../workPages";

/** What the app does on a cold start. */
export type WorkLaunchChoice = "ask" | "home" | "work";
/** Work's own appearance. The rest of the app is light-only by owner decision
 *  (src/lib/theme.ts) — this theme is scoped to `[data-work-shell]` and never
 *  touches `html[data-theme]`. */
export type WorkTheme = "light" | "dark";

const CHANGE_EVENT = "dc:work-prefs-change";

export const WORK_KEYS = {
  launch: "dc.work.launch.v1",
  theme: "dc.work.theme.v1",
  lastPage: "dc.work.lastPage.v1",
  history: "dc.work.history.v1",
  myDayFilter: "dc.work.myday.filter.v1",
} as const;

/** How many destinations the "previous page" history keeps. */
export const WORK_HISTORY_MAX = 8;

export const WORK_LAUNCH_DEFAULT: WorkLaunchChoice = "ask";
export const WORK_THEME_DEFAULT: WorkTheme = "light";
/** The page Work opens on when nothing is remembered yet. */
export const WORK_FIRST_PAGE: WorkPageId = "myday";

export const WORK_MYDAY_FILTERS = ["all", "task", "scheduled", "reminder", "note", "done"] as const;
export type WorkMyDayFilter = (typeof WORK_MYDAY_FILTERS)[number];

/* ── storage primitives (never throw) ───────────────────────────────────── */

const safeGet = (key: string): string | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): void => {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — the in-memory default still applies this visit */
  }
};

const emit = (): void => {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new window.Event(CHANGE_EVENT));
  } catch {
    /* no window, no listeners */
  }
};

/* ── launch choice (the Settings option, brief 3) ───────────────────────── */

const normalizeLaunch = (value: string | null | undefined): WorkLaunchChoice =>
  value === "home" || value === "work" || value === "ask" ? value : WORK_LAUNCH_DEFAULT;

export const getWorkLaunchChoice = (): WorkLaunchChoice => normalizeLaunch(safeGet(WORK_KEYS.launch));

export const setWorkLaunchChoice = (choice: WorkLaunchChoice): void => {
  safeSet(WORK_KEYS.launch, normalizeLaunch(choice));
  emit();
};

/* ── theme (brief 16: light aur dark donon) ─────────────────────────────── */

const normalizeTheme = (value: string | null | undefined): WorkTheme =>
  value === "dark" ? "dark" : WORK_THEME_DEFAULT;

export const getWorkTheme = (): WorkTheme => normalizeTheme(safeGet(WORK_KEYS.theme));

export const setWorkTheme = (theme: WorkTheme): void => {
  safeSet(WORK_KEYS.theme, normalizeTheme(theme));
  emit();
};

/** Flip light ⇄ dark — the header AREA's sun/moon button. */
export const toggleWorkTheme = (): WorkTheme => {
  const next: WorkTheme = getWorkTheme() === "dark" ? "light" : "dark";
  setWorkTheme(next);
  return next;
};

/* ── the remembered page (brief 7: "default last opened page dikhega") ──── */

const normalizePage = (value: string | null | undefined): WorkPageId =>
  isWorkPageId(value) ? (value as WorkPageId) : WORK_FIRST_PAGE;

export const getWorkLastPage = (): WorkPageId => normalizePage(safeGet(WORK_KEYS.lastPage));

export const setWorkLastPage = (page: WorkPageId): void => {
  if (!isWorkPageId(page)) return;
  safeSet(WORK_KEYS.lastPage, page);
  emit();
};

/* ── history: what the TOP slot shows the first time the deck is split ──── */

let cachedHistoryRaw: string | null | undefined;
let cachedHistory: WorkPageId[] = [];

/** Snapshot identity is stable until the underlying storage value changes —
 *  `useSyncExternalStore` requires exactly this to avoid an update loop. */
export const getWorkHistory = (): WorkPageId[] => {
  const raw = safeGet(WORK_KEYS.history);
  if (raw === cachedHistoryRaw) return cachedHistory;
  cachedHistoryRaw = raw;
  try {
    if (!raw) { cachedHistory = []; return cachedHistory; }
    const parsed = JSON.parse(raw) as unknown;
    cachedHistory = Array.isArray(parsed)
      ? parsed.filter(isWorkPageId).slice(0, WORK_HISTORY_MAX)
      : [];
    return cachedHistory;
  } catch {
    cachedHistory = [];
    return cachedHistory;
  }
};

/**
 * Push a destination onto the front of the history. Newest first, de-duplicated,
 * capped — so `history[0]` is the page on screen and `history[1]` is the one
 * the learner was on before it, which is exactly what the deck's top slot takes
 * when the divider is pulled down.
 */
export const pushWorkHistory = (page: WorkPageId): WorkPageId[] => {
  if (!isWorkPageId(page)) return getWorkHistory();
  const next = [page, ...getWorkHistory().filter((entry) => entry !== page)].slice(0, WORK_HISTORY_MAX);
  try {
    safeSet(WORK_KEYS.history, JSON.stringify(next));
  } catch {
    /* a full quota costs the convenience, never the page */
  }
  emit();
  return next;
};

/* ── My Day's filter rail (brief 9) ─────────────────────────────────────── */

const normalizeFilter = (value: string | null | undefined): WorkMyDayFilter =>
  (WORK_MYDAY_FILTERS as readonly string[]).includes(String(value))
    ? (value as WorkMyDayFilter)
    : "all";

export const getWorkMyDayFilter = (): WorkMyDayFilter => normalizeFilter(safeGet(WORK_KEYS.myDayFilter));

export const setWorkMyDayFilter = (filter: WorkMyDayFilter): void => {
  safeSet(WORK_KEYS.myDayFilter, normalizeFilter(filter));
  emit();
};

/* ── hooks (useSyncExternalStore, the repo's preference idiom) ──────────── */

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const useWorkLaunchChoice = (): WorkLaunchChoice =>
  useSyncExternalStore(subscribe, getWorkLaunchChoice, () => WORK_LAUNCH_DEFAULT);

export const useWorkTheme = (): WorkTheme =>
  useSyncExternalStore(subscribe, getWorkTheme, () => WORK_THEME_DEFAULT);

export const useWorkLastPage = (): WorkPageId =>
  useSyncExternalStore(subscribe, getWorkLastPage, () => WORK_FIRST_PAGE);

export const useWorkHistory = (): WorkPageId[] =>
  useSyncExternalStore(subscribe, getWorkHistory, () => [] as WorkPageId[]);

export const useWorkMyDayFilter = (): WorkMyDayFilter =>
  useSyncExternalStore(subscribe, getWorkMyDayFilter, () => "all");

/** Every page id, re-exported so callers never import two modules for one list. */
export { WORK_PAGE_ORDER };
