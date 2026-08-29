import type { ReactNode } from "react";
import { useExitGuard } from "./ExitGuardContext";
import { ChevronLeftIcon } from "./icons";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
};

/**
 * The feature's own header, ported from the reference design. It stays
 * independently sticky directly below the 68px website header (same
 * two-header pattern the My Day feature uses) so both headers are always
 * visible and neither covers the other.
 */
export default function AppHeader({ title, subtitle, backHref, rightSlot }: AppHeaderProps) {
  const { navigate } = useExitGuard();
  return (
    <header
      data-revision-app-header
      className="dc-glass-toolbar sticky top-0 z-20 border-b border-white/60 transition-all shadow-[0_10px_30px_-18px_rgba(79,70,229,0.32)]"
    >
      <div className="flex min-h-[56px] w-full min-w-0 flex-wrap items-center gap-2 px-3 py-2">
        {backHref ? (
          <button
            type="button"
            onClick={() => navigate(backHref)}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/70 text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white/90 active:scale-95"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1 py-1">
          <h1 className="break-words text-[17px] font-extrabold tracking-tight leading-tight text-slate-900 [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="break-words text-xs font-semibold tracking-wide uppercase text-slate-500 [overflow-wrap:anywhere]">{subtitle}</p>}
        </div>
        {rightSlot && <div className="mx-auto flex max-w-full shrink-0 flex-wrap items-center gap-1 pr-0 lg:pr-1">{rightSlot}</div>}
      </div>
    </header>
  );
}
