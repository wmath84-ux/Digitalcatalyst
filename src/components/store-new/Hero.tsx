import { BookOpenIcon, ShieldIcon, ZapIcon } from "./icons";

type HeroProps = {
  resourceCount: number;
};

export default function Hero({ resourceCount }: HeroProps) {
  return (
    <section className="bg-gradient-to-b from-indigo-50 via-white to-white px-4 pb-6 pt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
        Learning marketplace
      </p>
      <h2 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">
        Find the right
        <br />
        resource, faster
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        Search focused notes, courses, PDFs, and study tools by subject, class, or format.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
          Instant download
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          <ShieldIcon className="h-3.5 w-3.5 text-emerald-500" />
          Secure checkout
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
          <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
          Lifetime access
        </span>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2.5 text-sm font-bold text-indigo-700">
        <BookOpenIcon className="h-4 w-4" />
        {resourceCount} resource{resourceCount === 1 ? "" : "s"} available
      </div>
    </section>
  );
}
