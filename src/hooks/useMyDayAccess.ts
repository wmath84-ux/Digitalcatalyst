import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";

const millis = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export function useMyDayAccess() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));
  useEffect(() => {
    if (!user) { setHasAccess(false); setLoading(false); return undefined; }
    return onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      const data = snapshot.data() || {};
      const features = Array.isArray(data.features) ? data.features.map(String) : [];
      setHasAccess(data.status === "active" && millis(data.expiresAt) > Date.now() && features.includes("my-day"));
      setLoading(false);
    }, () => { setHasAccess(false); setLoading(false); });
  }, [user]);
  return { hasAccess, loading, uid: user?.id || null };
}
