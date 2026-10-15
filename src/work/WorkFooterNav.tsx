// src/work/WorkFooterNav.tsx
//
// The footer navigation design the owner picked for Work mode —
// https://uiverse.io/asgardOP/great-badger-21 — rendered with THIS app's
// destinations and colours.
//
// Owner brief (2026-10-14):
//
//   "[great-badger-21] footer navigation ka yah naya design add kiya jaaye aur
//    ismein button ko replace kiya jaaye aur sabhi button add kiye jaayen."
//   "Is design ko settings mein option ki tarah add kiya ja sakta hai" — so this
//    same component is also the fourth global footer style
//    (`footerNavigationStyle.ts` → "work-pill"), fed by SiteFooterNav's items.
//
// The design's own geometry lives in work-footer-nav.css; this file owns nothing
// but structure and semantics:
//
//   · ONE pill (`[data-site-footer]`), the reference's 60px × 40px-radius card,
//     centred, never stretched into a bar;
//   · `<button>` cells with `aria-current="page"` (the reference used hidden
//     radio inputs; buttons keep this repo's keyboard + screen-reader rules);
//   · the ONE site-footer contract — `[data-site-footer-nav]` outside,
//     `[data-site-footer]` inside — so utils/footerNavSpace.ts measures the real
//     height and every scroller clears it through `--dc-footer-nav-h`;
//   · colour: the reference paints every glyph one pink. Here an idle glyph is
//     `--text-secondary` and the SELECTED glyph takes that destination's own
//     accent (brief 2: "apna app ka design follow karo aur vahi color bhi use
//     karna hai" — Notes blue, Mind map violet, Sketch orange, exactly as in the
//     course player's TABS). Setting `--work-nav-active` on the shell restores
//     the reference's single-colour behaviour for every cell.
//   · `variant="editor"` renders the brief's My Day reading/editing footer:
//     only Back and Delete, on the same pill (requirement 10).

import type { CSSProperties, Ref } from "react";
import type { GlassDockItem } from "../components/glass-dock/GlassDock";
import { WORK_PAGES, type WorkPageIcon } from "./workPages";
import "./work-footer-nav.css";

/** One pill cell. */
export interface WorkNavCell {
  id: string;
  label: string;
  /** Accent colour the cell turns when it is the selected destination. */
  color: string;
  icon: WorkPageIcon;
  badge?: number;
  title?: string;
  disabled?: boolean;
}

export interface WorkFooterNavProps {
  /** Accessible name of the landmark. */
  label: string;
  cells: WorkNavCell[];
  /** The selected cell's id, or null when the pill only offers navigation. */
  activeId?: string | null;
  onSelect: (id: string) => void;
  position?: "absolute" | "fixed" | "flow";
  /** "editor" → the two-cell Back / Delete footer of a writing surface. */
  variant?: "nav" | "editor";
  dataAttrs?: Record<string, string | undefined>;
  /** Site-wide fourth footer style (uses its own fallback tokens). */
  global?: boolean;
  /** Keep local editor pills out of the page-wide measured site footer space. */
  measured?: boolean;
  /** Where utils/footerNavSpace.ts and the tests find the measured pill. */
  footerRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
}

/** SiteFooterNav's items → pill cells, so the global style is the same design. */
export const workCellsFromGlassItems = (items: GlassDockItem[]): WorkNavCell[] =>
  items.map((item) => ({
    id: item.id,
    label: item.label,
    color: item.color,
    icon: item.icon,
    badge: item.badge,
    title: item.label,
  }));

/** Work mode's own cells, straight from the page registry (the ONE source). */
export const workNavCells = (): WorkNavCell[] =>
  WORK_PAGES.map((page) => ({
    id: page.id,
    label: page.label,
    color: page.color,
    icon: page.icon,
    title: page.hint,
  }));

export default function WorkFooterNav({
  label,
  cells,
  activeId = null,
  onSelect,
  position = "absolute",
  variant = "nav",
  global = false,
  measured = true,
  dataAttrs,
  footerRef,
  style,
  className,
}: WorkFooterNavProps) {
  const count = Math.max(1, Math.min(8, cells.length));

  return (
    <nav
      data-work-footer-nav=""
      data-work-global-footer={global ? "true" : undefined}
      data-site-footer-nav={measured ? "" : undefined}
      data-position={position}
      data-variant={variant}
      data-cell-count={String(cells.length)}
      aria-label={label}
      className={className}
      style={style}
      {...dataAttrs}
    >
      <div
        ref={footerRef}
        data-site-footer=""
        data-nav-count={String(count)}
        style={{ "--work-nav-n": String(count) } as CSSProperties}
      >
        <div data-work-nav-row="">
          {cells.map((cell) => {
            const Icon = cell.icon;
            const isActive = activeId != null && cell.id === activeId;
            // The selected cell publishes its own accent, so the CSS lift and
            // the app's destination colour stay one rule (see the header note).
            const cellStyle = {
              ...(isActive ? { "--work-nav-active": cell.color } : null),
            } as CSSProperties;

            return (
              <button
                key={cell.id}
                type="button"
                data-work-nav-cell={cell.id}
                data-active={isActive ? "true" : "false"}
                aria-current={isActive ? "page" : undefined}
                aria-label={cell.label}
                title={cell.title ?? cell.label}
                disabled={cell.disabled}
                onClick={() => onSelect(cell.id)}
                style={cellStyle}
              >
                <span data-work-nav-icon="">
                  <Icon size={26} />
                </span>
                {typeof cell.badge === "number" && cell.badge > 0 ? (
                  <span data-work-nav-badge="" aria-hidden="true">
                    {cell.badge > 99 ? "99+" : String(cell.badge)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
