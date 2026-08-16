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
    <header className="sticky top-[68px] z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-[56px] items-center gap-2 px-3">
        {backHref ? (
          <button
            type="button"
            onClick={() => navigate(backHref)}
            aria-label="Go back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1 py-2">
          <h1 className="truncate text-[17px] font-semibold leading-tight text-slate-900">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {rightSlot && <div className="flex shrink-0 items-center gap-1 pr-1">{rightSlot}</div>}
      </div>
    </header>
  );
}
