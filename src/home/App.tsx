import { useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import HeroCarousel from "./components/HeroCarousel";
import CategoryNav from "./components/CategoryNav";
import ProductCard from "./components/ProductCard";
import ContinueLearning from "./components/ContinueLearning";
import Reviews from "./components/Reviews";
import BottomNav, { type NavTab } from "./components/BottomNav";
import { banners, categories, reviews } from "./data/mockData";
import type { Product } from "./types";
import { useCatalog } from "../context/CatalogContext";
import { useAuth } from "../context/AuthContext";

interface AppProps {
  onNavigateToStore: () => void;
  onNavigateToProduct: (product: Product) => void;
  onNavigateToMyDay: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPurchases?: () => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
}

export default function App({ onNavigateToStore, onNavigateToProduct, onNavigateToMyDay, onNavigateToProfile, onNavigateToPurchases, favoriteIds, onToggleFavorite }: AppProps) {
  const { user } = useAuth();
  const { products: catalogProducts } = useCatalog();
  const products = useMemo<Product[]>(() => catalogProducts.map((product) => ({
    id: product.id,
    title: product.title,
    type: product.category === "PDF" || product.category === "Notes" ? "pdf" : product.category === "E-book" ? "ebook" : product.category === "Live" ? "live" : "video",
    category: product.category === "PDF" || product.category === "Notes" ? "pdf" : product.category === "E-book" ? "ebook" : product.category === "Live" ? "live" : "video",
    author: product.instructor,
    price: product.price,
    mrp: product.originalPrice,
    educoins: 0,
    rating: product.rating,
    ratingCount: product.reviews,
    image: product.image,
    trending: product.tags.includes("TRENDING") || product.rating >= 4.5,
  })), [catalogProducts]);
  const userName = user?.name?.split(" ")[0] || "Learner";
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [continueProgress, setContinueProgress] = useState(42);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);

  const continueLearningItem = products[0];

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
  }, [normalizedQuery]);

  const suggestions = searchResults.slice(0, 5);

  const categoryFiltered: Product[] = useMemo(() => {
    if (activeCategory === "all") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favoriteIds.has(p.id)),
    [favoriteIds, products],
  );

  const handleSelectSuggestion = (product: Product) => {
    setSearchQuery(product.title);
    searchInputRef.current?.blur();
  };

  const handleTabChange = (tab: NavTab) => {
    if (tab === "myday") {
      onNavigateToMyDay();
      return;
    }
    if (tab === "profile") {
      onNavigateToProfile();
      return;
    }
    setActiveTab(tab);
    if (tab === "search") {
      contentTopRef.current?.scrollIntoView({ behavior: "smooth" });
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (tab === "home") {
      setSearchQuery("");
      contentTopRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleResume = () => {
    setContinueProgress((prev) => Math.min(100, prev + 14));
  };

  const isSearching = normalizedQuery.length > 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-[#f4f4f8] pb-24 shadow-2xl">
        <div ref={contentTopRef} />
        <Header
          ref={searchInputRef}
          userName={userName}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
          favoritesCount={favoriteIds.size}
          onOpenFavorites={() => handleTabChange("favorites")}
        />

        <main className="flex-1">
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
          ) : activeTab === "favorites" ? (
            <section className="px-5 pt-6">
              <h2 className="text-base font-bold text-slate-900">Your Saved Items</h2>
              <p className="mt-1 text-xs text-slate-400">
                {favoriteProducts.length} item{favoriteProducts.length !== 1 ? "s" : ""} saved for later
              </p>

              {favoriteProducts.length === 0 ? (
                <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400">
                  <span className="text-4xl">💔</span>
                  <p className="text-sm">
                    No favorites yet. Tap the heart on any product to save it here.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTabChange("home")}
                    className="mt-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white active:scale-95"
                  >
                    Browse Products
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {favoriteProducts.map((product) => (
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
          ) : activeTab === "profile" ? (
            <section className="px-5 pt-6">
              <div className="flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow-sm shadow-slate-200 ring-1 ring-slate-100">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-2xl font-bold text-white">
                  {userName.charAt(0)}
                </div>
                <h2 className="mt-3 text-lg font-bold text-slate-900">{userName} Patel</h2>
                <p className="text-xs text-slate-400">Learner since 2023</p>

                <div className="mt-5 grid w-full grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 py-3">
                    <p className="text-sm font-bold text-slate-900">12</p>
                    <p className="text-[11px] text-slate-400">Courses</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 py-3">
                    <p className="text-sm font-bold text-slate-900">{favoriteIds.size}</p>
                    <p className="text-[11px] text-slate-400">Saved</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 py-3">
                    <p className="text-sm font-bold text-amber-600">860</p>
                    <p className="text-[11px] text-amber-500">EduCoins</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTabChange("home")}
                  className="mt-5 w-full rounded-full bg-slate-900 py-2.5 text-sm font-bold text-white active:scale-95"
                >
                  Back to Home
                </button>
              </div>
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
                  onResume={handleResume}
                  onClick={onNavigateToPurchases}
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

              <Reviews reviews={reviews} />
            </>
          )}
        </main>

        <BottomNav active={activeTab} favoritesCount={favoriteIds.size} onChange={handleTabChange} />
      </div>
    </div>
  );
}
