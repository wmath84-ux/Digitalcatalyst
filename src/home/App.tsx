import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import Header from "./components/Header";
import HeroCarousel from "./components/HeroCarousel";
import HeroSkeleton from "./components/HeroSkeleton";
import CategoryNav from "./components/CategoryNav";
import ProductCard from "./components/ProductCard";
import ProductCardSkeleton from "./components/ProductCardSkeleton";
import ContinueLearning from "./components/ContinueLearning";
import ContinueLearningSkeleton from "./components/ContinueLearningSkeleton";
import Reviews from "./components/Reviews";
import HomeSectionHeader from "./components/HomeSectionHeader";
import FeedbackSection from "./components/FeedbackSection";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { EmptyState } from "../components/ui/EmptyState";
import { BookOpenIcon } from "../components/icons";
import { categories, reviews as fallbackReviews } from "./data/mockData";
import { calculateCourseProgress, findCurrentLesson } from "./data/homeDashboardData";
import type { Banner, Product } from "./types";
import type { CanonicalCourseModule, CanonicalCourseResource } from "../types/commerce";
import { useCatalog } from "../context/CatalogContext";
import { useHomepageProductReviews } from "../hooks/useProductReviews";
import { useAuth } from "../context/AuthContext";
import { useHomeBanners } from "./hooks/useHomeBanners";
import { ensureSavedWebPushSubscription, subscribeToWebPush } from "../../utils/webPush";
import "./home.css";

/**
 * Maximum number of courses the home page "Continue Learning" section shows.
 * The list is built from live Firestore course progress, so any product added
 * later automatically appears here once the learner opens it — only the two
 * most recently opened are kept on screen.
 */
const CONTINUE_LEARNING_LIMIT = 2;
const HOME_PRODUCT_LIMIT = 4;

interface HomeProgressRecord {
  productId: string;
  completedFileIds: string[];
  lastOpenedFileId?: string;
  updatedAt: number;
}

const GENERIC_CATALOG_LABELS = new Set(["digital learning", "course", "pdf", "notes", "e-book", "live", "lifetime access"]);

function collectCourseResources(modules: CanonicalCourseModule[] = []): Array<{ moduleTitle: string; resource: CanonicalCourseResource }> {
  const orderedModules = [...modules].sort((left, right) => left.sortOrder - right.sortOrder);
  return orderedModules.flatMap((module) => {
    const ownResources = [...(module.resources || [])]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((resource) => ({ moduleTitle: module.title.trim(), resource }));
    return [...ownResources, ...collectCourseResources(module.modules || [])];
  });
}

function countCourseModules(modules: CanonicalCourseModule[] = []): number {
  return modules.reduce((total, module) => total + 1 + countCourseModules(module.modules || []), 0);
}

function usefulCatalogValue(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized || GENERIC_CATALOG_LABELS.has(normalized.toLowerCase())) return undefined;
  return normalized;
}

