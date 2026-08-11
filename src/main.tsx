import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StoreApp from "./App";
import HomeApp from "./home/App";
import PdpApp from "./PdpApp";

const STORE_HASH = "#/store";
const PRODUCT_HASH = "#/product/";

type NavigableProduct = {
  id: string;
  title: string;
};

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

  if (hash.startsWith(PRODUCT_HASH)) return <PdpApp />;
  if (hash.startsWith(STORE_HASH)) return <StoreApp onNavigateToProduct={navigateToProduct} />;

  return (
    <HomeApp
      onNavigateToStore={() => {
        window.location.hash = STORE_HASH;
      }}
      onNavigateToProduct={navigateToProduct}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
