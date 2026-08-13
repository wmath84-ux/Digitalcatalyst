import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./landing.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";
import CheckoutApp from "./components/checkout/CheckoutApp";
import MyDayApp from "./MyDayApp";
import ProfileApp from "./profile/App";
import CourseRouteGuard from "./components/CourseRouteGuard";
import CartWishlistApp from "./CartWishlistApp";
import SubscriptionApp from "./subscription/App";
import LandingApp from "./LandingApp";
import AuthApp from "./AuthApp";
import AdminLoginApp from "./AdminLoginApp";
import AdminApp from "./admin/AdminApp";
import NotificationsPage from "./components/NotificationsPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import { CommerceProvider, useCommerce } from "./context/CommerceContext";
import { CheckoutProvider } from "./checkout/CheckoutContext";
import { clearAdminSession, hasAdminSession } from "./utils/adminSession";
import { useOwnedUpdateIds } from "./hooks/useOwnedUpdates";
import { type CheckoutReturnRoute } from "./checkout/types";
import { buildCheckoutSessionRecord, writeToSessionStorage as writeCheckoutToStorage } from "../utils/checkoutSession";
import type { CheckoutSelection } from "./types/commerce";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import type { PaidCourseUpdate } from "./types/course";

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
const CART_HASH = "#/cart";
const FAVORITES_HASH = "#/favorites";
const SUBSCRIPTION_HASH = "#/subscription";
const NOTIFICATIONS_HASH = "#/notifications";
const ADMIN_HASH = "#/admin";
const ADMIN_LOGIN_HASH = "#/admin-login";

type NavigableProduct = {
  id: string;
  title: string;
};

