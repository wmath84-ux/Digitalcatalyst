import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import {
  applyDocumentBranding,
  BRANDING_CHANGE_EVENT,
  BRANDING_DOC_PATH,
  DEFAULT_BRANDING,
  normalizeBranding,
  readCachedBranding,
  writeCachedBranding,
  type Branding,
} from "../utils/branding";

type BrandingValue = Branding & { loading: boolean };

const BrandingContext = createContext<BrandingValue>({
  ...DEFAULT_BRANDING,
  loading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(readCachedBranding);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next = normalizeBranding((snap.data() || {}) as Partial<Branding>);
        setBranding(next);
        writeCachedBranding(next);
        applyDocumentBranding(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    const syncSameTabChange = (event: Event) => {
      const next = (event as CustomEvent<Branding>).detail;
      if (next) setBranding(normalizeBranding(next));
    };
    window.addEventListener(BRANDING_CHANGE_EVENT, syncSameTabChange);
    return () => window.removeEventListener(BRANDING_CHANGE_EVENT, syncSameTabChange);
  }, []);

  useEffect(() => {
    applyDocumentBranding(branding);
  }, [branding]);

  const value = useMemo<BrandingValue>(() => ({ ...branding, loading }), [branding, loading]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
