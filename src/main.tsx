import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./landing.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";
import CheckoutApp from "./CheckoutApp";
import MyDayApp from "./MyDayApp";
import ProfileApp from "./profile/App";
import CoursePlayerApp from "./CoursePlayerApp";
import CommunityApp from "./community/App";
import CartWishlistApp from "./CartWishlistApp";
import SubscriptionApp from "./subscription/App";
import LandingApp from "./LandingApp";
import AuthApp from "./AuthApp";
import AiChatApp from "./ai-chat/App";
import AdminApp from "./admin/AdminApp";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import {
  product as checkoutProduct,
  user as checkoutUser,
  type Product as CheckoutProduct,
  type UserProfile,
} from "./data/checkoutData";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const LANDING_HASH = "#/landing";
const HOME_HASH = "#/home";
const AUTH_HASH = "#/auth";
const STORE_HASH = "#/store";
const PRODUCT_HASH = "#/product/";
const CHECKOUT_HASH = "#/checkout";
const MY_DAY_HASH = "#/my-day";
const PROFILE_HASH = "#/profile";
const COURSE_HASH = "#/course/";
const COMMUNITY_HASH = "#/community";
const CART_HASH = "#/cart";
const FAVORITES_HASH = "#/favorites";
const SUBSCRIPTION_HASH = "#/subscription";
const AI_CHAT_HASH = "#/ai-chat";
const ADMIN_HASH = "#/admin";
const CHECKOUT_CONTEXT_KEY = "checkoutContext";

const INITIAL_CART: string[] = [];
const INITIAL_FAVORITES: string[] = [];
const INITIAL_COINS = 0;

type NavigableProduct = {
  id: string;
  title: string;
};

type CheckoutContext = {
  product: CheckoutProduct;
  user: UserProfile;
};

function applyCheckoutContext(context: CheckoutContext) {
  Object.assign(checkoutProduct, context.product);
  Object.assign(checkoutUser, context.user);
}

const AUTH_REQUIRED_PREFIXES = [
  CHECKOUT_HASH,
  MY_DAY_HASH,
  PROFILE_HASH,
  COURSE_HASH,
  COMMUNITY_HASH,
  SUBSCRIPTION_HASH,
  AI_CHAT_HASH,
  ADMIN_HASH,
];

const requiresAuthentication = (hash: string) =>
  AUTH_REQUIRED_PREFIXES.some((prefix) => hash.startsWith(prefix));

