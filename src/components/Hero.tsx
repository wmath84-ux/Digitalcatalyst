import { BookOpenIcon, ShieldIcon, ZapIcon } from "./icons";
import { GlassSurface } from "./ui/glass";

type HeroProps = {
  resourceCount: number;
};

/**
 * The store hero — owner brief 2026-09-10: "store page per yah jo likha hai
 * isko card mein pack karo, card ke background mein add karo, text ka size aur
 * color ekadam badhiya select karo, design bhi uthakar sab kuchh clearly
 * dikhe."
 *
 * So the whole block (eyebrow, headline, copy, the three trust pills and the
 * resource counter) now lives inside ONE glass card instead of floating on the
 * scene: `.dc-store-glass` (src/store-glass.css) is the transparent light-blue
 * lens — blur 46%, tint rgb(173,216,255) @ 26% — and the type steps up to the
 * `.dc-store-hero-*` scale, which is a real headline rather than a 28px label.
 *
 * The pack props mirror the CSS tokens (`tintColor` = the light blue, tint
 * 0.62 → alpha 0.62 * 0.42 = 0.26), so the surface paints the requested
 * material even before the stylesheet's `!important` layers land.
 *
 * `data-store-gutter` is the desktop-alignment hook (index.css): inside the
 * desktop shell the mobile px-4 is zeroed so the card, the section headings,
 * the search bar and the product grid all sit on the shell's own gutter.
 */
export default function Hero({ resourceCount }: HeroProps) {
  return (
    <section data-store-gutter data-store-hero className="relative overflow-hidden px-4 pb-6 pt-6 lg:pb-8 lg:pt-1">
      <GlassSurface
        data-store-hero-card
        className="dc-store-glass dc-scene-ink"
        tint={0.62}
        tintColor="173,216,255"
        blur={0}
        radius={22}
        contentClassName="p-4 sm:p-5 lg:p-6"
      >
        {/* Eyebrow — the one quiet line on the card, so the headline owns it. */}
        <span className="dc-store-hero-eyebrow inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/12 px-3 py-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky-300" />
          Learning marketplace
        </span>

        <h2 className="dc-store-hero-title mt-3.5">
          Find the right
          <br />
          {/* The pinned brand ramp stays in the JSX; glass.css lifts it to the
              300 stops on the scene and store-glass.css to the 100/200 stops
              inside the light-blue lens, where the darker stops fall under AA. */}
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            resource, faster
          </span>
        </h2>

        <p className="dc-store-hero-body mt-3 max-w-xl">
          Search focused notes, courses, PDFs, and study tools by subject, class, or format.
        </p>

        {/* The three promises, as chips on the same lens. */}
        <ul className="mt-4 flex flex-wrap gap-2">
          <li className="dc-store-hero-chip inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
            <ZapIcon className="h-3.5 w-3.5 text-amber-300" />
            Instant download
          </li>
          <li className="dc-store-hero-chip inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
            <ShieldIcon className="h-3.5 w-3.5 text-emerald-300" />
            Secure checkout
          </li>
          <li className="dc-store-hero-chip inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
            <ZapIcon className="h-3.5 w-3.5 text-amber-300" />
            Lifetime access
          </li>
        </ul>

        <div className="dc-store-hero-count mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 shadow-[0_10px_26px_-12px_rgba(2,6,16,0.9)]">
          <BookOpenIcon className="h-4 w-4" />
          {resourceCount} resource{resourceCount === 1 ? "" : "s"} available
        </div>
      </GlassSurface>
    </section>
  );
}
