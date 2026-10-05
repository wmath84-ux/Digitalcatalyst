/**
 * `virtual:pwa-register/react` shim — Digitalcatalyst port.
 *
 * Recall asks Workbox's Vite plugin for `useRegisterSW`. Digitalcatalyst
 * already owns a service worker (`public/sw.js`, registered by the app shell),
 * so the Revision chunk must never register a second one: two workers fighting
 * over the same scope would break offline mode for the whole app (§22).
 *
 * This shim therefore reports the state of the EXISTING registration:
 *
 *   needRefresh         true when a new worker is waiting for activation
 *   offlineReady        true when the app shell is cached and offline works
 *   updateServiceWorker(true)  → tells the waiting worker to skip waiting and
 *                                reloads the page once it takes control
 *
 * The returned tuple is the same `[state, actions]` shape the plugin exposes.
 */

import { useCallback, useEffect, useState } from "react";

interface RegisterSWState {
  needRefresh: [boolean, (value: boolean) => void];
  offlineReady: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
}

interface RegisterSWOptions {
  immediate?: boolean;
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

function registrationContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker;
}

export function useRegisterSW(options: RegisterSWOptions = {}): RegisterSWState {
  const [needRefreshFlag, setNeedRefresh] = useState(false);
  const [offlineReadyFlag, setOfflineReady] = useState(false);

  useEffect(() => {
    const container = registrationContainer();
    if (!container) return;

    let cancelled = false;

    // The app shell registers `sw.js`; this only observes it.
    void (async () => {
      try {
        const registration =
          container.controller?.scriptURL
            ? await container.getRegistration()
            : await container.getRegistration();
        if (cancelled || !registration) return;

        options.onRegisteredSW?.(registration.active?.scriptURL ?? "sw.js", registration);

        if (registration.waiting) {
          setNeedRefresh(true);
          options.onNeedRefresh?.();
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && container.controller) {
              setNeedRefresh(true);
              options.onNeedRefresh?.();
            } else if (installing.state === "installed") {
              setOfflineReady(true);
              options.onOfflineReady?.();
            }
          });
        });
      } catch (error) {
        options.onRegisterError?.(error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `options` is intentionally read once: the ported callers pass a stable
    // object literal and re-running would re-attach listeners on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateServiceWorker = useCallback(async (reloadPage = true) => {
    const container = registrationContainer();
    const registration = await container?.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    if (reloadPage && typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  return {
    needRefresh: [needRefreshFlag, setNeedRefresh],
    offlineReady: [offlineReadyFlag, setOfflineReady],
    updateServiceWorker,
  };
}

export default useRegisterSW;
