import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { banners as builtInBanners } from "../data/mockData";
import { normalizeBanner } from "../data/bannerGradients";
import type { Banner } from "../types";

/**
 * Firestore document that stores the admin-edited home hero slides.
 * Read by every visitor (public read on /settings), written only by
 * the admin panel. When the document does not exist (or holds an
 * empty list) the app falls back to the built-in slides so the home
 * page always has something to show.
 */
export const HOME_BANNERS_DOC_ID = "homeBanners";

type State = {
  banners: Banner[];
  /** True when the list below comes from Firestore (admin saved it). */
  usingCustom: boolean;
  loaded: boolean;
};

/**
 * Live home hero slides. Admin edits in the dashboard appear on every
 * open device within a second — no app update needed.
 */
export function useHomeBanners(): State {
  const [state, setState] = useState<State>({ banners: builtInBanners, usingCustom: false, loaded: false });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", HOME_BANNERS_DOC_ID),
      (snapshot) => {
        const data = (snapshot.data() || {}) as Record<string, unknown>;
        const rawBanners = Array.isArray(data.banners) ? (data.banners as Record<string, unknown>[]) : [];
        if (rawBanners.length > 0) {
          setState({ banners: rawBanners.map((item, index) => normalizeBanner(item, index)), usingCustom: true, loaded: true });
        } else {
          // No saved banners (first run / admin cleared the list) —
          // the built-in slides keep the home page looking right.
          setState({ banners: builtInBanners, usingCustom: false, loaded: true });
        }
      },
      () => {
        // Offline / permission error — degrade to built-in slides.
        setState((current) => ({ ...current, loaded: true }));
      },
    );
    return unsubscribe;
  }, []);

  return state;
}
