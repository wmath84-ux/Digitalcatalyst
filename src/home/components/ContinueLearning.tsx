interface ContinueLearningProps {
  title: string;
  author: string;
  image: string;
  progress: number;
  onResume: () => void;
  onClick?: () => void;
}

export default function ContinueLearning({
  title,
  author,
  image,
  progress,
  onResume,
  onClick,
}: ContinueLearningProps) {
  const isComplete = progress >= 100;

  return (
    <section className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Continue Learning</h2>
        <span className="text-xs font-semibold text-indigo-600">{Math.round(progress)}% done</span>
      </div>

      <button
        type="button"
        onClick={onClick || onResume}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm shadow-slate-200 ring-1 ring-slate-100 transition active:scale-[0.98]"
      >
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
          <img src={image} alt={title} className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          <p className="truncate text-xs text-slate-400">{author}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onResume(); }}
          disabled={isComplete}
          className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-bold shadow-sm transition active:scale-95 ${
            isComplete
              ? "bg-emerald-100 text-emerald-600"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          {isComplete ? "Completed ✓" : "Resume ▶"}
        </button>
      </button>
    </section>
  );
}
