import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmojiBurstLayer, useEmojiBurst } from "./components/ui/EmojiBurst";
import {
  GlassToggleGroup,
  GlassToggleItem,
} from "./components/ui/glass-toggle-group";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Expand,
  Globe,
  Heart,
  LockKeyhole,
  MessageCircle,
  PackageOpen,
  PlayCircle,
  Send,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  Zap,
} from "lucide-react";
import Header from "./components/Header";
import { GlassSurface } from "./components/ui/glass";
import { GlassButton } from "./components/ui/glass-button";
import { GlassCard } from "./components/ui/GlassCard";
import { PopoverItem } from "./components/ui/glass-popover";
import { GlassAccordion, GlassAccordionContent, GlassAccordionItem, GlassAccordionTrigger } from "./components/ui/glass-accordion";
import BottomNav, { type TabKey } from "./components/BottomNav";
import type { Product } from "./data/products";
import type { CheckoutSelection } from "./types/commerce";
import { buildCheckoutSelection, computeSummary } from "../utils/pdpSelection";
import PdpPurchaseBuilder from "./components/pdp/PdpPurchaseBuilder";
import { useCourseAccess } from "./hooks/useCourseAccess";
import { useHomepageProductReviews, usePublishedProductReviews, type PublishedProductReview } from "./hooks/useProductReviews";
import { reviews as fallbackReviews } from "./home/data/mockData";
import { useAuth } from "./context/AuthContext";
import { useBranding } from "./context/BrandingContext";
import { auth, db } from "../firebase";
import { apiFetch } from "./utils/apiBase";
import PromoCodeInput, { type PromoResult } from "./subscription/components/PromoCodeInput";
import { isFreeProduct, shouldShowCouponInput } from "../utils/couponVisibility";
import {
  collectPaidModuleIdSet,
  countCurriculumTree,
  filterCurriculumForPdp,
  isPaidUpgradeModule,
  resolvePaidUpdateForModule,
} from "../utils/pdpCurriculum";
import { playSfxCopy, playSfxError, playSfxSuccess } from "./utils/sfx";

interface ProductDetailProps {
  product: Product | null;
  products?: Product[];
  cartIds?: Set<string>;
  favoriteIds?: Set<string>;
  onCheckout: (finalPrice: number, couponCode?: string | null) => void;
  onCheckoutSelection?: (selection: CheckoutSelection, finalPrice: number) => void;
  onBack: () => void;
  onAddToCart?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onNavigateToProduct?: (product: Product) => void;
  onOpenCourse?: (product: Product) => void;
  onNavigateToCart?: () => void;
  onNavigateToSubscription?: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateFooter?: (tab: TabKey) => void;
  purchasedIds?: Set<string>;
  ownedUpdateIds?: Set<string>;
}

type DetailTab = "Description" | "Curriculum" | "Instructor";

type CurriculumModule = {
  id: string;
  title: string;
  paid?: boolean;
  paidUpdateId?: string;
  paidUpdateTitle?: string;
  paidUpdatePrice?: string;
  resources?: Array<{ id: string; name: string; type: string }>;
  modules?: CurriculumModule[];
};

type CurriculumViewMode = "included" | "paid-upgrade";

