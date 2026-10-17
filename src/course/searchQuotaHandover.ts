// src/course/searchQuotaHandover.ts
//
// "QUOTA KHTAM HO GAYI — AB MASTER KI KEY SE CHAL RAHA HAI" — and the day
// after, the learner's OWN key is back on its own.
//
// ── The rule ───────────────────────────────────────────────────────────────
// The learner's own key (YouTube Data API / Google Custom Search) has a DAILY
// quota. Google's free daily budget comes back EVERY DAY, at midnight
// Pacific Time. So the handover to the master's key must not be permanent:
// it is a pause, not a switch.
//
// This module is that pause. It remembers WHEN the learner's own quota ran
// out — the moment Google's next daily reset — and the two engine modules
// read it before every search:
//
//   · the own quota is spent and the reset has NOT come yet → the master's
//     configuration takes over (silently, the search never breaks);
//   · the reset HAS come (or the learner swapped in a new key) → the memory
//     is dropped and the learner's OWN configuration is used again, with
//     nothing to press, nothing to notice.
//
// The reset moment is computed in Google's own timezone (America/Los_Angeles),
// because that is where the daily budget actually rolls over.

/** The two engines that burn a daily quota. */
export type QuotaEngine = "youtube" | "google";

/** Google's own reset timezone — the daily budget rolls over there. */
export const QUOTA_RESET_TIME_ZONE = "America/Los_Angeles";

/** This browser's slot — "my own quota is gone until …". */
const SLOT: Record<QuotaEngine, string> = {
  youtube: "dc.music.youtubeKey.quota",
  google: "dc.google.searchKey.quota",
};

/** The per-account slots — "this learner's own quota is gone until …". */
const USER_PREFIX: Record<QuotaEngine, string> = {
  youtube: "dc.music.youtubeKey.quota.u.",
  google: "dc.google.searchKey.quota.u.",
};

/** The slot the memory lives in — the account's, else this device's. */
export const quotaHandoverSlot = (engine: QuotaEngine, uid?: string | null): string => {
  const user = typeof uid === "string" ? uid.trim() : "";
  return user ? `${USER_PREFIX[engine]}${user}` : SLOT[engine];
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

/** The Pacific wall-clock parts of an instant. */
const pacificParts = (at: number): {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
} => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: QUOTA_RESET_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(at));
  const value = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    const parsed = Number(found?.value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
};

/**
 * The UTC instant of the Pacific midnight that starts the given Pacific day.
 * The offset is read from the zone itself, so a daylight-saving change is
 * followed instead of guessed.
 */
const pacificMidnightUtc = (at: number): number => {
  const parts = pacificParts(at);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - Math.floor(at / 1000) * 1000;
  return Date.UTC(parts.year, parts.month - 1, parts.day) - offset;
};

/**
 * The next moment the daily quota comes back — the next midnight in Google's
 * own reset timezone. Never throws: a host without a full ICU falls back to
 * a plain 24-hour window, which keeps the handover a pause and never a
 * permanent switch.
 */
export function dailyQuotaResetAt(now: number = Date.now()): number {
  try {
    let midnight = pacificMidnightUtc(now);
    if (midnight <= now) {
      // The next Pacific day — walk a day forward and read the zone again.
      midnight = pacificMidnightUtc(now + 26 * 60 * 60 * 1000);
      while (midnight <= now) midnight = pacificMidnightUtc(midnight + 26 * 60 * 60 * 1000);
    }
    return midnight;
  } catch {
    return now + 24 * 60 * 60 * 1000;
  }
}

/**
 * Remember that the learner's own quota is gone, until the next daily reset.
 * Returns the reset moment, so a caller can say when the own key is back.
 */
export function markOwnQuotaExhausted(
  engine: QuotaEngine,
  uid?: string | null,
  now: number = Date.now(),
): number {
  const reset = dailyQuotaResetAt(now);
  writeSlot(quotaHandoverSlot(engine, uid), String(reset));
  return reset;
}

/**
 * Is the learner's own quota still known to be gone?
 *
 * The answer is FALSE the moment the daily reset has passed — the memory is
 * dropped right there, so the next search uses the learner's own
 * configuration again, on its own, with nothing to press.
 */
export function ownQuotaExhausted(
  engine: QuotaEngine,
  uid?: string | null,
  now: number = Date.now(),
): boolean {
  const raw = Number(readSlot(quotaHandoverSlot(engine, uid)));
  if (!Number.isFinite(raw) || raw <= 0) return false;
  if (raw > now) return true;
  // The reset has come: the quota is back — forget the pause.
  clearOwnQuotaExhausted(engine, uid);
  return false;
}

/** Forget the pause (a new key, a removed key, or a reset that already came). */
export function clearOwnQuotaExhausted(engine: QuotaEngine, uid?: string | null): void {
  writeSlot(quotaHandoverSlot(engine, uid), "");
}

/** When the learner's own quota comes back — 0 when nothing is paused. */
export function ownQuotaResetAt(engine: QuotaEngine, uid?: string | null): number {
  const raw = Number(readSlot(quotaHandoverSlot(engine, uid)));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
