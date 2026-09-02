import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./components/Header";
import HeroCarousel from "./components/HeroCarousel";
import CategoryNav from "./components/CategoryNav";
import ProductCard from "./components/ProductCard";
import ContinueLearning from "./components/ContinueLearning";
import Reviews from "./components/Reviews";
import BottomNav, { type TabKey } from "../components/BottomNav";
import StickerWall from "../components/StickerWall";
import { createUserQuery } from "../utils/userQueries";
import { categories, reviews as fallbackReviews } from "./data/mockData";
import type { Banner, Product } from "./types";
import { useCatalog } from "../context/CatalogContext";
import { useHomepageProductReviews } from "../hooks/useProductReviews";
import { useAuth } from "../context/AuthContext";
import { useHomeBanners } from "./hooks/useHomeBanners";
import { ensureSavedWebPushSubscription, subscribeToWebPush } from "../../utils/webPush";

/**
 * Maximum number of courses the home page "Continue Learning" section shows.
 * The list is built from live Firestore course progress, so any product added
 * later automatically appears here once the learner opens it — only the two
 * most recently opened are kept on screen.
 */
const CONTINUE_LEARNING_LIMIT = 2;

interface AppProps {
  onNavigateToStore: () => void;
  onNavigateToProduct: (product: Product) => void;
  onNavigateToProductReview: (product: Product) => void;
  onNavigateToCourse: (product: Product) => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPurchases?: () => void;
  onNavigateToFavorites?: () => void;
  onNavigateToNotifications?: () => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
}