const formatPrice = (price: number) => price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}`;

/**
 * Live related-product ranking. It only considers products currently emitted
 * by CatalogContext, excludes the open product, and gives deterministic
 * priority to matching subject/category/level/tags. Newly published products
 * therefore become eligible automatically without a hard-coded PDP list.
 */
export const getRelatedProducts = (product: Product, catalog: Product[], limit = 3) => {
  const tags = new Set(product.tags.map((tag) => tag.toLowerCase()));
  return catalog
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      const sharedTags = candidate.tags.reduce((count, tag) => count + (tags.has(tag.toLowerCase()) ? 1 : 0), 0);
      const score =
        (candidate.subject.toLowerCase() === product.subject.toLowerCase() ? 8 : 0)
        + (candidate.category === product.category ? 5 : 0)
        + (candidate.classLevel.toLowerCase() === product.classLevel.toLowerCase() ? 3 : 0)
        + sharedTags * 2;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || b.candidate.rating - a.candidate.rating || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
};

export default function ProductDetail(props: ProductDetailProps) {
  return (
    <div className="min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none">
        <Header
          cartCount={props.cartIds?.size || 0}
          notifCount={1}
          onNavigateToSubscription={props.onNavigateToSubscription || (() => undefined)}
          onNavigateToCart={props.onNavigateToCart || (() => undefined)}
          onNavigateToNotifications={props.onNavigateToNotifications || (() => undefined)}
        />
        <main data-pdp-scroll data-pdp-grid className="min-h-0 flex-1 overflow-y-auto md:px-8">
          {props.product ? <PremiumProductContent {...props} product={props.product} /> : <MissingProduct onBack={props.onBack} />}
        </main>
        <BottomNav
          active="store"
          onChange={props.onNavigateFooter || (() => undefined)}
          storeBadge={1}
          purchasesBadge={props.purchasedIds?.size || 0}
        />
      </div>
    </div>
  );
}

function PremiumProductContent({
  product,
  products = [],
  cartIds = new Set<string>(),
  favoriteIds = new Set<string>(),
  onCheckout,
  onCheckoutSelection,
  onBack,
  onAddToCart,
  onToggleFavorite,
  onNavigateToProduct,
  onOpenCourse,
  purchasedIds,
  ownedUpdateIds,
}: ProductDetailProps & { product: Product }) {
  const { resolution } = useCourseAccess({ product });
  const { user } = useAuth();
  const { appName } = useBranding();
  const reviewCatalog = useMemo(() => products.length > 0 ? products : [product], [product, products]);
  const { reviews: homepageReviews } = useHomepageProductReviews(reviewCatalog, fallbackReviews, 6);
  const { reviews: liveProductReviews } = usePublishedProductReviews(reviewCatalog);
  const [localReviews, setLocalReviews] = useState<PublishedProductReview[]>([]);
  const productReviews = useMemo(
    () => {
      const fromHome = homepageReviews.filter((review) => review.productId === product.id);
      const live = liveProductReviews.filter((review) => review.productId === product.id || review.productId === product.documentId);
      const byId = new Map<string, PublishedProductReview>();
      // Locally-added reviews are seeded first so a just-submitted review is
      // guaranteed to appear at the top, then replaced by its synced twin.
      for (const review of [...localReviews, ...live, ...fromHome]) byId.set(review.id, review);
      return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    },
    [homepageReviews, liveProductReviews, localReviews, product.documentId, product.id],
  );
  const [activeImage, setActiveImage] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("Description");
  const [expandedModule, setExpandedModule] = useState<string | null>(product.canonicalModules?.[0]?.id || null);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "error">("idle");
  const [couponErrorMessage, setCouponErrorMessage] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPaise: number; label: string } | null>(null);
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");

  useEffect(() => {
    if (!window.location.hash.includes("section=reviews")) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("product-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [product.id]);

  // Close the share menu when the user taps/clicks outside it, or scrolls
  // anywhere outside the menu (page scroll, any scroll container, or touch drag).
  useEffect(() => {
    if (!shareOpen) return;
    const closeOnOutsidePointer = (event: Event) => {
      const target = event.target as Node | null;
      if (target && shareRef.current && !shareRef.current.contains(target)) setShareOpen(false);
    };
    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && shareRef.current && !shareRef.current.contains(target)) setShareOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("touchstart", closeOnOutsidePointer, { passive: true });
    document.addEventListener("scroll", closeOnOutsideScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", closeOnOutsideScroll, { passive: true });
    window.addEventListener("wheel", closeOnOutsideScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("touchstart", closeOnOutsidePointer);
      document.removeEventListener("scroll", closeOnOutsideScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchmove", closeOnOutsideScroll);
      window.removeEventListener("wheel", closeOnOutsideScroll);
    };
  }, [shareOpen]);

  const ownedKeys = purchasedIds || new Set<string>();
  const isProductOwned = ownedKeys.has(product.id)
    || Boolean(product.documentId && ownedKeys.has(product.documentId))
    || resolution.hasFullProductAccess;
  const updates = ownedUpdateIds || resolution.ownedUpdateIds;
  const availablePaidUpdates = (product.paidUpdates || []).filter((update) => update.active && update.visibility !== "hidden" && !updates.has(update.id));
  const ownedModuleIds = resolution.ownedModuleIds;
  const ownedResourceIds = resolution.ownedResourceIds;
  const gallery = product.images?.length ? product.images : [product.image];
  const selectedImage = gallery[Math.min(activeImage, gallery.length - 1)] || product.image;
  const related = useMemo(() => getRelatedProducts(product, products, 6), [product, products]);
  const discount = product.originalPrice > product.price && product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const collectedModules = useMemo(() => collectCurriculumModules(product), [product]);
  const includedCurriculum = useMemo(
    () => filterCurriculumForPdp(collectedModules, { isProductOwned: false, ownedUpdateIds: new Set() }).modules,
    [collectedModules],
  );
  const { modules, mode: curriculumMode } = useMemo(
    () => filterCurriculumForPdp(collectedModules as unknown as CurriculumModule[], { isProductOwned, ownedUpdateIds: updates }) as { modules: CurriculumModule[]; mode: CurriculumViewMode },
    [collectedModules, isProductOwned, updates],
  );
  const { modulesCount, resourcesCount: resourceCount } = useMemo(() => countCurriculumTree(includedCurriculum), [includedCurriculum]);

  useEffect(() => {
    const firstId = modules[0]?.id || null;
    setExpandedModule((current) => {
      const stillVisible = current ? curriculumContainsId(modules, current) : false;
      return stillVisible ? current : firstId;
    });
  }, [product.id, curriculumMode, modules]);

  const productShareUrl = typeof window === "undefined"
    ? ""
    : `${window.location.origin}${window.location.pathname}#/product/${encodeURIComponent(product.id)}`;
  const favorite = favoriteIds.has(product.id);
  const { particles: likeParticles, burst: likeBurst } = useEmojiBurst();
  const inCart = cartIds.has(product.id);
  const unavailable = product.availableForSale === false && !isProductOwned;

  const handlePreview = (selection: CheckoutSelection, summary: ReturnType<typeof computeSummary>) => {
    const withCoupon = appliedCoupon?.code ? { ...selection, couponCode: appliedCoupon.code } : selection;
    if (onCheckoutSelection) onCheckoutSelection(withCoupon, summary.effectiveSubtotal);
    else if (selection.purchaseKind === "full_product") onCheckout(product.price, appliedCoupon?.code || null);
  };

  // Directly buy the first available paid upgrade — used once the base course
  // is owned and the "Select course modules" section is no longer shown.
  const handleBuyUpgrade = () => {
    const update = availablePaidUpdates[0];
    if (!update) return;
    const selection = buildCheckoutSelection({
      product,
      mode: "paid_update",
      selectedIds: new Set([update.id]),
      paidUpdateId: update.id,
      returnRoute: `#/product/${encodeURIComponent(product.id)}`,
    });
    if (onCheckoutSelection) onCheckoutSelection(selection, Number(update.cashPrice) || 0);
    else if (selection.purchaseKind === "full_product") onCheckout(product.price, appliedCoupon?.code || null);
  };

  const copyLink = async () => {
    const url = productShareUrl || window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      playSfxCopy();
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const shareNative = async () => {
    const url = productShareUrl || window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: product.title, text: product.description || product.title, url });
        setShareOpen(false);
        return;
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const shareTo = (target: "whatsapp" | "telegram") => {
    const url = encodeURIComponent(productShareUrl || window.location.href);
    const text = encodeURIComponent(`${product.title} — ${product.description || `Learn on ${appName}`}`);
    const href = target === "whatsapp"
      ? `https://wa.me/?text=${text}%20${url}`
      : `https://t.me/share/url?url=${url}&text=${text}`;
    window.open(href, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const primaryAction = () => {
    if (!unavailable) onCheckout(product.price, appliedCoupon?.code || null);
  };

  // Coupon handling — mirrors the subscription page. The code is validated
  // server-side by re-quoting through the existing /api/quotes/create endpoint
  // (same Part 7 coupon engine + Part 4 quote engine the real checkout uses),
  // so the buyer sees "Verified savings" before entering checkout. The applied
  // code is carried into checkout.
  const handleApplyCoupon = useCallback(
    async (rawCode: string): Promise<PromoResult> => {
      if (isProductOwned) {
        return { valid: false, message: "You already own this product." };
      }
      const code = rawCode.trim().toUpperCase();
      if (!code) return { valid: false, message: "Enter a coupon code." };
      setCouponStatus("applying");
      setCouponErrorMessage(null);
      try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return { valid: false, message: "Please sign in to apply a coupon." };
        const token = await firebaseUser.getIdToken(true);
        const response = await apiFetch("/api/quotes/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            purchaseKind: "full_product",
            productIds: [product.documentId || product.id],
            moduleIds: [],
            resourceIds: [],
            updateId: null,
            subscriptionPlanId: null,
            billingCycle: null,
            featureIds: [],
            couponCode: code,
            returnRoute: null,
          }),
        });
        const data = await response.json().catch(() => ({})) as { ok?: boolean; quote?: { couponDiscount?: number }; error?: string };
        if (!response.ok || !data.ok) {
          const message = data.error || "This coupon could not be applied.";
          setCouponStatus("error");
          setCouponErrorMessage(message);
          return { valid: false, message };
        }
        const discountPaise = Math.max(0, Math.round(Number(data.quote?.couponDiscount || 0)));
        setCouponStatus("idle");
        playSfxSuccess();
        setAppliedCoupon({
          code,
          discountPaise,
          label: discountPaise > 0 ? `Verified savings · ₹${Math.round(discountPaise / 100)} off` : "Coupon applied (no additional savings).",
        });
        return { valid: true, message: "Coupon applied." };
      } catch (error) {
        const message = error instanceof Error ? error.message : "This coupon could not be applied.";
        setCouponStatus("error");
        setCouponErrorMessage(message);
        playSfxError();
        return { valid: false, message };
      }
    },
    [isProductOwned, product.documentId, product.id],
  );

  const handleRemoveCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponErrorMessage(null);
    setCouponStatus("idle");
  }, []);

  // A coupon can only reduce money that is actually charged. Free
  // products (admin `isFree` switch or a ₹0 effective price) never
  // render the coupon field anywhere on the PDP.
  const productIsFree = isFreeProduct(product);
  const canShowCouponInput = shouldShowCouponInput({
    purchaseKind: "full_product",
    payablePaise: Math.round((product.price || 0) * 100),
    isFree: productIsFree,
  });

  // If a product becomes free (or the buyer already owns it) while a
  // coupon was applied, drop the code so nothing stale is carried
  // into checkout.
  useEffect(() => {
    if (!canShowCouponInput && appliedCoupon) {
      setAppliedCoupon(null);
      setCouponErrorMessage(null);
      setCouponStatus("idle");
    }
  }, [canShowCouponInput, appliedCoupon]);

  const submitReview = async () => {
    if (!user) {
      window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(window.location.hash)}`;
      return;
    }
    const comment = reviewComment.trim();
    if (comment.length < 10) {
      setReviewNotice("Please write at least 10 characters.");
      return;
    }
    setReviewSubmitting(true);
    setReviewNotice("");
    const payload = {
      productId: product.id,
      productTitle: product.title,
      customerId: user.id,
      userId: user.id,
      uid: user.id,
      customerName: user.name,
      rating: Math.round(Number(reviewRating)) || 5,
      comment,
      verifiedPurchase: Boolean(isProductOwned),
    };
    try {
      let createdId = "";
      try {
        const ref = await addDoc(collection(db, "siteReviews"), { ...payload, status: "published", createdAt: serverTimestamp() });
        createdId = ref.id;
      } catch {
        const token = await import("../firebase").then((module) => module.auth.currentUser?.getIdToken(true));
        if (!token) throw new Error("Login is required.");
        const response = await apiFetch("/api/reviews/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; id?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || "Review could not be saved.");
        createdId = data.id || "";
      }
      // Show the review immediately at the top before the live snapshot syncs.
      const reviewId = createdId || `local-${Date.now()}`;
      const optimisticReview: PublishedProductReview = {
        id: reviewId,
        productId: product.id,
        productTitle: product.title,
        name: user.name || "Learner",
        initials: initials(user.name || "Learner"),
        avatarColor: "bg-indigo-500",
        rating: payload.rating,
        comment,
        createdAtMs: Date.now(),
        date: "Just now",
        verifiedPurchase: payload.verifiedPurchase,
        source: "live",
      };
      setLocalReviews((existing) => [optimisticReview, ...existing.filter((review) => review.id !== reviewId)]);
      setReviewComment("");
      setReviewComposerOpen(false);
      playSfxSuccess();
      setReviewNotice("Review added. Your rating now counts toward this product.");
    } catch (error) {
      console.error("Review submission failed", error);
      playSfxError();
      setReviewNotice("Review could not be submitted. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const autoHighlights = [
    modulesCount > 0 ? `${modulesCount} structured module${modulesCount === 1 ? "" : "s"}` : null,
    resourceCount > 0 ? `${resourceCount} downloadable or streaming resource${resourceCount === 1 ? "" : "s"}` : null,
    "Access from your purchases library",
    "Available on mobile and desktop",
    "Account-linked secure delivery",
    product.paidUpdates?.length ? `${product.paidUpdates.length} published course update${product.paidUpdates.length === 1 ? "" : "s"}` : null,
  ].filter((item): item is string => Boolean(item));
  // "What's included" is curated in the product editor. When the merchant has
  // configured custom bullets, those are shown verbatim; otherwise we fall back
  // to the modules/resources summary so the section never shows unrelated text.
  const highlights = product.features?.length ? product.features : autoHighlights;

  return (
    <div data-pdp-root className="relative pb-5 text-white">

      <div className="relative">
        <nav data-pdp-loose className="flex flex-wrap items-center gap-1.5 px-4 pt-4 text-[11px] text-white/55">
          <button type="button" onClick={onBack} className="transition hover:text-white">Store</button>
          <ChevronRight className="h-3 w-3 text-white/40" />
          <span>{product.category}</span>
          <ChevronRight className="h-3 w-3 text-white/40" />
          <span className="max-w-[190px] truncate font-medium text-white">{product.title}</span>
        </nav>

        <div className="space-y-6 px-4 pb-8 pt-4">
          <section className="flex flex-col gap-3">
            <GlassSurface radius={24} className="group relative overflow-hidden" contentClassName="relative">
              <img src={selectedImage} alt={product.title} className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--dc-chrome-glass)] px-3 py-1.5 text-[10px] font-medium text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live catalog
              </div>
              <div className="absolute right-3 top-3 flex gap-2">
                <span className="relative inline-flex">
                  <EmojiBurstLayer particles={likeParticles} />
                <GlassButton type="button" onClick={() => { if (!favorite) likeBurst(); onToggleFavorite?.(product.id); }} aria-label="Save product" className="[&_.size-12]:size-9">
                  <Heart className={`h-4 w-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} />
                </GlassButton>
                </span>
                <GlassButton type="button" onClick={() => window.open(selectedImage, "_blank", "noopener,noreferrer")} aria-label="Open image" className="[&_.size-12]:size-9">
                  <Expand className="h-4 w-4" />
                </GlassButton>
              </div>
              <div className="absolute bottom-3 right-3 rounded-full bg-[var(--dc-chrome-glass)] px-3 py-1 text-[10px] font-medium text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">{activeImage + 1} / {gallery.length}</div>
            </GlassSurface>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((image, index) => (
                  <button key={`${image}-${index}`} onClick={() => setActiveImage(index)} className={`h-16 min-w-16 flex-1 overflow-hidden rounded-xl border-2 transition ${activeImage === index ? "border-white/80" : "border-transparent opacity-70"}`}>
                    <img src={image} alt={`${product.title} ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-5">
            <div data-pdp-loose className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">{product.category}</span>
                {product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-semibold text-orange-300">{tag}</span>)}
                <span className="text-[11px] text-white/55">by <span className="font-medium text-white/85">{product.instructor}</span></span>
              </div>
              <h1 className="text-2xl font-black leading-[1.2] tracking-tight dc-ink-1">{product.title}</h1>
              {/* Body copy steps down to ink-2 (readable) instead of ink-3 —
                  the description is content, not a caption. */}
              <p className="text-sm leading-relaxed dc-ink-2">{product.description || `A focused ${product.category.toLowerCase()} resource for practical learning and measurable progress.`}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <RatingStars rating={product.rating} />
                <span className="font-bold dc-ink-1">{product.rating.toFixed(1)}</span>
                <a href="#product-reviews" className="dc-ink-3 underline underline-offset-2">({product.reviews.toLocaleString("en-IN")} ratings)</a>
                {product.reviews >= 25 ? <span className="dc-proof">🔥 {product.reviews.toLocaleString("en-IN")} learners rated this</span> : null}
              </div>
            </div>

            <GlassSurface radius={16} className="text-white/85" contentClassName="grid grid-cols-2 gap-2 p-3 text-[11px]">
              <Meta icon={Clock} text={product.classLevel} />
              <Meta icon={BarChart3} text={product.subject} />
              <Meta icon={Globe} text={product.category} />
              <Meta icon={BadgeCheck} text={`${modulesCount} modules`} />
            </GlassSurface>

            {isProductOwned ? (
              availablePaidUpdates.length > 0 ? (
                <GlassSurface data-pdp-upgrade-box radius={24} className="relative overflow-hidden text-white" contentClassName="p-5">
                  <div className="relative flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white">
                      <Zap size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[11px] font-black uppercase tracking-wider text-indigo-300">Course upgrade available</p>
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-200">Premium content update</span>
                      </div>
                      <h2 className="mt-0.5 text-base font-black text-white">{availablePaidUpdates[0].title}</h2>
                      <p className="mt-1 text-xs leading-5 text-white/85">New modules or files were added after your original purchase. Review exactly what is new before upgrading.</p>
                    </div>
                  </div>
                  <button onClick={handleBuyUpgrade} className="relative mt-4 w-full rounded-full bg-indigo-600 py-3 text-sm font-black text-white transition hover:bg-indigo-500 active:scale-[0.99]">
                    Buy upgrade · {formatPrice(availablePaidUpdates[0].cashPrice)}
                  </button>
                  {onOpenCourse ? (
                    <GlassButton variant="capsule" type="button" onClick={() => onOpenCourse(product)} className="mt-2.5 w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:gap-1.5 [&>span>div]:text-xs [&>span>div]:font-bold">
                      <PlayCircle className="h-4 w-4" /> Open course in library
                    </GlassButton>
                  ) : null}
                </GlassSurface>
              ) : null
            ) : (
              <GlassSurface radius={24} className="relative overflow-visible text-white" contentClassName="p-5">
                {/* Anchoring: the struck reference price is read first and
                    quietly, so the payable figure lands as the relief. The
                    saving is stated in rupees (loss aversion) rather than as a
                    bare percentage. */}
                <div className="relative flex flex-wrap items-end gap-x-2 gap-y-1">
                  {product.originalPrice > product.price && <span className="mb-1.5 text-base dc-anchor-price">{formatPrice(product.originalPrice)}</span>}
                  <span className="text-4xl tracking-tight dc-hero-price">{formatPrice(product.price)}</span>
                  {discount > 0 && <span className="dc-save-pill mb-1.5">Save {formatPrice(product.originalPrice - product.price)} · {discount}%</span>}
                </div>
                {/* Transparency bias: state exactly what the money buys before
                    asking for the tap. */}
                <ul className="relative mt-3 flex flex-col gap-1.5" aria-label="What you get">
                  <li className="flex items-center gap-2 text-[11.5px] font-semibold dc-ink-2">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    One-time payment — lifetime access from your purchases library.
                  </li>
                  <li className="flex items-center gap-2 text-[11.5px] font-semibold dc-ink-2">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
                    Unlocks instantly after checkout, on mobile and desktop.
                  </li>
                </ul>
                <div className="relative mt-5 flex gap-3">
                  <button disabled={unavailable} onClick={primaryAction} className="dc-focusable group flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-[var(--dc-elev-accent)] transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-amber-500/30 disabled:text-amber-200 active:scale-[0.98]">
                    <Zap className="h-4 w-4 fill-current" /> {unavailable ? "Coming soon" : `Get it for ${formatPrice(product.price)}`}
                  </button>
                  <GlassButton variant="capsule" type="button" disabled={inCart || unavailable} onClick={() => !unavailable && onAddToCart?.(product.id)} className="flex-1 disabled:opacity-60 [&>span>div]:h-12 [&>span>div]:w-full [&>span>div]:gap-2 [&>span>div]:px-3 [&>span>div]:text-sm [&>span>div]:font-bold">
                    <ShoppingCart className="h-4 w-4" /> {unavailable ? "Not for sale" : inCart ? "In Cart" : "Add to my cart"}
                  </GlassButton>
                </div>
                <div className="relative mt-3 flex justify-end">
                  <div ref={shareRef} className="relative">
                    <GlassButton type="button" onClick={() => setShareOpen((value) => !value)} aria-label="Share product" className="[&_.size-12]:size-10"><Share2 className="h-4 w-4" /></GlassButton>
                    {/* Wave 10: the share menu is the pack popover material (GlassSurface
                        radius 20) with the pack's own PopoverItem rows — no painted row plates. */}
                    <GlassSurface data-product-share radius={20} className="absolute right-0 top-12 z-50 w-60 text-white" contentClassName="py-1" hidden={!shareOpen}>
                      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-white/55">Share this product</p>
                      <PopoverItem onClick={() => void shareNative()} className="text-xs font-medium"><Share2 className="h-3.5 w-3.5" /> Share via device</PopoverItem>
                      <PopoverItem onClick={() => shareTo("whatsapp")} className="text-xs font-medium"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</PopoverItem>
                      <PopoverItem onClick={() => shareTo("telegram")} className="text-xs font-medium"><Send className="h-3.5 w-3.5" /> Telegram</PopoverItem>
                      <PopoverItem onClick={() => void copyLink()} className="justify-between text-xs font-medium"><span className="flex items-center gap-3"><Copy className="h-3.5 w-3.5" /> Copy product link</span>{copied && <Check className="h-3.5 w-3.5 text-emerald-400" />}</PopoverItem>
                    </GlassSurface>
                  </div>
                </div>
              </GlassSurface>
            )}

            {/* Thumb zone: once the buy box scrolls away the primary action
                follows the user down the page, parked where the thumb rests
                and clear of the (unchanged) footer dock. */}
            {!isProductOwned && !unavailable ? (
              <div data-pdp-thumb-bar className="dc-thumb-bar flex items-center gap-3 md:hidden">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] dc-hero-price">{formatPrice(product.price)}</span>
                  {product.originalPrice > product.price ? (
                    <span className="text-[10.5px] dc-anchor-price">{formatPrice(product.originalPrice)}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={primaryAction}
                  className="dc-focusable flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow-[var(--dc-elev-accent)] transition hover:bg-indigo-500 active:scale-[0.98]"
                >
                  <Zap className="h-4 w-4 fill-current" /> Get it now
                </button>
              </div>
            ) : null}

            {unavailable && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/15 p-4 text-sm text-amber-200 backdrop-blur-xl">
                This product is published for preview, but checkout is not enabled yet.
              </div>
            )}

            {!isProductOwned && !unavailable && canShowCouponInput && (
              <GlassSurface radius={16} className="text-white" contentClassName="p-4">
                <PromoCodeInput
                  kind="coupon"
                  label="Have a coupon? Enter the code below."
                  placeholder="Enter coupon code"
                  appliedCode={appliedCoupon?.code ?? null}
                  appliedMessage={appliedCoupon?.label ?? null}
                  errorMessage={couponStatus === "error" ? couponErrorMessage : null}
                  onApply={handleApplyCoupon}
                  onRemove={handleRemoveCoupon}
                />
              </GlassSurface>
            )}

          </section>

          {!isProductOwned && !unavailable && (
            <section id="pdp-purchase-options" className="scroll-mt-32">
              <div className="mb-3 px-1"><h2 className="text-lg font-black dc-ink-1">Build your purchase</h2><p className="text-xs dc-ink-3">Same as subscription extras: tick the modules you need, see the price beside each one, then checkout.</p></div>
              <PdpPurchaseBuilder
                product={product}
                isProductOwned={isProductOwned}
                ownedUpdateIds={updates}
                ownedModuleIds={ownedModuleIds}
                ownedResourceIds={ownedResourceIds}
                returnRoute={`#/product/${encodeURIComponent(product.id)}`}
                onPreview={handlePreview}
              />
            </section>
          )}

          <DetailsCard product={product} modules={modules} curriculumMode={curriculumMode} highlights={highlights} tab={activeTab} onTab={setActiveTab} expandedModule={expandedModule} onExpandModule={setExpandedModule} />
          <ReviewsCard
            product={product}
            reviews={productReviews}
            canReview={Boolean(user)}
            composerOpen={reviewComposerOpen}
            rating={reviewRating}
            comment={reviewComment}
            submitting={reviewSubmitting}
            notice={reviewNotice}
            onToggleComposer={() => setReviewComposerOpen((open) => !open)}
            onRating={setReviewRating}
            onComment={setReviewComment}
            onSubmit={() => void submitReview()}
          />
          {related.length > 0 && <RelatedProducts products={related} onNavigate={onNavigateToProduct} />}
        </div>
      </div>
    </div>
  );
}

