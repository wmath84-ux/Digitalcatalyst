// src/lib/sharedSnapshot.ts
//
// ONE Firestore listener per query, shared by every component that asks for it.
//
// The problem this solves (measured on this repo, 2026-09-08):
//
//   · `siteReviews where status == published` was subscribed TWICE on every
//     app open — once by `CatalogContext` (to build the per-product rating
//     aggregate) and once by `useProductReviews` (Home rail + PDP). Two
//     listeners on the same query = two full downloads of the collection and
//     two billed reads per document, forever, on every device.
//   · `users/{uid}/notifications` was subscribed twice as well — once by the
//     bell badge (`useUnreadNotificationCount`, mounted on nearly every page)
//     and once by the Notifications page itself.
//
// The fix is deliberately small: a ref-counted registry in front of
// `onSnapshot`. The FIRST subscriber opens the listener; everyone else joins
// it and is replayed the latest snapshot synchronously, so a component that
// mounts later paints instantly instead of waiting for a round trip
// (stale-while-revalidate, matching the persistent IndexedDB cache configured
// in firebase.ts). When the last subscriber leaves, the listener is closed
// after a short grace period so a route swap or a StrictMode double-mount
// does not tear down and re-open — and re-bill — the same query.
//
// This is NOT a second cache layer competing with Firestore's own: it holds
// exactly one entry per live query and nothing at all once the last consumer
// unmounts. No global store, no persistence, no eviction policy to tune.

import { onSnapshot, type DocumentData, type DocumentReference, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";

export type SharedDoc = { id: string; data: DocumentData };

type Entry = {
  docs: SharedDoc[] | null;
  error: unknown;
  listeners: Set<(docs: SharedDoc[], error: unknown) => void>;
  stop: (() => void) | null;
  teardown: ReturnType<typeof setTimeout> | null;
};

/** Keep a dropped listener alive briefly so remounts reuse it (see above). */
const TEARDOWN_GRACE_MS = 10_000;

const registry = new Map<string, Entry>();

/**
 * Subscribe to `makeQuery()` under `key`. Identical keys share one listener.
 * The callback fires immediately with the cached snapshot when one exists.
 */
export function subscribeShared(
  key: string,
  makeQuery: () => Query<DocumentData>,
  listener: (docs: SharedDoc[], error: unknown) => void,
): () => void {
  let entry = registry.get(key);
  if (!entry) {
    entry = { docs: null, error: null, listeners: new Set(), stop: null, teardown: null };
    registry.set(key, entry);
  }
  const current = entry;
  if (current.teardown) {
    clearTimeout(current.teardown);
    current.teardown = null;
  }
  current.listeners.add(listener);

  // Replay: a late subscriber gets the last snapshot without a round trip.
  if (current.docs || current.error) listener(current.docs || [], current.error);

  if (!current.stop) {
    try {
      current.stop = onSnapshot(
        makeQuery(),
        (snapshot) => {
          current.docs = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
          current.error = null;
          current.listeners.forEach((fn) => fn(current.docs as SharedDoc[], null));
        },
        (error) => {
          current.error = error;
          current.listeners.forEach((fn) => fn(current.docs || [], error));
        },
      );
    } catch (error) {
      current.error = error;
      current.listeners.forEach((fn) => fn([], error));
    }
  }

  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0 || current.teardown) return;
    current.teardown = setTimeout(() => {
      if (current.listeners.size > 0) return;
      current.stop?.();
      registry.delete(key);
    }, TEARDOWN_GRACE_MS);
  };
}

// ── Single documents ────────────────────────────────────────────────────────
// The same duplication exists on plain documents: `users/{uid}` was watched by
// AuthContext, CommerceContext AND useCourseAccess at the same time, and
// `users/{uid}/subscription/current` by every screen that resolves access.
// Same registry, same guarantees.

type DocEntry = {
  data: DocumentData | null;
  exists: boolean;
  error: unknown;
  seen: boolean;
  listeners: Set<(data: DocumentData | null, exists: boolean, error: unknown) => void>;
  stop: (() => void) | null;
  teardown: ReturnType<typeof setTimeout> | null;
};

const docRegistry = new Map<string, DocEntry>();

/** Subscribe to a single document, sharing one listener per `key`. */
export function subscribeSharedDoc(
  key: string,
  makeRef: () => DocumentReference<DocumentData>,
  listener: (data: DocumentData | null, exists: boolean, error: unknown) => void,
): () => void {
  let entry = docRegistry.get(key);
  if (!entry) {
    entry = { data: null, exists: false, error: null, seen: false, listeners: new Set(), stop: null, teardown: null };
    docRegistry.set(key, entry);
  }
  const current = entry;
  if (current.teardown) {
    clearTimeout(current.teardown);
    current.teardown = null;
  }
  current.listeners.add(listener);
  if (current.seen || current.error) listener(current.data, current.exists, current.error);

  if (!current.stop) {
    try {
      current.stop = onSnapshot(
        makeRef(),
        (snapshot) => {
          current.data = snapshot.data() ?? null;
          current.exists = snapshot.exists();
          current.error = null;
          current.seen = true;
          current.listeners.forEach((fn) => fn(current.data, current.exists, null));
        },
        (error) => {
          current.error = error;
          current.listeners.forEach((fn) => fn(current.data, current.exists, error));
        },
      );
    } catch (error) {
      current.error = error;
      current.listeners.forEach((fn) => fn(null, false, error));
    }
  }

  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0 || current.teardown) return;
    current.teardown = setTimeout(() => {
      if (current.listeners.size > 0) return;
      current.stop?.();
      docRegistry.delete(key);
    }, TEARDOWN_GRACE_MS);
  };
}

/** React binding for {@link subscribeShared}. */export function useSharedSnapshot(
  key: string | null,
  makeQuery: () => Query<DocumentData>,
): { docs: SharedDoc[]; error: unknown; loading: boolean } {
  const [state, setState] = useState<{ docs: SharedDoc[]; error: unknown; loading: boolean }>({
    docs: [],
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!key) {
      setState({ docs: [], error: null, loading: false });
      return undefined;
    }
    setState((previous) => (previous.loading ? previous : { ...previous, loading: true }));
    return subscribeShared(key, makeQuery, (docs, error) => {
      setState({ docs, error, loading: false });
    });
    // `makeQuery` is intentionally not a dependency: `key` is the identity of
    // the query, exactly as it is for the shared registry. Re-running on a new
    // inline closure every render is what created duplicate listeners before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
