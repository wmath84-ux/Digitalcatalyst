import { StrictMode, useEffect, useRef, useState } from "react";
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
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PRODUCTS as CART_PRODUCTS } from "./cartWishlist/data/products";
import type { Product as CartProduct, TabKey as CartTabKey } from "./cartWishlist/types";
import { products as STORE_PRODUCTS } from "./data/products";
import { product as pdpProduct } from "./data/product";
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
const CHECKOUT_CONTEXT_KEY = "checkoutContext";

const INITIAL_CART = ["p1", "p3"];
const INITIAL_FAVORITES = ["p2", "p4", "p6"];
const INITIAL_COINS = 480;

const STORE_CART_PRODUCTS: CartProduct[] = STORE_PRODUCTS.map((product) => ({
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
}));

const SHOPPING_PRODUCTS = [...CART_PRODUCTS, ...STORE_CART_PRODUCTS];

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

function Root() {
  const { user } = useAuth();
  const [hash, setHash] = useState(() => window.location.hash);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set(INITIAL_CART));
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(INITIAL_FAVORITES));
  const [userCoins, setUserCoins] = useState(INITIAL_COINS);
  const [shoppingToast, setShoppingToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const product = SHOPPING_PRODUCTS.find((item) => item.id === id);
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

    const context: CheckoutContext = {
      product: {
        id: "neuralearn-pro-2026",
        name: pdpProduct.title,
        type: "Course",
        description: pdpProduct.tagline,
        price: finalPrice,
        currency: pdpProduct.currency,
        thumbnail: "🤖",
        instructor: pdpProduct.brand,
        duration: `${pdpProduct.hours} hours`,
        rating: pdpProduct.rating,
        totalRatings: pdpProduct.ratingCount,
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

  const cartProducts = SHOPPING_PRODUCTS.filter((product) => cartIds.has(product.id));
  const favoriteProducts = SHOPPING_PRODUCTS.filter((product) => favoriteIds.has(product.id));

  if (!hash || hash.startsWith(LANDING_HASH)) return <LandingApp />;
  if (hash.startsWith(HOME_HASH)) {
    return (
      <HomeApp
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

  if (hash.startsWith(SUBSCRIPTION_HASH)) return <SubscriptionApp />;
  if (hash.startsWith(COMMUNITY_HASH)) return <CommunityApp />;
  if (hash.startsWith(COURSE_HASH)) return <CoursePlayerApp />;
  if (hash.startsWith(PROFILE_HASH)) return <ProfileApp />;
  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(PRODUCT_HASH)) return <PdpApp onCheckout={navigateToCheckout} />;
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
      <Root />
    </AuthProvider>
  </StrictMode>,
);
