import SubscriptionPage from "./components/SubscriptionPage";
// The page's own responsive design system (phone / tablet / desktop + the
// solid-vs-glass material rules). Imported here, after the app theme, so its
// layout rules win over the legacy container-query block in src/index.css.
import "./subscription.css";
import type { TabKey } from "../components/BottomNav";

export type SubscriptionAppProps = {
  cartCount: number;
  purchasesBadge: number;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  onNavigateFooter: (tab: TabKey) => void;
};

export default function App({
  cartCount,
  purchasesBadge,
  onNavigateToCart,
  onNavigateToSubscription,
  onNavigateToNotifications,
  onNavigateFooter,
}: SubscriptionAppProps) {
  return (
    <SubscriptionPage
      cartCount={cartCount}
      purchasesBadge={purchasesBadge}
      onNavigateToCart={onNavigateToCart}
      onNavigateToSubscription={onNavigateToSubscription}
      onNavigateToNotifications={onNavigateToNotifications}
      onNavigateFooter={onNavigateFooter}
    />
  );
}
