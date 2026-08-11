import { GraduationCap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-100 bg-zinc-50/60 pb-24 pt-10 sm:pb-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 text-center sm:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-600">
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-semibold text-zinc-900">
            Edu<span className="text-zinc-400">Verse</span>
          </span>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-zinc-400">
          Premium digital courses, ebooks, and templates — with EduCoins rewards on every
          purchase. Learn more, earn more.
        </p>
        <p className="text-[11px] text-zinc-300">© 2026 EduVerse Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}
