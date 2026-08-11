import { Heart, PlayCircle, Trash2 } from "lucide-react";
import { Sheet } from "./Sheet";
import { useApp } from "../context/AppContext";

export function PurchasesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { purchases, showToast } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title="Purchased Products">
      <div className="space-y-3">
        {purchases.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-100"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-neutral-100">
              {item.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-neutral-800">{item.title}</p>
              <p className="text-[10.5px] text-neutral-400">{item.type}</p>
              {typeof item.progress === "number" && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => showToast(`Resuming "${item.title}"`, "info")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 active:scale-90 transition"
              aria-label="Resume"
            >
              <PlayCircle className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function FavoritesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { favorites, toggleFavorite } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title="Favorites & Wishlist">
      {favorites.length === 0 ? (
        <EmptyState emoji="💔" text="No favorites yet. Start adding items you love!" />
      ) : (
        <div className="space-y-3">
          {favorites.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-100"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-neutral-100">
                {item.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-neutral-800">{item.title}</p>
                <p className="text-[10.5px] text-neutral-400">{item.type}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(item)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 active:scale-90 transition"
                aria-label="Remove favorite"
              >
                <Heart className="h-4.5 w-4.5 fill-rose-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function DownloadsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { downloads, removeDownload } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title="Offline Downloads">
      {downloads.length === 0 ? (
        <EmptyState emoji="📭" text="No offline downloads saved." />
      ) : (
        <div className="space-y-3">
          {downloads.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-100"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm ring-1 ring-neutral-100">
                {item.type === "PDF" ? "📄" : "🎬"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-neutral-800">{item.title}</p>
                <p className="text-[10.5px] text-neutral-400">
                  {item.type} • {item.size}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeDownload(item.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 active:scale-90 transition"
                aria-label="Delete download"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-4xl">{emoji}</span>
      <p className="max-w-[220px] text-xs text-neutral-400">{text}</p>
    </div>
  );
}
