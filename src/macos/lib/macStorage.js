/* macOS Web Simulator — namespaced localStorage.
 *
 * The upstream project owns the whole origin, so it writes unprefixed keys
 * (`os_state`, `wallpaper`, `notes`, `theme`, `user_name`, …) straight to
 * localStorage. Vendored into Digital Catalyst it shares an origin with the
 * store, the learning app and the admin console, several of which use
 * similarly generic keys — an unprefixed `theme` or `user_name` from the
 * simulator would silently overwrite real app state, and clearing the
 * simulator would be impossible without nuking everything else.
 *
 * So every simulator read/write goes through this shim, which transparently
 * prefixes `macsim:`. The simulator code is otherwise unchanged: the call
 * sites just say `macStorage.getItem(...)` instead of `localStorage.getItem(...)`.
 *
 * It is also defensive about storage being unavailable (Safari private mode,
 * blocked third-party storage), where `localStorage` access itself throws.
 */

const PREFIX = "macsim:";

/** In-memory fallback used when the real localStorage is unavailable. */
const memory = new Map();

function backing() {
  try {
    const store = window.localStorage;
    // Touch it — in some privacy modes the getter succeeds but access throws.
    store.getItem(PREFIX + "__probe__");
    return store;
  } catch {
    return null;
  }
}

export const macStorage = {
  getItem(key) {
    const store = backing();
    if (!store) return memory.has(PREFIX + key) ? memory.get(PREFIX + key) : null;
    try {
      return store.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },

  setItem(key, value) {
    const store = backing();
    if (!store) {
      memory.set(PREFIX + key, String(value));
      return;
    }
    try {
      store.setItem(PREFIX + key, String(value));
    } catch {
      // Quota exceeded — the simulator stores wallpapers and photos as data
      // URLs, which is easy to overflow. Losing the write is always better
      // than throwing out of a render or an event handler.
      memory.set(PREFIX + key, String(value));
    }
  },

  removeItem(key) {
    memory.delete(PREFIX + key);
    const store = backing();
    if (!store) return;
    try {
      store.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },

  /** Wipe every simulator key, leaving the host app's keys untouched. */
  clear() {
    memory.clear();
    const store = backing();
    if (!store) return;
    try {
      const doomed = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith(PREFIX)) doomed.push(key);
      }
      doomed.forEach((key) => store.removeItem(key));
    } catch {
      /* ignore */
    }
  },
};

export default macStorage;
