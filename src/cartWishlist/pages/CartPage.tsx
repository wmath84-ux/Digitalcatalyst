import { ShieldCheck, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Product, TabKey } from "../types";
import CartItemCard from "../components/CartItemCard";
import EmptyState from "../components/EmptyState";
import { formatINR } from "../utils/format";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import { PaymentButton } from "@/components/ui/PaymentButton";
import "./cart-page.css";

interface CartPageProps {
  cartProducts: Product[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onCheckout: () => void;
  onNavigate: (tab: TabKey) => void;
  onRequireAuth?: () => boolean;
  onOpenProduct?: (id: string) => void;
}

export default function CartPage({
  cartProducts,
  onRemove,
  onClearAll,
  onCheckout,
  onNavigate,
  onRequireAuth,
  onOpenProduct,
}: CartPageProps) {
  const originalTotal = cartProducts.reduce((sum, product) => sum + product.originalPrice, 0);
  const finalTotal = cartProducts.reduce((sum, product) => sum + product.price, 0);
  const savings = Math.max(0, originalTotal - finalTotal);

  const handleCheckout = () => {
    if (onRequireAuth && !onRequireAuth()) return;
    onCheckout();
  };

  if (cartProducts.length === 0) {
    return (
      <div data-cart-page className="flex h-full min-h-0 flex-col">
        <PageHeader title="My Cart" subtitle="0 items" />
        <EmptyState
          icon={<ShoppingBag size={44} strokeWidth={1.8} />}
          title="Your cart feels lonely"
          subtitle="Explore the live catalog and add a resource to start secure checkout."
          actionLabel="Continue Shopping"
          onAction={() => onNavigate("home")}
          accent="bg-indigo-600"
        />
      </div>
    );
  }

  return (
    <div data-cart-page className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="My Cart"
        subtitle={`${cartProducts.length} item${cartProducts.length > 1 ? "s" : ""}`}
        right={(
          <GlassButton
            variant="capsule"
            onClick={onClearAll}
            className="[&>span>div]:h-8 [&>span>div]:px-3 [&>span>div]:text-[11px] [&>span>div]:font-bold [&>span>div]:text-rose-300"
          >
            <span className="flex items-center gap-1"><Trash2 size={12} /> Clear</span>
          </GlassButton>
        )}
      />

      <div data-cart-row className="dc-cart-layout min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div data-cart-items>
          {cartProducts.map((product) => (
            <CartItemCard
              key={product.id}
              product={product}
              onRemove={onRemove}
              onOpen={onOpenProduct}
            />
          ))}
        </div>

        <div data-cart-summary>
          <GlassSurface
            radius={24}
            tint={0.12}
            blur={14}
            className="mt-4 text-white"
            contentClassName="p-4"
          >
            <div className="flex items-center gap-2 pb-3">
              <ShieldCheck size={16} className="text-indigo-300" />
              <h3 className="text-sm font-bold text-white">Server-verified price</h3>
            </div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between dc-cart-summary-muted">
                <span>Catalog total</span>
                <span>{formatINR(originalTotal)}</span>
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Product discounts</span>
                  <span>− {formatINR(savings)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-dashed border-white/10 pt-3">
                <span className="font-extrabold">Total payable</span>
                <span className="text-lg font-extrabold text-indigo-300">{formatINR(finalTotal)}</span>
              </div>
            </div>
            {savings > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-200 backdrop-blur">
                <Sparkles size={13} />
                <span>You save {formatINR(savings)} on this order.</span>
              </div>
            )}
            <p data-cart-price-note className="dc-cart-price-note mt-3 text-[11px] leading-5 text-white/55">
              Final amount is recalculated from Firestore by the payment server.
            </p>
            <div data-cart-desktop-checkout>
              <PaymentButton
                size="md"
                block
                onClick={handleCheckout}
                ariaLabel={`Secure checkout — ${formatINR(finalTotal)}`}
                data-cart-checkout-desktop=""
                label="Secure checkout"
              />
            </div>
          </GlassSurface>
        </div>
      </div>

      <div
        data-cart-checkout-bar
        className="border-t border-white/10 bg-[var(--dc-chrome-glass)] p-4 pb-[calc(env(safe-area-inset-bottom)+12px)] [backdrop-filter:var(--dc-chrome-glass-blur)]"
      >
        {/* Mobile keeps a persistent payment action. Its app-frame parent
            reserves measured footer space so the complete bar stays above the
            floating navigation. Desktop moves the action into the order card. */}
        <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
          <span className="min-w-0 text-left">
            <span data-cart-checkout-caption className="block text-[11px] text-indigo-100">Total payable</span>
            <span className="text-base font-extrabold text-white">{formatINR(finalTotal)}</span>
          </span>
          <PaymentButton
            size="md"
            onClick={handleCheckout}
            ariaLabel={`Secure checkout — ${formatINR(finalTotal)}`}
            data-cart-checkout=""
            className="dc-cart-payment-action"
            label="Secure checkout"
          />
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div
      data-cart-page-header
      className="flex items-center justify-between border-b border-white/10 bg-[var(--dc-chrome-glass)] px-4 py-4 [backdrop-filter:var(--dc-chrome-glass-blur)]"
    >
      <div>
        <h1 className="text-lg font-extrabold text-white">{title}</h1>
        <p data-cart-page-subtitle className="dc-cart-page-subtitle text-[11px] font-medium text-white/55">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}
