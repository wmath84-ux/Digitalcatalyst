import { auth } from "../../../firebase";
import { apiFetch } from "../../utils/apiBase";
import type { SubscriptionCatalog } from "./subscriptionCatalog";

/**
 * Load the public subscription catalogue for both the plan chooser and the
 * Profile membership summary. The catalogue is not user-specific; an auth
 * token is attached when one is already available so the endpoint can use its
 * normal authenticated path without making sign-in a prerequisite to browse.
 */
export async function loadSubscriptionCatalog(): Promise<SubscriptionCatalog> {
  const firebaseUser = auth.currentUser;
  const token = firebaseUser ? await firebaseUser.getIdToken(true) : "";
  const response = await apiFetch("/api/subscription-catalog", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Could not load subscription plans (server returned ${response.status}).`);
  }

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    catalog?: SubscriptionCatalog;
    error?: string;
  };
  if (!data.ok || !data.catalog) {
    throw new Error(data.error || "Subscription catalog response was malformed.");
  }

  return data.catalog;
}
