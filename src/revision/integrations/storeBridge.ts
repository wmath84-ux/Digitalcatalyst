/**
 * Bridge between the EXISTING Digitalcatalyst revision engine and the ported
 * Recall store.
 * ==================================================================
 *
 * Two directions, both debounced and both idempotent:
 *
 *   legacy → ported
 *     `saveDb()` (which every existing service calls) dispatches
 *     `revision-db-changed`. A Daily Test that just finished, an AI generation
 *     saved to the Test Bank or a bulk import therefore shows up in the ported
 *     deck browser without a reload. The refresh is skipped while the learner is
 *     mid-review so an in-flight card can never be replaced underneath the
 *     study screen, and it is coalesced so a burst of writes costs one refresh.
 *
 *   ported → legacy
 *     `mirrorReviewsToLegacy()` replays the unified review log into
 *     `revisionItems`, so Weak Topics, Progress and the Test Bank keep counting
 *     the same reviews the ported study screen records (§18). Applied review ids
 *     are remembered, so a repeated event cannot double-count.
 *
 * The bridge never dispatches `revision-db-changed` itself, which is what keeps
 * the loop finite.
 */

import { writeKv, KV_RECALL } from "../engine/localDb";
import { mirrorReviewsToLegacy } from "../engine/legacyMirror";
import { refreshDomainFromLegacy } from "./dcxRepository";
import { projectUnifiedToRecall } from "./recallAdapter";
import { useRecallStore } from "../recall/stores/recall-store";

export interface RevisionStoreBridge {
  start: () => void;
  dispose: () => void;
}

export function createRevisionStoreBridge(uid: string): RevisionStoreBridge {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let running = false;

  function scheduleRefresh(delayMs = 400): void {
    if (disposed) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, delayMs);
  }

  async function refresh(): Promise<void> {
    if (disposed || running) return;
    // Never swap the card list out from under a review in progress.
    const view = useRecallStore.getState().view;
    if (view === "study" || view === "match") {
      scheduleRefresh(2000);
      return;
    }
    running = true;
    try {
      const unified = await refreshDomainFromLegacy(uid);
      const recall = projectUnifiedToRecall(unified);
      await writeKv(KV_RECALL, recall);
      useRecallStore.setState({
        decks: recall.decks,
        cards: recall.cards,
        reviewLogs: recall.reviewLogs,
        studySessions: recall.studySessions,
      });
      await mirrorReviewsToLegacy(uid, unified);
    } catch (error) {
      console.warn("[revision] store refresh failed", error);
    } finally {
      running = false;
    }
  }

  function onLegacyChanged(event: Event): void {
    const detail = (event as CustomEvent<{ uid?: string }>).detail;
    if (detail?.uid && detail.uid !== uid) return;
    scheduleRefresh();
  }

  return {
    start() {
      if (typeof window === "undefined") return;
      window.addEventListener("revision-db-changed", onLegacyChanged);
      // One refresh at boot so a legacy write that happened before the shell
      // mounted (the Android resume path) is still picked up.
      scheduleRefresh(0);
    },
    dispose() {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("revision-db-changed", onLegacyChanged);
      }
    },
  };
}

/**
 * Force a legacy→ported refresh (used after the AI generator, the bulk importer
 * and the Daily Test player write to the legacy document directly).
 */
export async function refreshRevisionStoreFromLegacy(uid: string): Promise<void> {
  const unified = await refreshDomainFromLegacy(uid);
  const recall = projectUnifiedToRecall(unified);
  await writeKv(KV_RECALL, recall);
  useRecallStore.setState({
    decks: recall.decks,
    cards: recall.cards,
    reviewLogs: recall.reviewLogs,
    studySessions: recall.studySessions,
  });
}
