import { useState } from "react";
import { Play, Expand, Heart } from "lucide-react";
import { product } from "../../data/product";
import { cn } from "../../utils/cn";

export default function Gallery() {
  const [active, setActive] = useState(0);
  const [liked, setLiked] = useState(false);
  const item = product.gallery[active];

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-zinc-100 via-white to-zinc-200 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.6),transparent_60%)]" />
        <img
          src={item.src}
          alt={item.label}
          className="aspect-[4/3] w-full object-cover transition duration-700 ease-out group-hover:scale-105 sm:aspect-[16/11]"
        />

        {/* Top-left badge */}
        <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Bestseller
        </div>

        {/* Top-right actions */}
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            onClick={() => setLiked((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-md backdrop-blur-md transition hover:scale-110"
          >
            <Heart className={cn("h-4 w-4", liked && "fill-rose-500 text-rose-500")} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-md backdrop-blur-md transition hover:scale-110">
            <Expand className="h-4 w-4" />
          </button>
        </div>

        {/* Preview play button on hero image */}
        {active === 0 && (
          <button className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full bg-white/90 py-2 pl-2 pr-4 text-sm font-semibold text-zinc-900 shadow-lg backdrop-blur-md transition hover:scale-[1.03]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-zinc-900 to-zinc-700 text-white">
              <Play className="ml-0.5 h-3.5 w-3.5 fill-white" />
            </span>
            Watch Preview · 2:14
          </button>
        )}

        <div className="absolute bottom-5 right-5 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
          {item.label}
        </div>
      </div>

      <div className="flex gap-3">
        {product.gallery.map((g, i) => (
          <button
            key={g.src}
            onClick={() => setActive(i)}
            className={cn(
              "relative h-16 w-20 flex-1 overflow-hidden rounded-xl border-2 shadow-sm transition sm:h-20",
              active === i
                ? "border-zinc-900 shadow-md"
                : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            <img src={g.src} alt={g.label} className="h-full w-full object-cover" />
            {active === i && <div className="absolute inset-0 ring-2 ring-zinc-900/70" />}
          </button>
        ))}
      </div>
    </div>
  );
}
