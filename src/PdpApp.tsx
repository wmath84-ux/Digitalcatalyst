import { ArrowLeft, Check, Heart, ShieldCheck, ShoppingBag, Star } from "lucide-react";
import type { Product } from "./data/products";

interface ProductDetailProps {
  product: Product | null;
  onCheckout: (finalPrice: number) => void;
  onBack: () => void;
}

export default function ProductDetail({ product, onCheckout, onBack }: ProductDetailProps) {
  if (!product) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-6 text-center">
        <div>
          <ShoppingBag className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Product not found</h1>
          <p className="mt-2 text-sm text-slate-500">It may have been hidden or removed from the live catalog.</p>
          <button onClick={onBack} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to store</button>
        </div>
      </main>
    );
  }

  const discount = product.originalPrice > product.price && product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" aria-label="Back to store"><ArrowLeft size={18} /></button>
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Digital Catalyst</p><p className="truncate text-sm font-black">Product details</p></div>
          <button className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500" aria-label="Save product"><Heart size={18} /></button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:py-12">
        <section>
          <div className="aspect-[16/10] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <img src={product.image} alt={product.title} className="h-full w-full object-cover" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Trust label="Secure checkout" />
            <Trust label="Instant access" />
            <Trust label="Lifetime library" />
          </div>
        </section>

        <section className="self-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{product.category}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">{product.classLevel}</span>
            {product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{tag}</span>)}
          </div>
          <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-5xl">{product.title}</h1>
          <p className="mt-3 text-sm font-semibold text-slate-500">Created by {product.instructor}</p>
          <div className="mt-5 flex items-center gap-2">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="font-black">{product.rating.toFixed(1)}</span>
            <span className="text-sm text-slate-500">({product.reviews} verified reviews)</span>
          </div>
          <p className="mt-6 text-base leading-7 text-slate-600">{product.description || `Get complete access to this ${product.category.toLowerCase()} resource, designed for focused learning and practical progress.`}</p>

          <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-4xl font-black">{product.price === 0 ? "Free" : `₹${product.price.toLocaleString("en-IN")}`}</span>
              {product.originalPrice > product.price && <span className="pb-1 text-lg text-slate-400 line-through">₹{product.originalPrice.toLocaleString("en-IN")}</span>}
              {discount > 0 && <span className="mb-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">SAVE {discount}%</span>}
            </div>
            <ul className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              {["Access from your purchases library", "Available on mobile and desktop", "Account-linked secure delivery"].map((item) => <li key={item} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={13} /></span>{item}</li>)}
            </ul>
            <button onClick={() => onCheckout(product.price)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 text-base font-black text-white shadow-lg shadow-violet-200 transition hover:brightness-110 active:scale-[0.99]"><ShoppingBag size={19} />{product.price === 0 ? "Get instant access" : "Continue to secure checkout"}</button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-slate-400"><ShieldCheck size={14} /> Authentication required before checkout</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Trust({ label }: { label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-[11px] font-black text-slate-600"><ShieldCheck className="mx-auto mb-1 h-4 w-4 text-emerald-600" />{label}</div>;
}
