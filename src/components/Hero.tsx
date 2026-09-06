import { BookOpenIcon, ShieldIcon, ZapIcon } from "./icons";
import { GlassSurface } from "./ui/glass";

type HeroProps = {
  resourceCount: number;
};

export default function Hero({ resourceCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-4 pb-6 pt-6">
      <div className="relative">
        <GlassSurface radius={999} tint={0.25} blur={0} className="dc-scene-plate inline-block text-indigo-200" contentClassName="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
          Learning marketplace
        </GlassSurface>
        <h2 className="dc-scene-ink mt-2.5 text-[28px] font-extrabold leading-tight tracking-tight text-white">
          Find the right
          <br />
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            resource, faster
          </span>
        </h2>
        <p className="dc-scene-ink mt-2 max-w-sm text-sm leading-relaxed text-white/75">
          Search focused notes, courses, PDFs, and study tools by subject, class, or format.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 [&>div]:inline-block">
          <GlassSurface radius={999} tint={0.25} blur={0} className="dc-scene-plate text-white/85" contentClassName="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
            <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
            Instant download
          </GlassSurface>
          <GlassSurface radius={999} tint={0.25} blur={0} className="dc-scene-plate text-white/85" contentClassName="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
            <ShieldIcon className="h-3.5 w-3.5 text-emerald-500" />
            Secure checkout
          </GlassSurface>
          <GlassSurface radius={999} tint={0.25} blur={0} className="dc-scene-plate text-white/85" contentClassName="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
            <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
            Lifetime access
          </GlassSurface>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white">
          <BookOpenIcon className="h-4 w-4" />
          {resourceCount} resource{resourceCount === 1 ? "" : "s"} available
        </div>
      </div>
    </section>
  );
}
