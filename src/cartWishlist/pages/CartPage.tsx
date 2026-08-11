import { useEffect, useMemo, useState } from "react";
import { Coins, ShieldCheck, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { Product, TabKey } from "../types";
import CartItemCard from "../components/CartItemCard";
import EmptyState from "../components/EmptyState";
import CheckoutSuccessSheet from "../components/CheckoutSuccessSheet";
import { formatINR } from "../utils/format";

interface CartPageProps {
  cartProducts: Product[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  userCoins: number;
  onCheckoutComplete: (coinsUsed: number) => void;
  onNavigate: (tab: TabKey) => void;
}

const COIN_VALUE = 1; // ₹1 per EduCoin
const MAX_REDEEM_RATIO = 0.3; // up to 30% of subtotal can be covered by coins

export default function CartPage({
  cartProducts,
  onRemove,
  onClearAll,
  userCoins,
  onCheckoutComplete,
  onNavigate,
}: CartPageProps) {
  const [useEduCoins, setUseEduCoins] = useState(false);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [successOpen, setSuccessOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState({ amount: 0, coins: 0, items: 0 });

  const subtotal = useMemo(
    () => cartProducts.reduce((sum, p) => sum + p.price, 0),
    [cartProducts]
  );
  const itemSavings = useMemo(
    () => cartProducts.reduce((sum, p) => sum + (p.originalPrice - p.price), 0),
    [cartProducts]
  );

  const maxRedeemableCoins = Math.max(
    0,
    Math.min(userCoins, Math.floor(subtotal * MAX_REDEEM_RATIO))
  );

  useEffect(() => {
    setCoinsToRedeem((prev) => Math.min(prev, maxRedeemableCoins));
  }, [maxRedeemableCoins]);

  useEffect(() => {
    if (maxRedeemableCoins > 0 && coinsToRedeem === 0 && useEduCoins) {
      setCoinsToRedeem(maxRedeemableCoins);
    }
  }, [useEduCoins]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveCoins = useEduCoins ? coinsToRedeem : 0;
  const coinsDiscount = effectiveCoins * COIN_VALUE;
  const finalTotal = Math.max(subtotal - coinsDiscount, 0);
  const totalSavings = itemSavings + coinsDiscount;

  const handleCheckout = () => {
    setLastOrder({
      amount: finalTotal,
      coins: effectiveCoins,
      items: cartProducts.length,
    });
    setSuccessOpen(true);
  };

  const handleCloseSuccess = () => {
    setSuccessOpen(false);
    onCheckoutComplete(effectiveCoins);
    setUseEduCoins(false);
    setCoinsToRedeem(0);
  };

  if (cartProducts.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="My Cart" subtitle="0 items" />
        <EmptyState
          icon={<ShoppingBag size={44} strokeWidth={1.8} />}
          title="Your cart feels lonely"
          subtitle="Looks like you haven't added any courses yet. Explore our catalog and start learning today."
          actionLabel="Continue Shopping"
          onAction={() => onNavigate("home")}
          accent="from-violet-500 to-indigo-600"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="My Cart"
        subtitle={`${cartProducts.length} item${cartProducts.length > 1 ? "s" : ""}`}
        right={
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-500 transition active:scale-95"
          >
            <Trash2 size={12} /> Clear
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div className="flex flex-col gap-2.5">
          {cartProducts.map((product) => (
            <CartItemCard key={product.id} product={product} onRemove={onRemove} />
          ))}
        </div>

        {/* EduCoins card */}
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-white shadow-sm">
                <Coins size={18} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-900">Use EduCoins</p>
                <p className="text-[11px] text-slate-500">
                  Balance: <span className="font-semibold">{userCoins} coins</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setUseEduCoins((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-300 ${
                useEduCoins ? "bg-amber-500" : "bg-slate-200"
              }`}
              aria-label="Toggle EduCoins"
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
                  useEduCoins ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {useEduCoins && (
            <div className="mt-3.5 border-t border-amber-200/60 pt-3.5">
              {maxRedeemableCoins > 0 ? (
                <>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Redeem coins</span>
                    <span className="text-amber-600">
                      {coinsToRedeem} coins = {formatINR(coinsToRedeem * COIN_VALUE)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxRedeemableCoins}
                    step={Math.max(1, Math.round(maxRedeemableCoins / 20))}
                    value={coinsToRedeem}
                    onChange={(e) => setCoinsToRedeem(Number(e.target.value))}
                    className="mt-2 w-full accent-amber-500"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Max redeemable: {maxRedeemableCoins} coins (30% of subtotal)
                    </span>
                    <button
                      onClick={() => setCoinsToRedeem(maxRedeemableCoins)}
                      className="text-[10px] font-bold text-amber-600"
                    >
                      Use Max
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-500">
                  You don't have enough EduCoins to redeem right now.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Price summary */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70 ring-1 ring-slate-100">
          <div className="flex items-center gap-2 pb-3">
            <ShieldCheck size={16} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-900">Price Details</h3>
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Subtotal ({cartProducts.length} item
                {cartProducts.length > 1 ? "s" : ""})
              </span>
              <span className="font-semibold text-slate-800">
                {formatINR(cartProducts.reduce((s, p) => s + p.originalPrice, 0))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Course Discount</span>
              <span className="font-semibold text-emerald-600">
                − {formatINR(itemSavings)}
              </span>
            </div>
            {effectiveCoins > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">EduCoins Applied</span>
                <span className="font-semibold text-amber-600">
                  − {formatINR(coinsDiscount)}
                </span>
              </div>
            )}
            <div className="my-1 border-t border-dashed border-slate-200" />
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-extrabold text-slate-900">
                Final Total
              </span>
              <span className="text-[17px] font-extrabold text-indigo-600">
                {formatINR(finalTotal)}
              </span>
            </div>
          </div>
          {totalSavings > 0 && (
            <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              <Sparkles size={13} />
              You're saving {formatINR(totalSavings)} on this order!
            </div>
          )}
        </div>
        <div className="h-4" />
      </div>

      {/* Sticky checkout */}
      <div className="border-t border-slate-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]">
        <button
          onClick={handleCheckout}
          className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white shadow-lg shadow-indigo-300/60 transition active:scale-[0.98]"
        >
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-medium text-indigo-100">
              Total Payable
            </span>
            <span className="text-base font-extrabold">{formatINR(finalTotal)}</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold">
            Proceed to Checkout
          </span>
        </button>
      </div>

      <CheckoutSuccessSheet
        open={successOpen}
        itemsCount={lastOrder.items}
        amountPaid={lastOrder.amount}
        coinsUsed={lastOrder.coins}
        onClose={handleCloseSuccess}
      />
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
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-extrabold text-slate-900">{title}</h1>
        <p className="text-[11px] font-medium text-slate-400">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}
