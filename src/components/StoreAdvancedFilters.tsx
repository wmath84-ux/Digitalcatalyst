// src/components/StoreAdvancedFilters.tsx
//
// Advanced filter dropdown for Store page — replaces the old filter overlay that duplicated
// the sliding toggle chips. Now shows real advanced options: price, rating, category, availability, etc.
// Flexible responsive design for mobile/tablet/desktop.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { LiquidMetalButton } from "./ui/LiquidMetalButton";

export type AdvancedFilters = {
  priceRange: string;
  rating: string;
  category: string;
  availability: string;
};

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  priceRange: "all",
  rating: "all",
  category: "all",
  availability: "all",
};

const PRICE_OPTIONS = [
  { id: "all", label: "All Prices" },
  { id: "free", label: "Free" },
  { id: "under500", label: "Under ₹500" },
  { id: "under1000", label: "Under ₹1000" },
  { id: "under2000", label: "Under ₹2000" },
  { id: "premium", label: "Premium ₹2000+" },
];

const RATING_OPTIONS = [
  { id: "all", label: "All Ratings" },
  { id: "4.5", label: "4.5★ & up" },
  { id: "4", label: "4★ & up" },
  { id: "3.5", label: "3.5★ & up" },
  { id: "3", label: "3★ & up" },
];

const CATEGORY_OPTIONS = [
  { id: "all", label: "All Types" },
  { id: "Course", label: "Course" },
  { id: "Notes", label: "Notes" },
  { id: "PDF", label: "PDF" },
  { id: "E-book", label: "E-book" },
  { id: "Live", label: "Live" },
];

const AVAILABILITY_OPTIONS = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
  { id: "purchased", label: "Purchased" },
  { id: "not-purchased", label: "Not Purchased" },
];

interface Props {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  resultCount?: number;
}

export default function StoreAdvancedFilters({ filters, onChange, resultCount }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const hasActive = filters.priceRange !== "all" || filters.rating !== "all" || filters.category !== "all" || filters.availability !== "all";

  const update = (key: keyof AdvancedFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const clear = () => {
    onChange(DEFAULT_ADVANCED_FILTERS);
  };

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col sm:max-h-[85vh] sm:max-w-lg md:max-w-xl lg:max-w-2xl"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            role="dialog"
            aria-modal="true"
            aria-label="Advanced filters"
          >
            <GlassSurface radius={24} className="dc-scene-plate flex flex-col overflow-hidden text-white" contentClassName="flex flex-col overflow-hidden p-0">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5 md:px-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30 md:h-11 md:w-11">
                    <SlidersHorizontal className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-base font-black text-white md:text-lg">Advanced Filters</p>
                    <p className="text-[11px] text-white/60 md:text-xs">
                      {resultCount !== undefined ? `${resultCount} results` : "Refine your catalog"} {hasActive ? "· filters active" : ""}
                    </p>
                  </div>
                </div>
                <GlassButton type="button" aria-label="Close" onClick={() => setOpen(false)} className="[&_.size-12]:size-8">
                  <X className="h-4 w-4" />
                </GlassButton>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 md:p-6">
                <div className="space-y-6 md:space-y-7">
                  {/* Price */}
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-violet-300 md:text-xs">Price Range</h3>
                    <GlassToggleGroup value={filters.priceRange} onValueChange={(v) => update("priceRange", v)} className="dc-segment dc-scene-plate flex flex-wrap">
                      {PRICE_OPTIONS.map((opt) => (
                        <GlassToggleItem key={opt.id} value={opt.id} className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold md:text-sm">
                          {filters.priceRange === opt.id && <Check className="h-3.5 w-3.5" />}
                          {opt.label}
                        </GlassToggleItem>
                      ))}
                    </GlassToggleGroup>
                  </section>

                  {/* Rating */}
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-amber-300 md:text-xs">Minimum Rating</h3>
                    <GlassToggleGroup value={filters.rating} onValueChange={(v) => update("rating", v)} className="dc-segment dc-scene-plate flex flex-wrap">
                      {RATING_OPTIONS.map((opt) => (
                        <GlassToggleItem key={opt.id} value={opt.id} className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold md:text-sm">
                          {filters.rating === opt.id && <Check className="h-3.5 w-3.5" />}
                          {opt.label}
                        </GlassToggleItem>
                      ))}
                    </GlassToggleGroup>
                  </section>

                  {/* Category */}
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-emerald-300 md:text-xs">Content Type</h3>
                    <GlassToggleGroup value={filters.category} onValueChange={(v) => update("category", v)} className="dc-segment dc-scene-plate flex flex-wrap">
                      {CATEGORY_OPTIONS.map((opt) => (
                        <GlassToggleItem key={opt.id} value={opt.id} className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold md:text-sm">
                          {filters.category === opt.id && <Check className="h-3.5 w-3.5" />}
                          {opt.label}
                        </GlassToggleItem>
                      ))}
                    </GlassToggleGroup>
                  </section>

                  {/* Availability */}
                  <section>
                    <h3 className="mb-2.5 text-[11px] font-black uppercase tracking-widest text-sky-300 md:text-xs">Availability</h3>
                    <GlassToggleGroup value={filters.availability} onValueChange={(v) => update("availability", v)} className="dc-segment dc-scene-plate flex flex-wrap">
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <GlassToggleItem key={opt.id} value={opt.id} className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold md:text-sm">
                          {filters.availability === opt.id && <Check className="h-3.5 w-3.5" />}
                          {opt.label}
                        </GlassToggleItem>
                      ))}
                    </GlassToggleGroup>
                  </section>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-white/60 md:p-4 md:text-xs md:leading-6">
                    <p className="font-bold text-white/80">How advanced filters work</p>
                    <p className="mt-1">These filters combine with the sliding category chips above and your search query. For example, pick Course + Under ₹1000 + 4★ & up to find affordable highly-rated courses.</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 p-4 sm:p-5 md:p-6">
                <div className="flex gap-2.5 md:gap-3">
                  <LiquidMetalButton tone="silver" className="flex-1" onClick={clear}>
                    <span className="text-xs font-bold md:text-sm">Clear all</span>
                  </LiquidMetalButton>
                  <LiquidMetalButton tone="primary" className="flex-1" onClick={() => setOpen(false)}>
                    <span className="text-xs font-bold md:text-sm">Apply · {resultCount ?? 0} results</span>
                  </LiquidMetalButton>
                </div>
              </div>
            </GlassSurface>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <GlassButton
        ref={buttonRef as any}
        variant="capsule"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`shrink-0 [&>span>div]:h-9 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-xs [&>span>div]:font-bold md:[&>span>div]:h-10 ${hasActive ? "text-violet-200 ring-1 ring-violet-400/30" : ""}`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filters</span>
        {hasActive && <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-violet-500 px-1 text-[10px] font-black text-white">•</span>}
      </GlassButton>
      {typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}