export default function App({
  onNavigateToStore,
  onNavigateToProduct,
  onNavigateToProductReview,
  onNavigateToCourse,
  onNavigateToMyDay,
  onNavigateToProfile,
  onNavigateToPurchases,
  onNavigateToFavorites,
  onNavigateToNotifications,
  favoriteIds,
  onToggleFavorite,
}: AppProps) {
  const { user } = useAuth();
  const { products: catalogProducts, purchasedIds } = useCatalog();
  // Hero slides are admin-editable (Admin → Home · Hero Slides). Live
  // Firestore list; falls back to the built-in slides until the admin
  // saves their own.
  const { banners } = useHomeBanners();
  const products = useMemo<Product[]>(() => catalogProducts.map((product) => ({
    id: product.id,
    title: product.title,
    type: product.category === "PDF" || product.category === "Notes" ? "pdf" : product.category === "E-book" ? "ebook" : product.category === "Live" ? "live" : "video",
    category: product.category === "PDF" || product.category === "Notes" ? "pdf" : product.category === "E-book" ? "ebook" : product.category === "Live" ? "live" : "video",
    author: product.instructor,
    price: product.price,
    mrp: product.originalPrice,
    rating: product.rating,
    ratingCount: product.reviews,
    image: product.image,
    searchKeywords: product.searchKeywords,
    trending: product.tags.includes("TRENDING") || product.rating >= 4.5,
  })), [catalogProducts]);
  const { reviews: homepageReviews } = useHomepageProductReviews(catalogProducts, fallbackReviews, 6);
  // A profile can contain repeated spaces or a very long full name. The home
  // greeting intentionally shows only its first non-empty word so the compact
  // mobile header never turns the name into a second line.
  const userName = user?.name?.trim().split(/\s+/)[0] || "Learner";
  const [progressRecords, setProgressRecords] = useState<Array<{ productId: string; completedFileIds: string[]; updatedAt: number }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Ask for notification permission the moment a user lands on Home (app open).
  // Signed-in users are also subscribed + saved so purchase unlocks, renewals and
  // announcements reach this device as system notifications.
  useEffect(() => {
    if (user) {
      void ensureSavedWebPushSubscription(user.id);
    } else {
      void subscribeToWebPush();
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setProgressRecords([]); return undefined; }
    return onSnapshot(collection(db, "users", user.id, "courseProgress"), (snapshot) => {
      setProgressRecords(snapshot.docs.map((item) => {
        const data = item.data() || {};
        const stamp = data.lastOpenedAt || data.updatedAt;
        const updatedAt = stamp && typeof stamp.toMillis === "function" ? stamp.toMillis() : Number(stamp || 0);
        return { productId: String(data.productId || item.id), completedFileIds: Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : [], updatedAt };
      }));
    }, () => setProgressRecords([]));
  }, [user]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);

  // "Continue Learning" rule (kept data-driven so future products need no code
  // change): every course the learner has actually opened — i.e. has a real
  // `users/{uid}/courseProgress` record for — is a candidate, most recently
  // opened first, and only the newest CONTINUE_LEARNING_LIMIT are rendered.
  // A product that is removed from the catalog, or a stale progress record for
  // a product that no longer exists, drops out automatically.
  const continueLearningEntries = useMemo(() => {
    const countResources = (modules: (typeof catalogProducts)[number]["canonicalModules"] = []): number =>
      (modules || []).reduce((total, module) => total + (module.resources?.length || 0) + countResources(module.modules || []), 0);

    return [...progressRecords]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => {
        const item = products.find((product) => product.id === record.productId);
        const catalogProduct = catalogProducts.find((product) => product.id === record.productId);
        if (!item || !catalogProduct) return null;
        const totalResources = countResources(catalogProduct.canonicalModules);
        const progress = totalResources > 0
          ? Math.min(100, Math.round((record.completedFileIds.length / totalResources) * 100))
          : 0;
        return { item, progress };
      })
      .filter((entry): entry is { item: Product; progress: number } => entry !== null)
      .slice(0, CONTINUE_LEARNING_LIMIT);
  }, [catalogProducts, products, progressRecords]);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults: Product[] = useMemo(() => {
    if (!normalizedQuery) return [];
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(normalizedQuery) ||
        p.author.toLowerCase().includes(normalizedQuery) ||
        p.type.toLowerCase().includes(normalizedQuery) ||
        p.category.toLowerCase().includes(normalizedQuery) ||
        (p.searchKeywords || []).some((keyword) => keyword.toLowerCase().includes(normalizedQuery)),
    );
  }, [normalizedQuery, products]);

  const suggestions = searchResults.slice(0, 5);

  const [activeCategory, setActiveCategory] = useState("all");

  const categoryFiltered: Product[] = useMemo(() => {
    if (activeCategory === "all") {
      // "Trending Now" — show only the top 4 products, ranked by rating.
      return [...products].sort((a, b) => b.rating - a.rating).slice(0, 4);
    }
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products]);

  const handleSelectSuggestion = (product: Product) => {
    setSearchQuery(product.title);
    searchInputRef.current?.blur();
  };

  const handleOpenReview = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (product) onNavigateToProductReview(product);
  };

  /**
   * Hero slide tap target, configured per banner in the admin panel:
   *   product → open the product page (PDP) from the products module.
   *   module  → open the Course Player straight at that product's
   *             specific module (?module= deep link). Learners without
   *             access are still handled — the course route falls
   *             through to the PDP where they can buy.
   * Unlinked or stale banners (product removed from the catalog) are
   * simply inert.
   */
  const handleBannerOpen = (banner: Banner) => {
    if ((banner.linkType !== "product" && banner.linkType !== "module") || !banner.productId) return;
    const catalogProduct = catalogProducts.find((item) => item.id === banner.productId);
    if (!catalogProduct) return;
    if (banner.linkType === "product") {
      const mapped = products.find((item) => item.id === catalogProduct.id);
      if (mapped) onNavigateToProduct(mapped);
      return;
    }
    // linkType === "module"
    const moduleId = banner.moduleId || "";
    window.location.hash = `#/course/${encodeURIComponent(catalogProduct.id)}${moduleId ? `?module=${encodeURIComponent(moduleId)}` : ""}`;
  };

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") {
      setSearchQuery("");
      contentTopRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (tab === "myday") {
      onNavigateToMyDay();
      return;
    }
    if (tab === "store") {
      onNavigateToStore();
      return;
    }
    if (tab === "purchases") {
      onNavigateToPurchases?.();
      return;
    }
    if (tab === "profile") {
      onNavigateToProfile();
    }
  };

  const isSearching = normalizedQuery.length > 0;

  return (
    <div className="dc-app-shell min-h-screen sm:py-6">
      <div data-app-frame className="dc-app-frame relative mx-auto flex min-h-screen max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none md:bg-transparent md:shadow-none md:border-0">
        <div ref={contentTopRef} />
        <Header
          ref={searchInputRef}
          userName={userName}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
          favoritesCount={favoriteIds.size}
          onOpenFavorites={onNavigateToFavorites}
          onOpenNotifications={onNavigateToNotifications}
        />

        <main className="flex-1 overflow-y-auto pb-2">
          {isSearching ? (
            <section data-home-grid className="px-5 pt-6 md:px-8">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white md:text-lg">
                  Results for “{searchQuery}”
                </h2>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                >
                  Clear
                </button>
              </div>
              <p className="mt-1 text-xs text-white/55">
                {searchResults.length} item{searchResults.length !== 1 ? "s" : ""} found
              </p>

              {searchResults.length === 0 ? (
                <div className="mt-10 flex flex-col items-center gap-2 text-center text-white/55">
                  <span className="text-4xl">🔎</span>
                  <p className="text-sm">
                    We couldn't find anything for "{searchQuery}".<br />
                    Try searching a different keyword.
                  </p>
                </div>
              ) : (
                <div data-home-grid className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
                  {searchResults.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={favoriteIds.has(product.id)}
                      onToggleFavorite={onToggleFavorite}
                      onOpen={onNavigateToProduct}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              <div data-home-hero>
                <HeroCarousel banners={banners} onOpen={handleBannerOpen} />
              </div>

              <div data-home-category-nav>
                <CategoryNav
                  categories={categories}
                  activeCategory={activeCategory}
                  onSelect={setActiveCategory}
                />
              </div>

              {continueLearningEntries.length > 0 && (
                <div data-home-continue>
                  <ContinueLearning
                    items={continueLearningEntries.map(({ item, progress }) => ({
                      id: item.id,
                      title: item.title,
                      author: item.author,
                      image: item.image,
                      progress,
                      onResume: () => onNavigateToCourse(item),
                      onOpen: () => onNavigateToCourse(item),
                    }))}
                  />
                </div>
              )}

              <section data-home-trending className="px-5 pt-6 md:px-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white md:text-lg">
                    {activeCategory === "all"
                      ? "Trending Now"
                      : categories.find((c) => c.id === activeCategory)?.label}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigateToStore()}
                    className="text-xs font-semibold text-white/55 hover:text-white/85"
                  >
                    View All
                  </button>
                </div>

                {categoryFiltered.length === 0 ? (
                  <p className="mt-8 text-center text-sm text-white/55">
                    No products in this category yet.
                  </p>
                ) : (
                  <div data-home-grid className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
                    {categoryFiltered.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isFavorite={favoriteIds.has(product.id)}
                        onToggleFavorite={onToggleFavorite}
                        onOpen={onNavigateToProduct}
                      />
                    ))}
                  </div>
                )}
              </section>

              <div data-home-reviews>
                <Reviews reviews={homepageReviews} onOpenReview={handleOpenReview} />
              </div>

              {/* ── Feedback wall (AI Canvas Sticker Wall) ──────────────────
                  Sits at the very bottom of Home. A submitted note becomes a
                  user query the owner answers from #/queries. The wall is
                  tall on desktop and switches to a shorter, phone-tuned
                  layout under 640 px (fewer seeded stickers, smaller cards,
                  compact copy) so it fits without spilling. */}
              <section data-home-sticker-wall className="mt-8 px-4 md:px-8">
                <div className="h-[420px] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F0F12] sm:h-[520px] md:h-[600px]">
                  <StickerWall
                    onSubmitNote={async (note) => { await createUserQuery(note).catch(() => undefined); }}
                    footer={
                      <button
                        type="button"
                        onClick={() => { window.location.hash = "#/queries"; }}
                        className="rounded-full border border-white/15 bg-white/[0.07] px-5 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-white/[0.14]"
                        data-home-explore-queries
                      >
                        Explore user queries
                      </button>
                    }
                  />
                </div>
              </section>
            </>
          )}
        </main>

        <BottomNav
          active="home"
          onChange={handleFooterChange}
          purchasesBadge={purchasedIds.size}
        />
      </div>
    </div>
  );
}
