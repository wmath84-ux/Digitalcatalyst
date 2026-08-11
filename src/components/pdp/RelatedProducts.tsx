import { Coins, Star, ArrowUpRight } from "lucide-react";
import { relatedProducts } from "../../data/product";

export default function RelatedProducts() {
  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900">Frequently Bought Together</h2>
        <button className="flex items-center gap-1 text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
          View all <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {relatedProducts.map((p) => (
          <div
            key={p.title}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-zinc-100 bg-white transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="relative overflow-hidden">
              <img
                src={p.image}
                alt={p.title}
                className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className="flex flex-col gap-2 p-4">
              <p className="line-clamp-2 text-sm font-semibold text-zinc-800">{p.title}</p>
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {p.rating}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-lg font-bold text-zinc-900">${p.price}</span>
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                  <Coins className="h-3 w-3" /> +{p.eduCoins}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
