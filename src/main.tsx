import { StrictMode, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "@xyflow/react/dist/style.css";
import "./index.css";
import "./landing.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";
import CheckoutApp from "./components/checkout/CheckoutApp";
import MyDayApp from "./MyDayApp";
import LeaderboardApp from "./LeaderboardApp";
import RevisionApp from "./revision/RevisionApp";
import ProfileApp from "./profile/App";
import SettingsPage from "./settings/SettingsPage";
import SubscriberExperiencePage from "./profile/SubscriberExperiencePage";
import ProfilePreview from "./profile/ProfilePreview";
import CourseRouteGuard from "./components/CourseRouteGuard";
import CartWishlistApp from "./CartWishlistApp";
import SubscriptionApp from "./subscription/App";
import LandingApp from "./LandingApp";
import AuthApp from "./AuthApp";
import AdminLoginApp from "./AdminLoginApp";
import AdminApp from "./admin/AdminApp";
import FlowPathApp from "./FlowPathApp";
import NotificationsPage from "./components/NotificationsPage";
import SearchPage from "./components/SearchPage";
import RenewalPreviewPage from "./components/subscription/RenewalPreviewPage";
import RenewalBannerHost from "./components/subscription/RenewalBannerHost";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BrandingProvider, useBranding } from "./context/BrandingContext";
import PortraitOnlyGuard from "./components/PortraitOnlyGuard";
import { CatalogProvider, useCatalog } from "./context/CatalogContext";
import { CommerceProvider, useCommerce } from "./context/CommerceContext";
import { initFooterGlow } from "./utils/footerGlow";
import { CheckoutProvider } from "./checkout/CheckoutContext";
import { clearAdminSession, hasAdminSession } from "./utils/adminSession";
import { useOwnedUpdateIds } from "./hooks/useOwnedUpdates";
import { type CheckoutReturnRoute } from "./checkout/types";
import { getMyDayItemDeepLink } from "../utils/siteNotifications";
import { buildCheckoutSessionRecord, writeToSessionStorage as writeCheckoutToStorage } from "../utils/checkoutSession";
import type { CheckoutSelection } from "./types/commerce";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import type { PaidCourseUpdate } from "./types/course";
import { isDesktopBrowserLocked, isInstalledMobilePwa, showDesktopMaintenanceNotice } from "./utils/pwaInstall";
import { disablePageZoom } from "./utils/disablePageZoom";
import { setThemeColor, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "./utils/themeColor";
import { initOrientationLock } from "./utils/appOrientation";
import { recordRouteVisit } from "./utils/routeHistory";
import { requiresAuthentication } from "./utils/appRoutes";
import AppShell from "./components/AppShell";
import { resolveActiveFromHash } from "./components/DesktopShell";
import { useResponsiveCategory } from "./utils/responsive";
import { ensureSavedWebPushSubscription, showLocalSystemNotification } from "../utils/webPush";
import { collectDueMyDayItems, type MyDayDocData } from "../utils/pushScheduler";
import { playSfxAdd, playSfxError, playSfxRemove } from "./utils/sfx";
import {
  isAndroidNative,
  isNativeApp,
  onLocalAlarmTap,
  registerForPush,
  scheduleLocalAlarm,
  cancelLocalAlarms,
  type LocalAlarmItem,
} from "./utils/capacitorBridge";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
  // The service worker focuses an already-open PWA window on notification
  // taps. Finish the job in the page by navigating to the notification's
  // exact URL (hash route). The worker now always includes the url in the
  // message so the deep link survives every click path.
  navigator.serviceWorker.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "site-notification-open") {
      if (typeof message.url === "string" && message.url.includes("#")) {
        window.location.hash = message.url.slice(message.url.indexOf("#"));
      } else {
        window.location.hash = NOTIFICATIONS_HASH;
      }
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
  // HARD RULE: Mobile portrait lock - everywhere except course player
  initOrientationLock();
}

