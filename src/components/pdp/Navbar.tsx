import { Search, ShoppingCart, Menu, GraduationCap, Coins } from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 via-zinc-600 to-zinc-900 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
            <GraduationCap className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            Edu<span className="text-zinc-400">Verse</span>
          </span>
        </div>

        <div className="hidden flex-1 items-center md:flex max-w-md mx-6">
          <div className="flex w-full items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-4 py-2 text-sm text-zinc-400 shadow-inner">
            <Search className="h-4 w-4" />
            <span>Search courses, ebooks, templates…</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm sm:flex">
            <Coins className="h-3.5 w-3.5" />
            2,450
          </div>
          <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:scale-105 hover:shadow-md">
            <ShoppingCart className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-bold text-white">
              2
            </span>
          </button>
          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-zinc-300 via-zinc-100 to-zinc-400 text-xs font-bold text-zinc-800 shadow sm:flex">
            AK
          </div>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm md:hidden">
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
