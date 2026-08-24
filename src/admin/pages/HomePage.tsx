"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  inputClass,
  LoadingState,
  PrimaryButton,
  SectionCard,
  SecondaryButton,
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
    setDirty(true);
  };

  const addBanner = () => {
    setBanners((current) => [...current, newBanner(current.length)]);
    setDirty(true);
  };

  const resetToBuiltIn = () => {
    setBanners(cloneBanners(builtInBanners));
    setIsDefault(true);
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

  if (loading) return <LoadingState label="Loading home slides…" />;
  if (error) return <SectionCard title="Home · Hero Slides"><p className="text-sm text-red-500">{error}</p></SectionCard>;

  return (
    <div className="space-y-3 pb-6">
      <SectionCard
        title="Home · Hero Slides"
        description="The sliding cards at the top of the app home page. Edit the text, image and colours, and link each card to a real product — or to one specific module inside a product — from the Products module."
        action={
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={resetToBuiltIn} className="h-9 px-3 text-xs">Reset to built-in</SecondaryButton>
            <PrimaryButton onClick={save} loading={saving} className="h-9 px-4 text-xs">Save slides</PrimaryButton>
          </div>
        }
      >
        {isDefault && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <span className="font-bold">Built-in slides.</span> No custom set is published yet — what you see below is what
            the app shows today. Press <span className="font-bold">Save slides</span> to publish your own version.
          </div>
        )}

        {banners.length === 0 ? (
          <EmptyState
            title="No slides"
            description="Add a slide, or reset to the built-in set."
            action={
              <div className="flex gap-2">
                <SecondaryButton onClick={resetToBuiltIn} className="h-9 px-3 text-xs">Reset to built-in</SecondaryButton>
                <PrimaryButton onClick={addBanner} className="h-9 px-3 text-xs">Add slide</PrimaryButton>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            {banners.map((banner, index) => {
              const linked = banner.linkType === "product" || banner.linkType === "module";
              const product = products.find((item) => item.id === banner.productId) || null;
              const moduleOptions = moduleOptionsFor(product);
              const moduleTitle = banner.linkType === "module"
                ? moduleOptions.find((option) => option.id === banner.moduleId)?.label || null
                : null;
              const missingProduct = linked && !banner.productId;
              const missingModule = banner.linkType === "module" && !!banner.productId && !banner.moduleId;
              const staleModule = banner.linkType === "module" && !!banner.productId && !!banner.moduleId && !moduleOptions.some((o) => o.id === banner.moduleId);

              return (
                <div key={banner.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3" data-admin-banner-card={banner.id}>
                  {/* ── Card header ─────────────────────────────────────── */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-6 w-10 shrink-0 rounded-md bg-gradient-to-br ring-1 ring-inset ring-black/10 ${banner.gradient}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{banner.title || "Untitled slide"}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {banner.linkType === "none"
                          ? "No link — display only"
                          : `Opens ${banner.linkType === "module" ? "module" : "product"} · ${missingProduct ? "no product selected" : productNameById.get(banner.productId || "") || banner.productId || "unknown product"}${moduleTitle ? ` → ${moduleTitle}` : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveBanner(index, -1)} disabled={index === 0} aria-label="Move slide up"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-slate-300">↑</button>
                      <button type="button" onClick={() => moveBanner(index, 1)} disabled={index === banners.length - 1} aria-label="Move slide down"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-slate-300">↓</button>
                      <button type="button" onClick={() => void removeBanner(index)} aria-label="Remove slide"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:border-red-300">✕</button>
                    </div>
                  </div>

                  {/* ── Live mini-preview ───────────────────────────────── */}
                  <div className={`relative mt-2 flex h-16 items-center overflow-hidden rounded-lg bg-gradient-to-br px-3 ${banner.gradient}`}>
                    <div className="relative z-10 min-w-0 pr-16">
                      <p className="text-[9px] font-bold tracking-wider text-white/80">{banner.eyebrow || "FEATURED"}</p>
                      <p className="truncate text-xs font-bold text-white">{banner.title}</p>
                      <p className="truncate text-[10px] text-white/80">{banner.subtitle}</p>
                    </div>
                    <img src={banner.image} alt="" className="pointer-events-none absolute right-0 bottom-0 h-full w-20 object-cover opacity-90" style={{ maskImage: "linear-gradient(to left, black 50%, transparent 100%)" }} />
                  </div>

                  {/* ── Content fields ──────────────────────────────────── */}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Eyebrow (small tag)" hint="Short label shown on the pill — e.g. NEW ARRIVAL">
                      <input className={inputClass} value={banner.eyebrow} maxLength={28}
                        onChange={(e) => patchBanner(index, { eyebrow: e.target.value })} />
                    </Field>
                    <Field label="Title" hint="Main line on the slide">
                      <input className={inputClass} value={banner.title} maxLength={60}
                        onChange={(e) => patchBanner(index, { title: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Subtitle" hint="One or two supporting lines">
                        <textarea className={`${inputClass} min-h-[60px] resize-y`} value={banner.subtitle} maxLength={140}
                          onChange={(e) => patchBanner(index, { subtitle: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Button text (CTA)">
                      <input className={inputClass} value={banner.cta} maxLength={24}
                        onChange={(e) => patchBanner(index, { cta: e.target.value })} />
                    </Field>
                    <Field label="Image URL" hint="Right side of the card — /images/… or a full https URL, or upload your own below">
                      <input className={inputClass} value={banner.image} placeholder="/images/hero-1.jpg"
                        onChange={(e) => patchBanner(index, { image: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2" data-admin-banner-image-upload>
                      <CloudinaryImageUploadField
                        folder="home-hero-slides"
                        tags={["home-banner"]}
                        label="Upload a new image for this slide"
                        hint="Pick from your gallery / camera — the hosted URL is filled into the Image URL field above automatically."
                        onUploaded={(hostedUrl) => patchBanner(index, { image: hostedUrl })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Colour" hint="Card background gradient">
                        <div className="flex flex-wrap gap-2">
                          {BANNER_GRADIENTS.map((preset) => {
                            const selected = banner.gradient === preset.classes;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                title={preset.label}
                                aria-pressed={selected}
                                onClick={() => patchBanner(index, { gradient: preset.classes })}
                                className={`h-9 w-14 rounded-lg bg-gradient-to-br ring-2 transition ${preset.classes} ${
                                  selected ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"
                                }`}
                              />
                            );
                          })}
                        </div>
                      </Field>
                    </div>
                  </div>

                  {/* ── Link target ─────────────────────────────────────── */}
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3" data-admin-banner-link={banner.id}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Where does this card open?</p>
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
                            onClick={() => patchBanner(index, { linkType: option.value })}
                            className={`rounded-lg border px-2 py-2 text-center transition ${
                              selected
                                ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span className={`block text-xs font-bold ${selected ? "text-violet-900" : "text-slate-700"}`}>{option.label}</span>
                            <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{option.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    {linked && (
                      <div className="mt-3 space-y-3">
                        <Field label="Product (from Products module)" hint="The card opens this product">
                          <select
                            className={selectClass}
                            value={banner.productId || ""}
                            onChange={(e) => patchBanner(index, { productId: e.target.value || undefined })}
                            data-admin-banner-product
                          >
                            <option value="">— choose a product —</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>{product.title || product.id}</option>
                            ))}
                          </select>
                        </Field>
                        {banner.linkType === "module" && (
                          <Field
                            label="Module"
                            hint={product ? "Opens the Course Player straight at this module" : "Choose a product first to see its modules"}
                          >
                            <select
                              className={selectClass}
                              value={banner.moduleId || ""}
                              disabled={!product}
                              onChange={(e) => patchBanner(index, { moduleId: e.target.value || undefined })}
                              data-admin-banner-module
                            >
                              <option value="">— choose a module —</option>
                              {moduleOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {missingProduct && (
                          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                            Choose a product — until then the card stays display-only.
                          </p>
                        )}
                        {missingModule && (
                          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                            Choose a module — until then the card opens the product page instead of a specific module.
                          </p>
                        )}
                        {staleModule && (
                          <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                            That module no longer exists in this product — pick a current one before saving.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <SecondaryButton onClick={addBanner} className="w-full border-dashed">+ Add slide</SecondaryButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
