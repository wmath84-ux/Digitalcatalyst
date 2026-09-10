export interface InboxTarget {
  type?: string;
  productId?: string | number;
  section?: string;
  itemId?: string;
  listType?: string;
  articleId?: string;
  expired?: boolean;
}

export const INBOX_FRESH_MS: number;
export const INBOX_GRACE_MS: number;
export const INBOX_MAX_PER_PASS: number;
export const INBOX_SEEN_RETENTION_MS: number;
export const INBOX_LOCALLY_SCHEDULED_CATEGORIES: Set<string>;
export const INBOX_BELL_HIDDEN_CATEGORIES: Set<string>;

/** A `users/{uid}/notifications` document as handed over by the shared
 *  snapshot listener (Firestore Timestamps are normalized by the bridge). */
export interface InboxNotificationDoc {
  id: string;
  data: {
    title?: string;
    body?: string;
    category?: string;
    read?: boolean;
    createdAt?: unknown;
    target?: InboxTarget | null;
  } | null;
}

/** One alert the bridge should render on this device. */
export interface InboxNotificationItem {
  key: string;
  docId: string;
  category: string;
  title: string;
  body: string;
  /** `/...` hash URL the tap lands on. */
  url: string;
  /** Notification tag — aligned with the server's tag where derivable. */
  tag: string;
  createdAt: number;
}

export interface InboxCollectOptions {
  freshMs?: number;
  graceMs?: number;
  maxPerPass?: number;
  skipCategories?: Set<string>;
}

export function normalizeCreatedAtMs(value: unknown, fallbackMs?: number): number | null;

export function deriveInboxTag(category: string, target: InboxTarget | null | undefined, docId: string): string;

export function resolveInboxUrl(category: string, target: InboxTarget | null | undefined): string;

export function collectUnsurfacedInboxNotifications(
  docs: InboxNotificationDoc[],
  nowMs: number,
  seen: Record<string, number> | undefined,
  options?: InboxCollectOptions,
): InboxNotificationItem[];

export function pruneSeenMap(
  seen: Record<string, number> | undefined,
  nowMs: number,
  retentionMs?: number,
): Record<string, number>;
