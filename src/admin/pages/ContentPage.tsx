"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  Field,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  Sheet,
  Tabs,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import { useConfirm, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Banner = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  cta: string;
  destination: string;
  sortOrder: number;
  active: boolean;
};

type CategoryItem = {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
};

type TestimonialItem = {
  id: string;
  name: string;
  quote: string;
  active: boolean;
};

type ContentSettings = {
  siteName: string;
  banners: Banner[];
  categories: CategoryItem[];
  testimonials: TestimonialItem[];
  storeTitle: string;
  storeSubtitle: string;
  showWishlist: boolean;
  showRatings: boolean;
  showSaleBadges: boolean;
  emptyStateMessages: Record<string, string>;
  pdpHelperTexts: Record<string, string>;
  coursePlayerMessages: Record<string, string>;
  authLabels: Record<string, string>;
  /**
   * Google editor access inside the Course Player:
   *   "off"     — learners only see the read-only preview.
   *   "toolbar" — Edit opens the compact Google editor (full formatting
   *               toolbar, Google header hidden). Default.
   *   "full"    — Edit opens the complete docs.google.com page (title,
   *               menu bar, toolbar, side tabs, comments — everything).
   * Legacy single switch — kept as the inherited default for any type
   * without its own entry in `docsEditorAccessByType`.
   */
  docsEditorAccess?: "off" | "toolbar" | "full";
  /**
   * Per-type overrides: Docs, Sheets and Slides each get their own
   * off/toolbar/full switch. Forms and PDFs have no learner-facing
   * editor endpoint, so no switch exists for them.
   */
  docsEditorAccessByType?: Partial<Record<"doc" | "sheet" | "slides", "off" | "toolbar" | "full">>;
  /**
   * Personal-copy feature (Drive `files.copy`): every student gets their
   * OWN copy of the master file in their OWN Google Drive. Needs the
   * public OAuth Client ID; each Google family has its own enable switch.
   */
  drivePersonalCopy?: {
    clientId?: string;
    byType?: Partial<Record<"doc" | "sheet" | "slides" | "drive", boolean>>;
  };
};

function genLocalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const CONTENT_TABS = [
  { key: "landing", label: "Landing" },
  { key: "home", label: "Home" },
  { key: "store", label: "Store" },
  { key: "pdp", label: "Product Detail" },
  { key: "checkout", label: "Checkout" },
  { key: "player", label: "Course Player" },
  { key: "auth", label: "Authentication" },
  { key: "flags", label: "Feature Flags" },
];

