// Device-local delivery gate. The account document remains the authority; this
// only prevents foreground/native alarms bypassing a saved push opt-out.
let currentUid: string | null = null;
let pushEnabled = false;
let generation = 0;

export function setDeviceNotificationPreference(uid: string | null, enabled: boolean) {
  const next = Boolean(uid) && enabled;
  if (currentUid !== uid || pushEnabled !== next) ++generation;
  currentUid = uid;
  pushEnabled = next;
}

export function canShowDevicePush(uid?: string) {
  return Boolean(currentUid) && pushEnabled && (!uid || uid === currentUid);
}

/** An async display must keep the same opted-in session, not just observe
 * another account's true flag after awaiting an OS/browser API. */
export function captureDevicePushGate(uid?: string | null): () => boolean {
  const captured = generation;
  const owner = uid === undefined ? currentUid : uid;
  return () => captured === generation && Boolean(owner) && canShowDevicePush(owner || undefined);
}
