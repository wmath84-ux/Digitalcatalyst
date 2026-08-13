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
import { banners, categories, reviews as fallbackReviews } from "./data/mockData";
import type { Product } from "./types";
import { useCatalog } from "../context/CatalogContext";
import { useHomepageProductReviews } from "../hooks/useProductReviews";
import { useAuth } from "../context/AuthContext";

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
    trending: product.tags.includes("TRENDING") || product.rating >= 4.5,
  })), [catalogProducts]);
  const { reviews: homepageReviews } = useHomepageProductReviews(catalogProducts, fallbackReviews, 6);
  const userName = user?.name?.split(" ")[0] || "Learner";
  const [progressRecords, setProgressRecords] = useState<Array<{ productId: string; completedFileIds: string[]; updatedAt: number }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

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
  const touchStartX = useRef<number | null>(null);

  const continueProgressRecord = useMemo(() => [...progressRecords]
    .filter((record) => catalogProducts.some((product) => product.id === record.productId))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null, [catalogProducts, progressRecords]);
  const continueLearningItem = continueProgressRecord ? products.find((product) => product.id === continueProgressRecord.productId) || null : null;
  const continueProgress = useMemo(() => {
    if (!continueProgressRecord) return 0;
    const product = catalogProducts.find((item) => item.id === continueProgressRecord.productId);
    const countResources = (modules: NonNullable<typeof product>["canonicalModules"] = []): number => (modules || []).reduce((total, module) => total + (module.resources?.length || 0) + countResources(module.modules || []), 0);
    const total = product ? countResources(product.canonicalModules) : 0;
    return total > 0 ? Math.min(100, Math.round((continueProgressRecord.completedFileIds.length / total) * 100)) : 0;
  }, [catalogProducts, continueProgressRecord]);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults: Product[] = useMemo(() => {
    if (!normalizedQuery) return [];
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(normalizedQuery) ||
        p.author.toLowerCase().includes(normalizedQuery) ||
        p.type.toLowerCase().includes(normalizedQuery) ||
        p.category.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, products]);

  const suggestions = searchResults.slice(0, 5);

  const [activeCategory, setActiveCategory] = useState("all");

  const switchCategory = (direction: -1 | 1) => {
    const index = Math.max(0, categories.findIndex((category) => category.id === activeCategory));
    const next = (index + direction + categories.length) % categories.length;
    setActiveCategory(categories[next].id);
  };
  const handleTouchStart = (event: React.TouchEvent) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; };
  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= 48) switchCategory(delta < 0 ? 1 : -1);
  };

  const categoryFiltered: Product[] = useMemo(() => {
    if (activeCategory === "all") return products;
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
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-[#f4f4f8] shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
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

        <main className="flex-1 overflow-y-auto pb-2" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {isSearching ? (
            <section className="px-5 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Results for “{searchQuery}”
                </h2>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs font-semibold text-indigo-600"
                >
                  Clear
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {searchResults.length} item{searchResults.length !== 1 ? "s" : ""} found
              </p>

              {searchResults.length === 0 ? (
                <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400">
                  <span className="text-4xl">🔎</span>
                  <p className="text-sm">
                    We couldn't find anything for "{searchQuery}".<br />
                    Try searching a different keyword.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
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
              <HeroCarousel banners={banners} />

              <CategoryNav
                categories={categories}
                activeCategory={activeCategory}
                onSelect={setActiveCategory}
              />

              {continueLearningItem && (
                <ContinueLearning
                  title={continueLearningItem.title}
                  author={continueLearningItem.author}
                  image={continueLearningItem.image}
                  progress={continueProgress}
                  onResume={() => onNavigateToCourse(continueLearningItem)}
                  onClick={() => onNavigateToCourse(continueLearningItem)}
                />
              )}

              <section className="px-5 pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    {activeCategory === "all"
                      ? "Trending Now"
                      : categories.find((c) => c.id === activeCategory)?.label}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigateToStore()}
                    className="text-xs font-semibold text-slate-400"
                  >
                    View All
                  </button>
                </div>

                {categoryFiltered.length === 0 ? (
                  <p className="mt-8 text-center text-sm text-slate-400">
                    No products in this category yet.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3">
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

              <Reviews reviews={homepageReviews} onOpenReview={handleOpenReview} />
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
