import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";
import CheckoutApp from "./CheckoutApp";
import MyDayApp from "./MyDayApp";
import { product as pdpProduct } from "./data/product";
import {
  product as checkoutProduct,
  user as checkoutUser,
  type Product as CheckoutProduct,
  type UserProfile,
} from "./data/checkoutData";

const STORE_HASH = "#/store";
const PRODUCT_HASH = "#/product/";
const CHECKOUT_HASH = "#/checkout";
const MY_DAY_HASH = "#/my-day";
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

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateToProduct = (product: NavigableProduct) => {
    sessionStorage.setItem("selectedProduct", JSON.stringify(product));
    window.location.hash = `${PRODUCT_HASH}${encodeURIComponent(product.id)}`;
  };

  const navigateToCheckout = (finalPrice: number) => {
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
      user: { ...checkoutUser },
    };
    applyCheckoutContext(context);
    sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    window.location.hash = CHECKOUT_HASH;
  };

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

  if (hash.startsWith(MY_DAY_HASH)) return <MyDayApp />;
  if (hash.startsWith(PRODUCT_HASH)) return <PdpApp onCheckout={navigateToCheckout} />;
  if (hash.startsWith(STORE_HASH)) {
    return (
      <StoreApp
        onNavigateToProduct={navigateToProduct}
        onNavigateToMyDay={() => {
          window.location.hash = MY_DAY_HASH;
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
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