function DetailsCard({ product, modules, curriculumMode, highlights, tab, onTab, expandedModule, onExpandModule }: { product: Product; modules: CurriculumModule[]; curriculumMode: CurriculumViewMode; highlights: string[]; tab: DetailTab; onTab: (tab: DetailTab) => void; expandedModule: string | null; onExpandModule: (id: string | null) => void }) {
  const tabs: DetailTab[] = ["Description", "Curriculum", "Instructor"];
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tabBarStuck, setTabBarStuck] = useState(false);

  // Magnet behaviour: the tab bar is sticky inside the PDP scroll container,
  // so it sticks just below the app header while the user scrolls through the
  // card. A 1px sentinel above the bar flips the "stuck" styling the moment
  // the bar reaches the top edge.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const root = sentinel.closest<HTMLElement>("[data-pdp-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setTabBarStuck(!entry.isIntersecting);
      },
      { root: root || null, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <GlassSurface radius={24} className="overflow-hidden text-white" contentClassName="relative">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        data-pdp-tabbar
        className={`sticky top-0 z-30 px-3 pb-2 pt-3 backdrop-blur-xl transition-shadow duration-200 ${tabBarStuck ? "bg-[var(--dc-chrome-glass)]" : "rounded-t-[23px]"}`}
      >
        {/* Wave 3 (commerce): the tab strip is the pack's `glass-toggle-group`,
            the same control the store filter row uses — one sliding droplet
            instead of repainting a white pill per click. The sticky bar around it
            (`data-pdp-tabbar`, its stuck shadow, `rounded-t-[23px]`) is untouched,
            and so is every `data-pdp-curriculum*` hook. `dc-segment` is the
            light-theme ink in src/glass.css. */}
        <div className="flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <GlassToggleGroup
            className="dc-segment shrink-0"
            value={tab}
            onValueChange={(next) => onTab(next as DetailTab)}
            aria-label="Product details"
          >
            {tabs.map((item) => (
              <GlassToggleItem key={item} value={item} className="whitespace-nowrap px-3.5 py-2 text-xs font-semibold">
                {item}
              </GlassToggleItem>
            ))}
          </GlassToggleGroup>
        </div>
      </div>
      <div className="p-4 pt-3">
        {tab === "Description" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-white/85">{product.description || `Complete information for ${product.title}.`}</p>
            {highlights.length > 0 && (
              <GlassCard contentClassName="p-4">
                <p className="mb-3 text-sm font-semibold text-white">What's included</p>
                <ul className="space-y-2.5">
                  {highlights.map((highlight) => <li key={highlight} className="flex items-start gap-2 text-sm text-white/85"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{highlight}</li>)}
                </ul>
              </GlassCard>
            )}
          </div>
        )}
        {tab === "Curriculum" && (
          modules.length === 0 ? (
            <EmptyDetail text={curriculumMode === "paid-upgrade" ? "Every published upgrade is already in your library." : "No curriculum has been published for this product yet."} />
          ) : (
            <div className="space-y-3" data-pdp-curriculum data-pdp-curriculum-mode={curriculumMode}>
              {curriculumMode === "paid-upgrade" ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/15 px-3.5 py-3" data-pdp-curriculum-upgrade-hint>
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-200">Paid upgrades</p>
                  <p className="mt-1 text-xs leading-5 text-amber-200/75">These modules stay locked after the course purchase. Unlock them with a paid upgrade — they look different here so they are never mixed with included lessons.</p>
                </div>
              ) : null}
              <div className="space-y-2">
                {modules.map((module, index) => (
                  <CurriculumModuleRow key={module.id || `${module.title}-${index}`} module={module} index={index} expandedModule={expandedModule} onExpandModule={onExpandModule} />
                ))}
              </div>
            </div>
          )
        )}
        {tab === "Instructor" && <div className="flex items-start gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">{initials(product.instructor)}</div><div><p className="font-bold text-white">{product.instructor}</p><p className="text-xs text-white/55">Creator of {product.title}</p><p className="mt-2 text-sm leading-relaxed text-white/55">Instructor information is synced from this live product's catalog record.</p></div></div>}
      </div>
    </GlassSurface>
  );
}

