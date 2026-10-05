/**
 * Revision route table.
 * =====================
 *
 * Migration brief §21: `#/revision` and EVERY existing deep link must keep
 * working after the UI is replaced —
 *
 *   #/revision                      #/revision/session/<id>[ /result]
 *   #/revision/bank                 #/revision/test/play[ /<id>]
 *   #/revision/weak-topics          #/revision/test/play-attempt/<id>
 *   #/revision/progress             #/revision/test/result/<id>
 *   #/revision/profile              #/revision/test/review/<id>
 *   #/revision/ai-settings          #/revision/ai-generate
 *   #/revision/bulk-import          #/revision/customize[ /ai-config]
 *
 * The table is data, not a router library: Digitalcatalyst already navigates by
 * assigning `window.location.hash` (`src/main.tsx`), so the port hooks into that
 * instead of adding a router dependency that would fight the host.
 *
 * Page ids are stable strings, so a bookmark can be mapped to a different
 * component later without invalidating the link (internal redirects are
 * allowed by the brief; dead links are not).
 */

export const REVISION_HASH_PREFIX = "#/revision";

export type RevisionPageId =
  | "dashboard"
  | "decks"
  | "study"
  | "browser"
  | "tags"
  | "stats"
  | "settings"
  | "import-hub"
  | "focus-timer"
  | "bank"
  | "weak-topics"
  | "progress"
  | "profile"
  | "ai-generate"
  | "ai-settings"
  | "bulk-import"
  | "customize"
  | "session"
  | "session-result"
  | "test-play"
  | "test-play-attempt"
  | "test-result"
  | "test-review";

export interface RevisionRoute {
  page: RevisionPageId;
  /** Numeric id parsed out of the path (`/session/12`, `/test/result/9`). */
  id: number | null;
  /** The raw path after `#/revision`. */
  path: string;
  /** The full hash including `#/revision`. */
  hash: string;
}

/** True for every hash this feature owns (`#/revision` and below). */
export function isRevisionHash(hash: string): boolean {
  const clean = (hash || "").split("?")[0];
  return clean === REVISION_HASH_PREFIX || clean.startsWith(`${REVISION_HASH_PREFIX}/`);
}

