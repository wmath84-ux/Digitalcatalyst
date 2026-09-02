import { ShieldCheck, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import type { Product, TabKey } from "../types";
import CartItemCard from "../components/CartItemCard";
import EmptyState from "../components/EmptyState";
import { formatINR } from "../utils/format";

interface CartPageProps {
  cartProducts: Product[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onCheckout: () => void;
  onNavigate: (tab: TabKey) => void;
  onRequireAuth?: () => boolean;
  onOpenProduct?: (id: string) => void;
}

export default function CartPage({ cartProducts, onRemove, onClearAll, onCheckout, onNavigate, onRequireAuth, onOpenProduct }: CartPageProps) {
  const originalTotal = cartProducts.reduce((sum, product) => sum + product.originalPrice, 0);
  const finalTotal = cartProducts.reduce((sum, product) => sum + product.price, 0);
  const savings = Math.max(0, originalTotal - finalTotal);

  const handleCheckout = () => {
    if (onRequireAuth && !onRequireAuth()) return;
    onCheckout();
  };

  if (cartProducts.length === 0) {
    return <div className="flex h-full flex-col"><PageHeader title="My Cart" subtitle="0 items" /><EmptyState icon={<ShoppingBag size={44} strokeWidth={1.8} />} title="Your cart feels lonely" subtitle="Explore the live catalog and add a resource to start secure checkout." actionLabel="Continue Shopping" onAction={() => onNavigate("home")} accent="from-violet-500 to-indigo-600" /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="My Cart" subtitle={`${cartProducts.length} item${cartProducts.length > 1 ? "s" : ""}`} right={<button onClick={onClearAll} className="flex items-center gap-1 rounded-full border border-white/10 bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-500 backdrop-blur"><Trash2 size={12} /> Clear</button>} />
      <div data-cart-row className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div className="flex flex-col gap-2.5">{cartProducts.map((product) => <CartItemCard key={product.id} product={product} onRemove={onRemove} onOpen={onOpenProduct} />)}</div>
        <div className="dc-glass mt-4 rounded-[1.6rem] p-4">
          <div className="flex items-center gap-2 pb-3"><ShieldCheck size={16} className="text-indigo-500" /><h3 className="text-sm font-bold text-white">Server-verified price</h3></div>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between text-white/55"><span>Catalog total</span><span>{formatINR(originalTotal)}</span></div>
            {savings > 0 && <div className="flex justify-between text-emerald-300"><span>Product discounts</span><span>− {formatINR(savings)}</span></div>}
            <div className="border-t border-dashed border-white/10 pt-3 flex justify-between"><span className="font-extrabold">Total payable</span><span className="text-lg font-extrabold text-indigo-300">{formatINR(finalTotal)}</span></div>
          </div>
          {savings > 0 && <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-200 backdrop-blur"><Sparkles size={13} />You save {formatINR(savings)} on this order.</div>}
          <p className="mt-3 text-[11px] leading-5 text-white/55">Final amount is recalculated from Firestore by the payment server.</p>
        </div>
      </div>
      <div className="dc-glass-toolbar border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <button onClick={handleCheckout} className="flex w-full items-center justify-between rounded-full bg-indigo-600 px-5 py-4 text-white transition hover:bg-indigo-500 active:scale-[0.98]"><span className="text-left"><span className="block text-[11px] text-indigo-100">Total payable</span><span className="text-base font-extrabold">{formatINR(finalTotal)}</span></span><span className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold">Secure checkout</span></button>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return <div className="dc-glass-toolbar flex items-center justify-between border-b border-white/10 px-4 py-4"><div><h1 className="text-lg font-extrabold text-white">{title}</h1><p className="text-[11px] font-medium text-white/55">{subtitle}</p></div>{right}</div>;
}
