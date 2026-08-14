import { Heart } from "lucide-react";
import { Product, TabKey } from "../types";
import FavoriteCard from "../components/FavoriteCard";
import EmptyState from "../components/EmptyState";

interface FavoritesPageProps {
  favoriteProducts: Product[];
  cartIds: Set<string>;
  onRemove: (id: string) => void;
  onAddToCart: (id: string) => void;
  onNavigate: (tab: TabKey) => void;
  onOpenProduct?: (id: string) => void;
}

export default function FavoritesPage({
  favoriteProducts,
  cartIds,
  onRemove,
  onAddToCart,
  onNavigate,
  onOpenProduct,
}: FavoritesPageProps) {
  if (favoriteProducts.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Favorites" subtitle="0 saved courses" />
        <EmptyState
          icon={<Heart size={44} strokeWidth={1.8} />}
          title="No favorites yet"
          subtitle="Tap the heart icon on any course to save it here for later. Start exploring to build your wishlist!"
          actionLabel="Explore Store"
          onAction={() => onNavigate("home")}
          accent="from-rose-500 to-pink-600"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Favorites"
        subtitle={`${favoriteProducts.length} saved course${
          favoriteProducts.length > 1 ? "s" : ""
        }`}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <div className="grid grid-cols-2 gap-3">
          {favoriteProducts.map((product) => (
            <FavoriteCard
              key={product.id}
              product={product}
              inCart={cartIds.has(product.id)}
              onRemove={onRemove}
              onAddToCart={onAddToCart}
              onOpen={onOpenProduct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-extrabold text-slate-900">{title}</h1>
        <p className="text-[11px] font-medium text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}
