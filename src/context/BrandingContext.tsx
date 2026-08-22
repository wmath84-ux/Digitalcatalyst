import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import {
  applyDocumentBrandIcons,
  BRANDING_DOC_PATH,
  DEFAULT_LOGO_URL,
  readCachedLogoUrl,
  writeCachedLogoUrl,
} from "../utils/branding";

type BrandingValue = {
  logoUrl: string;
  loading: boolean;
};

const BrandingContext = createContext<BrandingValue>({
  logoUrl: DEFAULT_LOGO_URL,
  loading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState(readCachedLogoUrl);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() || {};
        const next = typeof data.logoUrl === "string" && data.logoUrl.trim() ? data.logoUrl.trim() : DEFAULT_LOGO_URL;
        setLogoUrl(next);
        writeCachedLogoUrl(next === DEFAULT_LOGO_URL ? null : next);
        applyDocumentBrandIcons(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    applyDocumentBrandIcons(logoUrl);
  }, [logoUrl]);

  const value = useMemo(() => ({ logoUrl, loading }), [logoUrl, loading]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
