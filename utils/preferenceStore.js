import { DEFAULT_PREFERENCES, normalizeUserPreferences, validatePreferencePatch } from "./userPreferences.js";

/** Framework-independent state machine shared by all mounted Settings consumers.
 * Writes are per field; snapshots cannot overwrite in-flight intent, stale
 * revisions cannot revert a confirmed write, and a failed write rolls back. */
export function createPreferenceStore(adapter) {
  let confirmed = { ...DEFAULT_PREFERENCES };
  let revision = -1;
  let ready = false;
  let syncError = "";
  let writeError = "";
  let failed = null;
  let lastSavedKey = null;
  let capabilities = null;
  const pending = new Map();
  const listeners = new Set();
  let stop = null;
  let generation = 0;
  let teardown = null;
  let state;
  const publish = () => {
    const preferences = { ...confirmed };
    for (const [key, intent] of pending) preferences[key] = intent.value;
    state = Object.freeze({ preferences, ready, loading: !ready && !syncError,
      savingKeys: [...pending.keys()], error: writeError || syncError, syncError,
      failed, lastSavedKey, capabilities });
    for (const listener of listeners) listener();
  };
  publish();

  const receive = (result, error) => {
    if (error) {
      syncError = error instanceof Error ? error.message : "Settings could not be loaded. Retry to reconnect.";
      publish();
      return;
    }
    if (!result) return;
    const nextRevision = Number.isFinite(Number(result.revision)) ? Number(result.revision) : 0;
    if (nextRevision < revision) return;
    revision = nextRevision;
    confirmed = normalizeUserPreferences(result.preferences, { requireActivityConsent: false });
    ready = true;
    syncError = "";
    if (result.capabilities) capabilities = result.capabilities;
    if (failed && confirmed[failed.key] === failed.value) {
      lastSavedKey = failed.key;
      failed = null;
      writeError = "";
    }
    publish();
  };

  const reload = async () => {
    const currentGeneration = generation;
    syncError = "";
    publish();
    try {
      const result = await adapter.read();
      if (currentGeneration === generation) receive(result);
      return true;
    } catch (error) {
      if (currentGeneration === generation) receive(null, error);
      return false;
    }
  };

  const setPreference = async (key, value) => {
    validatePreferencePatch({ [key]: value });
    if (!ready || pending.has(key)) return false;
    if (confirmed[key] === value) return true;
    const currentGeneration = generation;
    const startedRevision = revision;
    const intent = { value };
    pending.set(key, intent);
    writeError = "";
    failed = null;
    lastSavedKey = null;
    publish();
    let ok = false;
    try {
      const result = await adapter.write(key, value);
      if (currentGeneration !== generation) return false;
      receive(result);
      ok = confirmed[key] === value;
      if (!ok) throw new Error("The setting changed on another device. Check its latest value and try again.");
      lastSavedKey = key;
    } catch (error) {
      if (currentGeneration !== generation) return false;
      // The response can be lost after a server commit. An authoritative newer
      // snapshot is confirmation; do not falsely roll back that successful save.
      ok = revision > startedRevision && confirmed[key] === value;
      if (ok) lastSavedKey = key;
      else {
        writeError = error instanceof Error ? error.message : "The change could not be saved. Try again.";
        failed = { key, value };
      }
    } finally {
      if (currentGeneration === generation && pending.get(key) === intent) {
        pending.delete(key);
        publish();
      }
    }
    return ok;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      if (teardown) clearTimeout(teardown);
      teardown = null;
      listeners.add(listener);
      if (!stop) {
        const currentGeneration = ++generation;
        stop = adapter.subscribe((result, error) => {
          if (currentGeneration === generation) receive(result, error);
        });
        void reload();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        teardown = setTimeout(() => {
          if (listeners.size) return;
          stop?.();
          stop = null;
          ++generation;
          pending.clear();
          publish();
          // Pending HTTP requests still reconcile correctly on a remount;
          // the UID-specific registry prevents writes leaking to another user.
          adapter.onIdle?.();
        }, adapter.teardownMs ?? 10000);
      };
    },
    setPreference,
    reload,
    retry: () => failed ? setPreference(failed.key, failed.value) : reload(),
  };
}
