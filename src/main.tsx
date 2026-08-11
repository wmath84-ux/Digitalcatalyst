import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StoreApp from "./App";
import HomeApp from "./home/App";

const STORE_HASH = "#/store";

function Root() {
  const [isStorePage, setIsStorePage] = useState(() => window.location.hash.startsWith(STORE_HASH));

  useEffect(() => {
    const handleHashChange = () => setIsStorePage(window.location.hash.startsWith(STORE_HASH));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (isStorePage) return <StoreApp />;

  return (
    <HomeApp
      onNavigateToStore={() => {
        window.location.hash = STORE_HASH;
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