function CurriculumModuleRow({ module, index, expandedModule, onExpandModule, depth = 0 }: { module: CurriculumModule; index: number; expandedModule: string | null; onExpandModule: (id: string | null) => void; depth?: number }) {
  const open = expandedModule === module.id;
  const childModules = module.modules || [];
  const resources = module.resources || [];
  const paid = Boolean(module.paid);
  /* Wave 10: each module is the pack GlassAccordion (tint 0.4, radius 18), driven
     by the same single `expandedModule` state as before, so only one module is
     open at a time across every nesting level. A paid upgrade keeps its amber
     meaning colour on the rim + text; the material itself is the pack's. */
  return (
    <GlassAccordion
      type="single"
      value={open ? [module.id] : []}
      onValueChange={(next) => onExpandModule(next.includes(module.id) ? module.id : null)}
      className={paid ? "border border-amber-400/30 bg-amber-500/15" : ""}
      style={{ marginLeft: depth ? depth * 12 : 0 }}
      data-pdp-curriculum-module
      data-module-id={module.id}
      data-paid={paid ? "true" : "false"}
    >
      <GlassAccordionItem value={module.id} className="px-3">
        <GlassAccordionTrigger className="gap-3 py-3">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${paid ? "bg-amber-500" : "bg-indigo-600"}`}>{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-semibold ${paid ? "text-amber-100" : "text-white"}`}>{module.title}</span>
            {paid ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200">
                  <LockKeyhole className="h-2.5 w-2.5" /> Paid upgrade
                </span>
                {module.paidUpdatePrice ? <span className="text-[10px] font-bold text-amber-200">{module.paidUpdatePrice}</span> : null}
              </span>
            ) : null}
          </span>
          <span className={`text-[10px] ${paid ? "text-amber-200/70" : "text-white/55"}`}>{resources.length} resources{childModules.length ? ` · ${childModules.length} modules` : ""}</span>
          {paid ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : null}
        </GlassAccordionTrigger>
        <GlassAccordionContent className="space-y-2 pb-3">
          {resources.map((resource) => (
            <div key={resource.id} className={`flex items-center gap-2 text-xs ${paid ? "text-amber-200/70" : "text-white/55"}`}>
              <PlayCircle className={`h-4 w-4 ${paid ? "text-amber-400" : "text-white/40"}`} />
              <span className="min-w-0 flex-1 truncate">{resource.name}</span>
              <span className={`uppercase text-[9px] ${paid ? "text-amber-300/70" : "text-white/55"}`}>{resource.type}</span>
            </div>
          ))}
          {childModules.map((child, childIndex) => (
            <CurriculumModuleRow key={child.id || `${module.id}-${childIndex}`} module={child} index={childIndex} expandedModule={expandedModule} onExpandModule={onExpandModule} depth={depth + 1} />
          ))}
          {resources.length === 0 && childModules.length === 0 ? <p className={`text-xs ${paid ? "text-amber-200/70" : "text-white/55"}`}>Module details will appear here when published.</p> : null}
        </GlassAccordionContent>
      </GlassAccordionItem>
    </GlassAccordion>
  );
}

