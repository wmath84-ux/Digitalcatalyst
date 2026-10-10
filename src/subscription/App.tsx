import SubscriptionPage from "./components/SubscriptionPage";
// The page loads its scoped minimalist stylesheet. Do not reintroduce the
// legacy card/deck stylesheet after it.
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
