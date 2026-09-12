import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./components/Header";
import HeroCarousel from "./components/HeroCarousel";
import CategoryNav from "./components/CategoryNav";
import ProductCard from "./components/ProductCard";
import ProductCardSkeleton from "./components/ProductCardSkeleton";
import ContinueLearning from "./components/ContinueLearning";
import PublicPacksRail from "../personal-library/PublicPacksRail";
import ContinueLearningSkeleton from "./components/ContinueLearningSkeleton";
import Reviews from "./components/Reviews";
import BottomNav, { type TabKey } from "../components/BottomNav";
import DeferredVisible from "../components/DeferredVisible";
import EmptyProductState from "../components/EmptyProductState";
import ProductFilterBar from "../components/ProductFilterBar";
import { SearchIcon } from "../components/icons";
import { useProductFilters } from "../hooks/useProductFilters";
// Bottom-of-page feedback wall: matter.js physics + its own chunk, mounted
// lazily by DeferredVisible below (see the section near the end of the page).
const StickerWall = lazy(() => import("../components/StickerWall"));
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
  const { products: catalogProducts, purchasedIds, loading: catalogLoading, error: catalogError } = useCatalog();
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
  const [progressLoading, setProgressLoading] = useState(false);
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
    if (!user) { setProgressRecords([]); setProgressLoading(false); return undefined; }
    setProgressLoading(true);
    return onSnapshot(collection(db, "users", user.id, "courseProgress"), (snapshot) => {
      setProgressRecords(snapshot.docs.map((item) => {
        const data = item.data() || {};
        const stamp = data.lastOpenedAt || data.updatedAt;
        const updatedAt = stamp && typeof stamp.toMillis === "function" ? stamp.toMillis() : Number(stamp || 0);
        return { productId: String(data.productId || item.id), completedFileIds: Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : [], updatedAt };
      }));
      // With the persistent Firestore cache the first callback is usually
      // the cached snapshot; either way progress is known now.
      setProgressLoading(false);
    }, () => { setProgressRecords([]); setProgressLoading(false); });
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

  /**
   * The Store page's filtering system, mounted on Home (owner brief
   * 2026-09-11): the same admin-managed chips (`settings/storeFilters`), the
   * same matcher and the same overlay — not a second, Home-only filter. Home's
   * own category strip narrows by product TYPE; this narrows by whatever the
   * admin configured ("Notes", "Class 10", "Physics", …). The two compose: a
   * tile has to satisfy both to reach the grid, and the grid's length is what
   * decides whether the empty state appears — so every filter combination that
   * can come back empty gets the same treatment, never one hardcoded category.
   */
  const productFilters = useProductFilters(catalogProducts);
  const isFiltering = productFilters.isFiltered || activeCategory !== "all";
  const resetHomeFilters = () => {
    setActiveCategory("all");
    productFilters.clearFilters();
  };

  const activeCategoryLabel = activeCategory === "all"
    ? null
    : categories.find((category) => category.id === activeCategory)?.label ?? null;

  const categoryFiltered: Product[] = useMemo(() => {
    const visibleIds = new Set(productFilters.visible.map((product) => product.id));
    const inStoreFilter = products.filter((product) => visibleIds.has(product.id));
    if (activeCategory === "all") {
      // "Trending Now" — show only the top 4 products, ranked by rating.
      return [...inStoreFilter].sort((a, b) => b.rating - a.rating).slice(0, 4);
    }
    return inStoreFilter.filter((p) => p.category === activeCategory);
  }, [activeCategory, products, productFilters.visible]);

  const emptyProductsMessage = productFilters.isFiltered
    ? `Nothing is live under “${productFilters.activeFilter.label}” right now. Clear the filter to see the full catalog.`
    : activeCategoryLabel
      ? `The ${activeCategoryLabel} shelf is empty for now — new drops land here as soon as they are published.`
      : "No products are published yet. Fresh drops land here as soon as they go live.";

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
                <h2 className="dc-scene-ink text-base font-bold text-white md:text-lg">
                  Results for “{searchQuery}”
                </h2>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="dc-scene-ink text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                >
                  Clear
                </button>
              </div>
              <p className="dc-scene-ink mt-1 text-xs text-white/55">
                {searchResults.length} item{searchResults.length !== 1 ? "s" : ""} found
              </p>

              {searchResults.length === 0 ? (
                <EmptyProductState
                  className="mt-4"
                  icon={<SearchIcon className="h-6 w-6" />}
                  heading="No products found"
                  message={`Nothing matches “${searchQuery.trim()}”. Try a shorter keyword — titles, authors and subjects all count.`}
                  actionLabel="Clear search"
                  onAction={() => setSearchQuery("")}
                  secondaryLabel="Browse the store"
                  onSecondaryAction={onNavigateToStore}
                />
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

              {continueLearningEntries.length > 0 ? (
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
              ) : (
                // While a signed-in learner's progress snapshot is still
                // in flight (and the catalog it joins against is not
                // loaded yet), reserve the section with dimension-matched
                // cards so the grid below never jumps. Signed-out users
                // and learners with no progress get nothing here, same as
                // before.
                user && (progressLoading || catalogLoading) && (
                  <div data-home-continue data-home-continue-loading>
                    <ContinueLearningSkeleton count={2} />
                  </div>
                )
              )}

              <PublicPacksRail />

              <section data-home-trending className="px-5 pt-6 md:px-8">
                <div className="flex items-center justify-between">
                  <h2 className="dc-scene-ink text-base font-bold text-white md:text-lg">
                    {activeCategory === "all"
                      ? "Trending Now"
                      : categories.find((c) => c.id === activeCategory)?.label}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigateToStore()}
                    className="dc-scene-ink text-xs font-semibold text-white/55 hover:text-white/85"
                  >
                    View All
                  </button>
                </div>

                {/* The filter control, in the section's top area so it belongs
                    to the heading and the grid it drives — Home's own category
                    strip sits above it, the results sit below. `trigger`
                    variant: the identical Filters button + overlay without a
                    second chip rail. */}
                <div data-home-filter className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <ProductFilterBar
                    variant="trigger"
                    className="min-w-0"
                    chips={productFilters.chips}
                    activeId={productFilters.activeFilterId}
                    onSelect={productFilters.setActiveFilterId}
                  />
                  {/* The count is the filter's feedback: it moves as a chip is
                      picked. While the catalog is still streaming there is
                      nothing to count, so the slot stays empty. */}
                  {catalogLoading ? null : (
                    <span className="dc-scene-ink ml-auto shrink-0 text-[11px] font-semibold text-white/45">
                      {categoryFiltered.length} shown
                    </span>
                  )}
                </div>

                {catalogLoading ? (
                  // Skeleton cards carry the EXACT geometry of ProductCard
                  // (same glass plate, aspect-[4/3] art, same text-block
                  // heights), so the swap to real cards has zero layout
                  // shift. The grid/columns/gap classes are identical to
                  // the real grid below. 4 placeholders match the
                  // "Trending Now" top-4 count on the default tab.
                  <div
                    data-home-grid
                    data-home-grid-loading
                    aria-busy="true"
                    aria-label="Loading products"
                    className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4"
                  >
                    {Array.from({ length: activeCategory === "all" ? 4 : 6 }).map((_, index) => (
                      <ProductCardSkeleton key={index} />
                    ))}
                  </div>
                ) : catalogError ? (
                  // Snapshot failure still surfaces clearly — skeletons
                  // replace the LOADING state only, never the error state.
                  <div className="mt-6 rounded-3xl border border-rose-400/30 bg-rose-500/15 px-5 py-8 text-center text-sm font-semibold text-rose-200">
                    {catalogError}
                  </div>
                ) : categoryFiltered.length === 0 ? (
                  <EmptyProductState
                    className="mt-4"
                    heading="No products found"
                    message={emptyProductsMessage}
                    actionLabel={isFiltering ? "Clear filters" : undefined}
                    onAction={isFiltering ? resetHomeFilters : undefined}
                    secondaryLabel="Browse the store"
                    onSecondaryAction={onNavigateToStore}
                  />
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
                  {/* The wall boots a matter.js world + a rAF render loop, and
                      it is the LAST section on Home. `DeferredVisible` keeps
                      the reserved box (no layout shift) but only mounts — and
                      only downloads — the physics once the learner scrolls
                      near it, so a Home visit that never reaches the bottom
                      costs neither the chunk nor the CPU. */}
                  <DeferredVisible className="h-full w-full">
                    <Suspense fallback={<div className="h-full w-full" />}>
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
                    </Suspense>
                  </DeferredVisible>
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