const REVIEW_PAGE_SIZE = 6;

function ReviewsCard({ product, reviews, canReview, composerOpen, rating, comment, submitting, notice, onToggleComposer, onRating, onComment, onSubmit }: {
  product: Product;
  reviews: PublishedProductReview[];
  canReview: boolean;
  composerOpen: boolean;
  rating: number;
  comment: string;
  submitting: boolean;
  notice: string;
  onToggleComposer: () => void;
  onRating: (rating: number) => void;
  onComment: (comment: string) => void;
  onSubmit: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(REVIEW_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(REVIEW_PAGE_SIZE);
  }, [product.id]);
  const visibleReviews = reviews.slice(0, visibleCount);
  const remaining = Math.max(0, reviews.length - visibleCount);
  return (
    <GlassSurface id="product-reviews" radius={24} className="scroll-mt-36 text-white" contentClassName="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">Ratings & Reviews</h2>
        <button onClick={onToggleComposer} className="rounded-full bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-indigo-500">{composerOpen ? "Cancel" : canReview ? "Write a review" : "Review eligibility"}</button>
      </div>
      <GlassCard className="mt-5" contentClassName="flex items-center gap-5 p-5">
        <div className="text-center"><span className="text-4xl font-extrabold text-white">{product.rating.toFixed(1)}</span><RatingStars rating={product.rating} className="mt-1" /></div>
        <div className="h-14 w-px bg-white/[0.12]" />
        <div><p className="text-sm font-semibold text-white/85">{product.reviews.toLocaleString("en-IN")} rating{product.reviews === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-white/55">Live aggregate from the product catalog</p></div>
      </GlassCard>
      {composerOpen && (
        <GlassCard className="mt-4" contentClassName="p-4">
          {canReview ? (
            <>
              <p className="text-xs font-semibold text-white/85">Your rating</p>
              <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <GlassButton key={value} onClick={() => onRating(value)} aria-label={`${value} stars`} aria-pressed={value <= rating} className="[&_.size-12]:size-9"><Star className={`h-5 w-5 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-white/40"}`} /></GlassButton>)}</div>
              <textarea value={comment} onChange={(event) => onComment(event.target.value.slice(0, 2000))} rows={4} placeholder="Share your experience with this product…" className="dc-field mt-3 w-full resize-none rounded-2xl p-3 text-sm text-white outline-none placeholder:text-white/40" />
              <button disabled={submitting} onClick={onSubmit} className="mt-3 w-full rounded-full bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60">{submitting ? "Submitting…" : "Submit for review"}</button>
            </>
          ) : <p className="text-xs leading-relaxed text-white/55">Sign in to submit a genuine learner review. It is saved online in Firestore.</p>}
        </GlassCard>
      )}
      {notice && <p className="mt-3 rounded-xl bg-indigo-500/15 p-3 text-xs font-medium text-indigo-200">{notice}</p>}
      {reviews.length > 0 ? (
        <div className="mt-4 space-y-3">
          {visibleReviews.map((review) => (
            <GlassCard key={review.id} contentClassName="p-4">
              <article>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}>{review.initials}</div>
                       <div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-semibold text-white"><span className="truncate">{review.name}</span>{review.verifiedPurchase && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}</p><p className="text-[11px] text-white/55">{review.date}</p></div>
                <RatingStars rating={review.rating} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/85">“{review.comment}”</p>
              </article>
            </GlassCard>
          ))}
          {remaining > 0 ? (
            <GlassButton
              variant="capsule"
              type="button"
              data-load-more-reviews
              onClick={() => setVisibleCount((count) => count + REVIEW_PAGE_SIZE)}
              className="w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-bold"
            >
              Load more · {Math.min(REVIEW_PAGE_SIZE, remaining)} of {remaining} remaining
            </GlassButton>
          ) : null}
        </div>
      ) : <p className="mt-4 text-center text-xs text-white/55">Published written reviews will appear here when available.</p>}
    </GlassSurface>
  );
}

