import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/winter-background.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/empty-state-glass.css";
import Home from "../../../src/home/App";
import ProductDetail from "../../../src/PdpApp";
import { initFooterNavSpace } from "../../../src/utils/footerNavSpace";
import { products } from "./products";

initFooterNavSpace();
const record = (action: string) => { document.querySelector("output")!.textContent = action; };

function Fixture() {
  const [favoriteIds, setFavoriteIds] = useState(new Set<string>());
  const toggleFavorite = (id: string) => {
    record(`favorite:${id}`);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const pdp = new URLSearchParams(location.search).get("page") === "pdp";
  return (
    <>
      <output style={{ position: "fixed", bottom: 0, pointerEvents: "none" }} />
      {pdp ? (
        <ProductDetail
          product={products[0]}
          products={products}
          onBack={() => record("back")}
          onCheckout={() => record("checkout")}
          onToggleFavorite={toggleFavorite}
          favoriteIds={favoriteIds}
        />
      ) : (
        <Home
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onNavigateToProduct={(product) => record(`product:${product.id}`)}
          onNavigateToProductReview={(product) => record(`review:${product.id}`)}
          onNavigateToCourse={(product) => record(`course:${product.id}`)}
          onNavigateToStore={() => record("store")}
          onNavigateToMyDay={() => record("myday")}
          onNavigateToProfile={() => record("profile")}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
