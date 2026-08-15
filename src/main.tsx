import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "./index.css";
import "./landing.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";
import CheckoutApp from "./components/checkout/CheckoutApp";
import MyDayApp from "./MyDayApp";
import LeaderboardApp from "./LeaderboardApp";
import ProfileApp from "./profile/App";
import CourseRouteGuard from "./components/CourseRouteGuard";
import CartWishlistApp from "./CartWishlistApp";
import SubscriptionApp from "./subscription/App";
import LandingApp from "./LandingApp";
import AuthApp from "./AuthApp";
import AdminLoginApp from "./AdminLoginApp";
import AdminApp from "./admin/AdminApp";
import NotificationsPage from "./components/NotificationsPage";
import RenewalPreviewPage from "./components/subscription/RenewalPreviewPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import { CommerceProvider, useCommerce } from "./context/CommerceContext";
import { CheckoutProvider } from "./checkout/CheckoutContext";
import { clearAdminSession, hasAdminSession } from "./utils/adminSession";
import { useOwnedUpdateIds } from "./hooks/useOwnedUpdates";
import { type CheckoutReturnRoute } from "./checkout/types";
import { buildContentNotificationInventory, createContentNotifications, loadContentNotificationBaseline, loadSiteNotifications, mergeSiteNotifications, saveContentNotificationBaseline, saveSiteNotifications, type SiteNotification } from "../utils/siteNotifications";
import { getRenewalReminder } from "../utils/subscriptionRenewal";
import { buildCheckoutSessionRecord, writeToSessionStorage as writeCheckoutToStorage } from "../utils/checkoutSession";
import type { CheckoutSelection } from "./types/commerce";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import type { PaidCourseUpdate } from "./types/course";
import { isDesktopBrowserLocked, isInstalledMobilePwa, showDesktopMaintenanceNotice } from "./utils/pwaInstall";
import { disablePageZoom } from "./utils/disablePageZoom";
import { ensureSavedWebPushSubscription, showLocalSystemNotification } from "../utils/webPush";
import { collectDueMyDayItems, type MyDayDocData } from "../utils/pushScheduler";
import { playSfxAdd, playSfxError, playSfxRemove } from "./utils/sfx";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
  // The service worker focuses an already-open PWA window on notification
  // taps. Finish the job in the page by navigating to the notification URL.
  navigator.serviceWorker.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "site-notification-open" && message.notificationId) {
      window.location.hash = NOTIFICATIONS_HASH;
      return;
    }
    if (message.type === "push-open" && typeof message.url === "string") {
      const hashIndex = message.url.indexOf("#");
      if (hashIndex >= 0) window.location.hash = message.url.slice(hashIndex);
      else window.location.assign(message.url);
    }
  });
}

if (typeof window !== "undefined") {
  disablePageZoom();
}

const LANDING_HASH = "#/landing";
const HOME_HASH = "#/home";
const AUTH_HASH = "#/auth";
const STORE_HASH = "#/store";
const PRODUCT_HASH = "#/product/";
const CHECKOUT_HASH = "#/checkout";
const MY_DAY_HASH = "#/my-day";
const LEADERBOARD_HASH = "#/leaderboard";
const PROFILE_HASH = "#/profile";
const COURSE_HASH = "#/course/";
const CART_HASH = "#/cart";
const FAVORITES_HASH = "#/favorites";
const SUBSCRIPTION_HASH = "#/subscription";
const NOTIFICATIONS_HASH = "#/notifications";
// Developer sandbox for the expiry / renewal messaging. Pure preview:
// it synthesises a subscription document and never touches Firestore.
const RENEWAL_PREVIEW_HASH = "#/dev/subscription-preview";
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
  onCheckout: (price: number, couponCode?: string | null) => void;
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

function AppLaunchSplash({ label = "Preparing your learning space…" }: { label?: string }) {
  return (
    <main className="app-boot-splash" role="status" aria-live="polite" aria-label="Loading Eduvora">
      <div className="app-boot-content">
        <img className="app-boot-icon" src="/icons/icon-192x192.svg" alt="Eduvora" />
        <p className="app-boot-title">Eduvora</p>
        <p className="app-boot-label">{label}</p>
        <div className="app-boot-track" aria-hidden="true"><div className="app-boot-bar" /></div>
      </div>
    </main>
  );
}

