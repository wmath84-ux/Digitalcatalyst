import type { ReactNode } from "react";
import { useExitGuard } from "./ExitGuardContext";
import { ChevronLeftIcon } from "./icons";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: ReactNode;
};

/**
 * The feature's own header, ported from the reference design.
 *
 * PageShell still renders it as a sibling ABOVE the page scroller
 * (`[data-revision-page-main]`). Unlayered CSS then takes it out of
 * flow (`position: absolute; top: 0`) so page cards scroll UNDER the
 * MAG frost — the same overlay model as Store / Home. The scroller
 * keeps `--dc-revision-app-header-seat` of padding-top so the first
 * content is not hidden. The inset MUST stay 0: a sticky inset also
 * pushes a box down when its static position is above it, which is
 * what dropped this header into the middle of the page when
 * `index.css` carried per-band 68/80/64 px offsets.
 */
export default function AppHeader({ title, subtitle, backHref, rightSlot }: AppHeaderProps) {
  const { navigate } = useExitGuard();
  return (
    <header data-revision-app-header className="dc-scene-plate dc-scene-plate--bar dc-glass-toolbar sticky top-0 z-20 transition-all">
      {/* Phase A4: the bar IS the pack GlassSurface at defaults (radius 0 — it
          is an edge-to-edge strip); `.dc-glass-toolbar` stays as a hook only. */}
      <GlassSurface radius={0} className="border-b border-white/10 text-white" contentClassName="flex min-h-[56px] w-full min-w-0 flex-wrap items-center gap-2 px-3 py-2">
        {backHref ? (
          <GlassButton onClick={() => navigate(backHref)} aria-label="Go back" className="shrink-0 [&_.size-12]:size-10">
            <ChevronLeftIcon className="h-6 w-6" />
          </GlassButton>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1 py-1">
          <h1 className="break-words text-[17px] font-extrabold tracking-tight leading-tight text-white [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="break-words text-xs font-semibold tracking-wide uppercase text-white/55 [overflow-wrap:anywhere]">{subtitle}</p>}
        </div>
        {rightSlot && <div className="mx-auto flex max-w-full shrink-0 flex-wrap items-center gap-1 pr-0 lg:pr-1">{rightSlot}</div>}
      </GlassSurface>
    </header>
  );
}
