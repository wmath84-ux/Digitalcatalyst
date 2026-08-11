import { ChevronRight, Sparkles } from "lucide-react";
import type { Feature } from "../data/features";

interface Props {
  features: Feature[];
  selectedIds: string[];
  onOpen: () => void;
}

export default function FeatureSelectTrigger({
  features,
  selectedIds,
  onOpen,
}: Props) {
  const selectedFeatures = features.filter((f) => selectedIds.includes(f.id));
  const total = selectedFeatures.reduce((s, f) => s + f.price, 0);

  return (
    <div className="px-5 pt-3">
      <button
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Select Features</p>
            {selectedFeatures.length === 0 ? (
              <p className="text-xs text-slate-400">
                Add premium features to your plan
              </p>
            ) : (
              <p className="text-xs font-medium text-amber-600">
                {selectedFeatures.length} feature
                {selectedFeatures.length !== 1 ? "s" : ""} · +$
                {total.toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedFeatures.length > 0 && (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-2 text-[11px] font-bold text-white">
              {selectedFeatures.length}
            </span>
          )}
          <ChevronRight className="h-4.5 w-4.5 text-slate-300" />
        </div>
      </button>
    </div>
  );
}
