import {
  Check,
  Crown,
  X as XIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BillingCycle } from "../types";
import type { Course } from "../data/courses";
import type { Feature } from "../data/features";

interface Props {
  cycle: BillingCycle;
  onChangeCycle: (c: BillingCycle) => void;
  basePriceMonthly: number;
  basePriceYearly: number;
  selectedCourses: Course[];
  selectedFeatures: Feature[];
  coursesTotal: number;
  featuresTotal: number;
  finalPrice: number;
}

export default function PlanOverview({
  cycle,
  onChangeCycle,
  basePriceMonthly,
  basePriceYearly,
  selectedCourses,
  selectedFeatures,
  coursesTotal,
  featuresTotal,
  finalPrice,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const basePrice = cycle === "monthly" ? basePriceMonthly : basePriceYearly;
  const rawTotal = basePrice + coursesTotal + featuresTotal;

  return (
    <div className="px-5 pt-6">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 text-white shadow-xl shadow-slate-300/40 ring-1 ring-white/10">
        {/* glow effects */}
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />

        {/* Badge row */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-md shadow-amber-500/30">
              <Crown className="h-4.5 w-4.5 text-slate-900" />
            </div>
            <div>
              <p className="text-sm font-extrabold leading-none">
                Pro Unified Plan
              </p>
              <p className="mt-1 text-[11px] text-white/50">
                All-access · Cancel anytime
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">
            MOST POPULAR
          </span>
        </div>

        {/* Billing cycle toggle */}
        <div className="relative mt-5 flex rounded-2xl bg-white/10 p-1 backdrop-blur-sm">
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              onClick={() => onChangeCycle(c)}
              className={`relative flex-1 rounded-xl py-2.5 text-center text-xs font-bold transition-colors ${
                cycle === c ? "text-slate-900" : "text-white/70"
              }`}
            >
              {cycle === c && (
                <span className="absolute inset-0 rounded-xl bg-white shadow-sm" />
              )}
              <span className="relative capitalize">
                {c}
                {c === "yearly" && (
                  <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                    SAVE 50%
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Live price */}
        <div className="relative mt-5 flex items-end gap-2">
          <span className="text-4xl font-extrabold tracking-tight">
            ${finalPrice.toFixed(2)}
          </span>
          <span className="mb-1 text-sm font-medium text-white/50">
            / {cycle === "monthly" ? "month" : "year"}
          </span>
          {finalPrice < rawTotal && (
            <span className="mb-1.5 text-xs font-semibold text-white/40 line-through">
              ${rawTotal.toFixed(2)}
            </span>
          )}
        </div>
        <p className="relative mt-1 text-[11px] text-white/50">
          Base ${basePrice.toFixed(2)} + {selectedCourses.length} course
          {selectedCourses.length !== 1 ? "s" : ""} $
          {coursesTotal.toFixed(2)} + {selectedFeatures.length} feature
          {selectedFeatures.length !== 1 ? "s" : ""} $
          {featuresTotal.toFixed(2)}
        </p>

        {/* Selection details accordion */}
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="relative mt-4 flex w-full items-center justify-between rounded-xl bg-white/8 px-3 py-2.5 text-left active:bg-white/12 transition-colors"
        >
          <span className="text-xs font-bold text-white/70">
            Your Selection Details
          </span>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500/30 px-1.5 text-[10px] font-bold text-violet-200">
              {selectedCourses.length + selectedFeatures.length}
            </span>
            {detailsOpen ? (
              <ChevronUp className="h-4 w-4 text-white/50" />
            ) : (
              <ChevronDown className="h-4 w-4 text-white/50" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="relative overflow-hidden"
            >
              <div className="pt-3">
                {/* Selected courses */}
                {selectedCourses.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Courses ({selectedCourses.length})
                    </p>
                    <ul className="space-y-1.5">
                      {selectedCourses.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2"
                        >
                          <img
                            src={c.image}
                            alt={c.name}
                            className="h-7 w-7 rounded-md object-cover ring-1 ring-white/10"
                          />
                          <span className="flex-1 truncate text-xs font-medium text-white/80">
                            {c.name}
                          </span>
                          <span className="text-xs font-bold text-emerald-300">
                            ${c.price.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Selected features */}
                {selectedFeatures.length > 0 && (
                  <div className="mb-1">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Features ({selectedFeatures.length})
                    </p>
                    <ul className="space-y-1.5">
                      {selectedFeatures.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                            <Check
                              className="h-3.5 w-3.5 text-amber-300"
                              strokeWidth={3}
                            />
                          </span>
                          <span className="flex-1 truncate text-xs font-medium text-white/80">
                            {f.name}
                          </span>
                          <span className="text-xs font-bold text-emerald-300">
                            ${f.price.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedCourses.length === 0 &&
                  selectedFeatures.length === 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-3 text-xs text-white/50">
                      <XIcon className="h-3.5 w-3.5" />
                      No courses or features selected yet.
                    </div>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Static base features */}
        <ul className="relative mt-4 space-y-2 border-t border-white/10 pt-4">
          {[
            "Access to selected courses library",
            "Mobile & desktop streaming",
            "Course progress syncing",
            "Basic community access",
          ].map((label) => (
            <li
              key={label}
              className="flex items-center gap-2.5 text-[13px] text-white/85"
            >
              <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Check
                  className="h-3 w-3 text-emerald-400"
                  strokeWidth={3}
                />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