function Root() {
  const { user, loading } = useAuth();
  const { products: catalogProducts } = useCatalog();
  const [hash, setHash] = useState(() => window.location.hash);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set(INITIAL_CART));
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(INITIAL_FAVORITES));
  const [userCoins, setUserCoins] = useState(INITIAL_COINS);
  const [shoppingToast, setShoppingToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shoppingProducts: CartProduct[] = useMemo(() => catalogProducts.map((product) => ({
    id: product.id,
    title: product.title,
    author: product.instructor,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    rating: product.rating,
    reviewsCount: product.reviews,
    image: product.image,
    hours: product.classLevel,
    lessons: 1,
    bestseller: product.tags.includes("BOARD"),
  })), [catalogProducts]);

  const selectedCatalogProduct = useMemo(() => {
    const routeId = hash.startsWith(PRODUCT_HASH) ? decodeURIComponent(hash.slice(PRODUCT_HASH.length).split("?")[0]) : "";
    return catalogProducts.find((product) => product.id === routeId) || null;
  }, [catalogProducts, hash]);

  const showShoppingToast = (message: string) => {
    setShoppingToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShoppingToast(null), 2000);
  };

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (loading || user || !requiresAuthentication(hash)) return;
    window.location.hash = `${AUTH_HASH}?mode=login&return=${encodeURIComponent(hash)}`;
  }, [hash, loading, user]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleAddToCart = (id: string) => {
    setCartIds((previous) => {
      if (previous.has(id)) return previous;
      const next = new Set(previous);
      next.add(id);
      return next;
    });
    const product = shoppingProducts.find((item) => item.id === id);
    showShoppingToast(`${product ? product.title.slice(0, 28) + "…" : "Item"} added to cart`);
  };

  const handleRemoveFromCart = (id: string) => {
    setCartIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    showShoppingToast("Removed from cart");
  };

  const handleClearCart = () => {
    setCartIds(new Set());
    showShoppingToast("Cart cleared");
  };

  const handleToggleFavorite = (id: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
        showShoppingToast("Removed from favorites");
      } else {
        next.add(id);
        showShoppingToast("Added to favorites");
      }
      return next;
    });
  };

  const handleRemoveFromFavorites = (id: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    showShoppingToast("Removed from favorites");
  };

  const handleCheckoutComplete = (coinsUsed: number) => {
    setUserCoins((previous) => Math.max(0, previous - coinsUsed));
    setCartIds(new Set());
    showShoppingToast("Order placed successfully 🎉");
  };

  const handleShoppingNavigation = (tab: CartTabKey) => {
    if (tab === "home") window.location.hash = STORE_HASH;
    if (tab === "favorites") window.location.hash = FAVORITES_HASH;
    if (tab === "cart") window.location.hash = CART_HASH;
  };

  const redirectToAuth = (returnHash: string) => {
    window.location.hash = `${AUTH_HASH}?mode=login&return=${encodeURIComponent(returnHash)}`;
  };

  const navigateToProduct = (product: NavigableProduct) => {
    sessionStorage.setItem("selectedProduct", JSON.stringify(product));
    window.location.hash = `${PRODUCT_HASH}${encodeURIComponent(product.id)}`;
  };

  const navigateToCourse = (course: { id: string; title: string }) => {
    sessionStorage.setItem("selectedCourse", JSON.stringify({ courseId: course.id, title: course.title }));
    window.location.hash = `${COURSE_HASH}${encodeURIComponent(course.id)}`;
  };

  const navigateToCheckout = (finalPrice: number) => {
    if (!user) {
      sessionStorage.setItem("pendingCheckoutPrice", String(finalPrice));
      redirectToAuth(window.location.hash || PRODUCT_HASH);
      return;
    }

    if (!selectedCatalogProduct) {
      showShoppingToast("This product is no longer available");
      window.location.hash = STORE_HASH;
      return;
    }

    const context: CheckoutContext = {
      product: {
        id: selectedCatalogProduct.id,
        name: selectedCatalogProduct.title,
        type: selectedCatalogProduct.category === "PDF" || selectedCatalogProduct.category === "Notes"
          ? "PDF"
          : selectedCatalogProduct.category === "E-book"
            ? "eBook"
            : selectedCatalogProduct.category === "Live"
              ? "Live Workshop"
              : "Course",
        description: selectedCatalogProduct.description || selectedCatalogProduct.subject,
        price: finalPrice,
        currency: "₹",
        thumbnail: "📘",
        instructor: selectedCatalogProduct.instructor,
        duration: selectedCatalogProduct.classLevel,
        rating: selectedCatalogProduct.rating,
        totalRatings: selectedCatalogProduct.reviews,
      },
      user: {
        ...checkoutUser,
        id: String(user.id),
        name: user.name,
        email: user.email,
        eduCoins: user.coins,
      },
    };
    applyCheckoutContext(context);
    sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    window.location.hash = CHECKOUT_HASH;
  };

  const cartProducts = shoppingProducts.filter((product) => cartIds.has(product.id));
  const favoriteProducts = shoppingProducts.filter((product) => favoriteIds.has(product.id));
  const protectedRoutePending = requiresAuthentication(hash) && (loading || !user);

  if (protectedRoutePending) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#05060f] px-6 text-center text-white">
        <div>
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
          <p className="mt-4 text-sm font-semibold text-slate-300">
            {loading ? "Restoring your secure session…" : "Taking you to secure login…"}
          </p>
        </div>
      </main>
    );
  }

  if (!hash || hash.startsWith(LANDING_HASH)) return <LandingApp />;
  if (hash.startsWith(HOME_HASH)) {
    return (
      <HomeApp
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
        onNavigateToStore={() => {
          window.location.hash = STORE_HASH;
        }}
        onNavigateToProduct={navigateToProduct}
        onNavigateToMyDay={() => {
          window.location.hash = MY_DAY_HASH;
        }}
        onNavigateToProfile={() => {
          window.location.hash = PROFILE_HASH;
        }}
        onNavigateToPurchases={() => {
          window.location.hash = FAVORITES_HASH;
        }}
      />
    );
  }
  if (hash.startsWith(AUTH_HASH)) return <AuthApp />;

  if (hash.startsWith(CART_HASH) || hash.startsWith(FAVORITES_HASH)) {
    return (
      <CartWishlistApp
        activeTab={hash.startsWith(CART_HASH) ? "cart" : "favorites"}
        cartProducts={cartProducts}
        favoriteProducts={favoriteProducts}
        cartIds={cartIds}
        favoriteIds={favoriteIds}
        userCoins={userCoins}
        toast={shoppingToast}
        onRemoveFromCart={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onRemoveFromFavorites={handleRemoveFromFavorites}
        onAddToCart={handleAddToCart}
        onCheckoutComplete={handleCheckoutComplete}
        onNavigate={handleShoppingNavigation}
        onRequireAuth={() => {
          if (user) return true;
          redirectToAuth(CART_HASH);
          return false;
        }}
      />
    );
  }

  if (hash.startsWith(CHECKOUT_HASH)) {
    const savedContext = sessionStorage.getItem(CHECKOUT_CONTEXT_KEY);
    if (savedContext) {
      try {
        applyCheckoutContext(JSON.parse(savedContext) as CheckoutContext);
      } catch {
        sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
      }
    }
    return <CheckoutApp />;
  }

  if (hash.startsWith(ADMIN_HASH)) return <AdminApp />;
  if (hash.startsWith(SUBSCRIPTION_HASH)) return <SubscriptionApp />;
  if (hash.startsWith(AI_CHAT_HASH)) return <AiChatApp />;
  if (hash.startsWith(COMMUNITY_HASH)) return <CommunityApp />;
  if (hash.startsWith(COURSE_HASH)) return <CoursePlayerApp />;
  if (hash.startsWith(PROFILE_HASH)) return <ProfileApp />;
  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(PRODUCT_HASH)) return <PdpApp product={selectedCatalogProduct} onCheckout={navigateToCheckout} onBack={() => { window.location.hash = STORE_HASH; }} />;
  if (hash.startsWith(STORE_HASH)) {
    return (
      <StoreApp
        onNavigateToProduct={navigateToProduct}
        onNavigateToMyDay={() => {
          window.location.hash = MY_DAY_HASH;
        }}
        onNavigateToProfile={() => {
          window.location.hash = PROFILE_HASH;
        }}
        onNavigateToCourse={navigateToCourse}
        onNavigateToCommunity={() => {
          window.location.hash = COMMUNITY_HASH;
        }}
        cartIds={cartIds}
        favoriteIds={favoriteIds}
        toast={shoppingToast}
        onAddToCart={handleAddToCart}
        onToggleFavorite={handleToggleFavorite}
        onNavigateToCart={() => {
          window.location.hash = CART_HASH;
        }}
      />
    );
  }

  return (
    <HomeApp
      favoriteIds={favoriteIds}
      onToggleFavorite={handleToggleFavorite}
      onNavigateToStore={() => {
        window.location.hash = STORE_HASH;
      }}
      onNavigateToProduct={navigateToProduct}
      onNavigateToMyDay={() => {
        window.location.hash = MY_DAY_HASH;
      }}
      onNavigateToProfile={() => {
        window.location.hash = PROFILE_HASH;
      }}
      onNavigateToPurchases={() => {
        window.location.hash = FAVORITES_HASH;
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <CatalogProvider>
        <Root />
      </CatalogProvider>
    </AuthProvider>
  </StrictMode>,
);
