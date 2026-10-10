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
import { pdpFixtureCatalog, pdpFixtureProduct } from "./products";

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
  const params = new URLSearchParams(location.search);
  const pdp = params.get("page") === "pdp";
  const [product, setProduct] = useState(() => pdpFixtureProduct(params));
  const [cartIds, setCartIds] = useState(() => new Set(params.has("inCart") ? [product.id] : []));
  return (
    <>
      <output style={{ position: "fixed", bottom: 0, pointerEvents: "none" }} />
      {pdp ? (
        <ProductDetail
          product={params.has("missingProduct") ? null : product}
          products={pdpFixtureCatalog(product, params)}
          purchasedIds={new Set(params.has("owned") ? [product.id] : [])}
          ownedUpdateIds={new Set(params.has("updateOwned") ? ["revision-update"] : [])}
          cartIds={cartIds}
          onAddToCart={(id) => { record(`cart:${id}`); setCartIds((current) => new Set([...current, id])); }}
          onOpenCourse={(item) => record(`course:${item.id}`)}
          onNavigateToProduct={(item) => { record(`product:${item.id}`); setProduct(item); }}
          onBack={() => record("back")}
          onCheckout={(finalPrice, couponCode) => record(JSON.stringify({ purchaseKind: "full_product", productIds: [product.id], finalPrice, couponCode }))}
          onCheckoutSelection={(selection, finalPrice) => record(JSON.stringify({ ...selection, finalPrice }))}
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
