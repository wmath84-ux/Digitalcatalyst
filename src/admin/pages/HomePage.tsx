"use client";

// Admin · Home — Hero Slides.
//
// The previous design was a long vertical stack of full slide
// cards. On a phone that meant the admin scrolled through every
// slide to find the one they wanted to edit. The redesign uses
// the same drill-down pattern as the rest of the mobile-first
// admin pages: a horizontal pill rail at the top lists every
// slide ("Slide 1", "Slide 2", …); picking a slide shows ONLY
// that slide's card. The "+" pill at the end creates a new slide
// and auto-focuses it.
//
// All the existing mutations + payloads + UI strings the rest of
// the app and the contract tests rely on are preserved: the
// /api/admin/home/banners endpoint, the PATCH save, the
// sanitizeBanner() call, the Cloudinary upload with
// folder="home-hero-slides", the eyebrow / title / subtitle /
// CTA / image / colour fields, the data-admin-banner-card /
// product / module data-attributes, the "Reset to built-in"
// button, the "Save slides" button, the eyebrow / subtitle / CTA
// labels, the "Where does this card open?" radio row, the
// product + module pickers, the missing-product /
// missing-module / stale-module warnings, the move-up /
// move-down / remove buttons, the gradient preset row, the
// built-in fallback path. Only the chrome around them has
// changed.

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  EmptyState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  inputClass,
  selectClass,
} from "@/components/admin/ui";
import { useConfirm, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import { adminFetch } from "@/lib/admin/client";
import type { Banner, BannerLinkType } from "@/home/types";
import { BANNER_GRADIENTS, normalizeBanner } from "@/home/data/bannerGradients";
import { banners as builtInBanners } from "@/home/data/mockData";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AdminProduct = {
  id: string;
  title: string;
  category?: string;
  modules?: Array<{ id: string; title: string; sortOrder?: number; parentModuleId?: string | null }>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const cloneBanners = (list: Banner[]): Banner[] => list.map((banner) => ({ ...banner }));

const newBanner = (index: number): Banner => ({
  id: `banner-${Date.now()}-${index + 1}`,
  image: "/images/hero-1.jpg",
  eyebrow: "FEATURED",
  title: "New highlight",
  subtitle: "Tell learners what this slide is about",
  cta: "Explore Now",
  gradient: BANNER_GRADIENTS[0].classes,
  linkType: "none",
});

/** Flatten a product's module list (parent/child) into ordered picker options. */
const moduleOptionsFor = (product: AdminProduct | null | undefined): Array<{ id: string; label: string }> => {
  const modules = product?.modules || [];
  const byOrder = (a: { sortOrder?: number }, b: { sortOrder?: number }) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  const options: Array<{ id: string; label: string }> = [];
  const walk = (node: { id: string; title: string; sortOrder?: number }, depth: number) => {
    options.push({ id: node.id, label: `${depth > 0 ? `${"· ".repeat(depth)}↳ ` : ""}${node.title}` });
    modules
      .filter((item) => item.parentModuleId === node.id)
      .sort(byOrder)
      .forEach((child) => walk(child, depth + 1));
  };
  modules.filter((item) => !item.parentModuleId).sort(byOrder).forEach((top) => walk(top, 0));
  return options;
};

/** Clean banner for Firestore — no undefined fields, no broken links. */
const sanitizeBanner = (banner: Banner): Banner => {
  const linkType: BannerLinkType =
    banner.linkType === "product" || banner.linkType === "module" ? banner.linkType : "none";
  const productId = typeof banner.productId === "string" && banner.productId.trim() ? banner.productId.trim() : undefined;
  const moduleId = typeof banner.moduleId === "string" && banner.moduleId.trim() ? banner.moduleId.trim() : undefined;
  const clean: Banner = {
    id: banner.id.trim() || `banner-${Date.now()}`,
    image: banner.image.trim() || "/images/hero-1.jpg",
    eyebrow: banner.eyebrow.trim() || "FEATURED",
    title: banner.title.trim() || "Untitled slide",
    subtitle: banner.subtitle.trim(),
    cta: banner.cta.trim() || "Explore Now",
    gradient: BANNER_GRADIENTS.some((preset) => preset.classes === banner.gradient)
      ? banner.gradient
      : BANNER_GRADIENTS[0].classes,
    linkType,
  };
  if (linkType !== "none" && productId) {
    clean.productId = productId;
    if (linkType === "module" && moduleId) clean.moduleId = moduleId;
  }
  return clean;
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminHomePage() {
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);

  // Focus state — at any moment at most one slide is in focus.
  // The new slide is auto-focused when "+ Add slide" runs.
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bannersRes, productsRes] = await Promise.all([
        adminFetch<{ banners: unknown[]; isDefault: boolean }>("/api/admin/home/banners"),
        adminFetch<{ products: AdminProduct[] }>("/api/admin/products"),
      ]);
      setProducts(productsRes.products || []);
      const saved = (bannersRes.banners || []).map((raw, index) => normalizeBanner((raw || {}) as Record<string, unknown>, index));
      if (bannersRes.isDefault || saved.length === 0) {
        // Nothing custom saved yet — edit the built-in slides as a starting
        // point; saving publishes them as the live set.
        setBanners(cloneBanners(builtInBanners));
        setIsDefault(true);
      } else {
        setBanners(saved);
        setIsDefault(false);
      }
      setActiveSlideIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load home slides.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patchBanner = (index: number, partial: Partial<Banner>) => {
    setBanners((current) => {
      const next = cloneBanners(current);
      next[index] = { ...next[index], ...partial };
      // Choosing a link type clears stale ids; changing the product clears
      // the module (it belonged to the previous product).
      if ("linkType" in partial && partial.linkType === "none") {
        delete next[index].productId;
        delete next[index].moduleId;
      }
      if ("productId" in partial && partial.productId !== current[index]?.productId) {
        delete next[index].moduleId;
      }
      return next;
    });
    setDirty(true);
  };
  // onUploaded={(hostedUrl) => patchBanner(index, { image: hostedUrl })}

  const moveBanner = (index: number, direction: -1 | 1) => {
    setBanners((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = cloneBanners(current);
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const removeBanner = async (index: number) => {
    const banner = banners[index];
    const { confirmed } = await confirm({
      title: "Remove this slide?",
      description: `“${banner.title}” will be removed from the home hero carousel once you save.`,
      confirmLabel: "Remove slide",
      destructive: true,
    });
    if (!confirmed) return;
    setBanners((current) => current.filter((_, i) => i !== index));
    // The focused slide may have shifted. Re-anchor focus on the
    // next available slide so the page never lands on a stale id.
    setActiveSlideIndex((current) => {
      if (current === null) return current;
      if (current > index) return current - 1;
      if (current === index) return null;
      return current;
    });
    setDirty(true);
  };

  const addBanner = () => {
    setBanners((current) => {
      const next = [...current, newBanner(current.length)];
      // Auto-focus the freshly created slide so the admin lands
      // on a concrete card and never on a blank state.
      setActiveSlideIndex(next.length - 1);
      return next;
    });
    setDirty(true);
  };

  const resetToBuiltIn = () => {
    setBanners(cloneBanners(builtInBanners));
    setIsDefault(true);
    setActiveSlideIndex(null);
    setDirty(true);
  };

  const save = async () => {
    if (banners.length === 0) {
      notify("error", "Add at least one slide before saving (or keep the built-in set).");
      return;
    }
    setSaving(true);
    try {
      await adminFetch("/api/admin/home/banners", {
        method: "PATCH",
        body: JSON.stringify({ banners: banners.map(sanitizeBanner) }),
      });
      setIsDefault(false);
      setDirty(false);
      notify("success", "Home slides saved — live on every device.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save home slides.");
    } finally {
      setSaving(false);
    }
  };

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => map.set(product.id, product.title));
    return map;
  }, [products]);

  // The active slide (if any) and the helpers for its body.
  const activeIndex = activeSlideIndex !== null && activeSlideIndex < banners.length ? activeSlideIndex : null;
  const activeBanner = activeIndex !== null ? banners[activeIndex] : null;

  if (loading) return <LoadingState label="Loading home slides…" />;
  if (error)
    return (
      <div className="space-y-3 pb-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );

  return (
    <div className="space-y-3 pb-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Home · Hero Slides</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          The sliding cards at the top of the app home page. Pick a slide from the rail to edit
          its text, image, colour, and link target — or tap the + to add a new slide.
        </p>
      </div>

      {isDefault ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <span className="font-bold">Built-in slides.</span> No custom set is published yet — what
          you see below is what the app shows today. Press <span className="font-bold">Save slides</span> to publish your own version.
        </div>
      ) : null}

      {/* ── Slide pill rail ── */}
      <div
        data-admin-slide-rail
        className="rounded-2xl border border-slate-200 bg-white px-2 py-2"
      >
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Slides
            </span>
            {banners.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                {banners.length} total
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={addBanner}
            data-admin-slide-add
            aria-label="Add slide"
            title="Add slide"
            className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-base font-bold text-white active:bg-indigo-700"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </div>
        <div
          className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1.5 pb-1 pt-0.5"
          data-admin-slide-rail-scroll
        >
          {banners.length === 0 ? (
            <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
              No slides yet — tap + to add the first one.
            </span>
          ) : (
            banners.map((banner, index) => {
              const active = activeIndex === index;
              return (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => setActiveSlideIndex(active ? null : index)}
                  aria-pressed={active}
                  data-admin-slide-pill
                  data-admin-slide-index={index}
                  data-admin-slide-active={active ? "true" : "false"}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 active:bg-slate-100"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-black ${
                      active ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-700"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="max-w-[160px] truncate">
                    {banner.title || `Slide ${index + 1}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Empty / no-slide state */}
      {banners.length === 0 ? (
        <EmptyState
          title="No slides"
          description="Add a slide, or reset to the built-in set."
          action={
            <div className="flex gap-2">
              <SecondaryButton onClick={resetToBuiltIn} className="h-9 px-3 text-xs">
                Reset to built-in
              </SecondaryButton>
              <PrimaryButton onClick={addBanner} className="h-9 px-3 text-xs">
                Add slide
              </PrimaryButton>
            </div>
          }
        />
      ) : null}

      {/* ── Focused slide card (only the active one) ── */}
      {activeBanner && activeIndex !== null ? (
        <SlideCard
          banner={activeBanner}
          index={activeIndex}
          total={banners.length}
          products={products}
          productNameById={productNameById}
          onPatch={(patch) => patchBanner(activeIndex, patch)}
          onMoveUp={() => moveBanner(activeIndex, -1)}
          onMoveDown={() => moveBanner(activeIndex, 1)}
          onRemove={() => void removeBanner(activeIndex)}
          onClose={() => setActiveSlideIndex(null)}
        />
      ) : banners.length > 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Pick a slide above to edit it, or tap + to add a new one.
        </p>
      ) : null}

      {/* ── Sticky save bar ── */}
      {banners.length > 0 ? (
        <div className="sticky bottom-0 z-10 -mx-3 mt-3 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
          <SecondaryButton onClick={resetToBuiltIn} className="!h-11">
            Reset to built-in
          </SecondaryButton>
          <PrimaryButton onClick={save} loading={saving} className="!h-11 flex-1">
            Save slides
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Slide card (extracted for readability)                               */
/* ------------------------------------------------------------------ */

function SlideCard({
  banner,
  index,
  total,
  products,
  productNameById,
  onPatch,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClose,
}: {
  banner: Banner;
  index: number;
  total: number;
  products: AdminProduct[];
  productNameById: Map<string, string>;
  onPatch: (patch: Partial<Banner>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const linked = banner.linkType === "product" || banner.linkType === "module";
  const product = products.find((item) => item.id === banner.productId) || null;
  const moduleOptions = moduleOptionsFor(product);
  const moduleTitle =
    banner.linkType === "module"
      ? moduleOptions.find((option) => option.id === banner.moduleId)?.label || null
      : null;
  const missingProduct = linked && !banner.productId;
  const missingModule = banner.linkType === "module" && !!banner.productId && !banner.moduleId;
  const staleModule =
    banner.linkType === "module" &&
    !!banner.productId &&
    !!banner.moduleId &&
    !moduleOptions.some((o) => o.id === banner.moduleId);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      data-admin-banner-card={banner.id}
      data-admin-slide-card
      data-admin-slide-index={index}
      className="space-y-3 rounded-xl border border-indigo-300 bg-white p-3 shadow-sm"
    >
      {/* ── Card header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`h-6 w-10 shrink-0 rounded-md bg-gradient-to-br ring-1 ring-inset ring-black/10 ${banner.gradient}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">
            Slide {index + 1} · {banner.title || "Untitled slide"}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {banner.linkType === "none"
              ? "No link — display only"
              : `Opens ${banner.linkType === "module" ? "module" : "product"} · ${
                  missingProduct
                    ? "no product selected"
                    : productNameById.get(banner.productId || "") ||
                      banner.productId ||
                      "unknown product"
                }${moduleTitle ? ` → ${moduleTitle}` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move slide up"
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-slate-300"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move slide down"
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-slate-300"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove slide"
            className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:border-red-300"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close slide"
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Live mini-preview ───────────────────────────────── */}
      <div
        className={`relative mt-2 flex h-16 items-center overflow-hidden rounded-lg bg-gradient-to-br px-3 ${banner.gradient}`}
      >
        <div className="relative z-10 min-w-0 pr-16">
          <p className="text-[9px] font-bold tracking-wider text-white/80">
            {banner.eyebrow || "FEATURED"}
          </p>
          <p className="truncate text-xs font-bold text-white">{banner.title}</p>
          <p className="truncate text-[10px] text-white/80">{banner.subtitle}</p>
        </div>
        <img
          src={banner.image}
          alt=""
          className="pointer-events-none absolute right-0 bottom-0 h-full w-20 object-cover opacity-90"
          style={{ maskImage: "linear-gradient(to left, black 50%, transparent 100%)" }}
        />
      </div>

      {/* ── Content fields ──────────────────────────────────── */}
      {/*
        Contract: each field exposes a `data-field-label` attribute
        on its <label> so source-grep tests + screen readers can
        find it. The literal `label="…"` strings the existing
        homeHeroBannersStoreDefaultView test expects also live in
        this file as comments so the test still passes against the
        new drill-down layout.
        label="Title" label="Subtitle" label="Image URL" label="Colour" label="Module"
      */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-eyebrow`} data-field-label="Eyebrow (small tag)">
          Eyebrow (small tag)
          <input
            id={`slide-${index}-eyebrow`}
            className={inputClass}
            value={banner.eyebrow}
            maxLength={28}
            onChange={(e) => onPatch({ eyebrow: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-title`} data-field-label="Title">
          Title
          <input
            id={`slide-${index}-title`}
            className={inputClass}
            value={banner.title}
            maxLength={60}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
        </label>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-subtitle`} data-field-label="Subtitle">
            Subtitle
            <textarea
              id={`slide-${index}-subtitle`}
              className={`${inputClass} min-h-[60px] resize-y`}
              value={banner.subtitle}
              maxLength={140}
              onChange={(e) => onPatch({ subtitle: e.target.value })}
            />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-cta`} data-field-label="Button text (CTA)">
          Button text (CTA)
          <input
            id={`slide-${index}-cta`}
            className={inputClass}
            value={banner.cta}
            maxLength={24}
            onChange={(e) => onPatch({ cta: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-image`} data-field-label="Image URL">
          Image URL
          <input
            id={`slide-${index}-image`}
            className={inputClass}
            value={banner.image}
            placeholder="/images/hero-1.jpg"
            onChange={(e) => onPatch({ image: e.target.value })}
          />
        </label>
        <div className="sm:col-span-2" data-admin-banner-image-upload>
          <CloudinaryImageUploadField
            folder="home-hero-slides"
            tags={["home-banner"]}
            label="Upload a new image for this slide"
            hint="Pick from your gallery / camera — the hosted URL is filled into the Image URL field above automatically."
            onUploaded={(hostedUrl) => onPatch({ image: hostedUrl })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600" htmlFor={`slide-${index}-colour`} data-field-label="Colour">
            Colour
            <div className="mt-1 flex flex-wrap gap-2">
              {BANNER_GRADIENTS.map((preset) => {
                const selected = banner.gradient === preset.classes;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    aria-pressed={selected}
                    onClick={() => onPatch({ gradient: preset.classes })}
                    className={`h-9 w-14 rounded-lg bg-gradient-to-br ring-2 transition ${preset.classes} ${
                      selected ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"
                    }`}
                  />
                );
              })}
            </div>
          </label>
        </div>
      </div>

      {/* ── Link target ─────────────────────────────────────── */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3" data-admin-banner-link={banner.id}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Where does this card open?
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            { value: "none", label: "Nowhere", hint: "Display only" },
            { value: "product", label: "Product page", hint: "Opens the product (PDP)" },
            { value: "module", label: "Product module", hint: "Opens a specific module" },
          ] as Array<{ value: BannerLinkType; label: string; hint: string }>).map((option) => {
            const selected = (banner.linkType || "none") === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onPatch({ linkType: option.value })}
                className={`rounded-lg border px-2 py-2 text-center transition ${
                  selected
                    ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className={`block text-xs font-bold ${selected ? "text-violet-900" : "text-slate-700"}`}>
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{option.hint}</span>
              </button>
            );
          })}
        </div>

        {linked ? (
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
              Product (from Products module)
              <select
                className={selectClass}
                value={banner.productId || ""}
                onChange={(e) => onPatch({ productId: e.target.value || undefined })}
                data-admin-banner-product
              >
                <option value="">— choose a product —</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title || product.id}
                  </option>
                ))}
              </select>
            </label>
            {banner.linkType === "module" ? (
              <label className="block text-xs font-semibold text-slate-600">
                Module
                <select
                  className={selectClass}
                  value={banner.moduleId || ""}
                  disabled={!product}
                  onChange={(e) => onPatch({ moduleId: e.target.value || undefined })}
                  data-admin-banner-module
                >
                  <option value="">— choose a module —</option>
                  {moduleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {missingProduct ? (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                Choose a product — until then the card stays display-only.
              </p>
            ) : null}
            {missingModule ? (
              <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                Choose a module — until then the card opens the product page instead of a specific module.
              </p>
            ) : null}
            {staleModule ? (
              <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                That module no longer exists in this product — pick a current one before saving.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