function RelatedProducts({ products, onNavigate }: { products: Product[]; onNavigate?: (product: Product) => void }) {
  return (
    <GlassSurface radius={24} className="text-white" contentClassName="p-5">
      <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black dc-ink-1">You may also like</h2><p className="dc-section-label">Matched from the live catalog</p></div><ArrowUpRight className="h-4 w-4 text-white/55" /></div>
      <div className="space-y-3">{products.map((item) => <GlassCard key={item.id} role="button" tabIndex={0} onClick={() => onNavigate?.(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate?.(item); } }} aria-label={`View ${item.title}`} className="group w-full cursor-pointer overflow-hidden text-left transition hover:-translate-y-0.5" contentClassName="flex p-0"><img src={item.image} alt={item.title} className="h-24 w-28 shrink-0 object-cover transition duration-500 group-hover:scale-105" /><span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3"><span className="line-clamp-2 text-sm font-semibold text-white">{item.title}</span><span className="flex items-center gap-1 text-xs text-white/55"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {item.rating.toFixed(1)} · {item.category}</span><span className="font-bold text-white">{formatPrice(item.price)}</span></span></GlassCard>)}</div>
    </GlassSurface>
  );
}

function RatingStars({ rating, className = "" }: { rating: number; className?: string }) {
  return <span className={`flex items-center gap-0.5 ${className}`}>{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-3.5 w-3.5 ${rating >= index + 0.5 ? "fill-amber-400 text-amber-400" : "text-white/40"}`} />)}</span>;
}

function Meta({ icon: Icon, text }: { icon: typeof Clock; text: string }) { return <div className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-white/55" /><span className="truncate">{text}</span></div>; }
function EmptyDetail({ text }: { text: string }) { return <GlassCard contentClassName="flex flex-col items-center py-8 text-center"><PackageOpen className="h-7 w-7 text-white/40" /><p className="mt-2 px-5 text-xs text-white/55">{text}</p></GlassCard>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DC"; }

const asCurriculumModule = (raw: unknown, product: Product, paidModuleIds: Set<string>): CurriculumModule | null => {
  if (!raw || typeof raw !== "object") return null;
  const module = raw as Record<string, unknown>;
  if (module.visibility === "hidden" || module.active === false || module.accessLevel === "hidden") return null;
  const id = String(module.id || module.title || "");
  const title = String(module.title || "Untitled module");
  if (!id && !title) return null;
  const resourceSource = Array.isArray(module.resources) ? module.resources : Array.isArray(module.files) ? module.files : [];
  const resources = resourceSource.map((item, index) => {
    const resource = (item || {}) as Record<string, unknown>;
    if (resource.visibility === "hidden" || resource.accessLevel === "hidden") return null;
    return {
      id: String(resource.id || `${id}-r-${index}`),
      name: String(resource.name || resource.title || "Resource"),
      type: String(resource.type || "file"),
    };
  }).filter((resource): resource is { id: string; name: string; type: string } => resource !== null);
  const modules = (Array.isArray(module.modules) ? module.modules : []).map((child) => asCurriculumModule(child, product, paidModuleIds)).filter((item): item is CurriculumModule => Boolean(item));
  const paid = isPaidUpgradeModule(module, paidModuleIds);
  const update = paid ? resolvePaidUpdateForModule(module, product.paidUpdates || []) : null;
  const paidUpdateId = String(module.paidUpdateId || update?.id || "");
  const paidUpdateTitle = String(module.paidUpdateTitle || update?.title || "");
  const paidUpdatePrice = String(module.paidUpdatePrice || (update && Number(update.cashPrice) > 0 ? `₹${Number(update.cashPrice).toLocaleString("en-IN")}` : "") || "");
  return {
    id: id || title,
    title,
    paid,
    paidUpdateId: paidUpdateId || undefined,
    paidUpdateTitle: paidUpdateTitle || undefined,
    paidUpdatePrice: paidUpdatePrice || undefined,
    resources,
    modules,
  };
};

export const collectCurriculumModules = (product: Product): CurriculumModule[] => {
  const paidModuleIds = collectPaidModuleIdSet(product.paidUpdates || []);
  const canonical = (product.canonicalModules || []).map((item) => asCurriculumModule(item, product, paidModuleIds)).filter((item): item is CurriculumModule => Boolean(item));
  if (canonical.length > 0) return canonical;
  return (product.courseContent || []).map((item) => asCurriculumModule(item, product, paidModuleIds)).filter((item): item is CurriculumModule => Boolean(item));
};


const curriculumContainsId = (modules: CurriculumModule[], id: string): boolean =>
  modules.some((module) => module.id === id || curriculumContainsId(module.modules || [], id));

export const countCurriculumResources = (modules: CurriculumModule[]): number =>
  modules.reduce((sum, module) => sum + (module.resources?.length || 0) + countCurriculumResources(module.modules || []), 0);
function MissingProduct({ onBack }: { onBack: () => void }) { return <div className="grid min-h-[70vh] place-items-center px-6 text-center"><div><ShoppingBag className="mx-auto h-12 w-12 text-white/40" /><h1 className="mt-4 text-2xl font-black text-white">Product not found</h1><p className="mt-2 text-sm text-white/55">It may have been hidden or removed from the live catalog.</p><button onClick={onBack} className="mt-6 rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-500">Back to store</button></div></div>; }
