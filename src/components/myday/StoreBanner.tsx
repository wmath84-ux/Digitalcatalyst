import { ArrowRight, BookOpen } from "lucide-react";

interface StoreBannerProps {
  onExplore: () => void;
}

/** Lower promotional banner — drives the existing Store route. */
export default function StoreBanner({ onExplore }: StoreBannerProps) {
  return (
    <section aria-label="Explore the store" className="myday-banner">
      <span className="myday-banner-book">
        <BookOpen className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold tracking-tight text-white sm:whitespace-normal sm:text-[0.95rem]">
          A better version of you is waiting. Keep learning! 🚀
        </span>
        <span className="mt-0.5 hidden text-xs font-medium text-indigo-100/75 sm:block">
          Stay consistent, keep learning!
        </span>
      </span>
      <button
        type="button"
        onClick={onExplore}
        className="myday-cta myday-cta--sm relative shrink-0"
      >
        Explore Store
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
