import { ChevronRight, LayoutGrid } from "lucide-react";

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "₹0";
  if (value === 0) return "Free";
  return `₹${value.toLocaleString("en-IN")}`;
};

interface Props {
  totalModules: number;
  selectedCount: number;
  selectedTotal: number;
  onOpen: () => void;
}

export default function ModuleSelectTrigger({ totalModules, selectedCount, selectedTotal, onOpen }: Props) {
  return (
    <div className="px-0 pt-0">
      <button
        type="button"
        onClick={onOpen}
        data-pdp-modules-trigger
        className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 transition-transform active:scale-[0.99]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50">
            <LayoutGrid className="h-5 w-5 text-violet-600" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-bold text-white/85">Select course modules</p>
            {selectedCount === 0 ? (
              <p className="truncate text-xs text-white/55">
                {totalModules === 0 ? "No modules yet · tap to view" : `${totalModules} module${totalModules === 1 ? "" : "s"} available · pick what you need`}
              </p>
            ) : (
              <p className="truncate text-xs font-medium text-violet-600">
                {selectedCount} module{selectedCount === 1 ? "" : "s"} · {formatPrice(selectedTotal)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedCount > 0 ? (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-violet-600 px-2 text-[11px] font-bold text-white">
              {selectedCount}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-white/40" />
        </div>
      </button>
    </div>
  );
}
