import { useMemo, useState } from "react";
import Header from "./components/Header";
import BottomNav, { type TabKey } from "./components/BottomNav";
import StorePage from "./components/StorePage";
import { HomeTab, MyDayTab, PurchasesTab, WalletTab } from "./components/OtherTabs";
import type { Product } from "./data/products";

type AppProps = {
  onNavigateToProduct: (product: Product) => void;
  onNavigateToMyDay: () => void;
};

export default function App({ onNavigateToProduct, onNavigateToMyDay }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("store");
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [cartCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        showToast("Added to wishlist ❤️");
      }
      return next;
    });
  };

  const handleBuy = (product: Product) => {
    if (purchased.has(product.id)) return;
    setPurchased((prev) => new Set(prev).add(product.id));
    showToast(product.price === 0 ? "Claimed for free 🎉" : "Purchased successfully 🎉");
  };

  const purchasesBadge = useMemo(() => purchased.size, [purchased]);

  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header cartCount={cartCount} notifCount={1} />

        <main className="flex-1 overflow-y-auto">
          {activeTab === "home" && <HomeTab />}
          {activeTab === "myday" && <MyDayTab />}
          {activeTab === "store" && (
            <StorePage
              wishlist={wishlist}
              purchased={purchased}
              onToggleWishlist={toggleWishlist}
              onBuy={handleBuy}
              onView={onNavigateToProduct}
            />
          )}
          {activeTab === "purchases" && <PurchasesTab purchased={purchased} />}
          {activeTab === "wallet" && <WalletTab wishlistCount={wishlist.size} />}
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
            else setActiveTab(tab);
          }}
          storeBadge={1}
          purchasesBadge={purchasesBadge}
        />
      </div>
    </div>
  );
}
