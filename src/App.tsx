import { useMemo, type ReactNode } from "react";
import { Bell, CalendarDays, ChevronDown, House, Mail, NotebookPen, Search, Store as StoreGlyph } from "lucide-react";
import Header from "./components/Header";
import BottomNav, { type TabKey } from "./components/BottomNav";
import StorePage from "./components/StorePage";
import { PurchasesTab } from "./components/OtherTabs";
import type { Product } from "./data/products";
import { useCatalog } from "./context/CatalogContext";
import { useAuth } from "./context/AuthContext";
import { useBranding } from "./context/BrandingContext";
import { useUnreadNotificationCount } from "./hooks/useUnreadNotificationCount";
import BrandMark from "./components/BrandMark";
import { DEFAULT_LOGO_URL } from "@/utils/branding";

type AppProps = {
  onNavigateToProduct: (product: Product) => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToHome: () => void;
  onNavigateToCourse: (course: { id: string; title: string }) => void;
  onNavigateToSubscription: () => void;
  onNavigateToNotifications: () => void;
  cartIds: Set<string>;
  favoriteIds: Set<string>;
  toast: string | null;
  onAddToCart: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigateToCart: () => void;
};

function StoreMobileHeader({
  cartCount,
  favoriteCount,
  onNavigateToHome,
  onNavigateToProfile,
  onNavigateToNotifications,
  onNavigateToCart,
}: {
  cartCount: number;
  favoriteCount: number;
  onNavigateToHome: () => void;
  onNavigateToProfile: () => void;
  onNavigateToNotifications: () => void;
  onNavigateToCart: () => void;
}) {
  const { user } = useAuth();
  const { appName, logoUrl } = useBranding();
  const customLogo = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  const notificationCount = useUnreadNotificationCount() ?? 0;
  const initial = (user?.name?.trim()?.charAt(0) || "M").toUpperCase();

  return (
    <header
      data-site-header
      className="sticky top-0 z-30 border-b border-[#284481] bg-[#041433]/94 px-4 py-3 shadow-[0_18px_44px_-28px_rgba(71,106,255,0.75)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onNavigateToHome} className="flex min-w-0 items-center gap-3 text-left">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[20px] bg-white text-[#5e34ff] shadow-[0_14px_26px_-18px_rgba(255,255,255,0.9)]">
            {customLogo ? <BrandMark className="h-14 w-14" /> : <span className="text-xl font-black">L</span>}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[1.05rem] font-black tracking-[-0.03em] text-white">{appName}</p>
            <p className="truncate text-sm text-white/72">Learning workspace</p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderCircleButton ariaLabel="Search" onClick={() => { window.location.hash = "#/search"; }}>
            <Search className="h-5 w-5" />
          </HeaderCircleButton>
          <HeaderCircleButton ariaLabel="Notifications" badge={notificationCount} onClick={onNavigateToNotifications}>
            <Bell className="h-5 w-5" />
          </HeaderCircleButton>
          <HeaderCircleButton ariaLabel="Favorites" badge={favoriteCount} onClick={() => { window.location.hash = "#/favorites"; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
          </HeaderCircleButton>
          <HeaderCircleButton ariaLabel="Cart" badge={cartCount} onClick={onNavigateToCart}>
            <Mail className="h-5 w-5" />
          </HeaderCircleButton>
          <button
            type="button"
            onClick={onNavigateToProfile}
            aria-label="Profile"
            className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_30%,#b8bcff_0%,#8a8fff_35%,#5f65d9_100%)] text-[1.45rem] font-black text-[#241a68] shadow-[0_16px_28px_-18px_rgba(160,170,255,0.85)]"
          >
            {user?.photoURL ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" /> : <span>{initial}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

function HeaderCircleButton({
  children,
  ariaLabel,
  badge,
  onClick,
}: {
  children: ReactNode;
  ariaLabel: string;
  badge?: number;
  onClick: () => void;
}) {
  const visibleBadge = badge && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative grid h-14 w-14 place-items-center rounded-[18px] border border-[#284481] bg-[#091b46]/92 text-white transition hover:brightness-110"
    >
      {children}
      {visibleBadge ? (
        <span className="absolute -right-1.5 -top-1.5 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-[#ff2768] px-1 text-[11px] font-black text-white shadow-[0_12px_20px_-14px_rgba(255,39,104,0.95)]">
          {visibleBadge}
        </span>
      ) : null}
    </button>
  );
}

function StoreMobileFooter() {
  const items = [
    { key: "home", label: "Home", icon: House, onClick: () => { window.location.hash = "#/home"; } },
    { key: "tasks", label: "Tasks", icon: CalendarDays, onClick: () => { window.location.hash = "#/my-day?section=tasks"; } },
    { key: "schedule", label: "Schedule", icon: CalendarDays, onClick: () => { window.location.hash = "#/my-day?section=schedule"; } },
    { key: "notes", label: "Notes", icon: NotebookPen, onClick: () => { window.location.hash = "#/my-day?section=notes"; } },
    { key: "store", label: "Store", icon: StoreGlyph, onClick: () => { window.location.hash = "#/store"; } },
  ] as const;

  return (
    <nav
      data-site-footer-nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2"
      aria-label="Store quick navigation"
    >
      <div data-site-footer className="pointer-events-auto rounded-[28px] border border-[#284481] bg-[#041433]/96 shadow-[0_22px_50px_-28px_rgba(71,106,255,0.8)] backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-1 p-2">
          {items.map((item) => {
            const active = item.key === "store";
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[22px] px-1 text-center transition ${
                  active
                    ? "bg-[linear-gradient(135deg,#7448ff_0%,#5d40ff_60%,#4f36ff_100%)] text-white shadow-[0_18px_36px_-20px_rgba(116,72,255,0.95)]"
                    : "text-white/92 hover:bg-white/6"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-white" : "text-white/92"}`} />
                <span className={`text-[13px] font-medium ${active ? "text-white" : "text-white/88"}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default function App({
  onNavigateToProduct,
  onNavigateToMyDay,
  onNavigateToProfile,
  onNavigateToHome,
  onNavigateToCourse,
  onNavigateToSubscription,
  onNavigateToNotifications,
  cartIds,
  favoriteIds,
  toast,
  onAddToCart,
  onToggleFavorite,
  onNavigateToCart,
}: AppProps) {
  const { purchasedIds: purchased } = useCatalog();

  const activeTab: TabKey =
    window.location.hash.startsWith("#/store/purchases") ? "purchases" : "store";
  const cartCount = cartIds.size;
  const purchasesBadge = useMemo(() => purchased.size, [purchased]);

  return (
    <div className="dc-app-shell min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none">
        {activeTab === "store" ? (
          <StoreMobileHeader
            cartCount={cartCount}
            favoriteCount={favoriteIds.size}
            onNavigateToHome={onNavigateToHome}
            onNavigateToProfile={onNavigateToProfile}
            onNavigateToNotifications={onNavigateToNotifications}
            onNavigateToCart={onNavigateToCart}
          />
        ) : (
          <Header
            cartCount={cartCount}
            notifCount={1}
            onNavigateToSubscription={onNavigateToSubscription}
            onNavigateToCart={onNavigateToCart}
            onNavigateToNotifications={onNavigateToNotifications}
          />
        )}

        <main className="flex-1 overflow-y-auto">
          {activeTab === "store" && (
            <StorePage
              wishlist={favoriteIds}
              cartIds={cartIds}
              purchased={purchased}
              onToggleWishlist={onToggleFavorite}
              onAddToCart={onAddToCart}
              onView={onNavigateToProduct}
            />
          )}
          {activeTab === "purchases" && (
            <PurchasesTab purchased={purchased} onOpenCourse={onNavigateToCourse} />
          )}
        </main>

        {toast ? <span className="sr-only" role="status">{toast}</span> : null}

        {activeTab === "store" ? (
          <StoreMobileFooter />
        ) : (
          <BottomNav
            active={activeTab === "purchases" ? "purchases" : "store"}
            onChange={(tab) => {
              if (tab === "home") onNavigateToHome();
              else if (tab === "myday") onNavigateToMyDay();
              else if (tab === "profile") onNavigateToProfile();
              else if (tab === "purchases") window.location.hash = "#/store/purchases";
              else window.location.hash = "#/store";
            }}
            storeBadge={1}
            purchasesBadge={purchasesBadge}
          />
        )}
      </div>
    </div>
  );
}
