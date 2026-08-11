import { BellIcon, BookIcon, CartIcon, UserIcon } from "./icons";

type HeaderProps = {
  cartCount: number;
  notifCount: number;
  onNavigateToProfile: () => void;
};

export default function Header({ cartCount, notifCount, onNavigateToProfile }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200">
            <BookIcon className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Eduvora</h1>
            <p className="text-xs font-medium text-slate-400">Premium learning store</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Cart"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
          >
            <CartIcon className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
          >
            <BellIcon className="h-5 w-5" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                {notifCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Profile"
            onClick={onNavigateToProfile}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
          >
            <UserIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
