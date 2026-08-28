import { useMemo } from "react";
import Header from "./components/Header";
import BottomNav, { type TabKey } from "./components/BottomNav";
import StorePage from "./components/StorePage";
import { PurchasesTab } from "./components/OtherTabs";
import type { Product } from "./data/products";
import { useCatalog } from "./context/CatalogContext";

type AppProps = {
  onNavigateToProduct: (product: Product) => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToHome: () => void;
  onNavigateToCourse: (course: { id: string; title: string }) => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  cartIds: Set<string>;
  favoriteIds: Set<string>;
  toast: string | null;
  onAddToCart: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigateToCart: () => void;
};

export default function App({
  onNavigateToProduct,
  onNavigateToMyDay,
  onNavigateToProfile,
  onNavigateToHome,
  onNavigateToCourse,
  onNavigateToSubscription,
  onNavigateToNotifications,
  cartIds,
  favoriteIds,
  toast,
  onAddToCart,
  onToggleFavorite,
  onNavigateToCart,
}: AppProps) {
  const { purchasedIds: purchased } = useCatalog();
  // Keep the tab in sync with the URL hash. On desktop the left rail and
  // top bar drive navigation by changing `#/store` vs `#/store/purchases`,
  // so the tab must be derived from the hash instead of holding a local
  // copy (otherwise clicking Store / My Library can leave the old page on
  // screen). On mobile/tablet the bottom nav also writes the hash, so the
  // two sources never drift.
  const activeTab: TabKey =
    window.location.hash.startsWith("#/store/purchases") ? "purchases" : "store";
  const cartCount = cartIds.size;
  const purchasesBadge = useMemo(() => purchased.size, [purchased]);

  return (
    <div className="dc-app-shell min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200 md:max-w-none md:rounded-none md:border-0 md:shadow-none md:bg-transparent">
        <Header
          cartCount={cartCount}
          notifCount={1}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={onNavigateToCart}
          onNavigateToNotifications={onNavigateToNotifications}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === "store" && (
            <StorePage
              wishlist={favoriteIds}
              cartIds={cartIds}
              purchased={purchased}
              onToggleWishlist={onToggleFavorite}
              onAddToCart={onAddToCart}
              onView={onNavigateToProduct}
            />
          )}
          {activeTab === "purchases" && (
            <PurchasesTab purchased={purchased} onOpenCourse={onNavigateToCourse} />
          )}
        </main>

        {toast && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 z-40 w-max -translate-x-1/2 rounded-full bg-slate-900/95 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {toast}
          </div>
        )}

        <BottomNav
          active={activeTab === "purchases" ? "purchases" : "store"}
          onChange={(tab) => {
            if (tab === "home") onNavigateToHome();
            else if (tab === "myday") onNavigateToMyDay();
            else if (tab === "profile") onNavigateToProfile();
            // Mirror Store / My Library in the URL too. This keeps the
            // desktop rail's active state and browser history in sync, and
            // prevents the old "hash stays #/store while the screen shows
            // purchases" state that made switching unreliable.
            else if (tab === "purchases") window.location.hash = "#/store/purchases";
            else window.location.hash = "#/store";
          }}
          storeBadge={1}
          purchasesBadge={purchasesBadge}
        />
      </div>
    </div>
  );
}
