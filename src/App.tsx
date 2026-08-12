import { useMemo, useState } from "react";
import Header from "./components/Header";
import BottomNav, { type TabKey } from "./components/BottomNav";
import StorePage from "./components/StorePage";
import { HomeTab, MyDayTab, PurchasesTab } from "./components/OtherTabs";
import type { Product } from "./data/products";
import { useCatalog } from "./context/CatalogContext";

type AppProps = {
  onNavigateToProduct: (product: Product) => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToCourse: (course: { id: string; title: string }) => void;
  onNavigateToCommunity: () => void;
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
  onNavigateToCourse,
  onNavigateToCommunity,
  cartIds,
  favoriteIds,
  toast,
  onAddToCart,
  onToggleFavorite,
  onNavigateToCart,
}: AppProps) {
  const { purchasedIds: purchased } = useCatalog();
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    window.location.hash.startsWith("#/store/purchases") ? "purchases" : "store"
  );
  const cartCount = cartIds.size;

  const purchasesBadge = useMemo(() => purchased.size, [purchased]);

  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartCount}
          notifCount={1}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToCart={onNavigateToCart}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === "home" && <HomeTab />}
          {activeTab === "myday" && <MyDayTab />}
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
          active={activeTab}
          onChange={(tab) => {
            if (tab === "myday") onNavigateToMyDay();
            else if (tab === "community") onNavigateToCommunity();
            else setActiveTab(tab);
          }}
          storeBadge={1}
          purchasesBadge={purchasesBadge}
        />
      </div>
    </div>
  );
}
