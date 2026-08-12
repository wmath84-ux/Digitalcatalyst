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
import AdminLoginApp from "./AdminLoginApp";
import AiChatApp from "./ai-chat/App";
import AdminApp from "./admin/AdminApp";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import { CommerceProvider, useCommerce } from "./context/CommerceContext";
import { clearAdminSession, hasAdminSession } from "./utils/adminSession";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import type { PaidCourseUpdate } from "./types/course";
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
const ADMIN_LOGIN_HASH = "#/admin-login";
const CHECKOUT_CONTEXT_KEY = "checkoutContext";

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

function InvalidCheckout({ onBack }: { onBack: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6 text-center"><div><p className="text-4xl">🛒</p><h1 className="mt-4 text-2xl font-black text-slate-900">Checkout session not found</h1><p className="mt-2 text-sm text-slate-500">Choose a live product before starting secure checkout.</p><button onClick={onBack} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to store</button></div></main>;
}

const AUTH_REQUIRED_PREFIXES = [
  CHECKOUT_HASH,
  MY_DAY_HASH,
  PROFILE_HASH,
  COURSE_HASH,
  COMMUNITY_HASH,
  SUBSCRIPTION_HASH,
  AI_CHAT_HASH,
];

const requiresAuthentication = (hash: string) =>
  AUTH_REQUIRED_PREFIXES.some((prefix) => hash.startsWith(prefix));

function Root() {
  const { user, loading, logout } = useAuth();
  const { products: catalogProducts, purchasedIds } = useCatalog();
  const { cartIds, favoriteIds, addToCart, removeFromCart, clearCart, toggleFavorite } = useCommerce();
  const [hash, setHash] = useState(() => window.location.hash);
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

  const selectedCourseProduct = useMemo(() => {
    const routeId = hash.startsWith(COURSE_HASH) ? decodeURIComponent(hash.slice(COURSE_HASH.length).split("?")[0]) : "";
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
    sessionStorage.setItem("authReturnHash", hash);
    window.location.hash = `${AUTH_HASH}?mode=login&return=${encodeURIComponent(hash)}`;
  }, [hash, loading, user]);

  useEffect(() => {
    if (!hash.startsWith(ADMIN_HASH) || hash.startsWith(ADMIN_LOGIN_HASH) || loading) return;
    if (user && hasAdminSession(user.id, user.email, user.role)) return;
    clearAdminSession();
    window.location.hash = ADMIN_LOGIN_HASH;
    if (user) void logout();
  }, [hash, loading, logout, user]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleAddToCart = (id: string) => {
    if (!user) { redirectToAuth(window.location.hash || STORE_HASH); return; }
    const product = shoppingProducts.find((item) => item.id === id);
    void addToCart(id)
      .then(() => showShoppingToast(`${product ? product.title.slice(0, 28) + "…" : "Item"} added to cart`))
      .catch(() => showShoppingToast("Could not update cart"));
  };

  const handleRemoveFromCart = (id: string) => {
    void removeFromCart(id).then(() => showShoppingToast("Removed from cart")).catch(() => showShoppingToast("Could not update cart"));
  };

  const handleClearCart = () => {
    void clearCart().then(() => showShoppingToast("Cart cleared")).catch(() => showShoppingToast("Could not clear cart"));
  };

  const handleToggleFavorite = (id: string) => {
    if (!user) { redirectToAuth(window.location.hash || STORE_HASH); return; }
    void toggleFavorite(id)
      .then((added) => showShoppingToast(added ? "Added to favorites" : "Removed from favorites"))
      .catch(() => showShoppingToast("Could not update favorites"));
  };

  const handleRemoveFromFavorites = (id: string) => {
    void toggleFavorite(id).then(() => showShoppingToast("Removed from favorites")).catch(() => showShoppingToast("Could not update favorites"));
  };

  const handlePurchaseUpdate = (update: PaidCourseUpdate) => {
    if (!user || !selectedCourseProduct) return;
    const context: CheckoutContext = {
      product: {
        id: selectedCourseProduct.id,
        updateSelection: { productId: selectedCourseProduct.id, updateId: update.id, title: update.title, price: update.price },
        name: update.title,
        type: "Course",
        description: `Update for ${selectedCourseProduct.title}: ${update.contentNames.join(", ")}`,
        price: update.price,
        currency: "₹",
        thumbnail: "🆕",
        instructor: selectedCourseProduct.instructor,
        duration: `${update.contentNames.length} new item${update.contentNames.length === 1 ? "" : "s"}`,
        rating: selectedCourseProduct.rating,
        totalRatings: selectedCourseProduct.reviews,
      },
      user: { ...checkoutUser, id: user.id, name: user.name, email: user.email, eduCoins: user.coins },
    };
    applyCheckoutContext(context);
    sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    window.location.hash = CHECKOUT_HASH;
  };

  const handleCartCheckout = () => {
    if (!user) { redirectToAuth(CART_HASH); return; }
    const items = catalogProducts.filter((product) => cartIds.has(product.id));
    if (items.length === 0) return;
    const total = items.reduce((sum, product) => sum + product.price, 0);
    const context: CheckoutContext = {
      product: {
        id: items.length === 1 ? items[0].id : `bundle-${Date.now()}`,
        productIds: items.map((item) => item.id),
        name: items.length === 1 ? items[0].title : `${items.length} Digital Catalyst products`,
        type: "Course",
        description: items.map((item) => item.title).join(", "),
        price: total,
        currency: "₹",
        thumbnail: "🛒",
        instructor: "Digital Catalyst",
        duration: "Lifetime access",
        rating: 0,
        totalRatings: 0,
      },
      user: {
        ...checkoutUser,
        id: user.id,
        name: user.name,
        email: user.email,
        eduCoins: user.coins,
      },
    };
    applyCheckoutContext(context);
    sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    window.location.hash = CHECKOUT_HASH;
  };

  const handleShoppingNavigation = (tab: CartTabKey) => {
    if (tab === "home") window.location.hash = STORE_HASH;
    if (tab === "favorites") window.location.hash = FAVORITES_HASH;
    if (tab === "cart") window.location.hash = CART_HASH;
  };

  const redirectToAuth = (returnHash: string) => {
    sessionStorage.setItem("authReturnHash", returnHash);
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

  const navigateToCheckout = (finalPrice: number, checkoutCatalogProduct = selectedCatalogProduct) => {
    if (!user) {
      sessionStorage.setItem("pendingCheckoutPrice", String(finalPrice));
      redirectToAuth(window.location.hash || PRODUCT_HASH);
      return;
    }

    if (!checkoutCatalogProduct) {
      showShoppingToast("This product is no longer available");
      window.location.hash = STORE_HASH;
      return;
    }

    const context: CheckoutContext = {
      product: {
        id: checkoutCatalogProduct.id,
        name: checkoutCatalogProduct.title,
        type: checkoutCatalogProduct.category === "PDF" || checkoutCatalogProduct.category === "Notes"
          ? "PDF"
          : checkoutCatalogProduct.category === "E-book"
            ? "eBook"
            : checkoutCatalogProduct.category === "Live"
              ? "Live Workshop"
              : "Course",
        description: checkoutCatalogProduct.description || checkoutCatalogProduct.subject,
        price: finalPrice,
        currency: "₹",
        thumbnail: "📘",
        instructor: checkoutCatalogProduct.instructor,
        duration: checkoutCatalogProduct.classLevel,
        rating: checkoutCatalogProduct.rating,
        totalRatings: checkoutCatalogProduct.reviews,
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
  if (hash.startsWith(ADMIN_LOGIN_HASH)) return <AdminLoginApp />;

  if (hash.startsWith(CART_HASH) || hash.startsWith(FAVORITES_HASH)) {
    return (
      <CartWishlistApp
        activeTab={hash.startsWith(CART_HASH) ? "cart" : "favorites"}
        cartProducts={cartProducts}
        favoriteProducts={favoriteProducts}
        cartIds={cartIds}
        favoriteIds={favoriteIds}
        toast={shoppingToast}
        onRemoveFromCart={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onRemoveFromFavorites={handleRemoveFromFavorites}
        onAddToCart={handleAddToCart}
        onCheckout={handleCartCheckout}
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
    if (!savedContext) return <InvalidCheckout onBack={() => { window.location.hash = STORE_HASH; }} />;
    try {
      applyCheckoutContext(JSON.parse(savedContext) as CheckoutContext);
      return <CheckoutApp />;
    } catch {
      sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
      return <InvalidCheckout onBack={() => { window.location.hash = STORE_HASH; }} />;
    }
  }

  if (hash.startsWith(ADMIN_HASH)) return user && hasAdminSession(user.id, user.email, user.role) ? <AdminApp /> : <AdminLoginApp />;
  if (hash.startsWith(SUBSCRIPTION_HASH)) return <SubscriptionApp />;
  if (hash.startsWith(AI_CHAT_HASH)) return <AiChatApp />;
  if (hash.startsWith(COMMUNITY_HASH)) return <CommunityApp />;
  if (hash.startsWith(COURSE_HASH)) {
    if (!selectedCourseProduct) return <InvalidCheckout onBack={() => { window.location.hash = STORE_HASH; }} />;
    if (!purchasedIds.has(selectedCourseProduct.id)) return <PdpApp product={selectedCourseProduct} onCheckout={(price) => navigateToCheckout(price, selectedCourseProduct)} onBack={() => { window.location.hash = STORE_HASH; }} />;
    return <CoursePlayerApp product={selectedCourseProduct} onBack={() => { window.location.hash = "#/store/purchases"; }} onPurchaseUpdate={handlePurchaseUpdate} />;
  }
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
        <CommerceProvider>
          <Root />
        </CommerceProvider>
      </CatalogProvider>
    </AuthProvider>
  </StrictMode>,
);
