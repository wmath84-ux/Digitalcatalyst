import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/winter-background.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import { PurchasesTab } from "../../../src/components/OtherTabs";
import FavoritesPage from "../../../src/cartWishlist/pages/FavoritesPage";
import CartPage from "../../../src/cartWishlist/pages/CartPage";
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
  const remove = (id: string) => { record("remove", id); setRemoved(new Set([...removed, id])); };
  return (
    <div style={{ background: "#b9c9e0", minHeight: "100vh", padding: 16 }}>
      <output style={{ color: "#111" }} />
      {/* Simulate the real central width after desktop rails/padding, including
          narrow tablet split-screen. All page/card CSS is production CSS. */}
      <div data-app-frame style={{ width: "100%", maxWidth: "var(--fixture-width, 100%)" }}>
        {page === "library" && <PurchasesTab purchased={new Set(products.map(p => p.id))} onOpenCourse={p => record("open", p.id)} />}
        {page === "favorites" && <FavoritesPage favoriteProducts={visibleProducts} cartIds={cartIds} onRemove={remove} onAddToCart={id => { record("add", id); setCartIds(new Set([...cartIds, id])); }} onNavigate={tab => record("navigate", tab)} onOpenProduct={id => record("open", id)} />}
        {page === "cart" && <CartPage cartProducts={visibleProducts} onRemove={remove} onClearAll={() => setRemoved(new Set(products.map(p => p.id)))} onCheckout={() => record("checkout")} onNavigate={tab => record("navigate", tab)} onOpenProduct={id => record("open", id)} />}
        {page === "study" && <div data-my-course-grid className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          {visibleProducts.map(p => <MyCourseCard key={p.id} course={{ id: p.id, title: p.title, coverImage: p.image, description: p.author, modules: [] } as any} onPlay={c => record("play", c.id)} onEdit={c => record("edit", c.id)} onDelete={c => remove(c.id)} />)}
        </div>}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
