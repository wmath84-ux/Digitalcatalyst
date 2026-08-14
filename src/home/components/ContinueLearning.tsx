/**
 * Home page "Continue Learning" section.
 *
 * Renders the courses the learner has actually started, as stacked cards.
 * The caller (src/home/App.tsx) builds the list from live Firestore course
 * progress and already caps it, so this component simply renders whatever it
 * is given — no product list is hard-coded here, which means products added
 * in the future flow through automatically.
 */

export interface ContinueLearningItem {
  /** Product id — used as the React key. */
  id: string;
  title: string;
  author: string;
  image: string;
  /** Completion percentage, 0-100. */
  progress: number;
  /** Fired by the Resume button. */
  onResume: () => void;
  /** Fired when the card body is tapped. Falls back to `onResume`. */
  onOpen?: () => void;
}

interface ContinueLearningProps {
  items: ContinueLearningItem[];
}

export default function ContinueLearning({ items }: ContinueLearningProps) {
  if (items.length === 0) return null;

  return (
    <section className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Continue Learning</h2>
        {items.length === 1 && (
          <span className="text-xs font-semibold text-indigo-600">{Math.round(items[0].progress)}% done</span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <ContinueLearningCard key={item.id} item={item} showProgressLabel={items.length > 1} />
        ))}
      </div>
    </section>
  );
}

function ContinueLearningCard({ item, showProgressLabel }: { item: ContinueLearningItem; showProgressLabel: boolean }) {
  const progress = Math.max(0, Math.min(100, item.progress));
  const isComplete = progress >= 100;
  const open = item.onOpen || item.onResume;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") open(); }}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm shadow-slate-200 ring-1 ring-slate-100 transition active:scale-[0.98]"
    >
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
        <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-800">{item.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-400">{item.author}</p>
          {showProgressLabel && (
            <span className="flex-shrink-0 text-[11px] font-semibold text-indigo-600">{Math.round(progress)}% done</span>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); item.onResume(); }}
        disabled={isComplete}
        className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-bold shadow-sm transition active:scale-95 ${
          isComplete
            ? "bg-emerald-100 text-emerald-600"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {isComplete ? "Completed ✓" : "Resume ▶"}
      </button>
    </div>
  );
}
