import { BookOpenIcon, ShieldIcon, ZapIcon } from "./icons";

type HeroProps = {
  resourceCount: number;
};

export default function Hero({ resourceCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-4 pb-6 pt-6">
      {/* Colour wash + soft light blobs behind the frosted content */}
      <div aria-hidden data-glass-ambient className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-100/80 via-violet-50/60 to-transparent" />
      <div aria-hidden data-glass-ambient className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-fuchsia-300/30 blur-3xl" />
      <div aria-hidden data-glass-ambient className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-sky-300/30 blur-3xl" />

      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 shadow-sm shadow-indigo-200/60 backdrop-blur-md">
          Learning marketplace
        </p>
        <h2 className="mt-2.5 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">
          Find the right
          <br />
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            resource, faster
          </span>
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Search focused notes, courses, PDFs, and study tools by subject, class, or format.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md shadow-indigo-200/40 backdrop-blur-md">
            <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
            Instant download
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md shadow-indigo-200/40 backdrop-blur-md">
            <ShieldIcon className="h-3.5 w-3.5 text-emerald-500" />
            Secure checkout
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md shadow-indigo-200/40 backdrop-blur-md">
            <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
            Lifetime access
          </span>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-gradient-to-r from-indigo-600/90 via-violet-600/90 to-fuchsia-600/90 px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/30 backdrop-blur-md">
          <BookOpenIcon className="h-4 w-4" />
          {resourceCount} resource{resourceCount === 1 ? "" : "s"} available
        </div>
      </div>
    </section>
  );
}
