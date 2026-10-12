import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/winter-background.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/light-theme.css";
import "../../../src/light-theme-pages.css";
import { PurchasesTab } from "../../../src/components/OtherTabs";
import FavoritesPage from "../../../src/cartWishlist/pages/FavoritesPage";
import CartPage from "../../../src/cartWishlist/pages/CartPage";
import BottomNav from "../../../src/cartWishlist/components/BottomNav";
import { initFooterNavSpace } from "../../../src/utils/footerNavSpace";
import MyCourseCard from "../../../src/personal-library/MyCourseCard";
import { products } from "./products";

const record = (action: string, id?: string) => {
  document.querySelector("output")!.textContent = `${action}:${id || ""}`;
};

function Fixture() {
  const [cartIds, setCartIds] = useState(new Set(["short"]));
  const page = new URLSearchParams(location.search).get("page") || "library";
  const [removed, setRemoved] = useState(new Set<string>());
  const visibleProducts = products.filter((product) => !removed.has(product.id));
  const remove = (id: string) => {
    record("remove", id);
    setRemoved(new Set([...removed, id]));
  };
  const clearCart = () => setRemoved(new Set(products.map((product) => product.id)));
  const cartPage = (
    <CartPage
      cartProducts={visibleProducts}
      onRemove={remove}
      onClearAll={clearCart}
      onCheckout={() => record("checkout")}
      onNavigate={(tab) => record("navigate", tab)}
      onOpenProduct={(id) => record("open", id)}
    />
  );

  useEffect(() => {
    if (page !== "cart-shell") return undefined;
    return initFooterNavSpace();
  }, [page]);

  if (page === "cart-shell") {
    return (
      <div className="dc-app-shell min-h-screen sm:py-6">
        <output className="sr-only" />
        <div
          data-app-frame
          className="dc-app-frame relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden sm:h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:h-[calc(100dvh-3rem)] sm:rounded-[2rem] md:h-auto md:max-w-none md:rounded-none md:bg-transparent md:shadow-none md:border-0"
        >
          <div data-site-header aria-hidden="true" className="h-14 shrink-0" />
          <div
            data-cart-wishlist-content
            data-active-tab="cart"
            className="relative flex flex-1 flex-col overflow-hidden bg-transparent"
          >
            {cartPage}
          </div>
          <BottomNav
            active="cart"
            onChange={(tab) => record("navigate", tab)}
            favoritesCount={1}
            cartCount={visibleProducts.length}
          />
        </div>
      </div>
    );
  }

  if (page === "cart-desktop") {
    return (
      <div className="dc-desktop-shell" data-desktop-shell>
        <output className="sr-only" />
        <main className="min-w-0 flex-1">
          <div className="dc-app-shell">
            <div data-app-frame className="dc-app-frame flex min-h-[100dvh] w-full flex-col">
              <div
                data-cart-wishlist-content
                data-active-tab="cart"
                className="relative flex flex-1 flex-col overflow-hidden bg-transparent"
              >
                {cartPage}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: "#b9c9e0", minHeight: "100vh", padding: 16 }}>
      <output style={{ color: "#111" }} />
      {/* Simulate the real central width after desktop rails/padding, including
          narrow tablet split-screen. All page/card CSS is production CSS. */}
      <div data-app-frame style={{ width: "100%", maxWidth: "var(--fixture-width, 100%)" }}>
        {page === "library" && (
          <PurchasesTab
            purchased={new Set(products.map((product) => product.id))}
            onOpenCourse={(product) => record("open", product.id)}
          />
        )}
        {page === "favorites" && (
          <FavoritesPage
            favoriteProducts={visibleProducts}
            cartIds={cartIds}
            onRemove={remove}
            onAddToCart={(id) => {
              record("add", id);
              setCartIds(new Set([...cartIds, id]));
            }}
            onNavigate={(tab) => record("navigate", tab)}
            onOpenProduct={(id) => record("open", id)}
          />
        )}
        {page === "cart" && cartPage}
        {page === "study" && (
          <div data-my-course-grid className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
            {visibleProducts.map((product) => (
              <MyCourseCard
                key={product.id}
                course={{
                  id: product.id,
                  title: product.title,
                  coverImage: product.image,
                  description: product.author,
                  modules: [],
                } as any}
                onPlay={(course) => record("play", course.id)}
                onEdit={(course) => record("edit", course.id)}
                onDelete={(course) => remove(course.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
