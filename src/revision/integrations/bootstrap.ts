/**
 * Revision feature bootstrap.
 * ==========================
 *
 * One function that brings the ported Recall UI online inside Digitalcatalyst,
 * in the order the migration brief requires:
 *
 *   1. register the Digitalcatalyst repository  (§13 — one local-first store)
 *   2. run the versioned, backed-up migration   (§12 — never destructive)
 *   3. deep-link + hydrate from Firestore        (§14 — existing cloud contract)
 *   4. merge anything the EXISTING engine created since the last visit
 *      (Daily Test, AI generation, bulk import all still write the legacy
 *      document)                                  (§18 — keep every surface)
 *   5. keep the two directions in sync while the feature is mounted:
 *        legacy `revision-db-changed` → refresh the ported UI's data
 *        ported review               → mirror into the legacy revision items
 *   6. arm the daily due reminder through the EXISTING notification stack (§20)
 *
 * Everything here is idempotent: the shell calls it on every mount, and a
 * second call is a no-op that only re-attaches listeners.
 */

import { createRevisionStoreBridge, type RevisionStoreBridge } from "./storeBridge";
import { registerDigitalcatalystRepository, initializeRevisionDomain, getDomainUid } from "./dcxRepository";
import { scheduleDailyDueReminder } from "./notificationBridge";
import { countDueToday } from "../engine/analytics";

export interface RevisionBootstrapHandle {
  uid: string;
  bridge: RevisionStoreBridge;
  dispose: () => void;
}

let active: RevisionBootstrapHandle | null = null;

/** Bring the feature online for `uid`. Safe to call more than once. */
export async function bootstrapRevisionFeature(uid: string): Promise<RevisionBootstrapHandle> {
  if (active && active.uid === uid) return active;
  active?.dispose();

  const owner = uid || "guest";

  // 1 + 2 + 3 + 4 — repository, migration, cloud hydration, legacy projection.
  registerDigitalcatalystRepository(owner);
  const unified = await initializeRevisionDomain(owner);

  // 5 — live synchronisation between the legacy engine and the ported UI.
  const bridge = createRevisionStoreBridge(owner);
  bridge.start();

  // 6 — reminders flow into the app's existing notification stack.
  if (unified.settings.study.notificationsEnabled) {
    void scheduleDailyDueReminder({
      uid: owner === "guest" ? null : owner,
      dueCount: countDueToday(unified.cards),
    }).catch((error) => console.warn("[revision] reminder scheduling skipped", error));
  }

  const handle: RevisionBootstrapHandle = {
    uid: owner,
    bridge,
    dispose: () => {
      bridge.dispose();
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}

export function disposeRevisionFeature(): void {
  active?.dispose();
  active = null;
}

export function currentRevisionUid(): string {
  return active?.uid ?? getDomainUid();
}