function InvalidCheckout({ onBack }: { onBack: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6 text-center"><div><p className="text-4xl">🛒</p><h1 className="mt-4 text-2xl font-black text-slate-900">Checkout session not found</h1><p className="mt-2 text-sm text-slate-500">Choose a live product before starting secure checkout.</p><button onClick={onBack} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to store</button></div></main>;
}

/**
 * Wraps `PdpApp` with the live ownership state (paid-update ids the user
 * has unlocked for this specific product). Centralising the read here means
 * the two PdpApp call-sites (PDP route + course route when not yet owned)
 * stay identical and the PDP doesn't have to know about Firestore.
 */
function PdpWithOwnership({
  product,
  onCheckout,
  onCheckoutSelection,
  onBack,
  cartIds,
  favoriteIds,
  onAddToCart,
  onToggleFavorite,
  onNavigateToProduct,
  onOpenCourse,
  onNavigateToCart,
  onNavigateToSubscription,
  onNavigateToNotifications,
  onNavigateFooter,
}: {
  product: import("./data/products").Product | null;
  onCheckout: (price: number) => void;
  onCheckoutSelection: (selection: CheckoutSelection, price: number) => void;
  onBack: () => void;
  cartIds: Set<string>;
  favoriteIds: Set<string>;
  onAddToCart: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigateToProduct: (product: import("./data/products").Product) => void;
  onOpenCourse: (product: import("./data/products").Product) => void;
  onNavigateToCart: () => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  onNavigateFooter: (tab: import("./components/BottomNav").TabKey) => void;
}) {
  const { products, purchasedIds } = useCatalog();
  const ownedUpdateIds = useOwnedUpdateIds(product?.id || null);
  return (
    <PdpApp
      product={product}
      products={products}
      cartIds={cartIds}
      favoriteIds={favoriteIds}
      onCheckout={onCheckout}
      onCheckoutSelection={onCheckoutSelection}
      onBack={onBack}
      onAddToCart={onAddToCart}
      onToggleFavorite={onToggleFavorite}
      onNavigateToProduct={onNavigateToProduct}
      onOpenCourse={onOpenCourse}
      onNavigateToCart={onNavigateToCart}
      onNavigateToSubscription={onNavigateToSubscription}
      onNavigateToNotifications={onNavigateToNotifications}
      onNavigateFooter={onNavigateFooter}
      purchasedIds={purchasedIds}
      ownedUpdateIds={ownedUpdateIds}
    />
  );
}

const AUTH_REQUIRED_PREFIXES = [
  CHECKOUT_HASH,
  MY_DAY_HASH,
  PROFILE_HASH,
  COURSE_HASH,
  SUBSCRIPTION_HASH,
];

const requiresAuthentication = (hash: string) =>
  AUTH_REQUIRED_PREFIXES.some((prefix) => hash.startsWith(prefix));

/**
 * Start a new checkout: build a validated session record, write it to
 * sessionStorage, and navigate to `#/checkout`. The CheckoutContext
 * provider (mounted by `CheckoutRoute`) reads the record on mount and
 * fetches the verified ServerPriceQuote.
 */
const startCheckout = ({
  selection,
  buyer,
  returnRoute,
  idempotencyKey,
}: {
  selection: CheckoutSelection;
  buyer: { uid: string; name: string; email: string; mobile?: string | null; coins?: number; emailVerified?: boolean };
  returnRoute: CheckoutReturnRoute;
  idempotencyKey?: string | null;
}) => {
  if (typeof window === "undefined") return;
  const record = buildCheckoutSessionRecord({
    selection,
    quote: null,
    buyer: {
      uid: buyer.uid,
      name: buyer.name,
      email: buyer.email,
      mobile: buyer.mobile ?? null,
      emailVerified: Boolean(buyer.emailVerified),
      tokenVerified: Boolean(buyer.uid),
      coins: Number(buyer.coins || 0),
    },
    returnRoute,
    idempotencyKey: idempotencyKey || null,
  });
  if (record) writeCheckoutToStorage(record);
  window.location.hash = CHECKOUT_HASH;
};

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
    startCheckout({
      selection: {
        purchaseKind: "paid_update",
        productIds: [selectedCourseProduct.id],
        moduleIds: [],
        resourceIds: [],
        updateId: update.id,
        subscriptionPlanId: null,
        billingCycle: null,
        featureIds: [],
        couponCode: null,
        requestedEduCoins: 0,
        returnRoute: null,
      },
      buyer: {
        uid: user.id,
        name: user.name,
        email: user.email,
        mobile: null,
        coins: user.coins,
        emailVerified: false,
      },
      returnRoute: { hash: `#/course/${encodeURIComponent(selectedCourseProduct.id)}` },
      idempotencyKey: `update:${selectedCourseProduct.id}:${update.id}:${Date.now()}`,
    });
  };

  const handleCartCheckout = () => {
    if (!user) { redirectToAuth(CART_HASH); return; }
    const items = catalogProducts.filter((product) => cartIds.has(product.id));
    if (items.length === 0) return;
    startCheckout({
      selection: {
        purchaseKind: "cart_bundle",
        productIds: items.map((item) => item.id),
        moduleIds: [],
        resourceIds: [],
        updateId: null,
        subscriptionPlanId: null,
        billingCycle: null,
        featureIds: [],
        couponCode: null,
        requestedEduCoins: 0,
        returnRoute: null,
      },
      buyer: {
        uid: user.id,
        name: user.name,
        email: user.email,
        mobile: null,
        coins: user.coins,
        emailVerified: false,
      },
      returnRoute: { hash: CART_HASH },
      idempotencyKey: `cart:${user.id}:${Date.now()}`,
    });
  };

  const handleShoppingNavigation = (tab: CartTabKey) => {
    if (tab === "home") window.location.hash = HOME_HASH;
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

  const navigateToProductReview = (product: NavigableProduct) => {
    sessionStorage.setItem("selectedProduct", JSON.stringify(product));
    window.location.hash = `${PRODUCT_HASH}${encodeURIComponent(product.id)}?section=reviews`;
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

    startCheckout({
      selection: {
        purchaseKind: "full_product",
        productIds: [checkoutCatalogProduct.id],
        moduleIds: [],
        resourceIds: [],
        updateId: null,
        subscriptionPlanId: null,
        billingCycle: null,
        featureIds: [],
        couponCode: null,
        requestedEduCoins: 0,
        returnRoute: null,
      },
      buyer: {
        uid: String(user.id),
        name: user.name,
        email: user.email,
        mobile: null,
        coins: user.coins,
        emailVerified: false,
      },
      returnRoute: { hash: `${PRODUCT_HASH}${encodeURIComponent(checkoutCatalogProduct.id)}` },
      idempotencyKey: `full:${checkoutCatalogProduct.id}:${user.id}:${Date.now()}`,
    });
  };

  const navigatePdpSelectionToCheckout = (selection: CheckoutSelection, finalPrice: number) => {
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
    startCheckout({
      selection,
      buyer: {
        uid: String(user.id),
        name: user.name,
        email: user.email,
        mobile: null,
        coins: user.coins,
        emailVerified: false,
      },
      returnRoute: { hash: `${PRODUCT_HASH}${encodeURIComponent(selectedCatalogProduct.id)}` },
      idempotencyKey: `${selection.purchaseKind}:${selectedCatalogProduct.id}:${user.id}:${Date.now()}`,
    });
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
        onNavigateToProductReview={navigateToProductReview}
        onNavigateToMyDay={() => {
          window.location.hash = MY_DAY_HASH;
        }}
        onNavigateToProfile={() => {
          window.location.hash = PROFILE_HASH;
        }}
        onNavigateToPurchases={() => {
          window.location.hash = `${STORE_HASH}/purchases`;
        }}
        onNavigateToFavorites={() => {
          window.location.hash = FAVORITES_HASH;
        }}
        onNavigateToNotifications={() => {
          window.location.hash = NOTIFICATIONS_HASH;
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
        onNavigateToSubscription={() => {
          window.location.hash = SUBSCRIPTION_HASH;
        }}
        onNavigateToNotifications={() => {
          window.location.hash = NOTIFICATIONS_HASH;
        }}
        onRequireAuth={() => {
          if (user) return true;
          redirectToAuth(CART_HASH);
          return false;
        }}
      />
    );
  }

  if (hash.startsWith(CHECKOUT_HASH)) {
    return (
      <CheckoutProvider>
        <CheckoutApp />
      </CheckoutProvider>
    );
  }

  if (hash.startsWith(ADMIN_HASH)) return user && hasAdminSession(user.id, user.email, user.role) ? <AdminApp /> : <AdminLoginApp />;
  if (hash.startsWith(SUBSCRIPTION_HASH)) return <SubscriptionApp />;
  if (hash.startsWith(NOTIFICATIONS_HASH)) {
    return (
      <NotificationsPage
        cartCount={cartIds.size}
        purchasesBadge={purchasedIds.size}
        onNavigateToCart={() => {
          window.location.hash = CART_HASH;
        }}
        onNavigateToSubscription={() => {
          window.location.hash = SUBSCRIPTION_HASH;
        }}
        onNavigateFooter={(tab) => {
          if (tab === "home") window.location.hash = HOME_HASH;
          else if (tab === "myday") window.location.hash = MY_DAY_HASH;
          else if (tab === "store") window.location.hash = STORE_HASH;
          else if (tab === "purchases") window.location.hash = `${STORE_HASH}/purchases`;
          else if (tab === "profile") window.location.hash = PROFILE_HASH;
        }}
      />
    );
  }
  if (hash.startsWith(COURSE_HASH)) {
    if (!selectedCourseProduct) return <InvalidCheckout onBack={() => { window.location.hash = STORE_HASH; }} />;
    return (
      <CourseRouteGuard
        product={selectedCourseProduct}
        onCheckout={(price) => navigateToCheckout(price, selectedCourseProduct)}
        onBack={() => { window.location.hash = STORE_HASH; }}
        onPurchaseUpdate={handlePurchaseUpdate}
      />
    );
  }
  if (hash.startsWith(PROFILE_HASH)) return <ProfileApp />;
  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(PRODUCT_HASH)) {
    return (
      <PdpWithOwnership
        product={selectedCatalogProduct}
        onCheckout={navigateToCheckout}
        onCheckoutSelection={navigatePdpSelectionToCheckout}
        onBack={() => { window.location.hash = STORE_HASH; }}
        cartIds={cartIds}
        favoriteIds={favoriteIds}
        onAddToCart={handleAddToCart}
        onToggleFavorite={handleToggleFavorite}
        onNavigateToProduct={navigateToProduct}
        onOpenCourse={navigateToCourse}
        onNavigateToCart={() => { window.location.hash = CART_HASH; }}
        onNavigateToSubscription={() => { window.location.hash = SUBSCRIPTION_HASH; }}
        onNavigateToNotifications={() => { window.location.hash = NOTIFICATIONS_HASH; }}
        onNavigateFooter={(tab) => {
          if (tab === "home") window.location.hash = HOME_HASH;
          else if (tab === "myday") window.location.hash = MY_DAY_HASH;
          else if (tab === "store") window.location.hash = STORE_HASH;
          else if (tab === "purchases") window.location.hash = `${STORE_HASH}/purchases`;
          else if (tab === "profile") window.location.hash = PROFILE_HASH;
        }}
      />
    );
  }
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
        onNavigateToHome={() => {
          window.location.hash = HOME_HASH;
        }}
        onNavigateToCourse={navigateToCourse}
        onNavigateToSubscription={() => {
          window.location.hash = SUBSCRIPTION_HASH;
        }}
        onNavigateToNotifications={() => {
          window.location.hash = NOTIFICATIONS_HASH;
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
      onNavigateToProductReview={navigateToProductReview}
      onNavigateToMyDay={() => {
        window.location.hash = MY_DAY_HASH;
      }}
      onNavigateToProfile={() => {
        window.location.hash = PROFILE_HASH;
      }}
      onNavigateToPurchases={() => {
        window.location.hash = `${STORE_HASH}/purchases`;
      }}
      onNavigateToFavorites={() => {
        window.location.hash = FAVORITES_HASH;
      }}
      onNavigateToNotifications={() => {
        window.location.hash = NOTIFICATIONS_HASH;
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
