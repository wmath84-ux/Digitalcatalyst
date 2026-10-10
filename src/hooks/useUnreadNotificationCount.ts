import { useUserPreferences } from "../settings/useUserPreferences";
import { notificationPolicy } from "../../utils/userPreferences";
import { useEffect, useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../../firebase";
import { subscribeShared } from "../lib/sharedSnapshot";
import { useAuth } from "../context/AuthContext";
import { loadSiteNotifications, type SiteNotification } from "../../utils/siteNotifications";

/**
 * The one per-user notifications query.
 *
 * The bell badge (this hook, mounted on nearly every page) and the
 * Notifications page used to open the SAME collection listener separately, so
 * opening the tray doubled the reads on the whole collection. Both now join a
 * single shared listener keyed by uid — see src/lib/sharedSnapshot.ts.
 */
export const notificationsKey = (uid: string) => `users/${uid}/notifications`;

export function useUnreadNotificationCount(): number | null {
  const { user, loading } = useAuth();
  const { preferences } = useUserPreferences(user?.id);
  const viewerKey = user?.id || "guest";
  const [localItems, setLocalItems] = useState<SiteNotification[]>(() => loadSiteNotifications(viewerKey));
  const [cloudUnreadItems, setCloudUnreadItems] = useState<Array<{ id: string; category?: string }>>([]);

  useEffect(() => {
    const refresh = () => setLocalItems(loadSiteNotifications(viewerKey));
    refresh();
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ viewerKey?: string; notifications?: SiteNotification[] }>).detail;
      if (detail?.viewerKey === viewerKey && Array.isArray(detail.notifications)) setLocalItems(detail.notifications);
      else refresh();
    };
    window.addEventListener("eduvora:notifications-updated", onUpdated);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("eduvora:notifications-updated", onUpdated);
      window.removeEventListener("storage", refresh);
    };
  }, [viewerKey]);

  useEffect(() => {
    if (!user) { setCloudUnreadItems([]); return undefined; }
    return subscribeShared(notificationsKey(user.id), () => collection(db, "users", user.id, "notifications"), (docs, error) => {
      if (error) { setCloudUnreadItems([]); return; }
      setCloudUnreadItems(docs.filter((item) => item.data.read !== true).map((item) => ({ id: item.id, category: item.data.category })));
    });
  }, [user]);

  const count = useMemo(() => {
    const allowed = (item: { category?: string }) => notificationPolicy(preferences, { category: item.category }).inbox;
    const ids = new Set(localItems.filter((item) => !item.read && allowed(item)).map((item) => item.id));
    cloudUnreadItems.filter(allowed).forEach((item) => ids.add(item.id));
    return ids.size;
  }, [cloudUnreadItems, localItems, preferences]);

  return loading ? null : count;
}