const LANDING_HASH = "#/landing";
const HOME_HASH = "#/home";
const AUTH_HASH = "#/auth";
const STORE_HASH = "#/store";
const PRODUCT_HASH = "#/product/";
const CHECKOUT_HASH = "#/checkout";
const MY_DAY_HASH = "#/my-day";
const LEADERBOARD_HASH = "#/leaderboard";
const REVISION_HASH = "#/revision";
const PROFILE_HASH = "#/profile";
// Dedicated Settings / Preferences page (the desktop rail's Settings entry).
const SETTINGS_HASH = "#/settings";
const PROFILE_SUBSCRIBER_EXPERIENCE_HASH = "#/profile/subscriber-experience";
const COURSE_HASH = "#/course/";
const CART_HASH = "#/cart";
const FAVORITES_HASH = "#/favorites";
const SUBSCRIPTION_HASH = "#/subscription";
const NOTIFICATIONS_HASH = "#/notifications";
const SEARCH_HASH = "#/search";
// Developer sandbox for the expiry / renewal messaging. Pure preview:
// it synthesises a subscription document and never touches Firestore.
const RENEWAL_PREVIEW_HASH = "#/dev/subscription-preview";
// Developer visual sandbox for the redesigned Profile layout. Renders the
// layout with mock data so its responsive behaviour can be reviewed on any
// screen without auth. Never touches Firestore.
const PROFILE_PREVIEW_HASH = "#/dev/profile-preview";
const FLOWPATH_HASH = "#/flowpath";
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
  buyer: { uid: string; name: string; email: string; mobile?: string | null; emailVerified?: boolean };
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
    },
    returnRoute,
    idempotencyKey: idempotencyKey || null,
  });
  if (record) writeCheckoutToStorage(record);
  window.location.hash = CHECKOUT_HASH;
};

function AppLaunchSplash({ label = "Preparing your learning space…" }: { label?: string }) {
  const { logoUrl, appName } = useBranding();
  return (
    <main className="app-boot-splash" role="status" aria-live="polite" aria-label={`Loading ${appName}`}>
      <div className="app-boot-content">
        <img className="app-boot-icon" src={logoUrl} alt={appName} />
        <p className="app-boot-title">{appName}</p>
        <p className="app-boot-label">{label}</p>
        <div className="app-boot-track" aria-hidden="true"><div className="app-boot-bar" /></div>
      </div>
    </main>
  );
}

/**
 * Renewal notice for the whole shell.
 *
 * `Root` returns early on almost every route, so the banner cannot live
 * inside it without being repeated a dozen times. Mounting it as a
 * sibling keeps exactly one instance alive across navigations — the
 * host itself decides when to stay quiet.
 */
function RenewalNotice() {
  const { user } = useAuth();
  return (
    <RenewalBannerHost
      uid={user?.id ?? null}
      onRenew={() => {
        window.location.hash = `${SUBSCRIPTION_HASH}?renew=1`;
      }}
    />
  );
}

function Root() {
  // Root is the desktop shell's host. Mobile + tablet get the same
  // page body, but the per-page chrome (Header + BottomNav) is still
  // rendered inside each app — the desktop CSS hides it on >= 1024 px.
  // The shell (left rail + top bar) takes over from there.
  return (
    <DesktopAppHost>
      <RootPage />
    </DesktopAppHost>
  );
}

/**
 * Tiny wrapper that conditionally mounts the desktop shell on
 * viewports >= 1024 px. Uses the same responsive hook as
 * AppShell, but here it lives at the routing level (above RootPage)
 * so every page — including the landing, checkout and auth pages —
 * gets the desktop chrome for free. Mobile + tablet just pass the
 * children through unchanged.
 */
