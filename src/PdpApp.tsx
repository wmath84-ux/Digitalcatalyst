import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmojiBurstLayer, useEmojiBurst } from "./components/ui/EmojiBurst";
import {
  GlassToggleGroup,
  GlassToggleItem,
} from "./components/ui/glass-toggle-group";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Expand,
  GraduationCap,
  Heart,
  Layers,
  LockKeyhole,
  MessageCircle,
  PackageOpen,
  PlayCircle,
  Send,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  X,
  Zap,
} from "lucide-react";
import Header from "./components/Header";
import { GlassSurface } from "./components/ui/glass";
import { useDragScroll } from "@/hooks/useDragScroll";
import { GlassButton } from "./components/ui/glass-button";
import { SimplePanel } from "./components/ui/SimplePanel";
import "./pdp-minimal.css";
import { PopoverItem } from "./components/ui/glass-popover";
import { GlassAccordion, GlassAccordionContent, GlassAccordionItem, GlassAccordionTrigger } from "./components/ui/glass-accordion";
import BottomNav, { type TabKey } from "./components/BottomNav";
import type { Product } from "./data/products";
import type { CheckoutSelection } from "./types/commerce";
import { buildCheckoutSelection, computeSummary } from "../utils/pdpSelection";
import { PaymentButton } from "./components/ui/PaymentButton";
import PdpPurchaseBuilder from "./components/pdp/PdpPurchaseBuilder";
import { useCourseAccess } from "./hooks/useCourseAccess";
import { usePublishedProductReviews, type PublishedProductReview } from "./hooks/useProductReviews";
import { fullDemoCourseContent } from "./data/demoCourseContent";
import { getProductClassLabel, getProductInstructorLabel, getProductPresentation, getProductSubjectLabel } from "./pdp/productPresentation";
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
  const subject = getProductSubjectLabel(product).toLowerCase();
  const classLevel = getProductClassLabel(product).toLowerCase();
  return catalog
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      const sharedTags = candidate.tags.reduce((count, tag) => count + (tags.has(tag.toLowerCase()) ? 1 : 0), 0);
      const candidateSubject = getProductSubjectLabel(candidate).toLowerCase();
      const candidateClassLevel = getProductClassLabel(candidate).toLowerCase();
      const score =
        (subject && subject === candidateSubject ? 8 : 0)
        + (candidate.category === product.category ? 5 : 0)
        + (classLevel && classLevel === candidateClassLevel ? 3 : 0)
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
        <main data-pdp-scroll className="min-h-0 flex-1 overflow-y-auto md:px-8">
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
  const { reviews: liveProductReviews } = usePublishedProductReviews(reviewCatalog);
  // Only moderation-published reviews whose product id matches this product
  // are eligible for the PDP; Home presentation placeholders never enter here.
  const [localReviews, setLocalReviews] = useState<PublishedProductReview[]>([]);
  const productReviews = useMemo(
    () => {
      const belongsToProduct = (review: PublishedProductReview) =>
        review.productId === product.id || review.productId === product.documentId;
      const local = localReviews.filter(belongsToProduct);
      const live = liveProductReviews.filter(belongsToProduct);
      const byId = new Map<string, PublishedProductReview>();
      // Locally-added reviews keep a just-submitted item visible until its
      // published Firestore snapshot arrives; a synced twin replaces it.
      for (const review of [...local, ...live]) byId.set(review.id, review);
      return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    },
    [liveProductReviews, localReviews, product.documentId, product.id],
  );
  const [activeImage, setActiveImage] = useState(0);
  const [failedImageSources, setFailedImageSources] = useState<Set<string>>(() => new Set());
  const [loadedImageSource, setLoadedImageSource] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const fullscreenCloseRef = useRef<HTMLButtonElement>(null);
  // Mouse parity: the gallery thumbs are a hidden-scrollbar rail, so a desktop
  // pointer drags it left/right like a thumb — and a drag never re-selects the
  // image it happens to end on.
  const thumbs = useDragScroll<HTMLDivElement>();
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

  const gallery = useMemo(() => getProductImageSources(product), [product]);
  const visibleGallery = gallery.filter((image) => !failedImageSources.has(image));
  const selectedImageIndex = Math.min(activeImage, Math.max(0, visibleGallery.length - 1));
  const selectedImage = visibleGallery[selectedImageIndex] || null;

  useEffect(() => {
    setActiveImage(0);
    setFailedImageSources(new Set());
    setLoadedImageSource(null);
    setExpandedImage(null);
  }, [product.id]);

  useEffect(() => {
    if (!expandedImage) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => fullscreenCloseRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [expandedImage]);

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
  const identity = getProductPresentation(product);
  const instructorLabel = getProductInstructorLabel(product);
  const related = useMemo(() => getRelatedProducts(product, products, 6), [product, products]);
  const discount = product.originalPrice > product.price && product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const collectedModules = useMemo(() => collectCurriculumModules(product), [product]);
  const includedCurriculum = useMemo(
    () => filterCurriculumForPdp(collectedModules, { isProductOwned: false, ownedUpdateIds: new Set() }).modules as CurriculumModule[],
    [collectedModules],
  );
  const { modules, mode: curriculumMode } = useMemo(
    () => filterCurriculumForPdp(collectedModules as unknown as CurriculumModule[], { isProductOwned, ownedUpdateIds: updates }) as { modules: CurriculumModule[]; mode: CurriculumViewMode },
    [collectedModules, isProductOwned, updates],
  );
  const { modulesCount } = useMemo(() => countCurriculumTree(includedCurriculum), [includedCurriculum]);

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
        await navigator.share({ title: identity.title, text: product.description?.trim() || identity.title, url });
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
    const text = encodeURIComponent(`${identity.title} — ${product.description?.trim() || `Learn on ${appName}`}`);
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
      setReviewNotice("Review added.");
    } catch (error) {
      console.error("Review submission failed", error);
      playSfxError();
      setReviewNotice("Review could not be submitted. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const classLabel = getProductClassLabel(product);
  const subjectLabel = identity.subjectLabel;
  const metadataItems = [
    classLabel ? { icon: classLabel.toLowerCase() === "lifetime access" ? BadgeCheck : GraduationCap, label: classLabel.toLowerCase() === "lifetime access" ? "Access" : "Level", text: classLabel } : null,
    subjectLabel ? { icon: BookOpen, label: "Subject", text: subjectLabel } : null,
    { icon: PackageOpen, label: "Format", text: identity.typeLabel },
    modulesCount > 0 ? { icon: Layers, label: "Curriculum", text: `${modulesCount} module${modulesCount === 1 ? "" : "s"}` } : null,
  ].filter((item): item is { icon: typeof BookOpen; label: string; text: string } => Boolean(item));
  const includedItems = buildIncludedSummaries(includedCurriculum, modulesCount);
  const ratingSummary = getProductRatingSummary(product, productReviews);
  const highlights = (product.features || []).map((feature) => feature.trim()).filter(Boolean);
  const hasPurchaseBuilder = !isProductOwned && !unavailable && Boolean(product.canonicalModules?.length);
  const firstAvailableUpdate = availablePaidUpdates[0];
  const updateBenefits = firstAvailableUpdate ? buildUpdateBenefits(firstAvailableUpdate) : [];

  return (
    <div data-pdp-root className="relative pb-5 text-white">
      <nav aria-label="Breadcrumb" data-pdp-loose className="dc-scene-ink flex min-w-0 items-center gap-1.5 px-4 pt-4 text-[11px] text-white/60">
        <button type="button" onClick={onBack} className="min-h-9 shrink-0 px-1 transition hover:text-white">Store</button>
        <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-white/40" />
        <span className="shrink-0 text-white/65">{identity.typeLabel}</span>
        <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-white/40" />
        <span aria-current="page" title={identity.title} className="min-w-0 flex-1 truncate font-semibold text-white">{identity.title}</span>
      </nav>

      {/* Desktop places the media and long-form details in the main column,
          with the decision panel in a stable right rail. On smaller screens the
          same DOM order becomes a single product-first journey. */}
      <div data-pdp-body className="flex min-w-0 flex-col gap-6 px-4 pb-8 pt-4">
        <section data-pdp-gallery className="flex min-w-0 flex-col gap-3">
          <GlassSurface radius={24} tint={0.25} blur={0} className="dc-scene-plate group relative overflow-hidden" contentClassName="relative">
            <div data-pdp-media aria-busy={Boolean(selectedImage && loadedImageSource !== selectedImage)} className="relative aspect-[4/3] overflow-hidden">
              {selectedImage ? (
                <>
                  {loadedImageSource !== selectedImage && <div aria-hidden="true" className="dc-pdp-image-loading absolute inset-0" />}
                  <img
                    key={selectedImage}
                    data-pdp-hero-img
                    src={selectedImage}
                    alt={identity.title}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    onLoad={() => setLoadedImageSource(selectedImage)}
                    onError={() => setFailedImageSources((current) => new Set(current).add(selectedImage))}
                    className={`aspect-[4/3] w-full object-contain transition-opacity duration-200 ${loadedImageSource === selectedImage ? "opacity-100" : "opacity-0"}`}
                  />
                </>
              ) : (
                <ProductArtworkFallback product={product} title={identity.title} typeLabel={identity.typeLabel} />
              )}
            </div>
            {product.status === "published" && (
              <div className="dc-scene-plate dc-scene-plate--bar absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--dc-chrome-glass)] px-3 py-1.5 text-[10px] font-medium text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live catalog
              </div>
            )}
            <div className="absolute right-3 top-3 flex gap-2">
              {onToggleFavorite ? (
                <span className="relative inline-flex">
                  <EmojiBurstLayer particles={likeParticles} />
                  <GlassButton
                    type="button"
                    onClick={() => { if (!favorite) likeBurst(); onToggleFavorite(product.id); }}
                    aria-label={favorite ? "Remove from saved products" : "Save product"}
                    aria-pressed={favorite}
                    className="min-h-11 min-w-11 [&_.size-12]:size-9"
                  >
                    <Heart aria-hidden="true" className={`h-4 w-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} />
                  </GlassButton>
                </span>
              ) : null}
              {selectedImage ? (
                <GlassButton
                  type="button"
                  onClick={() => setExpandedImage(selectedImage)}
                  aria-label="View product image fullscreen"
                  className="min-h-11 min-w-11 [&_.size-12]:size-9"
                >
                  <Expand aria-hidden="true" className="h-4 w-4" />
                </GlassButton>
              ) : null}
            </div>
            {visibleGallery.length > 1 && (
              <div className="dc-scene-plate dc-scene-plate--bar absolute bottom-3 right-3 rounded-full bg-[var(--dc-chrome-glass)] px-3 py-1 text-[10px] font-medium text-white [backdrop-filter:var(--dc-chrome-glass-blur)]" aria-live="polite">
                {selectedImageIndex + 1} / {visibleGallery.length}
              </div>
            )}
          </GlassSurface>
          {visibleGallery.length > 1 && (
            <div data-pdp-thumbs ref={thumbs.ref} onPointerDown={thumbs.onPointerDown} className="flex gap-2 overflow-x-auto pb-1">
              {visibleGallery.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => { setActiveImage(index); setLoadedImageSource(null); }}
                  aria-label={`Show product image ${index + 1}`}
                  aria-pressed={selectedImageIndex === index}
                  className={`h-16 min-w-16 flex-1 overflow-hidden rounded-xl border-2 transition ${selectedImageIndex === index ? "border-indigo-300/80" : "border-transparent opacity-75 hover:opacity-100"}`}
                >
                  <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section data-pdp-buy className="flex min-w-0 flex-col gap-4">
          <div data-pdp-titleblock className="dc-pdp-identity space-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="dc-pdp-type-badge">{identity.typeLabel}</span>
              <span className="dc-pdp-store-label">{appName}</span>
            </div>
            {instructorLabel ? (
              <p className="text-xs text-white/65">By <span className="font-semibold text-white/85">{instructorLabel}</span></p>
            ) : null}
            <h1 className="dc-pdp-title font-black tracking-tight text-white">{identity.title}</h1>
            {product.description?.trim() ? (
              <p className="dc-pdp-summary text-sm leading-relaxed text-white/75">{product.description.trim()}</p>
            ) : null}
            <div className="dc-pdp-identity-rating flex flex-wrap items-center gap-2 text-xs">
              {ratingSummary.hasRating ? (
                <>
                  <RatingStars rating={ratingSummary.rating} />
                  <span className="font-bold text-white">{ratingSummary.rating.toFixed(1)}</span>
                  <a href="#product-reviews" className="text-white/65 underline underline-offset-2">
                    {ratingSummary.count.toLocaleString("en-IN")} rating{ratingSummary.count === 1 ? "" : "s"}
                  </a>
                </>
              ) : <span className="text-white/60">No ratings yet</span>}
            </div>
          </div>

          {metadataItems.length > 0 && (
            <GlassSurface data-pdp-meta radius={24} tint={0.25} blur={0} className="dc-scene-plate text-white/85" contentClassName="grid grid-cols-2 gap-2 p-3">
              {metadataItems.map((item) => <Meta key={`${item.label}-${item.text}`} icon={item.icon} label={item.label} text={item.text} />)}
            </GlassSurface>
          )}

          {isProductOwned ? (
            firstAvailableUpdate ? (
              <GlassSurface data-pdp-upgrade-box radius={24} tint={0.25} blur={0} className="dc-scene-plate relative overflow-hidden text-white" contentClassName="p-5">
                <div className="relative flex items-start gap-3">
                  <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600/90 text-white">
                    <Zap size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-200">
                      {identity.isCourse ? "Course upgrade available" : "Content upgrade available"}
                    </p>
                    <h2 className="mt-1 text-base font-bold leading-snug text-white">{firstAvailableUpdate.title}</h2>
                    {firstAvailableUpdate.description?.trim() ? (
                      <p className="mt-2 text-sm leading-relaxed text-white/75">{firstAvailableUpdate.description.trim()}</p>
                    ) : updateBenefits.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75" aria-label="Included in this update">
                        {updateBenefits.map((benefit) => <li key={benefit} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-400" />{benefit}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm leading-relaxed text-white/75">A published content update is available for this product.</p>
                    )}
                    {firstAvailableUpdate.description?.trim() && updateBenefits.length > 0 ? (
                      <p className="mt-2 text-xs text-white/60">Includes {updateBenefits.join(" · ")}</p>
                    ) : null}
                  </div>
                </div>
                <PaymentButton
                  block
                  className="relative mt-4"
                  icon={<Zap size={18} />}
                  onClick={handleBuyUpgrade}
                  data-pdp-upgrade-checkout=""
                  label={`Upgrade for ${formatPrice(firstAvailableUpdate.cashPrice)}`}
                />
                {onOpenCourse ? (
                  <GlassButton variant="capsule" type="button" onClick={() => onOpenCourse(product)} className="mt-2.5 w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:gap-1.5 [&>span>div]:text-xs [&>span>div]:font-bold">
                    <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
                      <PlayCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{identity.libraryAction}</span>
                    </span>
                  </GlassButton>
                ) : null}
              </GlassSurface>
            ) : onOpenCourse ? (
              <button
                type="button"
                data-pdp-library-primary
                onClick={() => onOpenCourse(product)}
                className="dc-pdp-library-cta"
              >
                <PlayCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span>{identity.libraryAction}</span>
              </button>
            ) : null
          ) : (
            <GlassSurface radius={24} tint={0.25} blur={0} className="dc-scene-plate relative overflow-visible text-white" data-pdp-price-box contentClassName="p-5">
              <div className="relative flex flex-wrap items-end gap-x-2 gap-y-1">
                {product.originalPrice > product.price && product.originalPrice > 0 ? <span className="mb-1 text-sm dc-anchor-price">{formatPrice(product.originalPrice)}</span> : null}
                <span className="text-4xl tracking-tight dc-hero-price">{formatPrice(product.price)}</span>
                {discount > 0 ? <span className="mb-1 text-xs font-semibold text-emerald-300">Save {discount}%</span> : null}
              </div>
              <PaymentButton
                block
                className="relative mt-4"
                icon={<Zap size={18} />}
                disabled={unavailable}
                onClick={primaryAction}
                data-pdp-checkout=""
                label={unavailable ? "Coming soon" : productIsFree ? "Get access · Free" : `Get access · ${formatPrice(product.price)}`}
              />
              {!productIsFree && onAddToCart && (
                <GlassButton variant="capsule" type="button" disabled={inCart || unavailable} onClick={() => !unavailable && onAddToCart(product.id)} className="mt-2.5 w-full disabled:opacity-60 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:gap-2 [&>span>div]:px-3 [&>span>div]:text-sm [&>span>div]:font-semibold">
                  <ShoppingCart aria-hidden="true" className="h-4 w-4" /> {inCart ? "In cart" : "Add to cart"}
                </GlassButton>
              )}
              <div className="relative mt-3 flex justify-end">
                <div ref={shareRef} className="relative">
                  <GlassButton
                    type="button"
                    onClick={() => setShareOpen((value) => !value)}
                    aria-label="Share product"
                    aria-expanded={shareOpen}
                    aria-haspopup="menu"
                    className="min-h-11 min-w-11 [&_.size-12]:size-10"
                  >
                    <Share2 aria-hidden="true" className="h-4 w-4" />
                  </GlassButton>
                  <GlassSurface data-product-share radius={20} className="dc-scene-plate absolute right-0 top-12 z-50 w-60 max-w-[calc(100vw-2rem)] text-white" id="product-share-menu" contentClassName="py-1" hidden={!shareOpen}>
                    <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-white/55">Share this product</p>
                    <PopoverItem onClick={() => void shareNative()} className="text-xs font-medium"><Share2 aria-hidden="true" className="h-3.5 w-3.5" /> Share via device</PopoverItem>
                    <PopoverItem onClick={() => shareTo("whatsapp")} className="text-xs font-medium"><MessageCircle aria-hidden="true" className="h-3.5 w-3.5" /> WhatsApp</PopoverItem>
                    <PopoverItem onClick={() => shareTo("telegram")} className="text-xs font-medium"><Send aria-hidden="true" className="h-3.5 w-3.5" /> Telegram</PopoverItem>
                    <PopoverItem onClick={() => void copyLink()} className="justify-between text-xs font-medium"><span className="flex items-center gap-3"><Copy aria-hidden="true" className="h-3.5 w-3.5" /> Copy product link</span>{copied && <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />}</PopoverItem>
                  </GlassSurface>
                </div>
              </div>
            </GlassSurface>
          )}

            {/* Thumb zone: once the buy box scrolls away the primary action
                follows the user down the page, parked where the thumb rests
                and clear of the (unchanged) footer dock. */}
            {!isProductOwned && !unavailable ? (
              <div data-pdp-thumb-bar className="dc-scene-plate dc-scene-plate--bar dc-thumb-bar flex items-center gap-3 md:hidden">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] dc-hero-price">{formatPrice(product.price)}</span>
                  {product.originalPrice > product.price ? (
                    <span className="text-[10.5px] dc-anchor-price">{formatPrice(product.originalPrice)}</span>
                  ) : null}
                </div>
                {/* Sticky thumb CTA — the same payment component, so the
                    follow-the-thumb action can never drift from the buy box. */}
                <PaymentButton
                  block
                  className="min-w-0 flex-1"
                  icon={<Zap size={18} />}
                  onClick={primaryAction}
                  data-pdp-thumb-checkout=""
                  ariaLabel={productIsFree ? "Get free access" : `Get access for ${formatPrice(product.price)}`}
                  label={productIsFree ? "Get access" : "Get access now"}
                />
              </div>
            ) : null}

            {unavailable && (
              <div className="dc-scene-ink rounded-2xl border border-amber-400/30 bg-amber-500/15 p-4 text-sm text-amber-200 backdrop-blur-xl">
                This product is published for preview, but checkout is not enabled yet.
              </div>
            )}

            {!isProductOwned && !unavailable && canShowCouponInput && (
              <GlassSurface radius={24} tint={0.25} blur={0} className="dc-scene-plate text-white" contentClassName="p-4">
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

          <div data-pdp-stack className="flex min-w-0 flex-col gap-6">
          {hasPurchaseBuilder && (
            <section id="pdp-purchase-options" className="scroll-mt-32">
              <div className="mb-3 px-1"><h2 className="dc-scene-ink text-lg font-black dc-ink-1">Build your purchase</h2><p className="dc-scene-ink text-xs dc-ink-3">Choose the full product or select available modules, resources, and paid updates.</p></div>
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

          <DetailsCard product={product} modules={modules} curriculumMode={curriculumMode} includedItems={includedItems} highlights={highlights} tab={activeTab} onTab={setActiveTab} expandedModule={expandedModule} onExpandModule={setExpandedModule} />
          <ReviewsCard
            product={product}
            reviews={productReviews}
            canReview={Boolean(user)}
            composerOpen={reviewComposerOpen}
            rating={reviewRating}
            comment={reviewComment}
            submitting={reviewSubmitting}
            notice={reviewNotice}
            onToggleComposer={() => {
              if (!user) {
                window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(window.location.hash)}`;
                return;
              }
              setReviewComposerOpen((open) => !open);
            }}
            onRating={setReviewRating}
            onComment={setReviewComment}
            onSubmit={() => void submitReview()}
          />
          {related.length > 0 && <RelatedProducts products={related} onNavigate={onNavigateToProduct} />}
          </div>
        </div>
      {expandedImage && (
        <div
          data-pdp-lightbox
          role="dialog"
          aria-modal="true"
          aria-label={`Fullscreen image: ${identity.title}`}
          className="dc-pdp-lightbox"
          onClick={(event) => { if (event.target === event.currentTarget) setExpandedImage(null); }}
        >
          <button ref={fullscreenCloseRef} type="button" onClick={() => setExpandedImage(null)} className="dc-pdp-lightbox-close" aria-label="Close fullscreen image">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          <img src={expandedImage} alt={identity.title} decoding="async" onError={() => setExpandedImage(null)} />
          <p>{identity.title}</p>
        </div>
      )}
    </div>
  );
}

function buildIncludedSummaries(modules: CurriculumModule[], modulesCount: number): string[] {
  const counts = new Map<string, number>();
  const visit = (items: CurriculumModule[]) => {
    for (const module of items) {
      for (const resource of module.resources || []) {
        const type = resource.type.trim().toLowerCase() || "resource";
        counts.set(type, (counts.get(type) || 0) + 1);
      }
      visit(module.modules || []);
    }
  };
  visit(modules);

  const typeLabels: Record<string, [string, string]> = {
    audio: ["audio resource", "audio resources"],
    brain: ["practice set", "practice sets"],
    doc: ["document", "documents"],
    ebook: ["e-book", "e-books"],
    embed: ["interactive resource", "interactive resources"],
    google_form: ["Google Form", "Google Forms"],
    image: ["image", "images"],
    interactive: ["interactive activity", "interactive activities"],
    mindmap: ["mind map", "mind maps"],
    mind_map: ["mind map", "mind maps"],
    note: ["study note", "study notes"],
    pdf: ["PDF", "PDFs"],
    read: ["reading resource", "reading resources"],
    sheet: ["spreadsheet", "spreadsheets"],
    slides: ["slide deck", "slide decks"],
    video: ["video lesson", "video lessons"],
    video_url: ["video lesson", "video lessons"],
    youtube: ["video lesson", "video lessons"],
  };
  const summaries: string[] = [];
  if (modulesCount > 0) summaries.push(`${modulesCount} module${modulesCount === 1 ? "" : "s"}`);
  for (const [type, count] of counts) {
    const labels = typeLabels[type] || [type.replace(/[_-]+/g, " "), `${type.replace(/[_-]+/g, " ")}s`];
    summaries.push(`${count} ${count === 1 ? labels[0] : labels[1]}`);
  }
  return summaries;
}

function formatResourceType(type: string): string {
  const labels: Record<string, string> = {
    audio: "Audio",
    brain: "Practice set",
    doc: "Document",
    ebook: "E-book",
    embed: "Interactive",
    google_form: "Google Form",
    image: "Image",
    interactive: "Interactive",
    mindmap: "Mind map",
    mind_map: "Mind map",
    note: "Study note",
    pdf: "PDF",
    read: "Reading",
    sheet: "Spreadsheet",
    slides: "Slides",
    video: "Video",
    video_url: "Video",
    youtube: "Video",
  };
  const normalized = type.trim().toLowerCase();
  return labels[normalized] || normalized.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function buildUpdateBenefits(update: NonNullable<Product["paidUpdates"]>[number]): string[] {
  const modules = update.includedModuleIds?.length || 0;
  const resources = update.includedResourceIds?.length || 0;
  return [
    modules > 0 ? `${modules} module${modules === 1 ? "" : "s"}` : null,
    resources > 0 ? `${resources} resource${resources === 1 ? "" : "s"}` : null,
  ].filter((item): item is string => Boolean(item));
}

const GENERIC_PRODUCT_IMAGE = /^(?:hero(?:-main|-\d+)?|related-\d+|gallery-\d+|product-(?:pdf|video|ebook|live))$/i;
const TOPIC_IMAGE_RULES: Array<{ file: RegExp; product: RegExp }> = [
  { file: /chemical[-_ ]reactions?/i, product: /\bchemical\s+reactions?\b/i },
  { file: /real[-_ ]numbers?/i, product: /\breal\s+numbers?\b/i },
  { file: /trigonometry/i, product: /\btrigonometric(?:al)?\b|\btrigonometry\b/i },
  { file: /mechanics/i, product: /\bmechanics\b|\bmechanical\b/i },
  { file: /english[-_ ]grammar/i, product: /\benglish\s+grammar\b|\bgrammar\b/i },
  { file: /photosynthesis/i, product: /\bphotosynthesis\b/i },
  { file: /chain[-_ ]rule/i, product: /\bchain\s+rule\b/i },
];
const COURSE_IMAGE_ALIASES: Record<string, string> = {
  datascience: "data science",
  webdev: "web development",
  uiux: "ui ux",
};

function imageSourceMatchesProduct(source: string, product: Product): boolean {
  const value = source.trim();
  if (!value || /^(?:javascript|file):/i.test(value)) return false;
  let filename = "";
  try {
    const url = new URL(value, "https://pdp.learnbook.invalid");
    if (!new Set(["http:", "https:", "data:", "blob:"]).has(url.protocol)) return false;
    filename = decodeURIComponent(url.pathname.split("/").pop() || "").split("/").pop() || "";
  } catch {
    return false;
  }
  const stem = filename.replace(/\.[a-z0-9]{2,8}$/i, "").toLowerCase();
  if (GENERIC_PRODUCT_IMAGE.test(stem)) return false;

  const identityText = [product.title, getProductSubjectLabel(product), ...(product.tags || [])]
    .filter(Boolean)
    .join(" ");
  for (const rule of TOPIC_IMAGE_RULES) {
    if (rule.file.test(stem) && !rule.product.test(identityText)) return false;
  }
  const courseImage = stem.match(/^course[-_](.+)$/i);
  if (courseImage) {
    const topic = COURSE_IMAGE_ALIASES[courseImage[1].replace(/[-_\s]/g, "")] || courseImage[1].replace(/[-_]+/g, " ");
    const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!normalize(identityText).includes(normalize(topic))) return false;
  }
  return true;
}

function getProductImageSources(product: Product): string[] {
  const candidates = [...(product.images || []), product.image];
  return [...new Set(candidates.map((image) => String(image || "").trim()).filter(Boolean))]
    .filter((image) => imageSourceMatchesProduct(image, product));
}

function ProductArtworkFallback({ product, title, typeLabel, compact = false }: { product: Product; title: string; typeLabel: string; compact?: boolean }) {
  const subject = getProductSubjectLabel(product);
  return (
    <div role="img" aria-label={`Artwork unavailable for ${title}`} className={`dc-pdp-artwork-fallback ${compact ? "dc-pdp-artwork-fallback--compact" : ""}`}>
      <div className="dc-pdp-artwork-copy">
        <span className="dc-pdp-artwork-type">{typeLabel}</span>
        <BookOpen aria-hidden="true" className="dc-pdp-artwork-icon" />
        <strong>{title}</strong>
        {subject ? <span className="dc-pdp-artwork-subject">{subject}</span> : null}
        <span className="dc-pdp-artwork-note">Product artwork unavailable</span>
      </div>
    </div>
  );
}

function ProductImageThumb({ product, source }: { product: Product; source: string | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const identity = getProductPresentation(product);
  if (!source || failed) return <ProductArtworkFallback product={product} title={identity.title} typeLabel={identity.typeLabel} compact />;
  return <img src={source} alt={identity.title} loading="lazy" decoding="async" width={112} height={96} onError={() => setFailed(true)} className="h-24 w-28 shrink-0 object-contain" />;
}

function DetailsCard({ product, modules, curriculumMode, includedItems, highlights, tab, onTab, expandedModule, onExpandModule }: { product: Product; modules: CurriculumModule[]; curriculumMode: CurriculumViewMode; includedItems: string[]; highlights: string[]; tab: DetailTab; onTab: (tab: DetailTab) => void; expandedModule: string | null; onExpandModule: (id: string | null) => void }) {
  const tabs: DetailTab[] = ["Description", "Curriculum", "Instructor"];
  const instructorLabel = getProductInstructorLabel(product);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tabBarStuck, setTabBarStuck] = useState(false);
  // Mouse parity on the tab strip too: drag it sideways instead of hunting for
  // Shift+wheel, and a drag never switches the tab it ends on.
  const tabStrip = useDragScroll<HTMLDivElement>();

  // Magnet behaviour: the tab bar is sticky inside the PDP scroll container,
  // so it sticks just below the app header while the user scrolls through the
  // card. A 1px sentinel above the bar flips the "stuck" styling the moment
  // the bar reaches the top edge.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    // Inside the desktop shell the page's own <main> no longer scrolls — the
    // shell's [data-desktop-content] is the scrollport. Measuring against a
    // non-scrolling ancestor would never flip the stuck styling on desktop.
    const shellScroller = sentinel.closest<HTMLElement>("[data-desktop-content]");
    const root = shellScroller || sentinel.closest<HTMLElement>("[data-pdp-scroll]");
    // On desktop the bar seats one topbar + 0.75rem below the viewport top
    // (see the PDP desktop block in index.css), so the stuck styling has to
    // flip at that line, not at the scroller edge. On phone / tablet the bar
    // seats at the scroller edge and the margin stays 0.
    let rootMargin = "0px";
    if (shellScroller) {
      const topbar = parseFloat(getComputedStyle(shellScroller.closest("[data-desktop-shell]") || shellScroller).getPropertyValue("--desktop-topbar-height")) || 64;
      rootMargin = `-${topbar + 12}px 0px 0px 0px`;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setTabBarStuck(!entry.isIntersecting);
      },
      { root: root || null, threshold: 0, rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // `overflow: clip` (with `overflow-hidden` kept in the class list as the
  // legacy-Safari fallback) clips the rounded corners WITHOUT creating a
  // scroll box — an `overflow-hidden` ancestor traps `position: sticky`,
  // which is why the magnet tab bar below never seated under the header.
  return (
    <GlassSurface data-pdp-details radius={24} tint={0.25} blur={0} className="dc-scene-plate overflow-hidden text-white" style={{ overflow: "clip" }} contentClassName="relative">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        data-pdp-tabbar
        data-stuck={tabBarStuck ? "true" : "false"}
        className={`sticky top-0 z-30 px-3 pb-2 pt-3 transition-shadow duration-200 ${tabBarStuck ? "dc-scene-plate dc-scene-plate--bar bg-[var(--dc-chrome-glass)]" : "rounded-t-[23px]"}`}
      >
        {/* Wave 3 (commerce): the tab strip is the pack's `glass-toggle-group`,
            the same control the store filter row uses — one sliding droplet
            instead of repainting a white pill per click. The sticky bar around it
            (`data-pdp-tabbar`, its stuck shadow, `rounded-t-[23px]`) is untouched,
            and so is every `data-pdp-curriculum*` hook. `dc-segment` is the
            light-theme ink in src/glass.css. */}
        <div ref={tabStrip.ref} onPointerDown={tabStrip.onPointerDown} className="flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <GlassToggleGroup
            className="dc-segment dc-scene-plate shrink-0"
            value={tab}
            onValueChange={(next) => onTab(next as DetailTab)}
            aria-label="Product details"
          >
            {tabs.map((item) => (
              <GlassToggleItem key={item} value={item} className="whitespace-nowrap px-3.5 py-2 text-xs font-semibold min-h-[38px]">
                {item}
              </GlassToggleItem>
            ))}
          </GlassToggleGroup>
        </div>
      </div>
      <div className="p-4 pt-3" data-pdp-tab-content aria-live="polite">
        {tab === "Description" && (
          <div className="space-y-4">
            <section>
              <h2 className="dc-pdp-section-heading">{getProductPresentation(product).aboutHeading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                {product.description?.trim() || "A description has not been added for this product yet."}
              </p>
            </section>
            {includedItems.length > 0 && (
              <SimplePanel data-pdp-included className="dc-pdp-flat" contentClassName="p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">What's included</h3>
                <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
                  {includedItems.map((item) => <li key={item} className="flex min-w-0 items-start gap-2 text-sm leading-relaxed text-white/80"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{item}</span></li>)}
                </ul>
              </SimplePanel>
            )}
            {highlights.length > 0 && (
              <SimplePanel data-pdp-highlights className="dc-pdp-flat" contentClassName="p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Product highlights</h3>
                <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
                  {highlights.map((highlight) => <li key={highlight} className="flex min-w-0 items-start gap-2 text-sm leading-relaxed text-white/80"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{highlight}</span></li>)}
                </ul>
              </SimplePanel>
            )}
          </div>
        )}
        {tab === "Curriculum" && (
          modules.length === 0 ? (
            <EmptyDetail text={curriculumMode === "paid-upgrade" ? "Every published upgrade is already in your library." : "No curriculum has been published for this product yet."} />
          ) : (
            <div className="space-y-3" data-pdp-curriculum data-pdp-curriculum-mode={curriculumMode}>
              {curriculumMode === "paid-upgrade" ? (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-3" data-pdp-curriculum-upgrade-hint>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Paid upgrades</p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/75">These modules are not part of the base product. Unlock them with a published paid update.</p>
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
        {tab === "Instructor" && (
          instructorLabel ? (
            <article data-pdp-instructor className="flex items-start gap-4">
              <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-300/15 bg-indigo-500/15 text-base font-bold text-indigo-100">{initials(instructorLabel)}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Instructor / provider</p>
                <p className="mt-1 break-words font-semibold text-white">{instructorLabel}</p>
              </div>
            </article>
          ) : <EmptyDetail text="Instructor or provider information has not been added yet." />
        )}
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
            <span className={`block text-[10px] font-semibold uppercase tracking-wide ${paid ? "text-amber-200/70" : "text-white/45"}`}>Module {String(index + 1).padStart(2, "0")}</span>
            <span className={`mt-0.5 block break-words text-sm font-semibold leading-snug ${paid ? "text-amber-100" : "text-white"}`}>{module.title}</span>
            {paid ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-200">
                  <LockKeyhole className="h-2.5 w-2.5" /> Paid upgrade
                </span>
                {module.paidUpdatePrice ? <span className="text-[10px] font-bold text-amber-200">{module.paidUpdatePrice}</span> : null}
              </span>
            ) : null}
          </span>
          {(resources.length > 0 || childModules.length > 0) && (
            <span className={`shrink-0 text-[10px] ${paid ? "text-amber-200/70" : "text-white/55"}`}>
              {resources.length > 0 ? `${resources.length} resource${resources.length === 1 ? "" : "s"}` : null}
              {resources.length > 0 && childModules.length > 0 ? " · " : null}
              {childModules.length > 0 ? `${childModules.length} submodule${childModules.length === 1 ? "" : "s"}` : null}
            </span>
          )}
          {paid ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : null}
        </GlassAccordionTrigger>
        <GlassAccordionContent className="space-y-2 pb-3">
          {resources.map((resource) => (
            <div key={resource.id} className={`flex items-center gap-2 text-xs ${paid ? "text-amber-200/70" : "text-white/55"}`}>
              <PlayCircle className={`h-4 w-4 ${paid ? "text-amber-400" : "text-white/40"}`} />
              <span className="min-w-0 flex-1 break-words">{resource.name}</span>
              <span className={`shrink-0 text-[9px] uppercase tracking-wide ${paid ? "text-amber-300/70" : "text-white/55"}`}>{formatResourceType(resource.type)}</span>
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

function getProductRatingSummary(product: Product, reviews: PublishedProductReview[]) {
  if (Number.isFinite(product.rating) && product.rating > 0 && product.reviews > 0) {
    return { rating: product.rating, count: product.reviews, hasRating: true, source: "catalog" as const };
  }
  const ratings = reviews.map((review) => Number(review.rating)).filter((rating) => Number.isFinite(rating) && rating > 0);
  if (ratings.length === 0) return { rating: 0, count: 0, hasRating: false, source: "published" as const };
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return { rating: average, count: ratings.length, hasRating: true, source: "published" as const };
}

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
  const ratingSummary = getProductRatingSummary(product, reviews);
  return (
    <GlassSurface data-pdp-reviews id="product-reviews" radius={24} tint={0.25} blur={0} className="dc-scene-plate scroll-mt-36 text-white" contentClassName="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Ratings &amp; Reviews</h2>
          <p className="mt-1 text-xs text-white/55">Published feedback for this product</p>
        </div>
        <button
          type="button"
          onClick={onToggleComposer}
          aria-controls="pdp-review-composer"
          aria-expanded={composerOpen}
          className="dc-pdp-review-action"
        >
          {composerOpen ? "Cancel review" : canReview ? "Write a review" : "Sign in to review"}
        </button>
      </div>

      <div data-pdp-rating-summary className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
        {ratingSummary.hasRating ? (
          <>
            <div className="min-w-[4.5rem] text-center">
              <span className="block text-3xl font-bold tabular-nums text-white">{ratingSummary.rating.toFixed(1)}</span>
              <RatingStars rating={ratingSummary.rating} className="mt-1 justify-center" />
            </div>
            <div className="min-h-10 w-px self-stretch bg-white/10" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/85">{ratingSummary.count.toLocaleString("en-IN")} rating{ratingSummary.count === 1 ? "" : "s"}</p>
              <p className="mt-1 text-xs text-white/55">{ratingSummary.source === "catalog" ? "Catalog rating summary" : "Based on published reviews"}</p>
            </div>
          </>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/85">No ratings yet</p>
            <p className="mt-1 text-xs text-white/55">Be the first to share a rating.</p>
          </div>
        )}
      </div>

      {composerOpen && canReview && (
        <SimplePanel id="pdp-review-composer" className="mt-4" contentClassName="p-4">
          <p className="text-sm font-semibold text-white/85">Your rating</p>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Choose a rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <GlassButton key={value} type="button" onClick={() => onRating(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={value === rating} className="min-h-11 min-w-11 [&_.size-12]:size-9">
                <Star aria-hidden="true" className={`h-5 w-5 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-white/40"}`} />
              </GlassButton>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(event) => onComment(event.target.value.slice(0, 2000))}
            rows={4}
            maxLength={2000}
            aria-label="Your product review"
            placeholder="Share your experience with this product…"
            className="dc-field mt-3 w-full resize-y rounded-2xl p-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-indigo-300"
          />
          <button type="button" disabled={submitting} onClick={onSubmit} className="dc-pdp-review-submit mt-3 w-full disabled:opacity-60">
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </SimplePanel>
      )}
      {notice && <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-indigo-300/10 bg-indigo-500/10 p-3 text-xs font-medium text-indigo-100">{notice}</p>}

      {reviews.length > 0 ? (
        <div data-pdp-review-list className="mt-4 grid grid-cols-1 gap-3">
          {visibleReviews.map((review) => (
            <SimplePanel className="dc-pdp-review min-w-0" key={review.id} contentClassName="p-4">
              <article>
                <div className="flex min-w-0 items-center gap-3">
                  <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${review.avatarColor}`}>{review.initials}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-white">
                      <span className="min-w-0 break-words">{review.name}</span>
                      {review.verifiedPurchase && <BadgeCheck aria-label="Verified purchase" className="h-4 w-4 shrink-0 text-emerald-400" />}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/55">{review.date}</p>
                  </div>
                  <RatingStars rating={review.rating} className="shrink-0" />
                </div>
                <p className="mt-3 break-words text-sm leading-relaxed text-white/80">“{review.comment}”</p>
              </article>
            </SimplePanel>
          ))}
          {remaining > 0 ? (
            <GlassButton
              variant="capsule"
              type="button"
              data-load-more-reviews
              onClick={() => setVisibleCount((count) => count + REVIEW_PAGE_SIZE)}
              className="min-h-11 w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-semibold"
            >
              Load {Math.min(REVIEW_PAGE_SIZE, remaining)} more reviews
            </GlassButton>
          ) : null}
        </div>
      ) : <p className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm text-white/60">No published written reviews yet.</p>}
    </GlassSurface>
  );
}

function RelatedProducts({ products, onNavigate }: { products: Product[]; onNavigate?: (product: Product) => void }) {
  if (!onNavigate) return null;
  return (
    <GlassSurface data-pdp-related radius={24} className="dc-scene-plate text-white" contentClassName="p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">You may also like</h2>
        <p className="mt-1 text-xs text-white/55">Other products from the live catalog</p>
      </div>
      <div data-pdp-related-list className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((item) => {
          const identity = getProductPresentation(item);
          const image = getProductImageSources(item)[0];
          return (
            <SimplePanel
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(item)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate(item); } }}
              aria-label={`View ${identity.title}`}
              className="group min-w-0 cursor-pointer overflow-hidden text-left transition-colors hover:border-indigo-300/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
              contentClassName="flex min-w-0 p-0"
            >
              <ProductImageThumb product={item} source={image} />
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3">
                <span className="dc-pdp-related-type">{identity.typeLabel}</span>
                <span className="break-words text-sm font-semibold text-white">{identity.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                  {item.reviews > 0 && item.rating > 0 ? <><RatingStars rating={item.rating} />{item.rating.toFixed(1)} · {item.reviews.toLocaleString("en-IN")} ratings</> : "No ratings yet"}
                </span>
                <span className="font-semibold tabular-nums text-white">{formatPrice(item.price)}</span>
              </span>
            </SimplePanel>
          );
        })}
      </div>
    </GlassSurface>
  );
}

function RatingStars({ rating, className = "" }: { rating: number; className?: string }) {
  const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <span role="img" aria-label={`${safeRating.toFixed(1)} out of 5 stars`} className={`flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} aria-hidden="true" className={`h-3.5 w-3.5 ${safeRating >= index + 0.5 ? "fill-amber-400 text-amber-400" : "text-white/35"}`} />
      ))}
    </span>
  );
}

function Meta({ icon: Icon, label, text }: { icon: typeof Clock; label: string; text: string }) {
  return (
    <div data-pdp-meta-item className="flex min-w-0 items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-200/80" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">{label}</span>
        <span className="break-words text-xs font-semibold leading-snug text-white/85">{text}</span>
      </span>
    </div>
  );
}
function EmptyDetail({ text }: { text: string }) {
  return <SimplePanel data-pdp-empty-detail contentClassName="flex flex-col items-center py-6 text-center"><PackageOpen aria-hidden="true" className="h-6 w-6 text-white/40" /><p className="mt-2 max-w-md px-3 text-sm text-white/60">{text}</p></SimplePanel>;
}
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
  // CatalogContext retains a legacy demo tree for older Course Player routes.
  // Never present that shared demo data as this live product's curriculum.
  const courseContent = product.courseContent === fullDemoCourseContent ? [] : (product.courseContent || []);
  return courseContent.map((item) => asCurriculumModule(item, product, paidModuleIds)).filter((item): item is CurriculumModule => Boolean(item));
};


const curriculumContainsId = (modules: CurriculumModule[], id: string): boolean =>
  modules.some((module) => module.id === id || curriculumContainsId(module.modules || [], id));

export const countCurriculumResources = (modules: CurriculumModule[]): number =>
  modules.reduce((sum, module) => sum + (module.resources?.length || 0) + countCurriculumResources(module.modules || []), 0);
function MissingProduct({ onBack }: { onBack: () => void }) {
  return (
    <div data-pdp-not-found className="grid min-h-[50vh] place-items-center px-6 py-10 text-center">
      <div>
        <ShoppingBag aria-hidden="true" className="mx-auto h-10 w-10 text-white/40" />
        <h1 className="mt-4 text-2xl font-bold text-white">Product not found</h1>
        <p className="mt-2 text-sm text-white/60">This product is no longer available in the live catalog.</p>
        <button type="button" onClick={onBack} className="dc-pdp-library-cta mt-5">Back to store</button>
      </div>
    </div>
  );
}
