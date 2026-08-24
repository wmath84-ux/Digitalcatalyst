import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { normalizeStoreFilters, STORE_FILTERS_DOC_ID, type StoreFilter } from "../data/storeFilters";

type State = {
  /** Active filters configured by the admin (empty until one is saved). */
  filters: StoreFilter[];
  /** True once the Firestore document (or its absence) has been observed. */
  loaded: boolean;
};

/**
 * Live store filter chips. The admin panel writes `settings/storeFilters`
 * and every open device picks the change up within a second — no deploy and
 * no app update required. When nothing is configured the Store page falls
 * back to chips derived from the products themselves.
 */
export function useStoreFilters(): State {
  const [state, setState] = useState<State>({ filters: [], loaded: false });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", STORE_FILTERS_DOC_ID),
      (snapshot) => {
        const data = (snapshot.data() || {}) as Record<string, unknown>;
        setState({ filters: normalizeStoreFilters(data.filters), loaded: true });
      },
      () => {
        // Offline / permission error — degrade to derived chips.
        setState((current) => ({ ...current, loaded: true }));
      },
    );
    return unsubscribe;
  }, []);

  return state;
}