function DesktopAppHost({ children }: { children: ReactNode }) {
  const category = useResponsiveCategory();
  const [hash, setHash] = useState<string>(() => (typeof window !== "undefined" ? window.location.hash : ""));
  const [isTabletDesktop, setIsTabletDesktop] = useState(false);

  // Tablet landscape = desktop detection
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const checkTabletDesktop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const landscape = w > h;
      let isTabletDevice = false;
      try {
        const sw = window.screen?.width ?? 0;
        const sh = window.screen?.height ?? 0;
        isTabletDevice = Math.min(sw, sh) >= 600;
      } catch {
        isTabletDevice = w >= 640;
      }
      const shouldDesktop = w >= 960 || (landscape && isTabletDevice && w >= 640);
      setIsTabletDesktop(shouldDesktop);
    };
    checkTabletDesktop();
    window.addEventListener("resize", checkTabletDesktop);
    window.addEventListener("orientationchange", checkTabletDesktop);
    return () => {
      window.removeEventListener("resize", checkTabletDesktop);
      window.removeEventListener("orientationchange", checkTabletDesktop);
    };
  }, []);

  // Re-render on hash change so the active rail item follows the URL.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // Show desktop shell for desktop OR tablet landscape/wide tablet
  if (category !== "desktop" && !isTabletDesktop) {
    return <>{children}</>;
  }

  // Skip the shell on routes that are designed as full-screen experiences
  // (checkout has its own payment iframe, the course player has its own
  // immersive layout, the admin has its own shell). On those routes
  // the mobile + tablet chrome is hidden too — keeping the desktop
  // shell out of the way preserves the full-bleed experience.
  //
  // The landing page is a standalone marketing page: wrapping it in the
  // app shell squeezed the hero into a small box beside the rail, hid the
  // sections below from the page scroll and stretched the fixed header
  // edge-to-edge. It renders full-bleed at every size instead — desktop
  // browsers are locked to it anyway (Open App shows the install-PWA
  // notice), so any hash that ends up rendering the landing also passes
  // through unchanged.
  if (
    !hash
    || hash.startsWith(LANDING_HASH)
    || isDesktopBrowserLocked()
    || hash.startsWith("#/checkout")
    || hash.startsWith("#/auth")
    || hash.startsWith("#/admin")
    || hash.startsWith("#/admin-login")
    || hash.startsWith("#/course/")
    || hash.startsWith("#/flowpath")
    || hash.startsWith(PROFILE_PREVIEW_HASH)
  ) {
    return <>{children}</>;
  }

  return (
    <AppShell active={resolveActiveFromHash(hash)}>
      {children}
    </AppShell>
  );
}

/**
 * The routing + auth-guard + chrome logic. Returns the page element
 * (or a splash / loading / landing fallback) without knowing about the
 * desktop shell — the desktop wrapper lives in `Root` above so the
 * whole routing tree can be wrapped in a single AppShell.
 */