function parseTrailingId(segment: string | undefined): number | null {
  if (!segment) return null;
  const value = Number(segment);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

/**
 * Parse a hash into a Revision route.
 *
 * Unknown paths fall back to the dashboard (`#/revision`), which is the
 * documented Behaviour of the pre-migration shell: a stale or hand-typed link
 * lands somewhere usable instead of a blank screen.
 */
export function parseRevisionRoute(hash: string): RevisionRoute {
  const clean = (hash || "").split("?")[0] || REVISION_HASH_PREFIX;
  const path = clean.startsWith(REVISION_HASH_PREFIX)
    ? clean.slice(REVISION_HASH_PREFIX.length)
    : clean;
  const segments = path.split("/").filter(Boolean);

  const route = (page: RevisionPageId, id: number | null = null): RevisionRoute => ({
    page,
    id,
    path,
    hash: `${REVISION_HASH_PREFIX}${path}`,
  });

  const [first, second, third] = segments;

  switch (first) {
    case undefined:
      return route("dashboard");
    case "bank":
    case "test-bank":
      return route("bank");
    case "weak-topics":
    case "weak":
      return route("weak-topics");
    case "progress":
      return route("progress");
    case "profile":
      return route("profile");
    case "ai-settings":
      return route("ai-settings");
    case "ai-generate":
      return route("ai-generate");
    case "bulk-import":
      return route("bulk-import");
    case "customize":
      return second === "ai-config" ? route("ai-settings") : route("customize");
    case "session":
      if (third === "result") return route("session-result", parseTrailingId(second));
      return route("session", parseTrailingId(second));
    case "test":
      if (second === "play") return route("test-play", parseTrailingId(third));
      if (second === "play-attempt") return route("test-play-attempt", parseTrailingId(third));
      if (second === "result") return route("test-result", parseTrailingId(third));
      if (second === "review") return route("test-review", parseTrailingId(third));
      return route("bank");
    case "decks":
    case "deck-browser":
      return route("decks", parseTrailingId(second));
    case "browser":
      return route("browser");
    case "tags":
      return route("tags");
    case "stats":
      return route("stats");
    case "settings":
      return route("settings");
    case "import-hub":
    case "import":
      return route("import-hub");
    case "focus-timer":
    case "focus":
      return route("focus-timer");
    case "study":
      return route("study");
    default:
      return route("dashboard");
  }
}

/** Which of the ported Recall in-component views a route opens. */
export type RecallViewId =
  | "dashboard"
  | "deck"
  | "study"
  | "settings"
  | "stats"
  | "browser"
  | "tags"
  | "deck-browser"
  | "import-hub"
  | "focus-timer"
  | "match";

export function recallViewForPage(page: RevisionPageId): RecallViewId | null {
  switch (page) {
    case "dashboard":
      return "dashboard";
    case "decks":
      return "deck-browser";
    case "study":
      return "study";
    case "browser":
      return "browser";
    case "tags":
      return "tags";
    case "stats":
      return "stats";
    case "settings":
      return "settings";
    // Plan & AI is a Digitalcatalyst page, not Recall's settings view. Keeping
    // it out of this bridge prevents Recall's view→hash sync from rewriting
    // /profile to /settings after a click or refresh.
    case "profile":
      return null;
    case "import-hub":
      return "import-hub";
    case "focus-timer":
      return "focus-timer";
    default:
      return null;
  }
}

/**
 * The hash a ported Recall view lives at. Used to mirror the store's in-memory
 * `view` back into the URL, so the browser back button, a refresh and a shared
 * link all land on the screen the learner is looking at.
 */
export function hashForRecallView(view: RecallViewId, deckId?: string | null): string {
  switch (view) {
    case "dashboard":
      return `${REVISION_HASH_PREFIX}`;
    case "deck":
      return deckId ? `${REVISION_HASH_PREFIX}/decks/${deckId}` : `${REVISION_HASH_PREFIX}/decks`;
    case "deck-browser":
      return `${REVISION_HASH_PREFIX}/decks`;
    case "study":
      return `${REVISION_HASH_PREFIX}/study`;
    case "browser":
      return `${REVISION_HASH_PREFIX}/browser`;
    case "tags":
      return `${REVISION_HASH_PREFIX}/tags`;
    case "stats":
      return `${REVISION_HASH_PREFIX}/stats`;
    case "settings":
      return `${REVISION_HASH_PREFIX}/settings`;
    case "import-hub":
      return `${REVISION_HASH_PREFIX}/import-hub`;
    case "focus-timer":
      return `${REVISION_HASH_PREFIX}/focus-timer`;
    case "match":
      return `${REVISION_HASH_PREFIX}/study`;
    default:
      return REVISION_HASH_PREFIX;
  }
}

/** Navigate without adding a duplicate history entry. */
export function goToRevisionHash(hash: string): void {
  if (typeof window === "undefined") return;
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/**
 * Deep links that the rest of the app (notifications, My Day, the store, the
 * Joplin scheduler) already emit. Kept as a table so the notification bridge and
 * the shell cannot drift apart.
 */
export const REVISION_DEEP_LINKS = {
  dashboard: `${REVISION_HASH_PREFIX}`,
  testBank: `${REVISION_HASH_PREFIX}/bank`,
  weakTopics: `${REVISION_HASH_PREFIX}/weak-topics`,
  progress: `${REVISION_HASH_PREFIX}/progress`,
  profile: `${REVISION_HASH_PREFIX}/profile`,
  aiSettings: `${REVISION_HASH_PREFIX}/ai-settings`,
  aiGenerate: `${REVISION_HASH_PREFIX}/ai-generate`,
  bulkImport: `${REVISION_HASH_PREFIX}/bulk-import`,
  customize: `${REVISION_HASH_PREFIX}/customize`,
  /** Ported Recall views, addressable too. */
  decks: `${REVISION_HASH_PREFIX}/decks`,
  browser: `${REVISION_HASH_PREFIX}/browser`,
  tags: `${REVISION_HASH_PREFIX}/tags`,
  stats: `${REVISION_HASH_PREFIX}/stats`,
  settings: `${REVISION_HASH_PREFIX}/settings`,
  focusTimer: `${REVISION_HASH_PREFIX}/focus-timer`,
  importHub: `${REVISION_HASH_PREFIX}/import-hub`,
  study: `${REVISION_HASH_PREFIX}/study`,
  session: (id: number) => `${REVISION_HASH_PREFIX}/session/${id}`,
  sessionResult: (id: number) => `${REVISION_HASH_PREFIX}/session/${id}/result`,
  testPlay: (id?: number) => `${REVISION_HASH_PREFIX}/test/play${id ? `/${id}` : ""}`,
  testPlayAttempt: (id: number) => `${REVISION_HASH_PREFIX}/test/play-attempt/${id}`,
  testResult: (id: number) => `${REVISION_HASH_PREFIX}/test/result/${id}`,
  testReview: (id: number) => `${REVISION_HASH_PREFIX}/test/review/${id}`,
} as const;
