// src/hooks/useOwnedUpdates.ts
//
// Reads the `purchasedProductUpdateIds` map from the current user's Firestore
// document. The map is shaped as `{ [productId: string]: string[] }` so a
// PDP can ask "which paid-update ids has the user already unlocked for THIS
// product?" and gate the paid-update module set accordingly.
//
// Returns a stable `Set<string>` for the supplied product id, or an empty set
// while the user is signed out / the doc is still loading.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";

export const useOwnedUpdateIds = (productId: string | null | undefined): Set<string> => {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!user || !productId) {
      setIds(new Set());
      return undefined;
    }
    const ref = doc(db, "users", user.id);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        setIds(new Set());
        return;
      }
      const data = snapshot.data() || {};
      const map = (data.purchasedProductUpdateIds || {}) as Record<string, unknown>;
      const raw = map[productId];
      if (Array.isArray(raw)) {
        setIds(new Set(raw.map((v) => String(v)).filter(Boolean)));
      } else {
        setIds(new Set());
      }
    }, (error) => {
      // Snapshot read failures are non-fatal: the PDP just shows every paid
      // update as available until the user doc comes back online.
      console.warn("[useOwnedUpdateIds] snapshot failed", error);
    });
    return unsubscribe;
  }, [user, productId]);

  return ids;
};