function RootPage(): ReactNode {
  const { user, loading, logout } = useAuth();
  const { openingAnimationEnabled } = useBranding();
  const { products: catalogProducts, purchasedIds, loading: catalogLoading } = useCatalog();
  const { cartIds, favoriteIds, addToCart, removeFromCart, clearCart, toggleFavorite } = useCommerce();
  const [hash, setHash] = useState(() => window.location.hash);
  const [shoppingToast, setShoppingToast] = useState<string | null>(null);
  const [desktopLocked, setDesktopLocked] = useState(() => isDesktopBrowserLocked());
  const [installedMobilePwa, setInstalledMobilePwa] = useState(() => isInstalledMobilePwa());
  // Live viewport category so the AppShell wrapper re-renders when the
  // learner resizes across the desktop / tablet / mobile boundaries.
  // Tablet + mobile get the existing per-page chrome; desktop gets the
  // new DesktopShell (persistent left rail + sticky top bar).
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

  // Course deep-link module (`#/course/<id>?module=<moduleId>`). Set by
  // admin-linked home hero slides so the player opens straight at that
  // product's specific module.
  const selectedCourseModuleId = useMemo(() => {
    if (!hash.startsWith(COURSE_HASH)) return null;
    const query = hash.split("?")[1] || "";
    const moduleParam = new URLSearchParams(query).get("module");
    return moduleParam ? moduleParam : null;
  }, [hash]);

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

  // Capacitor / TWA wiring. On the installed Android app the web-push
  // helper is irrelevant (it can never wake the device reliably because
  // the TWA service worker is throttled like any other background tab).
  // We register for FCM instead and route local taps through the same
  // hash deep-link the SW uses. The TWA also installs a local-alarm
  // tap listener once so foreground + backgrounded alarms land on the
  // right page.
  useEffect(() => {
    if (!user || !isNativeApp()) return undefined;
    void registerForPush(async () => {
      // The Firebase Auth id token is what /api/push/fcm-register expects.
      // The AuthContext already keeps a fresh idToken in memory; we
      // surface a getter so the TWA never has to re-implement Firebase
      // auth.
      try {
        const { auth } = await import("../firebase");
        if (!auth?.currentUser) return null;
        return await auth.currentUser.getIdToken(true);
      } catch {
        return null;
      }
    });
    // Tapping a local notification deep-links to its URL — the data we
    // pass when scheduling the alarm carries the same hash routes the
    // web uses (e.g. "/#/my-day?section=tasks&item=abc").
    void onLocalAlarmTap((url) => {
      const hashIndex = url.indexOf("#");
      if (hashIndex >= 0) window.location.hash = url.slice(hashIndex);
    });
    return undefined;
  }, [user]);

  // Foreground safety net for My Day. Server Web Push is still responsible
  // when the PWA is closed; while it is open this clock guarantees every due
  // task, schedule event and reminder becomes an Android/system notification
  // even if the external minute scheduler is delayed.
  //
  // On the TWA we go one step further and ALSO schedule a local
  // notification at the exact wall-clock time. Local alarms (Android
  // AlarmManager) fire even when the app process is killed, the
  // device is locked, or doze mode is on — they are the only delivery
  // mechanism that actually gives a "1 minute exact" guarantee on
  // Android. The local alarm has a stable numeric id derived from the
  // item key, so updating the My Day doc re-schedules cleanly.
  useEffect(() => {
    if (!user) return undefined;
    let current: MyDayDocData | null = null;
    const pending = new Set<string>();
    const shownKey = `eduvora.myDaySystemNotifications.v1:${user.id}`;
    const readShown = (): Record<string, number> => {
      try { return JSON.parse(localStorage.getItem(shownKey) || "{}"); } catch { return {}; }
    };
    // Hash the item key into a stable 31-bit alarm id. Android limits
    // notification ids to 32-bit signed; SHA-1 mod 2^31 keeps the value
    // in range and stable across re-renders of the same item.
    const alarmId = (key: string) => {
      let hash = 0;
      for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
      return Math.abs(hash) || 1;
    };
    const checkDue = () => {
      if (!current) return;
      const now = Date.now();
      const shown = readShown();
      const due = collectDueMyDayItems(current, now, new Date().getTimezoneOffset());
      for (const item of due) {
        if (shown[item.key] || pending.has(item.key)) continue;
        pending.add(item.key);
        // Deep-link the system alert to the exact My Day tab + item so the
        // tap lands on the task/schedule/reminder that fired, not the overview.
        const itemUrl = `/${getMyDayItemDeepLink(item.section, item.itemId)}`;
        // On the TWA the local alarm is the source of truth — the
        // FCM payload that woke us is a bonus, not the only path.
        if (isAndroidNative()) {
          const alarm: LocalAlarmItem = {
            id: alarmId(item.key),
            at: item.dueAt,
            title: item.title,
            body: item.body,
            url: itemUrl,
            tag: `myday-${item.key}`,
          };
          void scheduleLocalAlarm(alarm);
        }
        void showLocalSystemNotification(item.title, item.body, itemUrl, `myday-${item.key}`)
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
    // Schedule the upcoming alarms (the ones that haven't fired yet) the
    // moment the doc is read or updated. This is what gives the TWA its
    // exact-time guarantee: even if the server push never arrives, the
    // local AlarmManager fires on the dot.
    const scheduleUpcoming = () => {
      if (!isAndroidNative() || !current) return;
      const now = Date.now();
      const items = collectDueMyDayItems(current, now + 6 * 60 * 60 * 1000, new Date().getTimezoneOffset());
      // Cancel every previously-scheduled My Day alarm and re-create the
      // ones still in the future. This keeps the schedule authoritative
      // against the latest doc — adding/removing a task in the app
      // updates the alarms immediately.
      const seen = new Set<number>();
      for (const item of items) {
        if (item.dueAt <= now) continue;
        const id = alarmId(item.key);
        seen.add(id);
        const itemUrl = `/${getMyDayItemDeepLink(item.section, item.itemId)}`;
        void scheduleLocalAlarm({
          id,
          at: item.dueAt,
          title: item.title,
          body: item.body,
          url: itemUrl,
          tag: `myday-${item.key}`,
        });
      }
      // Wipe any orphans (alarms that no longer correspond to a live
      // item). LocalNotifications has no "list" API, so we keep a
      // small id cache in localStorage and cancel the diff.
      try {
        const cacheKey = `eduvora.myDayAlarmIds.v1:${user.id}`;
        const prior: number[] = JSON.parse(localStorage.getItem(cacheKey) || "[]");
        const orphans = prior.filter((id) => !seen.has(id));
        if (orphans.length) void cancelLocalAlarms(orphans);
        localStorage.setItem(cacheKey, JSON.stringify(Array.from(seen)));
      } catch {
        // ignore — next pass will reconcile.
      }
    };
    const onDocChange = () => {
      checkDue();
      scheduleUpcoming();
    };
    const unsubscribe = onSnapshot(doc(db, "users", user.id, "myDay", "current"), (snapshot) => {
      current = snapshot.exists() ? snapshot.data() as MyDayDocData : null;
      onDocChange();
    });
    const timer = window.setInterval(checkDue, 15_000);
    // Re-schedule upcoming alarms every 5 minutes as a safety net — if
    // the user kept the app in the background for hours the schedule
    // stays warm.
    const reschedule = window.setInterval(scheduleUpcoming, 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") checkDue(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.clearInterval(reschedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  // Renewal reminders, product unlocks, new-product announcements and course
  // content updates are all SERVER-GENERATED now (the GitHub Actions minute
  // pinger drives api/cron/subscription-renewals; instant paths live in
  // api/razorpay/verify-payment and api/push/send). The server writes the
  // cross-device bell doc AND sends the Web Push, so the app never needs to
  // be open — and there is no client-side baseline diff left to misfire.
  //
  // The old client-side generator that lived here recomputed a localStorage
  // baseline on every app open; because `purchasedIds` streams in after the
  // catalog, the baseline was clobbered with an empty purchase list and the
  // next render re-announced every owned product as "Product unlocked" —
  // that was the repeating-notification bug. Do not reintroduce it.

  // Keep the in-app navigation history up to date so the auth screen's Back
  // button can return to the page the user actually came from. Runs before
  // the auth-guard effect below, so a protected deep link is recorded and
  // then skipped by the Back resolver (it can never bounce back to login).
  useEffect(() => {
    if (typeof window !== "undefined") {
      recordRouteVisit(hash, window.sessionStorage);
    }
  }, [hash]);

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
        returnRoute: null,
      },
      buyer: {
        uid: user.id,
        name: user.name,
        email: user.email,
        mobile: null,
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
        returnRoute: null,
      },
      buyer: {
        uid: user.id,
        name: user.name,
        email: user.email,
        mobile: null,
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
        returnRoute: null,
      },
      buyer: {
        uid: String(user.id),
        name: user.name,
        email: user.email,
        mobile: null,
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
        emailVerified: false,
      },
      returnRoute: { hash: `${PRODUCT_HASH}${encodeURIComponent(selectedCatalogProduct.id)}` },
      idempotencyKey: `${selection.purchaseKind}:${selectedCatalogProduct.id}:${user.id}:${Date.now()}`,
    });
  };

  const cartProducts = shoppingProducts.filter((product) => cartIds.has(product.id));
  const favoriteProducts = shoppingProducts.filter((product) => favoriteIds.has(product.id));
  const protectedRoutePending = requiresAuthentication(hash) && (loading || !user);

  // Keep the mobile status bar / browser chrome colour in sync with the
  // screen on display. Only the dark brand screens (boot splash, landing,
  // auth and admin login) get the dark bar; every light app screen switches
  // the bar to the page background so it never shows black over light UI.
  useEffect(() => {
    const launchPending =
      loading
      || skipLandingForInstalledMobilePwa
      || Boolean(user && user.role !== "admin" && catalogLoading && hash.startsWith(HOME_HASH));
    const splashVisible = openingAnimationEnabled && launchPending;
    const darkScreen =
      splashVisible
      || protectedRoutePending
      || !hash
      || hash.startsWith(LANDING_HASH)
      || hash.startsWith(AUTH_HASH)
      || hash.startsWith(ADMIN_LOGIN_HASH);
    setThemeColor(darkScreen ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }, [hash, loading, skipLandingForInstalledMobilePwa, protectedRoutePending, user, catalogLoading, openingAnimationEnabled]);

  if (desktopLocked && !hash.startsWith(ADMIN_HASH) && !hash.startsWith(ADMIN_LOGIN_HASH)) {
    return <LandingApp />;
  }

  const launchPending =
    loading
    || skipLandingForInstalledMobilePwa
    || Boolean(user && user.role !== "admin" && catalogLoading && hash.startsWith(HOME_HASH));
  if (launchPending && openingAnimationEnabled) {
    return <AppLaunchSplash label={skipLandingForInstalledMobilePwa ? "Opening your dashboard…" : "Preparing your learning space…"} />;
  }
  if (launchPending && skipLandingForInstalledMobilePwa) {
    return <main className="min-h-[100dvh] bg-white" aria-busy="true" aria-label="Opening app" />;
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
  if (hash.startsWith(SUBSCRIPTION_HASH)) {
    return (
      <SubscriptionApp
        cartCount={cartIds.size}
        purchasesBadge={purchasedIds.size}
        onNavigateToCart={() => {
          window.location.hash = CART_HASH;
        }}
        onNavigateToSubscription={() => {
          window.location.hash = SUBSCRIPTION_HASH;
        }}
        onNavigateToNotifications={() => {
          window.location.hash = NOTIFICATIONS_HASH;
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
  if (hash.startsWith(SEARCH_HASH)) {
    return (
      <SearchPage
        favoriteIds={favoriteIds}
        onToggleFavorite={handleToggleFavorite}
        onNavigateToProduct={navigateToProduct}
        onNavigateToStore={() => {
          window.location.hash = STORE_HASH;
        }}
        onNavigateToHome={() => {
          window.location.hash = HOME_HASH;
        }}
        onNavigateToMyDay={() => {
          window.location.hash = MY_DAY_HASH;
        }}
        onNavigateToProfile={() => {
          window.location.hash = PROFILE_HASH;
        }}
        onNavigateToPurchases={() => {
          window.location.hash = `${STORE_HASH}/purchases`;
        }}
        onNavigateToCart={() => {
          window.location.hash = CART_HASH;
        }}
        onNavigateToSubscription={() => {
          window.location.hash = SUBSCRIPTION_HASH;
        }}
        onNavigateToNotifications={() => {
          window.location.hash = NOTIFICATIONS_HASH;
        }}
      />
    );
  }
  if (hash.startsWith(PROFILE_SUBSCRIBER_EXPERIENCE_HASH)) return <SubscriberExperiencePage />;
  if (hash.startsWith(PROFILE_PREVIEW_HASH)) return <ProfilePreview />;
  if (hash.startsWith(COURSE_HASH)) {
    if (!selectedCourseProduct) return <InvalidCheckout onBack={() => { window.location.hash = `${STORE_HASH}/purchases`; }} />;
    return (
      <CourseRouteGuard
        product={selectedCourseProduct}
        onCheckout={(price) => navigateToCheckout(price)}
        onBack={() => { window.location.hash = `${STORE_HASH}/purchases`; }}
        onPurchaseUpdate={handlePurchaseUpdate}
        initialModuleId={selectedCourseModuleId || undefined}
      />
    );
  }
  // Settings renders inside the desktop shell like the Profile page does.
  if (hash.startsWith(SETTINGS_HASH)) return <SettingsPage />;
  if (hash.startsWith(PROFILE_HASH)) return <ProfileApp />;
  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(LEADERBOARD_HASH)) return <LeaderboardApp />;
  if (hash.startsWith(FLOWPATH_HASH)) return <FlowPathApp onNavigateToHome={() => { window.location.hash = HOME_HASH; }} />;
  if (hash.startsWith(REVISION_HASH)) return <RevisionApp />;
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

// Drive the footer's outside magic glow with the page's scroll energy
// (see src/utils/footerGlow.ts). Runs once for the whole app shell.
initFooterGlow();
// HARD RULE: Ensure portrait lock is active on app start (mobile only)
if (typeof window !== "undefined") {
  // Double-init for safety (initOrientationLock is idempotent)
  try { initOrientationLock(); } catch {}
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrandingProvider>
        <CatalogProvider>
          <CommerceProvider>
            <Root />
            <RenewalNotice />
            <PortraitOnlyGuard />
          </CommerceProvider>
        </CatalogProvider>
      </BrandingProvider>
    </AuthProvider>
  </StrictMode>,
);