function productRatingScore(product: Product): number {
  return product.ratingCount > 0 && Number.isFinite(product.rating) ? product.rating : 0;
}

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
  // Admin-managed banners remain the source when configured. Otherwise the
  // featured slide is built from a real catalog product below, so the Home
  // page never presents invented course counts or promotional claims.
  const { banners: configuredBanners, usingCustom } = useHomeBanners();
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
    trending: product.tags.includes("TRENDING") || (product.reviews > 0 && product.rating >= 4.5),
    classLevel: product.classLevel,
    subject: product.subject,
    isFree: product.isFree,
    description: product.description,
  })), [catalogProducts]);
  const homeBanners = useMemo<Banner[]>(() => {
    if (usingCustom) return configuredBanners;
    const featured = catalogProducts.find((product) => product.tags.includes("FEATURED"))
      || catalogProducts.find((product) => product.tags.includes("TRENDING"))
      || [...catalogProducts].sort((left, right) => {
        const rightRating = right.reviews > 0 && Number.isFinite(right.rating) ? right.rating : 0;
        const leftRating = left.reviews > 0 && Number.isFinite(left.rating) ? left.rating : 0;
        return rightRating - leftRating || right.reviews - left.reviews;
      })[0];
    if (!featured) return [];

    const categoryLabel = featured.category === "Course"
      ? "Video course"
      : featured.category === "PDF" || featured.category === "Notes"
        ? "PDF"
        : featured.category === "E-book"
          ? "E-book"
          : featured.category === "Live"
            ? "Live class"
            : "Learning resource";
    const modules = featured.canonicalModules || [];
    const moduleCount = countCourseModules(modules);
    const resourceCount = collectCourseResources(modules).length;
    const metadata = [
      categoryLabel,
      moduleCount > 0 ? `${moduleCount} ${moduleCount === 1 ? "module" : "modules"}` : undefined,
      resourceCount > 0 ? `${resourceCount} ${resourceCount === 1 ? "resource" : "resources"}` : undefined,
      usefulCatalogValue(featured.classLevel),
      usefulCatalogValue(featured.subject),
    ].filter((value): value is string => Boolean(value)).slice(0, 3);
    const description = usefulCatalogValue(String(featured.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

    return [{
      id: `catalog-featured-${featured.id}`,
      image: featured.image,
      eyebrow: "FEATURED",
      title: featured.title,
      subtitle: description || `Explore this ${categoryLabel.toLowerCase()}.`,
      cta: featured.category === "Course" ? "Explore course" : "Explore resource",
      metadata,
      gradient: "bg-indigo-500/20",
      linkType: "product",
      productId: featured.id,
    }];
  }, [catalogProducts, configuredBanners, usingCustom]);
  const { reviews: homepageReviews } = useHomepageProductReviews(catalogProducts, fallbackReviews, 6);
  const publishedHomepageReviews = useMemo(
    () => homepageReviews.filter((review) => review.source === "live" && Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5),
    [homepageReviews],
  );
  // Keep the compact greeting in the approved Header on one line.
  const userName = user?.name?.trim().split(/\s+/)[0] || "Learner";
  const [progressRecords, setProgressRecords] = useState<HomeProgressRecord[]>([]);
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
        return {
          productId: String(data.productId || item.id),
          completedFileIds: Array.isArray(data.completedFileIds) ? data.completedFileIds.map(String) : [],
          lastOpenedFileId: typeof data.lastOpenedFileId === "string" ? data.lastOpenedFileId : undefined,
          updatedAt,
        };
      }));
      // With the persistent Firestore cache the first callback is usually
      // the cached snapshot; either way progress is known now.
      setProgressLoading(false);
    }, () => { setProgressRecords([]); setProgressLoading(false); });
  }, [user]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);

  // Continue Learning is derived from the learner's live course-progress
  // documents. Titles, last-opened lesson and completion are all catalog data.
  const continueLearningEntries = useMemo(() => [...progressRecords]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((record) => {
      const item = products.find((product) => product.id === record.productId);
      const catalogProduct = catalogProducts.find((product) => product.id === record.productId);
      if (!item || !catalogProduct) return null;

      const resources = collectCourseResources(catalogProduct.canonicalModules || []);
      const progress = calculateCourseProgress(record.completedFileIds, resources.map(({ resource }) => resource.id));
      const currentLesson = findCurrentLesson(resources, record.lastOpenedFileId);

      return { item, progress, currentLesson };
    })
    .filter((entry): entry is { item: Product; progress: number; currentLesson: string | undefined } => entry !== null)
    .slice(0, CONTINUE_LEARNING_LIMIT), [catalogProducts, products, progressRecords]);

  const visibleCategories = useMemo(() => categories.filter((category) =>
    category.id !== "live" || products.some((product) => product.category === "live")), [products]);

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
  useEffect(() => {
    if (!visibleCategories.some((category) => category.id === activeCategory)) setActiveCategory("all");
  }, [activeCategory, visibleCategories]);

  const categoryFiltered: Product[] = useMemo(() => {
    const categoryProducts = activeCategory === "all"
      ? products
      : products.filter((product) => product.category === activeCategory);
    const explicitlyTrending = categoryProducts.filter((product) => product.trending);
    const ranked = explicitlyTrending.length > 0 ? explicitlyTrending : categoryProducts;
    return [...ranked]
      .sort((left, right) => productRatingScore(right) - productRatingScore(left) || right.ratingCount - left.ratingCount)
      .slice(0, HOME_PRODUCT_LIMIT);
  }, [activeCategory, products]);

  // Personal recommendations use real learning or ownership signals only.
  // With no prior learning/purchase data, the section is intentionally absent.
  const recommendationSources = useMemo(() => {
    if (continueLearningEntries.length > 0) return continueLearningEntries.map(({ item }) => item);
    return products.filter((product) => purchasedIds.has(product.id));
  }, [continueLearningEntries, products, purchasedIds]);

  const recommendedProducts = useMemo(() => {
    if (recommendationSources.length === 0) return [];
    const excluded = new Set([
      ...Array.from(purchasedIds),
      ...continueLearningEntries.map(({ item }) => item.id),
    ]);
    return products
      .filter((product) => !excluded.has(product.id))
      .map((product) => {
        let relevance = 0;
        for (const source of recommendationSources) {
          if (product.category === source.category) relevance = Math.max(relevance, 2);
          const productSubject = usefulCatalogValue(product.subject)?.toLowerCase();
          const sourceSubject = usefulCatalogValue(source.subject)?.toLowerCase();
          if (productSubject && productSubject === sourceSubject) relevance = Math.max(relevance, 4);
          const productLevel = usefulCatalogValue(product.classLevel)?.toLowerCase();
          const sourceLevel = usefulCatalogValue(source.classLevel)?.toLowerCase();
          if (productLevel && productLevel === sourceLevel && product.category === source.category) relevance = Math.max(relevance, 3);
        }
        return { product, relevance };
      })
      .filter(({ relevance }) => relevance > 0)
      .sort((left, right) => right.relevance - left.relevance || productRatingScore(right.product) - productRatingScore(left.product) || right.product.ratingCount - left.product.ratingCount)
      .slice(0, HOME_PRODUCT_LIMIT)
      .map(({ product }) => product);
  }, [continueLearningEntries, products, purchasedIds, recommendationSources]);

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
          <div data-home-content className="dc-home-content">
            {isSearching ? (
              <section className="dc-home-section dc-home-search-section">
                <HomeSectionHeader
                  title={`Results for “${searchQuery}”`}
                  trailing={(
                    <button type="button" onClick={() => setSearchQuery("")} className="dc-home-section-action dc-home-clear-search dc-scene-ink">
                      Clear
                    </button>
                  )}
                />
                <p className="dc-home-results-count dc-scene-ink">
                  {searchResults.length} item{searchResults.length !== 1 ? "s" : ""} found
                </p>
                {searchResults.length === 0 ? (
                  <div className="dc-home-search-empty">
                    <BookOpenIcon className="h-8 w-8 text-indigo-200/80" aria-hidden="true" />
                    <p>We couldn’t find anything for “{searchQuery}”.</p>
                    <span>Try a different title, subject or keyword.</span>
                  </div>
                ) : (
                  <div data-home-grid className="dc-home-product-grid mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
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
                {homeBanners.length > 0 ? (
                  <div data-home-hero>
                    <HeroCarousel banners={homeBanners} onOpen={handleBannerOpen} />
                  </div>
                ) : catalogLoading ? (
                  <div data-home-hero role="status" aria-busy="true" aria-label="Loading featured content">
                    <HeroSkeleton />
                  </div>
                ) : null}

                <div data-home-category-nav>
                  <CategoryNav
                    categories={visibleCategories}
                    activeCategory={activeCategory}
                    onSelect={setActiveCategory}
                  />
                </div>

                {continueLearningEntries.length > 0 ? (
                  <div data-home-continue>
                    <ContinueLearning
                      items={continueLearningEntries.map(({ item, progress, currentLesson }) => ({
                        id: item.id,
                        title: item.title,
                        author: item.author,
                        image: item.image,
                        details: [usefulCatalogValue(item.classLevel), usefulCatalogValue(item.subject)].filter(Boolean).join(" · ") || undefined,
                        currentLesson,
                        progress,
                        onResume: () => onNavigateToCourse(item),
                        onOpen: () => onNavigateToCourse(item),
                      }))}
                    />
                  </div>
                ) : (
                  user && (progressLoading || catalogLoading) && (
                    <div data-home-continue data-home-continue-loading>
                      <ContinueLearningSkeleton count={2} />
                    </div>
                  )
                )}

                <section data-home-trending className="dc-home-section">
                  <HomeSectionHeader
                    title="Trending Now"
                    trailing={(
                      <button type="button" onClick={onNavigateToStore} className="dc-home-section-action dc-scene-ink">
                        View all
                      </button>
                    )}
                  />

                  {catalogLoading ? (
                    <div
                      data-home-grid
                      data-home-grid-loading
                      aria-busy="true"
                      aria-label="Loading products"
                      className="dc-home-product-grid mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4"
                    >
                      {Array.from({ length: HOME_PRODUCT_LIMIT }).map((_, index) => <ProductCardSkeleton key={index} />)}
                    </div>
                  ) : catalogError ? (
                    <div className="dc-home-catalog-error border-rose-400/30" role="alert">{catalogError}</div>
                  ) : categoryFiltered.length === 0 ? (
                    <EmptyState
                      className="dc-home-empty-state"
                      icon={<BookOpenIcon className="h-7 w-7 text-indigo-200" />}
                      title="No products in this category yet."
                    />
                  ) : (
                    <div data-home-grid className="dc-home-product-grid mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
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

                {recommendedProducts.length > 0 ? (
                  <section className="dc-home-section dc-home-recommendations" aria-labelledby="home-recommendations-title">
                    <HomeSectionHeader
                      id="home-recommendations-title"
                      title="Recommended for You"
                      trailing={(
                        <button type="button" onClick={onNavigateToStore} className="dc-home-section-action dc-scene-ink">
                          View all
                        </button>
                      )}
                    />
                    <div data-home-grid className="dc-home-product-grid mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
                      {recommendedProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          isFavorite={favoriteIds.has(product.id)}
                          onToggleFavorite={onToggleFavorite}
                          onOpen={onNavigateToProduct}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {publishedHomepageReviews.length > 0 ? (
                  <div data-home-reviews>
                    <Reviews reviews={publishedHomepageReviews} onOpenReview={handleOpenReview} />
                  </div>
                ) : null}

                <FeedbackSection
                  canSubmit={Boolean(user)}
                  onSignIn={() => {
                    const returnHash = window.location.hash || "#/home";
                    window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(returnHash)}`;
                  }}
                />
              </>
            )}
          </div>
        </main>

        {/* Home's footer is visible by default and never collapses; the
            course-player drag wave stays available on its line. */}
        <BottomNav
          active="home"
          peek
          peekAlwaysOpen
          onChange={handleFooterChange}
          purchasesBadge={purchasedIds.size}
        />
      </div>
    </div>
  );
}
