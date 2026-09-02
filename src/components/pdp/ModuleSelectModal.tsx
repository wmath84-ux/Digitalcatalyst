import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Search, Sparkles, X } from "lucide-react";
import type { CanonicalCourseModule } from "../../types/commerce";
import { getModuleEffectivePrice } from "../../../utils/pdpSelection";
import { lockBodyScroll, unlockBodyScroll } from "../ui/overlayBounds";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassInput } from "../ui/glass-input";
import { GlassCard } from "../ui/GlassCard";
import { GlassCheckbox } from "../ui/glass-checkbox";

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "Included";
  if (value === 0) return "Free";
  return `₹${value.toLocaleString("en-IN")}`;
};

interface Props {
  open: boolean;
  modules: CanonicalCourseModule[];
  selectedIds: string[];
  ownedIds: Set<string>;
  fallbackPrice: number;
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
}

export default function ModuleSelectModal({
  open,
  modules,
  selectedIds,
  ownedIds,
  fallbackPrice,
  onClose,
  onChangeSelected,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter((module) =>
      module.title.toLowerCase().includes(q)
      || String(module.description || "").toLowerCase().includes(q),
    );
  }, [modules, query]);

  const selectable = filtered.filter((module) => !ownedIds.has(module.id));
  const allFilteredSelected = selectable.length > 0 && selectable.every((module) => selectedIds.includes(module.id));

  const toggleModule = (id: string) => {
    if (ownedIds.has(id)) return;
    if (selectedIds.includes(id)) onChangeSelected(selectedIds.filter((value) => value !== id));
    else onChangeSelected([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(selectable.map((module) => module.id));
      onChangeSelected(selectedIds.filter((id) => !filteredIds.has(id)));
      return;
    }
    onChangeSelected(Array.from(new Set([...selectedIds, ...selectable.map((module) => module.id)])));
  };

  const selectedTotal = modules
    .filter((module) => selectedIds.includes(module.id))
    .reduce((sum, module) => sum + (getModuleEffectivePrice(module, fallbackPrice) || 0), 0);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  if (!open) return null;

  // Portal to document.body so a parent overflow-hidden / backdrop-filter
  // frame cannot clip the picker, and tablet `* { max-width: 100% }` cannot
  // stretch the card to the full viewport. CSS then caps height and width
  // so the sheet stays fully visible on phone, every tablet size, and desktop.
  const overlay = (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-indigo-950/30 p-3 backdrop-blur-md sm:items-center sm:p-6"
      data-pdp-module-select-overlay
      onClick={onClose}
    >
      <GlassSurface
        onClick={(event) => event.stopPropagation()}
        data-pdp-module-select-modal
        radius={0}
        style={{ borderRadius: "var(--glass-sheet-radius)" }}
        className="flex min-h-0 w-full max-w-md flex-col overflow-hidden text-white"
        contentClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-white/30" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white">Select modules</h2>
            <p className="text-xs text-white/55">
              {selectedIds.length} of {modules.length} selected · {formatPrice(selectedTotal)}
            </p>
          </div>
          <GlassButton type="button" onClick={onClose} className="[&_.size-12]:size-9" aria-label="Close">
            <X className="h-4 w-4" />
          </GlassButton>
        </div>

        {modules.length > 0 ? <div className="px-5 pb-3">
          <div className="flex items-center gap-2">
            <GlassInput
              type="search"
              className="w-full"
              icon={<Search className="h-4 w-4" aria-hidden="true" />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules..."
            />
            {query ? (
              <GlassButton type="button" onClick={() => setQuery("")} className="shrink-0 [&_.size-12]:size-9" aria-label="Clear search">
                <X className="h-4 w-4" />
              </GlassButton>
            ) : null}
          </div>
        </div> : null}

        {/* Wave 10: the "Select all" row is a pack GlassCard carrying the checkbox
            role, with the pack GlassCheckbox as its indicator. */}
        {modules.length > 0 ? <GlassCard
          role="checkbox"
          aria-checked={allFilteredSelected}
          tabIndex={0}
          onClick={toggleSelectAll}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleSelectAll();
            }
          }}
          className="mx-5 mb-2 cursor-pointer"
          contentClassName="flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <GlassCheckbox checked={allFilteredSelected} tabIndex={-1} aria-hidden="true" onCheckedChange={toggleSelectAll} onClick={(event) => event.stopPropagation()} className="shrink-0" />
            <span className="text-sm font-bold text-white/85">Select all {query ? "(filtered)" : ""}</span>
          </div>
          <span className="text-xs font-medium text-violet-300">{filtered.length} modules</span>
        </GlassCard> : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {modules.length === 0 ? (
            <div data-pdp-no-modules className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 px-6 py-16 text-center">
              <PackageOpenIcon />
              <p className="mt-3 text-base font-black text-white">No modules</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">This course has no modules yet. Check back when the instructor publishes them.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Sparkles className="mb-2 h-8 w-8 text-white/40" />
              <p className="text-sm font-medium text-white/55">No modules match “{query}”</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((module) => {
                const checked = selectedIds.includes(module.id);
                const owned = ownedIds.has(module.id);
                const price = getModuleEffectivePrice(module, fallbackPrice);
                return (
        <li key={module.id}>
            <GlassCard
              role="checkbox"
              aria-checked={owned ? true : checked}
              aria-label={`${module.title} — ${owned ? "already owned" : `${formatPrice(price)}`}`}
              aria-disabled={owned || undefined}
              tabIndex={owned ? -1 : 0}
              onClick={() => { if (!owned) toggleModule(module.id); }}
              onKeyDown={(event) => {
                if (owned) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleModule(module.id);
                }
              }}
                      data-pdp-module-pick={module.id}
                      className={`w-full text-left ${
                        owned ? "opacity-80" : checked ? "cursor-pointer ring-2 ring-violet-400/50" : "cursor-pointer"
                      }`}
                      contentClassName="flex items-center gap-3 p-3"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                        <LayoutIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white/85">{module.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">
                          {module.description || `${module.resources?.length || 0} resource${(module.resources?.length || 0) === 1 ? "" : "s"} included.`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-sm font-extrabold ${owned ? "text-emerald-200" : "text-white/85"}`}>{owned ? "Purchased" : `+${formatPrice(price)}`}</span>
                        {owned ? (
                          <span aria-label="Purchased" className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-emerald-500/80 text-white">
                            <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <GlassCheckbox checked={checked} tabIndex={-1} aria-hidden="true" onCheckedChange={() => toggleModule(module.id)} onClick={(event) => event.stopPropagation()} className="shrink-0" />
                        )}
                      </div>
                    </GlassCard>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-500"
          >
            Done · {selectedIds.length} modules · {formatPrice(selectedTotal)}
          </button>
        </div>
      </GlassSurface>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return overlay;
  return createPortal(overlay, document.body);
}

function PackageOpenIcon() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-violet-300">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M3 9.5v6L12 21l9-5.5v-6" />
        <path d="M12 21v-6.5" />
        <path d="M7.5 12.2 12 14.8l4.5-2.6" />
      </svg>
    </span>
  );
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
