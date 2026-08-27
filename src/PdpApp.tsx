import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
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
    <div className="min-h-screen bg-white sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200 md:max-w-none md:rounded-none md:border-0 md:shadow-none md:bg-transparent">
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
        const response = await fetch("/api/quotes/create", {
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
        const response = await fetch("/api/reviews/create", {
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
    <div className="relative bg-gradient-to-b from-indigo-50 via-slate-50 to-white pb-5 text-zinc-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-gradient-to-br from-violet-300/40 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-64 w-64 rounded-full bg-gradient-to-bl from-sky-300/35 to-transparent blur-3xl" />
        <div className="absolute bottom-24 -left-20 h-64 w-64 rounded-full bg-gradient-to-tr from-fuchsia-200/35 to-transparent blur-3xl" />
      </div>

      <div className="relative">
        <nav className="flex flex-wrap items-center gap-1.5 px-4 pt-4 text-[11px] text-zinc-500">
          <button onClick={onBack} className="transition hover:text-zinc-900">Store</button>
          <ChevronRight className="h-3 w-3 text-zinc-300" />
          <span>{product.category}</span>
          <ChevronRight className="h-3 w-3 text-zinc-300" />
          <span className="max-w-[190px] truncate font-medium text-zinc-900">{product.title}</span>
        </nav>

        <div className="space-y-6 px-4 pb-8 pt-4">
          <section className="flex flex-col gap-3">
            <div className="group relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white/70 via-indigo-50/60 to-violet-100/60 shadow-[0_18px_50px_-18px_rgba(79,70,229,0.5)] backdrop-blur-xl">
              <img src={selectedImage} alt={product.title} className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-medium text-white backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live catalog
              </div>
              <div className="absolute right-3 top-3 flex gap-2">
                <button onClick={() => onToggleFavorite?.(product.id)} aria-label="Save product" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-zinc-700 shadow-md backdrop-blur-md transition active:scale-95">
                  <Heart className={`h-4 w-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} />
                </button>
                <a href={selectedImage} target="_blank" rel="noreferrer" aria-label="Open image" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-zinc-700 shadow-md backdrop-blur-md">
                  <Expand className="h-4 w-4" />
                </a>
              </div>
              <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-[10px] font-medium text-white backdrop-blur-md">{activeImage + 1} / {gallery.length}</div>
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((image, index) => (
                  <button key={`${image}-${index}`} onClick={() => setActiveImage(index)} className={`h-16 min-w-16 flex-1 overflow-hidden rounded-xl border-2 shadow-sm transition ${activeImage === index ? "border-zinc-900" : "border-transparent opacity-70"}`}>
                    <img src={image} alt={`${product.title} ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">{product.category}</span>
                {product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-600">{tag}</span>)}
                <span className="text-[11px] text-zinc-400">by <span className="font-medium text-zinc-600">{product.instructor}</span></span>
              </div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-zinc-900">{product.title}</h1>
              <p className="text-sm leading-relaxed text-zinc-500">{product.description || `A focused ${product.category.toLowerCase()} resource for practical learning and measurable progress.`}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <RatingStars rating={product.rating} />
                <span className="font-semibold text-zinc-800">{product.rating.toFixed(1)}</span>
                <a href="#product-reviews" className="text-zinc-400 underline underline-offset-2">({product.reviews.toLocaleString("en-IN")} ratings)</a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/70 bg-white/55 p-3 text-[11px] text-zinc-600 shadow-lg shadow-indigo-200/30 backdrop-blur-xl">
              <Meta icon={Clock} text={product.classLevel} />
              <Meta icon={BarChart3} text={product.subject} />
              <Meta icon={Globe} text={product.category} />
              <Meta icon={BadgeCheck} text={`${modulesCount} modules`} />
            </div>

            {isProductOwned ? (
              availablePaidUpdates.length > 0 ? (
                <section data-pdp-upgrade-box className="relative overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-[0_10px_50px_-15px_rgba(99,102,241,0.35)]">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-indigo-200/40 blur-2xl" />
                  <div className="relative flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200">
                      <Zap size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Course upgrade available</p>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-700">Premium content update</span>
                      </div>
                      <h2 className="mt-0.5 text-base font-black text-zinc-900">{availablePaidUpdates[0].title}</h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">New modules or files were added after your original purchase. Review exactly what is new before upgrading.</p>
                    </div>
                  </div>
                  <button onClick={handleBuyUpgrade} className="relative mt-4 w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-black text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-[0.99]">
                    Buy upgrade · {formatPrice(availablePaidUpdates[0].cashPrice)}
                  </button>
                  {onOpenCourse ? (
                    <button onClick={() => onOpenCourse(product)} className="relative mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-indigo-200 bg-white/80 py-2.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50">
                      <PlayCircle className="h-4 w-4" /> Open course in library
                    </button>
                  ) : null}
                </section>
              ) : null
            ) : (
              <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_18px_55px_-18px_rgba(79,70,229,0.45)] backdrop-blur-2xl">
                <div className="relative flex flex-wrap items-end gap-2">
                  <span className="text-4xl font-extrabold tracking-tight text-zinc-900">{formatPrice(product.price)}</span>
                  {product.originalPrice > product.price && <span className="mb-1 text-base text-zinc-400 line-through">{formatPrice(product.originalPrice)}</span>}
                  {discount > 0 && <span className="mb-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">-{discount}%</span>}
                </div>
                <div className="relative mt-5 flex gap-3">
                  <button disabled={unavailable} onClick={primaryAction} className="group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_-10px_rgba(99,102,241,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-amber-200 disabled:via-amber-200 disabled:to-amber-300 disabled:text-amber-900 disabled:shadow-none active:scale-[0.98]">
                    <Zap className="h-4 w-4 fill-current" /> {unavailable ? "Coming soon" : "Buy Now"}
                  </button>
                  <button disabled={inCart || unavailable} onClick={() => !unavailable && onAddToCart?.(product.id)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-3 py-3.5 text-sm font-bold text-indigo-700 shadow-lg shadow-indigo-200/40 backdrop-blur-xl transition hover:bg-white/85 disabled:opacity-60">
                    <ShoppingCart className="h-4 w-4" /> {unavailable ? "Not for sale" : inCart ? "In Cart" : "Add to Cart"}
                  </button>
                </div>
                <div className="relative mt-3 flex justify-end">
                  <div ref={shareRef} className="relative">
                    <button type="button" onClick={() => setShareOpen((value) => !value)} aria-label="Share product" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/65 text-indigo-600 shadow-md shadow-indigo-200/40 backdrop-blur-md transition hover:bg-white/90"><Share2 className="h-4 w-4" /></button>
                    <div data-product-share className="absolute right-0 top-12 z-50 w-60 rounded-2xl border border-white/70 bg-white/85 p-3 shadow-2xl shadow-indigo-900/20 backdrop-blur-2xl" hidden={!shareOpen}>
                      <p className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Share this product</p>
                      <div className="space-y-1.5">
                        <button type="button" onClick={() => void shareNative()} className="flex w-full items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-700"><Share2 className="h-3.5 w-3.5" /> Share via device</button>
                        <button type="button" onClick={() => shareTo("whatsapp")} className="flex w-full items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-700"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button>
                        <button type="button" onClick={() => shareTo("telegram")} className="flex w-full items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-700"><Send className="h-3.5 w-3.5" /> Telegram</button>
                        <button type="button" onClick={() => void copyLink()} className="flex w-full items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-700"><span className="flex items-center gap-2"><Copy className="h-3.5 w-3.5" /> Copy product link</span>{copied && <Check className="h-3.5 w-3.5 text-emerald-500" />}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {unavailable && (
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900 shadow-lg shadow-amber-200/30 backdrop-blur-xl">
                This product is published for preview, but checkout is not enabled yet.
              </div>
            )}

            {!isProductOwned && !unavailable && canShowCouponInput && (
              <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-lg shadow-indigo-200/30 backdrop-blur-xl">
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
              </div>
            )}

          </section>

          {!isProductOwned && !unavailable && (
            <section id="pdp-purchase-options" className="scroll-mt-32">
              <div className="mb-3 px-1"><h2 className="text-lg font-bold text-zinc-900">Select course modules</h2><p className="text-xs text-zinc-500">Same as subscription extras: tick the modules you need, see the price beside each one, then checkout.</p></div>
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
    <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/60 shadow-[0_16px_45px_-20px_rgba(49,46,129,0.55)] backdrop-blur-xl">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        data-pdp-tabbar
        className={`sticky top-0 z-30 bg-white/95 px-3 pb-2 pt-3 backdrop-blur transition-shadow duration-200 ${tabBarStuck ? "shadow-[0_10px_24px_-12px_rgba(24,24,27,0.28)]" : "rounded-t-[23px]"}`}
      >
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-zinc-100/70 p-1.5">
          {tabs.map((item) => <button key={item} onClick={() => onTab(item)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${tab === item ? "bg-white text-zinc-900 shadow" : "text-zinc-500 hover:text-zinc-700"}`}>{item}</button>)}
        </div>
      </div>
      <div className="p-4 pt-3">
        {tab === "Description" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-zinc-600">{product.description || `Complete information for ${product.title}.`}</p>
            {highlights.length > 0 && (
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="mb-3 text-sm font-semibold text-zinc-900">What's included</p>
                <ul className="space-y-2.5">
                  {highlights.map((highlight) => <li key={highlight} className="flex items-start gap-2 text-sm text-zinc-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{highlight}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {tab === "Curriculum" && (
          modules.length === 0 ? (
            <EmptyDetail text={curriculumMode === "paid-upgrade" ? "Every published upgrade is already in your library." : "No curriculum has been published for this product yet."} />
          ) : (
            <div className="space-y-3" data-pdp-curriculum data-pdp-curriculum-mode={curriculumMode}>
              {curriculumMode === "paid-upgrade" ? (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white px-3.5 py-3" data-pdp-curriculum-upgrade-hint>
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">Paid upgrades</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/75">These modules stay locked after the course purchase. Unlock them with a paid upgrade — they look different here so they are never mixed with included lessons.</p>
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
        {tab === "Instructor" && <div className="flex items-start gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-700 via-zinc-500 to-zinc-800 text-lg font-bold text-white shadow-lg">{initials(product.instructor)}</div><div><p className="font-bold text-zinc-900">{product.instructor}</p><p className="text-xs text-zinc-500">Creator of {product.title}</p><p className="mt-2 text-sm leading-relaxed text-zinc-500">Instructor information is synced from this live product's catalog record.</p></div></div>}
      </div>
    </section>
  );
}

function CurriculumModuleRow({ module, index, expandedModule, onExpandModule, depth = 0 }: { module: CurriculumModule; index: number; expandedModule: string | null; onExpandModule: (id: string | null) => void; depth?: number }) {
  const open = expandedModule === module.id;
  const childModules = module.modules || [];
  const resources = module.resources || [];
  const paid = Boolean(module.paid);
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${paid ? "border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/70 to-white shadow-[0_8px_24px_-16px_rgba(180,83,9,0.55)]" : "border-zinc-100"}`}
      style={{ marginLeft: depth ? depth * 12 : 0 }}
      data-pdp-curriculum-module
      data-module-id={module.id}
      data-paid={paid ? "true" : "false"}
    >
      <button type="button" onClick={() => onExpandModule(open ? null : module.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left ${paid ? "bg-amber-100/40" : "bg-zinc-50/60"}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${paid ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-200" : "bg-gradient-to-br from-indigo-600 to-violet-600 shadow-indigo-200"}`}>{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${paid ? "text-amber-950" : "text-zinc-800"}`}>{module.title}</span>
          {paid ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
                <LockKeyhole className="h-2.5 w-2.5" /> Paid upgrade
              </span>
              {module.paidUpdatePrice ? <span className="text-[10px] font-bold text-amber-700">{module.paidUpdatePrice}</span> : null}
            </span>
          ) : null}
        </span>
        <span className={`text-[10px] ${paid ? "text-amber-700/70" : "text-zinc-400"}`}>{resources.length} resources{childModules.length ? ` · ${childModules.length} modules` : ""}</span>
        {paid ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""} ${paid ? "text-amber-500" : "text-zinc-400"}`} />
      </button>
      {open && (
        <div className="space-y-2 px-4 py-3">
          {resources.map((resource) => (
            <div key={resource.id} className={`flex items-center gap-2 text-xs ${paid ? "text-amber-900/70" : "text-zinc-500"}`}>
              <PlayCircle className={`h-4 w-4 ${paid ? "text-amber-400" : "text-zinc-300"}`} />
              <span className="min-w-0 flex-1 truncate">{resource.name}</span>
              <span className={`uppercase text-[9px] ${paid ? "text-amber-600/70" : "text-zinc-400"}`}>{resource.type}</span>
            </div>
          ))}
          {childModules.map((child, childIndex) => (
            <CurriculumModuleRow key={child.id || `${module.id}-${childIndex}`} module={child} index={childIndex} expandedModule={expandedModule} onExpandModule={onExpandModule} depth={depth + 1} />
          ))}
          {resources.length === 0 && childModules.length === 0 ? <p className={`text-xs ${paid ? "text-amber-700/70" : "text-zinc-400"}`}>Module details will appear here when published.</p> : null}
        </div>
      )}
    </div>
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
    <section id="product-reviews" className="scroll-mt-36 rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_16px_45px_-20px_rgba(49,46,129,0.55)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-zinc-900">Ratings & Reviews</h2>
        <button onClick={onToggleComposer} className="rounded-full bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white">{composerOpen ? "Cancel" : canReview ? "Write a review" : "Review eligibility"}</button>
      </div>
      <div className="mt-5 flex items-center gap-5 rounded-2xl border border-white/70 bg-gradient-to-br from-indigo-50/80 to-white/50 p-5 shadow-inner shadow-white/60 backdrop-blur-md">
        <div className="text-center"><span className="text-4xl font-extrabold text-zinc-900">{product.rating.toFixed(1)}</span><RatingStars rating={product.rating} className="mt-1" /></div>
        <div className="h-14 w-px bg-zinc-200" />
        <div><p className="text-sm font-semibold text-zinc-700">{product.reviews.toLocaleString("en-IN")} rating{product.reviews === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-zinc-400">Live aggregate from the product catalog</p></div>
      </div>
      {composerOpen && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          {canReview ? (
            <>
              <p className="text-xs font-semibold text-zinc-700">Your rating</p>
              <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => onRating(value)} aria-label={`${value} stars`}><Star className={`h-6 w-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} /></button>)}</div>
              <textarea value={comment} onChange={(event) => onComment(event.target.value.slice(0, 2000))} rows={4} placeholder="Share your experience with this product…" className="mt-3 w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm outline-none focus:border-zinc-400" />
              <button disabled={submitting} onClick={onSubmit} className="mt-3 w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white disabled:opacity-60">{submitting ? "Submitting…" : "Submit for review"}</button>
            </>
          ) : <p className="text-xs leading-relaxed text-zinc-500">Sign in to submit a genuine learner review. It is saved online in Firestore.</p>}
        </div>
      )}
      {notice && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs font-medium text-indigo-700">{notice}</p>}
      {reviews.length > 0 ? (
        <div className="mt-4 space-y-3">
          {visibleReviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-white/70 bg-white/55 p-4 shadow-sm shadow-indigo-200/25 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}>{review.initials}</div>
                       <div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-sm font-semibold text-zinc-800"><span className="truncate">{review.name}</span>{review.verifiedPurchase && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}</p><p className="text-[11px] text-zinc-400">{review.date}</p></div>
                <RatingStars rating={review.rating} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">“{review.comment}”</p>
            </article>
          ))}
          {remaining > 0 ? (
            <button
              type="button"
              data-load-more-reviews
              onClick={() => setVisibleCount((count) => count + REVIEW_PAGE_SIZE)}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-800 shadow-sm"
            >
              Load more · {Math.min(REVIEW_PAGE_SIZE, remaining)} of {remaining} remaining
            </button>
          ) : null}
        </div>
      ) : <p className="mt-4 text-center text-xs text-zinc-400">Published written reviews will appear here when available.</p>}
    </section>
  );
}

function RelatedProducts({ products, onNavigate }: { products: Product[]; onNavigate?: (product: Product) => void }) {
  return (
    <section className="rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_16px_45px_-20px_rgba(49,46,129,0.55)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-zinc-900">You may also like</h2><p className="text-[10px] text-zinc-400">Matched from the live catalog</p></div><ArrowUpRight className="h-4 w-4 text-zinc-400" /></div>
      <div className="space-y-3">{products.map((item) => <button key={item.id} onClick={() => onNavigate?.(item)} className="group flex w-full overflow-hidden rounded-2xl border border-white/70 bg-white/60 text-left shadow-md shadow-indigo-200/30 backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-xl hover:shadow-indigo-300/40"><img src={item.image} alt={item.title} className="h-24 w-28 shrink-0 object-cover transition duration-500 group-hover:scale-105" /><span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3"><span className="line-clamp-2 text-sm font-semibold text-zinc-800">{item.title}</span><span className="flex items-center gap-1 text-xs text-zinc-500"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {item.rating.toFixed(1)} · {item.category}</span><span className="font-bold text-zinc-900">{formatPrice(item.price)}</span></span></button>)}</div>
    </section>
  );
}

function RatingStars({ rating, className = "" }: { rating: number; className?: string }) {
  return <span className={`flex items-center gap-0.5 ${className}`}>{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-3.5 w-3.5 ${rating >= index + 0.5 ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />)}</span>;
}

function Meta({ icon: Icon, text }: { icon: typeof Clock; text: string }) { return <div className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-zinc-400" /><span className="truncate">{text}</span></div>; }
function EmptyDetail({ text }: { text: string }) { return <div className="flex flex-col items-center rounded-2xl bg-zinc-50 py-8 text-center"><PackageOpen className="h-7 w-7 text-zinc-300" /><p className="mt-2 px-5 text-xs text-zinc-400">{text}</p></div>; }
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
function MissingProduct({ onBack }: { onBack: () => void }) { return <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-6 text-center"><div><ShoppingBag className="mx-auto h-12 w-12 text-slate-300" /><h1 className="mt-4 text-2xl font-black text-slate-900">Product not found</h1><p className="mt-2 text-sm text-slate-500">It may have been hidden or removed from the live catalog.</p><button onClick={onBack} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to store</button></div></div>; }
