import { products, type Product } from "../data/products";
import { BagIcon, CalendarIcon, HeartIcon, HomeIcon, WalletIcon } from "./icons";

export function HomeTab() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
        <HomeIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-extrabold text-slate-900">Welcome back 👋</h2>
      <p className="max-w-xs text-sm text-slate-500">
        Your personalized dashboard, continue-learning shortcuts, and daily streaks will show up here.
      </p>
    </div>
  );
}

export function MyDayTab() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <CalendarIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-extrabold text-slate-900">Nothing planned yet</h2>
      <p className="max-w-xs text-sm text-slate-500">
        Add notes or courses to your study plan and they'll show up here as daily tasks.
      </p>
    </div>
  );
}

export function PurchasesTab({ purchased }: { purchased: Set<string> }) {
  const items: Product[] = products.filter((p) => purchased.has(p.id));

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <BagIcon className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900">No purchases yet</h2>
        <p className="max-w-xs text-sm text-slate-500">
          Resources you buy or claim for free from the Store will appear here for lifetime access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-8 pt-6">
      <h2 className="text-lg font-extrabold text-slate-900">Your purchases</h2>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <img src={item.image} alt={item.title} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
            <p className="text-xs text-slate-500">by {item.instructor}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-emerald-700">
            Owned
          </span>
        </div>
      ))}
    </div>
  );
}

export function WalletTab({ wishlistCount }: { wishlistCount: number }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
        <WalletIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-extrabold text-slate-900">₹0.00 balance</h2>
      <p className="max-w-xs text-sm text-slate-500">
        Coupons, referral rewards, and refunds will be credited to your Eduvora wallet.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
        <HeartIcon className="h-4 w-4 text-rose-400" />
        {wishlistCount} item{wishlistCount === 1 ? "" : "s"} saved to wishlist
      </div>
    </div>
  );
}
