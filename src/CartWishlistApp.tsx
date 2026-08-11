import BottomNav from "./cartWishlist/components/BottomNav";
import Toast from "./cartWishlist/components/Toast";
import CartPage from "./cartWishlist/pages/CartPage";
import FavoritesPage from "./cartWishlist/pages/FavoritesPage";
import type { Product, TabKey } from "./cartWishlist/types";

interface CartWishlistAppProps {
  activeTab: "cart" | "favorites";
  cartProducts: Product[];
  favoriteProducts: Product[];
  cartIds: Set<string>;
  favoriteIds: Set<string>;
  userCoins: number;
  toast: string | null;
  onRemoveFromCart: (id: string) => void;
  onClearCart: () => void;
  onRemoveFromFavorites: (id: string) => void;
  onAddToCart: (id: string) => void;
  onCheckoutComplete: (coinsUsed: number) => void;
  onNavigate: (tab: TabKey) => void;
}

export default function CartWishlistApp({
  activeTab,
  cartProducts,
  favoriteProducts,
  cartIds,
  favoriteIds,
  userCoins,
  toast,
  onRemoveFromCart,
  onClearCart,
  onRemoveFromFavorites,
  onAddToCart,
  onCheckoutComplete,
  onNavigate,
}: CartWishlistAppProps) {
  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 font-[system-ui]">
      <div className="z-40 flex shrink-0 items-center justify-between bg-white px-6 pb-1 pt-3 text-[13px] font-semibold text-slate-900">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">5G</span>
          <div className="h-2.5 w-4 rounded-[2px] border border-slate-900 relative">
            <span className="absolute inset-y-[1px] left-[1px] right-[3px] bg-slate-900 rounded-[1px]" />
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-50">
        <Toast message={toast} />
        {activeTab === "favorites" && (
          <FavoritesPage
            favoriteProducts={favoriteProducts}
            cartIds={cartIds}
            onRemove={onRemoveFromFavorites}
            onAddToCart={onAddToCart}
            onNavigate={onNavigate}
          />
        )}
        {activeTab === "cart" && (
          <CartPage
            cartProducts={cartProducts}
            onRemove={onRemoveFromCart}
            onClearAll={onClearCart}
            userCoins={userCoins}
            onCheckoutComplete={onCheckoutComplete}
            onNavigate={onNavigate}
          />
        )}
      </div>

      <BottomNav
        active={activeTab}
        onChange={onNavigate}
        favoritesCount={favoriteIds.size}
        cartCount={cartIds.size}
      />
      <div className="flex shrink-0 justify-center bg-white pb-1.5 pt-0.5">
        <div className="h-1 w-32 rounded-full bg-slate-300" />
      </div>
    </div>
  );
}
