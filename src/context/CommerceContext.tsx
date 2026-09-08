import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "./AuthContext";

interface CommerceContextValue {
  cartIds: Set<string>;
  favoriteIds: Set<string>;
  ready: boolean;
  addToCart: (productId: string) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleFavorite: (productId: string) => Promise<boolean>;
}

const CommerceContext = createContext<CommerceContextValue | undefined>(undefined);
const normalizeIds = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];

export function CommerceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setCartIds(new Set());
      setFavoriteIds(new Set());
      setReady(true);
      return undefined;
    }
    setReady(false);
    return onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
      setCartIds(new Set(normalizeIds(data.cartProductIds)));
      setFavoriteIds(new Set(normalizeIds(data.wishlistProductIds)));
      setReady(true);
    }, (error) => {
      console.error("Commerce state sync failed", error);
      setCartIds(new Set());
      setFavoriteIds(new Set());
      setReady(true);
    });
  }, [user]);

  const requireUser = useCallback(() => {
    if (!user) throw new Error("Login is required.");
    return doc(db, "users", user.id);
  }, [user]);

  const addToCart = useCallback(async (productId: string) => {
    const userRef = requireUser();
    setCartIds((current) => new Set(current).add(productId));
    await setDoc(userRef, { cartProductIds: arrayUnion(productId) }, { merge: true });
  }, [requireUser]);

  const removeFromCart = useCallback(async (productId: string) => {
    const userRef = requireUser();
    setCartIds((current) => { const next = new Set(current); next.delete(productId); return next; });
    await updateDoc(userRef, { cartProductIds: arrayRemove(productId) });
  }, [requireUser]);

  const clearCart = useCallback(async () => {
    const userRef = requireUser();
    setCartIds(new Set());
    await setDoc(userRef, { cartProductIds: [] }, { merge: true });
  }, [requireUser]);

  const toggleFavorite = useCallback(async (productId: string) => {
    const userRef = requireUser();
    const removing = favoriteIds.has(productId);
    setFavoriteIds((current) => { const next = new Set(current); removing ? next.delete(productId) : next.add(productId); return next; });
    await setDoc(userRef, { wishlistProductIds: removing ? arrayRemove(productId) : arrayUnion(productId) }, { merge: true });
    return !removing;
  }, [favoriteIds, requireUser]);

  const value = useMemo(() => ({ cartIds, favoriteIds, ready, addToCart, removeFromCart, clearCart, toggleFavorite }), [cartIds, favoriteIds, ready, addToCart, removeFromCart, clearCart, toggleFavorite]);
  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const context = useContext(CommerceContext);
  if (!context) throw new Error("useCommerce must be used within CommerceProvider");
  return context;
}
