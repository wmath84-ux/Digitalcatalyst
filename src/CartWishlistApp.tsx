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
  onRequireAuth: () => boolean;
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
  onRequireAuth,
}: CartWishlistAppProps) {
  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 font-[system-ui]">
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
            onRequireAuth={onRequireAuth}
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
