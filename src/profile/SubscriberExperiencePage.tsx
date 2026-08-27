import { useRef } from "react";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";

/**
 * Placeholder for the subscriber-only product tour. The route intentionally
 * keeps the normal Eduvora shell so the future experience can be designed
 * without changing navigation or the profile entry point.
 */
export default function SubscriberExperiencePage() {
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const mainRef = useRef<HTMLElement>(null);

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") window.location.hash = "#/profile";
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200 md:max-w-none md:rounded-none md:border-0 md:shadow-none md:bg-transparent">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-12">
          <div data-subscriber-experience-empty className="text-center">
            <p className="text-5xl font-black tracking-tight text-slate-200">Empty</p>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}
