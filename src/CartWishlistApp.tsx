import Header from "./components/Header";
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
  toast: string | null;
  onRemoveFromCart: (id: string) => void;
  onClearCart: () => void;
  onRemoveFromFavorites: (id: string) => void;
  onAddToCart: (id: string) => void;
  onCheckout: () => void;
  onNavigate: (tab: TabKey) => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  onRequireAuth: () => boolean;
  onOpenProduct: (id: string) => void;
}

export default function CartWishlistApp({
  activeTab,
  cartProducts,
  favoriteProducts,
  cartIds,
  favoriteIds,
  toast,
  onRemoveFromCart,
  onClearCart,
  onRemoveFromFavorites,
  onAddToCart,
  onCheckout,
  onNavigate,
  onNavigateToSubscription,
  onNavigateToNotifications,
  onRequireAuth,
  onOpenProduct,
}: CartWishlistAppProps) {
  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-white shadow-xl shadow-slate-200 sm:h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={onNavigateToSubscription}
          onNavigateToCart={() => onNavigate("cart")}
          onNavigateToNotifications={onNavigateToNotifications}
        />

        <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-50">
          <Toast message={toast} />
          {activeTab === "favorites" && (
            <FavoritesPage
              favoriteProducts={favoriteProducts}
              cartIds={cartIds}
              onRemove={onRemoveFromFavorites}
              onAddToCart={onAddToCart}
              onNavigate={onNavigate}
              onOpenProduct={onOpenProduct}
            />
          )}
          {activeTab === "cart" && (
            <CartPage
              cartProducts={cartProducts}
              onRemove={onRemoveFromCart}
              onClearAll={onClearCart}
              onCheckout={onCheckout}
              onNavigate={onNavigate}
              onRequireAuth={onRequireAuth}
              onOpenProduct={onOpenProduct}
            />
          )}
        </div>

        <BottomNav
          active={activeTab}
          onChange={onNavigate}
          favoritesCount={favoriteIds.size}
          cartCount={cartIds.size}
        />
      </div>
    </div>
  );
}
