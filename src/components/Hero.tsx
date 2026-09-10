import { ShieldIcon, ZapIcon } from "./icons";
import { GlassSurface } from "./ui/glass";

type HeroProps = {
  resourceCount: number;
};

export default function Hero({ resourceCount: _resourceCount }: HeroProps) {
  return (
    <section data-store-gutter className="relative overflow-hidden px-4 pb-6 pt-6 lg:pb-8 lg:pt-1">
      <div className="relative overflow-hidden rounded-[30px] border border-[#304d93]/70 bg-[#071435] shadow-[0_25px_70px_-35px_rgba(62,86,255,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(161,85,255,0.3),transparent_28%),radial-gradient(circle_at_75%_18%,rgba(248,113,113,0.12),transparent_14%),linear-gradient(180deg,rgba(15,24,68,0.92),rgba(5,13,34,0.96))]" />
        <div className="relative grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,44%)] lg:items-center lg:px-8 lg:py-8">
          <div className="relative z-10 max-w-xl">
            <GlassSurface radius={999} tint={0.25} blur={0} className="dc-scene-plate inline-block text-indigo-200" contentClassName="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              Learning marketplace
            </GlassSurface>
            <h2 className="dc-scene-ink mt-2.5 text-[28px] font-extrabold leading-tight tracking-tight text-white lg:text-[34px] xl:text-[38px]">
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

          </div>

          <div className="relative min-h-[15rem] lg:min-h-[18rem]">
            <div className="absolute inset-y-[-6%] right-[-7%] w-[92%] lg:inset-y-[-14%] lg:right-[-10%]">
              <img
                src="/store-hero-desktop-ref.png"
                alt="Store hero collage"
                className="h-full w-full object-cover object-center opacity-95"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,20,53,0.94)_0%,rgba(7,20,53,0.62)_20%,rgba(7,20,53,0.15)_46%,rgba(7,20,53,0)_65%)] lg:bg-[linear-gradient(90deg,rgba(7,20,53,0.88)_0%,rgba(7,20,53,0.2)_32%,rgba(7,20,53,0)_54%)]" />
            <p className="absolute right-0 top-1 text-right text-[clamp(1.2rem,2vw,1.9rem)] font-medium leading-[1.35] tracking-[-0.03em] text-white/90">
              “Better resources.
              <br />
              Brighter you.”
            </p>
            <div className="absolute bottom-1 right-0 flex items-center gap-2 lg:bottom-2">
              <span className="h-2.5 w-8 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
