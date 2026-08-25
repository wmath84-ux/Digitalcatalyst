import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import {
  APP_ZOOM_CHANGE_EVENT,
  APP_ZOOM_DOC_PATH,
  DEFAULT_APP_ZOOM_SETTING,
  applyDocumentAppZoom,
  normalizeAppZoomSetting,
  readCachedAppZoom,
  writeCachedAppZoom,
  type AppZoomSetting,
} from "../utils/appZoom";

type AppZoomValue = AppZoomSetting & { loading: boolean };

const AppZoomContext = createContext<AppZoomValue>({
  ...DEFAULT_APP_ZOOM_SETTING,
  loading: true,
});

export function AppZoomProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<AppZoomSetting>(readCachedAppZoom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, APP_ZOOM_DOC_PATH.collection, APP_ZOOM_DOC_PATH.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next = normalizeAppZoomSetting((snap.data() || {}) as Partial<AppZoomSetting>);
        setSetting(next);
        writeCachedAppZoom(next);
        applyDocumentAppZoom(next);
        setLoading(false);
      },
      () => {
        // Offline / permission issue — keep the cached value, never block the app.
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    const syncSameTabChange = (event: Event) => {
      const next = (event as CustomEvent<AppZoomSetting>).detail;
      if (next) {
        const normalized = normalizeAppZoomSetting(next);
        setSetting(normalized);
        applyDocumentAppZoom(normalized);
      }
    };
    window.addEventListener(APP_ZOOM_CHANGE_EVENT, syncSameTabChange);
    return () => window.removeEventListener(APP_ZOOM_CHANGE_EVENT, syncSameTabChange);
  }, []);

  useEffect(() => {
    applyDocumentAppZoom(setting);
  }, [setting]);

  const value = useMemo<AppZoomValue>(() => ({ ...setting, loading }), [setting, loading]);
  return <AppZoomContext.Provider value={value}>{children}</AppZoomContext.Provider>;
}

export function useAppZoom() {
  return useContext(AppZoomContext);
}