function Root() {
  const { user, loading, logout } = useAuth();
  const { products: catalogProducts, purchasedIds, loading: catalogLoading } = useCatalog();
  const { cartIds, favoriteIds, addToCart, removeFromCart, clearCart, toggleFavorite } = useCommerce();
  const [hash, setHash] = useState(() => window.location.hash);
  const [shoppingToast, setShoppingToast] = useState<string | null>(null);
  const [desktopLocked, setDesktopLocked] = useState(() => isDesktopBrowserLocked());
  const [installedMobilePwa, setInstalledMobilePwa] = useState(() => isInstalledMobilePwa());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingRouteRequested = !hash || hash.startsWith(LANDING_HASH);
  // Mobile + installed PWA: never show landing. Everyone else on mobile
  // (logged in or not) starts on landing and opens the app from there.
  const skipLandingForInstalledMobilePwa = Boolean(installedMobilePwa && landingRouteRequested && !desktopLocked);

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
    const syncInstallState = () => {
      setDesktopLocked(isDesktopBrowserLocked());
      setInstalledMobilePwa(isInstalledMobilePwa());
    };
    const handleHashChange = () => setHash(window.location.hash);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("resize", syncInstallState);
    window.addEventListener("appinstalled", syncInstallState);
    displayMode.addEventListener?.("change", syncInstallState);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("resize", syncInstallState);
      window.removeEventListener("appinstalled", syncInstallState);
      displayMode.removeEventListener?.("change", syncInstallState);
    };
  }, []);

  useEffect(() => {
    if (!desktopLocked) return;
    if (hash.startsWith(ADMIN_HASH) || hash.startsWith(ADMIN_LOGIN_HASH)) return;
    if (!hash || hash.startsWith(LANDING_HASH)) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${LANDING_HASH}`);
    setHash(LANDING_HASH);
    showDesktopMaintenanceNotice();
  }, [desktopLocked, hash]);

  useEffect(() => {
    if (!skipLandingForInstalledMobilePwa) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${HOME_HASH}`);
    setHash(HOME_HASH);
  }, [skipLandingForInstalledMobilePwa]);

  useEffect(() => {
    if (!user) return;
    void ensureSavedWebPushSubscription(user.id);

    // Android/Chrome may refuse a permission prompt started from an effect.
    // Retry on the user's first real tap, which is a valid browser gesture.
    // Once granted, this also refreshes the saved endpoint on every login.
    const subscribeOnGesture = () => {
      void ensureSavedWebPushSubscription(user.id);
    };
    window.addEventListener("pointerdown", subscribeOnGesture, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", subscribeOnGesture, { capture: true });
  }, [user]);

  // Foreground safety net for My Day. Server Web Push is still responsible
  // when the PWA is closed; while it is open this clock guarantees every due
  // task, schedule event and reminder becomes an Android/system notification
  // even if the external minute scheduler is delayed.
  useEffect(() => {
    if (!user) return undefined;
    let current: MyDayDocData | null = null;
    const pending = new Set<string>();
    const shownKey = `eduvora.myDaySystemNotifications.v1:${user.id}`;
    const readShown = (): Record<string, number> => {
      try { return JSON.parse(localStorage.getItem(shownKey) || "{}"); } catch { return {}; }
    };
    const checkDue = () => {
      if (!current) return;
      const now = Date.now();
      const shown = readShown();
      const due = collectDueMyDayItems(current, now, new Date().getTimezoneOffset());
      for (const item of due) {
        if (shown[item.key] || pending.has(item.key)) continue;
        pending.add(item.key);
        void showLocalSystemNotification(item.title, item.body, "/#/my-day", `myday-${item.key}`)
          .then((displayed) => {
            // Do not dedupe a failed display (for example before permission is
            // granted); the next tick must be allowed to retry it.
            if (!displayed) return;
            const latest = readShown();
            latest[item.key] = Date.now();
            try { localStorage.setItem(shownKey, JSON.stringify(latest)); } catch { /* restricted storage */ }
          })
          .finally(() => pending.delete(item.key));
      }
      const cutoff = now - 2 * 24 * 60 * 60 * 1000;
      Object.keys(shown).forEach((key) => { if (shown[key] < cutoff) delete shown[key]; });
      try { localStorage.setItem(shownKey, JSON.stringify(shown)); } catch { /* restricted storage */ }
    };
    const unsubscribe = onSnapshot(doc(db, "users", user.id, "myDay", "current"), (snapshot) => {
      current = snapshot.exists() ? snapshot.data() as MyDayDocData : null;
      checkDue();
    });
    const timer = window.setInterval(checkDue, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") checkDue(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      const reminder = getRenewalReminder(snapshot.data() || null);
      if (!reminder) return;
      const incoming: SiteNotification = { ...reminder, category: "subscription", read: false, source: "system" };
      saveSiteNotifications(user.id, mergeSiteNotifications(loadSiteNotifications(user.id), [incoming]));
    });
  }, [user]);

  useEffect(() => {
    if (!user || catalogProducts.length === 0) return;
    const current = buildContentNotificationInventory({ products: catalogProducts, articles: [], announcements: [], purchasedProductIds: Array.from(purchasedIds) });
    const previous = loadContentNotificationBaseline(user.id);
    if (previous) {
      const incoming = createContentNotifications(previous, current);
      if (incoming.length > 0) {
        saveSiteNotifications(user.id, mergeSiteNotifications(loadSiteNotifications(user.id), incoming));
        // Foreground fallback: Web Push normally supplies this system alert.
        // A stable tag lets Android collapse it with the matching server push.
        incoming.forEach((notification) => {
          const target = notification.target;
          const url = target.type === "product"
            ? `/#/product/${encodeURIComponent(String(target.productId))}`
            : target.type === "purchases" ? "/#/store/purchases" : "/#/notifications";
          void showLocalSystemNotification(notification.title, notification.body, url, notification.id);
        });
      }
    }
    saveContentNotificationBaseline(user.id, current);
  }, [catalogProducts, purchasedIds, user]);

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
      .then(() => { playSfxAdd(); showShoppingToast(`${product ? product.title.slice(0, 28) + "…" : "Item"} added to cart`); })
      .catch(() => { playSfxError(); showShoppingToast("Could not update cart"); });
  };

  const handleRemoveFromCart = (id: string) => {
    void removeFromCart(id).then(() => { playSfxRemove(); showShoppingToast("Removed from cart"); }).catch(() => { playSfxError(); showShoppingToast("Could not update cart"); });
  };

  const handleClearCart = () => {
    void clearCart().then(() => { playSfxRemove(); showShoppingToast("Cart cleared"); }).catch(() => { playSfxError(); showShoppingToast("Could not clear cart"); });
  };

  const handleToggleFavorite = (id: string) => {
    if (!user) { redirectToAuth(window.location.hash || STORE_HASH); return; }
    void toggleFavorite(id)
      .then((added) => { if (added) playSfxAdd(); else playSfxRemove(); showShoppingToast(added ? "Added to favorites" : "Removed from favorites"); })
      .catch(() => { playSfxError(); showShoppingToast("Could not update favorites"); });
  };

  const handleRemoveFromFavorites = (id: string) => {
    void toggleFavorite(id).then(() => { playSfxRemove(); showShoppingToast("Removed from favorites"); }).catch(() => { playSfxError(); showShoppingToast("Could not update favorites"); });
  };

  const handlePurchaseUpdate = (update: PaidCourseUpdate) => {
    if (!user || !selectedCourseProduct) return;
    startCheckout({
      selection: {
        purchaseKind: "paid_update",
        productIds: [selectedCourseProduct.documentId || selectedCourseProduct.id],
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

  const navigateToCheckout = (finalPrice: number, couponCode: string | null = null) => {
    const checkoutCatalogProduct = selectedCatalogProduct;
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
        productIds: [checkoutCatalogProduct.documentId || checkoutCatalogProduct.id],
        moduleIds: [],
        resourceIds: [],
        updateId: null,
        subscriptionPlanId: null,
        billingCycle: null,
        featureIds: [],
        couponCode: couponCode || null,
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

  if (desktopLocked && !hash.startsWith(ADMIN_HASH) && !hash.startsWith(ADMIN_LOGIN_HASH)) {
    return <LandingApp />;
  }

  if (loading || skipLandingForInstalledMobilePwa || Boolean(user && user.role !== "admin" && catalogLoading && hash.startsWith(HOME_HASH))) {
    return <AppLaunchSplash label={skipLandingForInstalledMobilePwa ? "Opening your dashboard…" : "Preparing your learning space…"} />;
  }

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
        onNavigateToCourse={navigateToCourse}
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
        onOpenProduct={(id) => {
          const product = catalogProducts.find((item) => item.id === id);
          if (product) navigateToProduct({ id: product.id, title: product.title });
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
  if (hash.startsWith(RENEWAL_PREVIEW_HASH)) {
    return <RenewalPreviewPage onBack={() => { window.location.hash = SUBSCRIPTION_HASH; }} />;
  }
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
    if (!selectedCourseProduct) return <InvalidCheckout onBack={() => { window.location.hash = `${STORE_HASH}/purchases`; }} />;
    return (
      <CourseRouteGuard
        product={selectedCourseProduct}
        onCheckout={(price) => navigateToCheckout(price)}
        onBack={() => { window.location.hash = `${STORE_HASH}/purchases`; }}
        onPurchaseUpdate={handlePurchaseUpdate}
      />
    );
  }
  if (hash.startsWith(PROFILE_HASH)) return <ProfileApp />;
  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(LEADERBOARD_HASH)) return <LeaderboardApp />;
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
      onNavigateToCourse={navigateToCourse}
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