export default function AppContentPage() {
  const [tab, setTab] = useState("landing");
  const confirm = useConfirm();
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={CONTENT_TABS} active={tab} onChange={setTab} />
      <div className="mt-3">
        {tab === "landing" && <LandingTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "home" && <HomeTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "store" && <StoreTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "pdp" && <PdpTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "checkout" && <CheckoutTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "player" && <PlayerTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "auth" && <AuthTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "flags" && <FlagsTab confirm={confirm} notify={notify} setDirty={setDirty} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content settings hook                                                */
/* ------------------------------------------------------------------ */

function useContentSettings(onDirty: (v: boolean) => void) {
  const [settings, setSettings] = useState<ContentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ settings: ContentSettings }>("/api/admin/content");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content settings.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(partial: Partial<ContentSettings>) {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    onDirty(true);
  }

  return { settings, error, reload: load, patch };
}

/* ------------------------------------------------------------------ */
/* Landing tab                                                         */
/* ------------------------------------------------------------------ */

function LandingTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Landing"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({ siteName: settings?.siteName }),
      });
      notify("success", "Landing settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Landing page" description="Controls the main landing / marketing page.">
        <Field label="App / site name">
          <input
            className={inputClass}
            value={settings.siteName}
            onChange={(e) => patch({ siteName: e.target.value })}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Landing footer">
        <Field label="Open-dashboard text label">
          <input
            className={inputClass}
            value={settings.authLabels?.["openDashboardLabel"] ?? "Open dashboard"}
            onChange={(e) =>
              patch({ authLabels: { ...(settings.authLabels ?? {}), openDashboardLabel: e.target.value } })
            }
          />
        </Field>
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save landing settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home tab                                                            */
/* ------------------------------------------------------------------ */

function HomeTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Partial<Banner> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<CategoryItem> | null>(null);
  const [editingTestimonial, setEditingTestimonial] = useState<Partial<TestimonialItem> | null>(null);

  if (error) return <SectionCard title="Home"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({
          banners: settings?.banners,
          categories: settings?.categories,
          testimonials: settings?.testimonials,
        }),
      });
      notify("success", "Home settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard
        title={`Hero banners (${settings.banners.length})`}
        action={
          <SecondaryButton
            className="h-9 text-xs"
            onClick={() =>
              setEditingBanner({
                id: genLocalId("banner"),
                title: "",
                subtitle: "",
                image: "",
                cta: "",
                destination: "",
                sortOrder: settings.banners.length,
                active: true,
              })
            }
          >
            + Add banner
          </SecondaryButton>
        }
      >
        {settings.banners.length === 0 ? (
          <EmptyState title="No banners yet" />
        ) : (
          <div className="space-y-2">
            {settings.banners.map((b, idx) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.title || "Untitled"}</p>
                  <p className="text-xs text-slate-500">{b.subtitle}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] active:bg-slate-50"
                    onClick={() =>
                      setEditingBanner(b)
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-md border border-red-200 px-2 text-[11px] text-red-600 active:bg-red-50"
                    onClick={() => {
                      const next = [...settings.banners];
                      next.splice(idx, 1);
                      patch({ banners: next });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Categories (${settings.categories.length})`}
        action={
          <SecondaryButton
            className="h-9 text-xs"
            onClick={() =>
              setEditingCategory({
                id: genLocalId("cat"),
                label: "",
                icon: "",
                sortOrder: settings.categories.length,
              })
            }
          >
            + Add category
          </SecondaryButton>
        }
      >
        {settings.categories.length === 0 ? (
          <EmptyState title="No categories yet" />
        ) : (
          <div className="space-y-2">
            {settings.categories.map((c, idx) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.icon} {c.label}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] active:bg-slate-50"
                    onClick={() => setEditingCategory(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-md border border-red-200 px-2 text-[11px] text-red-600 active:bg-red-50"
                    onClick={() => {
                      const next = [...settings.categories];
                      next.splice(idx, 1);
                      patch({ categories: next });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Testimonials (${settings.testimonials.length})`}
        action={
          <SecondaryButton
            className="h-9 text-xs"
            onClick={() =>
              setEditingTestimonial({
                id: genLocalId("tst"),
                name: "",
                quote: "",
                active: true,
              })
            }
          >
            + Add testimonial
          </SecondaryButton>
        }
      >
        {settings.testimonials.length === 0 ? (
          <EmptyState title="No testimonials yet" />
        ) : (
          <div className="space-y-2">
            {settings.testimonials.map((t, idx) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{t.name}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{t.quote}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] active:bg-slate-50"
                    onClick={() => setEditingTestimonial(t)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-md border border-red-200 px-2 text-[11px] text-red-600 active:bg-red-50"
                    onClick={() => {
                      const next = [...settings.testimonials];
                      next.splice(idx, 1);
                      patch({ testimonials: next });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save home settings
      </PrimaryButton>

      <Sheet open={!!editingBanner} onClose={() => setEditingBanner(null)} title={editingBanner?.id && settings.banners.some(b => b.id === editingBanner.id) ? "Edit banner" : "Add banner"} footer={
        <PrimaryButton className="w-full" onClick={() => {
          if (!editingBanner) return;
          const isExisting = settings.banners.some(b => b.id === editingBanner.id);
          const nextBanners = isExisting
            ? settings.banners.map(b => b.id === editingBanner.id ? (editingBanner as Banner) : b)
            : [...settings.banners, editingBanner as Banner];
          patch({ banners: nextBanners });
          setEditingBanner(null);
        }}>Save banner</PrimaryButton>
      }>
        {editingBanner && (
          <div className="space-y-3">
            <Field label="Title"><input className={inputClass} value={editingBanner.title ?? ""} onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })} /></Field>
            <Field label="Subtitle"><input className={inputClass} value={editingBanner.subtitle ?? ""} onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })} /></Field>
            <Field label="Image URL"><input className={inputClass} value={editingBanner.image ?? ""} onChange={(e) => setEditingBanner({ ...editingBanner, image: e.target.value })} /></Field>
            <Field label="CTA label"><input className={inputClass} value={editingBanner.cta ?? ""} onChange={(e) => setEditingBanner({ ...editingBanner, cta: e.target.value })} /></Field>
            <Field label="CTA destination"><input className={inputClass} value={editingBanner.destination ?? ""} onChange={(e) => setEditingBanner({ ...editingBanner, destination: e.target.value })} /></Field>
            <Field label="Sort order"><input className={inputClass} type="number" value={editingBanner.sortOrder ?? 0} onChange={(e) => setEditingBanner({ ...editingBanner, sortOrder: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingBanner.active} onChange={(e) => setEditingBanner({ ...editingBanner, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editingCategory} onClose={() => setEditingCategory(null)} title="Category" footer={
        <PrimaryButton className="w-full" onClick={() => {
          if (!editingCategory) return;
          const isExisting = settings.categories.some(c => c.id === editingCategory.id);
          const next = isExisting
            ? settings.categories.map(c => c.id === editingCategory.id ? (editingCategory as CategoryItem) : c)
            : [...settings.categories, editingCategory as CategoryItem];
          patch({ categories: next });
          setEditingCategory(null);
        }}>Save category</PrimaryButton>
      }>
        {editingCategory && (
          <div className="space-y-3">
            <Field label="Label"><input className={inputClass} value={editingCategory.label ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, label: e.target.value })} /></Field>
            <Field label="Icon"><input className={inputClass} value={editingCategory.icon ?? ""} onChange={(e) => setEditingCategory({ ...editingCategory, icon: e.target.value })} /></Field>
            <Field label="Sort order"><input className={inputClass} type="number" value={editingCategory.sortOrder ?? 0} onChange={(e) => setEditingCategory({ ...editingCategory, sortOrder: Number(e.target.value) })} /></Field>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editingTestimonial} onClose={() => setEditingTestimonial(null)} title="Testimonial" footer={
        <PrimaryButton className="w-full" onClick={() => {
          if (!editingTestimonial) return;
          const isExisting = settings.testimonials.some(t => t.id === editingTestimonial.id);
          const next = isExisting
            ? settings.testimonials.map(t => t.id === editingTestimonial.id ? (editingTestimonial as TestimonialItem) : t)
            : [...settings.testimonials, editingTestimonial as TestimonialItem];
          patch({ testimonials: next });
          setEditingTestimonial(null);
        }}>Save testimonial</PrimaryButton>
      }>
        {editingTestimonial && (
          <div className="space-y-3">
            <Field label="Name"><input className={inputClass} value={editingTestimonial.name ?? ""} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, name: e.target.value })} /></Field>
            <Field label="Quote"><textarea className={textareaClass} value={editingTestimonial.quote ?? ""} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, quote: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5" checked={!!editingTestimonial.active} onChange={(e) => setEditingTestimonial({ ...editingTestimonial, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Store tab                                                           */
/* ------------------------------------------------------------------ */

function StoreTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Store"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({
          storeTitle: settings?.storeTitle,
          storeSubtitle: settings?.storeSubtitle,
          showWishlist: settings?.showWishlist,
          showRatings: settings?.showRatings,
          showSaleBadges: settings?.showSaleBadges,
        }),
      });
      notify("success", "Store settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Store labels">
        <Field label="Store heading">
          <input className={inputClass} value={settings.storeTitle} onChange={(e) => patch({ storeTitle: e.target.value })} />
        </Field>
        <Field label="Store subtitle">
          <input className={inputClass} value={settings.storeSubtitle} onChange={(e) => patch({ storeSubtitle: e.target.value })} />
        </Field>
        <Field label="Search placeholder">
          <input className={inputClass} value={settings.emptyStateMessages?.["storeSearch"] ?? ""} onChange={(e) => patch({ emptyStateMessages: { ...(settings.emptyStateMessages ?? {}), storeSearch: e.target.value } })} />
        </Field>
      </SectionCard>

      <SectionCard title="Empty states">
        <Field label="Empty-store title">
          <input className={inputClass} value={settings.emptyStateMessages?.["emptyStoreTitle"] ?? ""} onChange={(e) => patch({ emptyStateMessages: { ...(settings.emptyStateMessages ?? {}), emptyStoreTitle: e.target.value } })} />
        </Field>
        <Field label="Empty-store description">
          <textarea className={textareaClass} value={settings.emptyStateMessages?.["emptyStoreDesc"] ?? ""} onChange={(e) => patch({ emptyStateMessages: { ...(settings.emptyStateMessages ?? {}), emptyStoreDesc: e.target.value } })} />
        </Field>
      </SectionCard>

      <SectionCard title="Visibility toggles">
        {([
          { key: "showWishlist" as const, label: "Show wishlist" },
          { key: "showRatings" as const, label: "Show ratings" },
          { key: "showSaleBadges" as const, label: "Show sale badges" },
        ]).map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <ToggleSwitch checked={!!settings[key]} onChange={(v) => patch({ [key]: v })} />
          </div>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save store settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Product Detail tab                                                  */
/* ------------------------------------------------------------------ */

function PdpTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="PDP"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({ pdpHelperTexts: settings?.pdpHelperTexts }),
      });
      notify("success", "Product detail settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Product detail helper texts" description="Control copy shown around the product detail page.">
        {[
          "secureCheckoutHelper",
          "instantAccessLabel",
          "lifetimeLibraryLabel",
          "verifiedReviewsLabel",
          "moduleSelectionHeading",
          "moduleSelectionHelper",
          "fullCourseOptionLabel",
          "paidUpdateHeading",
          "purchasedStateMessage",
          "hiddenTitle",
          "hiddenDescription",
        ].map((key) => (
          <Field key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}>
            <input
              className={inputClass}
              value={settings.pdpHelperTexts?.[key] ?? ""}
              onChange={(e) =>
                patch({
                  pdpHelperTexts: {
                    ...(settings.pdpHelperTexts ?? {}),
                    [key]: e.target.value,
                  },
                })
              }
            />
          </Field>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save PDP settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checkout tab                                                        */
/* ------------------------------------------------------------------ */

function CheckoutTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Checkout"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({ pdpHelperTexts: settings?.pdpHelperTexts }),
      });
      notify("success", "Checkout settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Checkout copy">
        {[
          ["checkoutHeading", "Checkout heading"],
          ["reviewStepLabel", "Review step label"],
          ["paymentStepLabel", "Payment step label"],
          ["doneStepLabel", "Done step label"],
          ["buyerDetailsHeading", "Buyer details heading"],
          ["priceDetailsHeading", "Price details heading"],
          ["securePaymentHeading", "Secure payment heading"],
          ["paymentVerificationMessage", "Payment verification message"],
          ["paymentSuccessTitle", "Payment success title"],
          ["paymentSuccessDescription", "Payment success description"],
          ["invalidCheckoutTitle", "Invalid checkout title"],
          ["invalidCheckoutMessage", "Invalid checkout message"],
        ].map(([key, label]) => (
          <Field key={key} label={label as string}>
            <input
              className={inputClass}
              value={settings.pdpHelperTexts?.[key] ?? ""}
              onChange={(e) =>
                patch({
                  pdpHelperTexts: {
                    ...(settings.pdpHelperTexts ?? {}),
                    [key]: e.target.value,
                  },
                })
              }
            />
          </Field>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save checkout settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Course Player tab                                                   */
/* ------------------------------------------------------------------ */

function PlayerTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Course Player"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({
          coursePlayerMessages: settings?.coursePlayerMessages,
          docsEditorAccess: settings?.docsEditorAccess ?? "full",
          docsEditorAccessByType: settings?.docsEditorAccessByType ?? {},
          drivePersonalCopy: settings?.drivePersonalCopy ?? { clientId: "", byType: {} },
        }),
      });
      notify("success", "Course player settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const docsEditorOptions: Array<{ value: "off" | "toolbar" | "full"; label: string; hint: string }> = [
    { value: "off", label: "Preview only", hint: "Learners never see the Edit button — files of this type stay read-only." },
    { value: "toolbar", label: "Toolbar editor", hint: "Edit opens Google's compact editor: the complete formatting toolbar, but the Google header (title, File/Edit/View menus, Share) stays hidden." },
    { value: "full", label: "Full Google page", hint: "Edit opens the complete Google page — title, whole menu bar, toolbar, side panels, comments, Share. Everything." },
  ];

  /** The Google families that actually have a learner-facing editor. */
  const editorTypes: Array<{ key: "doc" | "sheet" | "slides"; label: string; hint: string }> = [
    { key: "doc", label: "Google Docs", hint: "Documents — full editor available" },
    { key: "sheet", label: "Google Sheets", hint: "Spreadsheets — full editor available" },
    { key: "slides", label: "Google Slides", hint: "Presentations — full editor available" },
  ];

  const accessForType = (key: "doc" | "sheet" | "slides"): "off" | "toolbar" | "full" =>
    settings?.docsEditorAccessByType?.[key] ?? settings?.docsEditorAccess ?? "full";

  const setAccessForType = (key: "doc" | "sheet" | "slides", value: "off" | "toolbar" | "full") =>
    patch({
      docsEditorAccessByType: { ...(settings?.docsEditorAccessByType ?? {}), [key]: value },
    });

  const setAccessForAll = (value: "off" | "toolbar" | "full") =>
    patch({
      docsEditorAccess: value,
      docsEditorAccessByType: { doc: value, sheet: value, slides: value },
    });

  /** Personal-copy feature — every copyable Google family gets a switch. */
  const personalCopyTypes: Array<{ key: "doc" | "sheet" | "slides" | "drive"; label: string; hint: string }> = [
    { key: "doc", label: "Google Docs", hint: "Student edits their own document copy" },
    { key: "sheet", label: "Google Sheets", hint: "Student edits their own spreadsheet copy" },
    { key: "slides", label: "Google Slides", hint: "Student edits their own presentation copy" },
    { key: "drive", label: "Drive files (PDF & others)", hint: "Student gets the file copied into their Drive" },
  ];

  const personalCopyOn = (key: "doc" | "sheet" | "slides" | "drive"): boolean =>
    settings?.drivePersonalCopy?.byType?.[key] === true;

  const setPersonalCopy = (key: "doc" | "sheet" | "slides" | "drive", value: boolean) =>
    patch({
      drivePersonalCopy: {
        ...(settings?.drivePersonalCopy ?? {}),
        byType: { ...(settings?.drivePersonalCopy?.byType ?? {}), [key]: value },
      },
    });

  const playerKeys = [
    ["emptyCourseTitle", "Empty course title"],
    ["emptyCourseMessage", "Empty course message"],
    ["selectResourceMessage", "Select resource message"],
    ["publicUrlHelper", "Public URL helper"],
    ["googleSharingHelper", "Google sharing helper"],
    ["whimsicalSharingHelper", "Whimsical sharing helper"],
    ["markCompleteLabel", "Mark complete label"],
    ["completedLabel", "Completed label"],
    ["notesPlaceholder", "Notes placeholder"],
    ["paidUpdateHeading", "Paid update heading"],
    ["buyUpdateLabel", "Buy update label"],
  ];

  return (
    <div className="space-y-3">
      <SectionCard title="Google file editing">
        <p className="text-xs text-slate-500">
          Choose what learners get when they open each kind of Google file inside the Course Player — every type has its own switch.
          Editing always requires the file to be shared with edit permission (e.g. “Anyone with the link → Editor”).
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <span className="font-bold text-slate-600">No switch for other types:</span> Google Forms have no learner editor
          (their /edit page is your form <em>builder</em>; learners fill the embedded form, which already works), and
          PDFs / Drive files have no editor at all — they always show the preview with download.
        </div>

        {/* Quick apply-to-all row */}
        <div className="mt-3 flex flex-wrap items-center gap-2" data-admin-docs-editor-all>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Set all:</span>
          {docsEditorOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccessForAll(option.value)}
              data-docs-editor-all-option={option.value}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Per-type switches */}
        <div className="mt-3 space-y-3" data-admin-docs-editor-access>
          {editorTypes.map((type) => {
            const current = accessForType(type.key);
            return (
              <div key={type.key} className="rounded-xl border border-slate-200 bg-white p-3" data-docs-editor-type={type.key}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">{type.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{type.hint}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {docsEditorOptions.map((option) => {
                    const selected = current === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAccessForType(type.key, option.value)}
                        data-docs-editor-option={`${type.key}:${option.value}`}
                        aria-pressed={selected}
                        title={option.hint}
                        className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition ${
                          selected
                            ? "border-violet-400 bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {docsEditorOptions.find((option) => option.value === current)?.hint}
                </p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Personal copies (Google Drive)">
        <p className="text-xs text-slate-500">
          Give every student their <strong>own private copy</strong> of a Google file, cloned into the
          student&apos;s own Google Drive with one tap. The student owns the copy — they can always edit it,
          and the master file stays untouched. Works per file type below.
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <span className="font-bold text-slate-600">Setup:</span> paste your Google OAuth <strong>Client ID</strong> (Web application)
          below — from Google Cloud Console → APIs &amp; Services → Credentials. The Drive API must be enabled in the same
          project, and your site&apos;s domain added to the client&apos;s <em>Authorized JavaScript origins</em>. The client
          <em> secret</em> is <strong>not</strong> needed (browser token flow). Masters only need
          &ldquo;Anyone with the link → Viewer&rdquo; sharing. Google Forms are excluded — copying a form would hand the
          student your form <em>builder</em>, not a fillable form.
        </div>
        <Field label="Google OAuth Client ID" hint="Leave blank to use the VITE_GOOGLE_CLIENT_ID the app already uses for Google sign-in">
          <input
            className={inputClass}
            placeholder="1234567890-abc123.apps.googleusercontent.com"
            value={settings.drivePersonalCopy?.clientId ?? ""}
            data-admin-drive-client-id
            onChange={(e) =>
              patch({
                drivePersonalCopy: { ...(settings.drivePersonalCopy ?? {}), clientId: e.target.value },
              })
            }
          />
        </Field>
        <div className="mt-3 space-y-2" data-admin-personal-copy>
          {personalCopyTypes.map((type) => {
            const enabled = personalCopyOn(type.key);
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => setPersonalCopy(type.key, !enabled)}
                data-personal-copy-type={type.key}
                aria-pressed={enabled}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                  enabled ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span>
                  <span className={`block text-sm font-bold ${enabled ? "text-emerald-900" : "text-slate-800"}`}>{type.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{type.hint}</span>
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                  aria-hidden="true"
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Course player messages">
        {playerKeys.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className={inputClass}
              value={settings.coursePlayerMessages?.[key] ?? ""}
              onChange={(e) =>
                patch({
                  coursePlayerMessages: {
                    ...(settings.coursePlayerMessages ?? {}),
                    [key]: e.target.value,
                  },
                })
              }
            />
          </Field>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save course player settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Authentication tab                                                  */
/* ------------------------------------------------------------------ */

function AuthTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Authentication"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({ authLabels: settings?.authLabels }),
      });
      notify("success", "Authentication labels saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const authKeys = [
    ["loginHeading", "Login heading"],
    ["signupHeading", "Signup heading"],
    ["loginDescription", "Login description"],
    ["signupDescription", "Signup description"],
    ["googleButtonLabel", "Google button label"],
    ["forgotPasswordLabel", "Forgot password label"],
    ["resetSuccessMessage", "Reset success message"],
    ["termsHelperText", "Terms / helper text"],
  ];

  return (
    <div className="space-y-3">
      <SectionCard title="User authentication labels" description="Controls text on the normal user auth page only. No admin auth controls here.">
        {authKeys.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className={inputClass}
              value={settings.authLabels?.[key] ?? ""}
              onChange={(e) =>
                patch({
                  authLabels: {
                    ...(settings.authLabels ?? {}),
                    [key]: e.target.value,
                  },
                })
              }
            />
          </Field>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save authentication labels
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature Flags tab                                                   */
/* ------------------------------------------------------------------ */

function FlagsTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const { settings, error, patch } = useContentSettings(setDirty);
  const [saving, setSaving] = useState(false);

  if (error) return <SectionCard title="Feature Flags"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({
          showWishlist: settings?.showWishlist,
          showRatings: settings?.showRatings,
          showSaleBadges: settings?.showSaleBadges,
        }),
      });
      notify("success", "Feature flags saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Active app features" description="Toggle features that are currently active in the main application.">
        {[
          { key: "showWishlist" as const, label: "Wishlist" },
          { key: "showRatings" as const, label: "Ratings" },
          { key: "showSaleBadges" as const, label: "Sale badges" },
        ].map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
          >
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <ToggleSwitch
              checked={!!settings[key]}
              onChange={(v) => patch({ [key]: v })}
            />
          </div>
        ))}
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save feature flags
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle helper                                                       */
/* ------------------------------------------------------------------ */

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
        checked ? "bg-slate-900" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
