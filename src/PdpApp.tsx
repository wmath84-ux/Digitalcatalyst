import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Star,
  X,
} from "lucide-react";
import Header from "./components/Header";
import { GlassSurface } from "./components/ui/glass";
import { useDragScroll } from "@/hooks/useDragScroll";
import "./pdp-minimal.css";
import { PopoverItem } from "./components/ui/glass-popover";
import BottomNav, { type TabKey } from "./components/BottomNav";
import type { Product } from "./data/products";
import type { CheckoutSelection } from "./types/commerce";
import { buildCheckoutSelection, computeSummary } from "../utils/pdpSelection";
import { PaymentButton } from "./components/ui/PaymentButton";
import PdpPurchaseBuilder from "./components/pdp/PdpPurchaseBuilder";
import PdpSelectionSummary, { type PdpPricingView, type PdpSelectionSnapshot } from "./components/pdp/PdpSelectionSummary";
import { pdpSelectionKey, usePdpQuote } from "./pdp/usePdpQuote";
import { paiseToRupees } from "./utils/money";
import { useCourseAccess } from "./hooks/useCourseAccess";
import { usePublishedProductReviews, type PublishedProductReview } from "./hooks/useProductReviews";
import { fullDemoCourseContent } from "./data/demoCourseContent";
import { getProductClassLabel, getProductInstructorLabel, getProductPresentation, getProductSubjectLabel } from "./pdp/productPresentation";
import { useAuth } from "./context/AuthContext";
import { useBranding } from "./context/BrandingContext";
import { db } from "../firebase";
import { apiFetch } from "./utils/apiBase";
import PromoCodeInput from "./subscription/components/PromoCodeInput";
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

type DetailTab = "Description" | "Curriculum";

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

const formatPrice = (price: number) => `₹${price.toLocaleString("en-IN")}`;

const GENERIC_CHAPTER_WORDS = new Set([
  "advanced", "all", "basic", "beginner", "board", "boards", "cbse", "complete", "concept",
  "course", "courses", "ebook", "exam", "exams", "foundation", "general", "icse", "introduction",
  "jee", "learning", "lesson", "lessons", "main", "module", "modules", "ncert", "neet", "notes",
  "overview", "pdf", "practice", "question", "questions", "resources", "revision", "school", "study",
  "test", "tests", "unit", "units",
]);

const relatedClassKey = (product: Product): string => {
  const label = getProductClassLabel(product).trim();
  if (!label) return "";
  const number = label.match(/\b(?:class|grade)\s*[-–—]?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
  return number ? `class ${Number(number[1])}` : label.toLocaleLowerCase().replace(/\s+/g, " ");
};

const normalizeChapterSignal = (value: unknown, product: Product): string => {
  let normalized = String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
  if (!normalized) return "";
  normalized = normalized
    .replace(/\b(?:chapter|ch\.?|unit|module)\s*(?:no\.?\s*)?\d+[a-z]?\b/gi, " ")
    .replace(/\b(?:class|grade)\s*[-–—]?\s*\d{1,2}(?:st|nd|rd|th)?\b/gi, " ");

  const subject = getProductSubjectLabel(product).trim();
  if (subject) {
    const normalizedSubject = subject.toLocaleLowerCase().replace(/\s+/g, " ");
    normalized = normalized.split(normalizedSubject).join(" ");
  }
  normalized = normalized
    .replace(/\b(?:mathematics|maths?|science|physics|chemistry|biology|social studies|english|history|geography)\b/gi, " ")
    .replace(/\b(?:chapter|ch|unit|module|part|volume|vol)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  const words = normalized.split(/\s+/).filter(Boolean).map((word) => {
    if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) return word.slice(0, -1);
    return word;
  }).filter((word) => !GENERIC_CHAPTER_WORDS.has(word));
  return words.length > 0 ? words.join(" ") : "";
};

const relatedChapterKeys = (product: Product): Set<string> => {
  const extended = product as Product & Record<string, unknown>;
  const values: unknown[] = [
    ...(Array.isArray(product.chapters) ? product.chapters : []),
    extended.chapter,
    extended.chapterName,
    ...(Array.isArray(extended.chapterNames) ? extended.chapterNames : []),
    // Keep title-derived chapter names as a useful fallback for older catalog
    // entries that predate the explicit Chapters field in the product editor.
    product.title,
    getProductPresentation(product).title,
    ...(Array.isArray(product.tags) ? product.tags : []),
    ...(Array.isArray(product.searchKeywords) ? product.searchKeywords : []),
  ];

  const collectModuleTitles = (modules: unknown) => {
    if (!Array.isArray(modules)) return;
    for (const module of modules) {
      if (!module || typeof module !== "object") continue;
      const row = module as { title?: unknown; modules?: unknown };
      values.push(row.title);
      collectModuleTitles(row.modules);
    }
  };
  collectModuleTitles(product.canonicalModules);
  if (product.courseContent && product.courseContent !== fullDemoCourseContent) {
    collectModuleTitles(product.courseContent);
  }

  return new Set(values.map((value) => normalizeChapterSignal(value, product)).filter(Boolean));
};

/**
 * Related products require both the same class/level AND at least one shared
 * chapter signal. Signals come from the explicit Chapters editor field first,
 * then existing titles, tags, keywords and curriculum module headings, so old
 * catalog records remain eligible without guessing from category alone.
 */
export const getRelatedProducts = (product: Product, catalog: Product[], limit = 12) => {
  const classKey = relatedClassKey(product);
  const chapterKeys = relatedChapterKeys(product);
  if (!classKey || chapterKeys.size === 0) return [];

  return catalog
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      const candidateClassKey = relatedClassKey(candidate);
      if (candidateClassKey !== classKey) return null;
      const sharedChapterKeys = [...relatedChapterKeys(candidate)].filter((key) => chapterKeys.has(key));
      if (sharedChapterKeys.length === 0) return null;
      const sameSubject = getProductSubjectLabel(candidate).toLocaleLowerCase() === getProductSubjectLabel(product).toLocaleLowerCase();
      return { candidate, sharedChapterCount: sharedChapterKeys.length, sameSubject };
    })
    .filter((item): item is { candidate: Product; sharedChapterCount: number; sameSubject: boolean } => Boolean(item))
    .sort((a, b) =>
      b.sharedChapterCount - a.sharedChapterCount
      || Number(b.sameSubject) - Number(a.sameSubject)
      || b.candidate.rating - a.candidate.rating
      || a.candidate.title.localeCompare(b.candidate.title),
    )
    .slice(0, Math.max(0, limit))
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
          {props.product ? <PremiumProductContent key={props.product.id} {...props} product={props.product} /> : <MissingProduct onBack={props.onBack} />}
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
  const heroImageRef = useRef<HTMLImageElement>(null);
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
  const [selectedOrder, setSelectedOrder] = useState<PdpSelectionSnapshot | null>(null);
  const handleSelectionChange = useCallback((next: PdpSelectionSnapshot) => {
    setSelectedOrder((previous) => previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [showReviewsPage, setShowReviewsPage] = useState(false);

  useEffect(() => {
    const syncReviewsRoute = () => {
      const query = window.location.hash.split("?").slice(1).join("?");
      setShowReviewsPage(new URLSearchParams(query).get("reviews") === "1");
    };
    syncReviewsRoute();
    window.addEventListener("hashchange", syncReviewsRoute);
    return () => window.removeEventListener("hashchange", syncReviewsRoute);
  }, [product.id]);

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

  // Cached images can finish before the reset effect (and their load event
  // then never fires again). Reconcile the DOM image so artwork cannot stay
  // permanently transparent, including when returning from the reviews view.
  useEffect(() => {
    const image = heroImageRef.current;
    if (!selectedImage || !image?.complete) return;
    if (image.naturalWidth > 0) setLoadedImageSource(selectedImage);
    else setFailedImageSources((current) => current.has(selectedImage) ? current : new Set(current).add(selectedImage));
  }, [product.id, selectedImage, showReviewsPage]);

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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShareOpen(false);
      shareRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
    };
    const frame = window.requestAnimationFrame(() => shareRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus({ preventScroll: true }));
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("touchstart", closeOnOutsidePointer, { passive: true });
    document.addEventListener("scroll", closeOnOutsideScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", closeOnOutsideScroll, { passive: true });
    window.addEventListener("wheel", closeOnOutsideScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
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
  const related = useMemo(() => getRelatedProducts(product, products, 12), [product, products]);
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
  const inCart = cartIds.has(product.id);
  const unavailable = product.availableForSale === false && !isProductOwned;

  const defaultOrder = useMemo<PdpSelectionSnapshot>(() => {
    const update = isProductOwned ? availablePaidUpdates[0] : undefined;
    const mode = update ? "paid_update" : "full_product";
    const selectedIds = new Set(update ? [update.id] : []);
    const selection = buildCheckoutSelection({ product, mode, selectedIds, paidUpdateId: update?.id || null, returnRoute: `#/product/${encodeURIComponent(product.id)}` });
    const summary = computeSummary({ product: isFreeProduct(product) ? { ...product, isFree: true } : product, mode, selectedIds, modules: product.canonicalModules || [], paidUpdates: product.paidUpdates || [], isProductOwned, ownedUpdateIds: updates, ownedModuleIds, ownedResourceIds });
    return { selection, summary, valid: summary.selectedCount > 0, rules: [] };
  }, [product, isProductOwned, availablePaidUpdates, updates, ownedModuleIds, ownedResourceIds]);
  const order = !isProductOwned && selectedOrder ? selectedOrder : defaultOrder;
  const purchaseMode = order.summary.mode;
  const quoteSelection = { ...order.selection, productIds: [product.documentId || product.id] };
  const pricing = usePdpQuote({ selection: quoteSelection, uid: user?.id || null, enabled: Boolean(user) && order.valid && !unavailable && (!isProductOwned || Boolean(availablePaidUpdates[0])), chargeable: order.summary.effectiveSubtotal > 0 });
  const pricingView: PdpPricingView = { ...pricing, selectionKey: pdpSelectionKey({ ...quoteSelection, couponCode: pricing.couponIntent }) };
  const pricingBusy = pricing.status === "loading" || pricing.applying;
  const pricingBlocked = pricingBusy || pricing.status === "error";
  const handlePreview = (selection: CheckoutSelection, summary: ReturnType<typeof computeSummary>) => {
    const withCoupon = { ...selection, productIds: [product.documentId || product.id], couponCode: summary.effectiveSubtotal > 0 ? pricing.appliedCode : null };
    if (user && (!pricing.quote || pdpSelectionKey(withCoupon) !== pricingView.selectionKey)) return;
    const payable = pricing.quote ? paiseToRupees(pricing.quote.cashPayable) : summary.effectiveSubtotal;
    if (onCheckoutSelection) onCheckoutSelection(withCoupon, payable);
    else if (selection.purchaseKind === "full_product") onCheckout(payable, withCoupon.couponCode);
  };

  // Directly buy the first available paid upgrade — used once the base course
  // is owned and the "Select course modules" section is no longer shown.
  const handleBuyUpgrade = () => {
    if (availablePaidUpdates[0]) handlePreview(order.selection, order.summary);
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
    if (!unavailable && !pricingBlocked) handlePreview(order.selection, order.summary);
  };
  const productIsFree = isFreeProduct(product);
  const canShowCouponInput = !isProductOwned && !unavailable && order.valid && shouldShowCouponInput({
    purchaseKind: order.selection.purchaseKind,
    payablePaise: Math.round(order.summary.effectiveSubtotal * 100),
    isFree: order.selection.purchaseKind === "full_product" && productIsFree,
  });
  const couponEntry = canShowCouponInput ? (
    <details data-pdp-coupon className="dc-pdp-coupon">
      <summary>Have a coupon?</summary>
      <PromoCodeInput key={pdpSelectionKey({ ...order.selection, couponCode: null })} kind="coupon" label="Coupon code" placeholder="Enter code" appliedCode={pricing.appliedCode} appliedMessage={pricing.quote?.couponDiscount ? `Verified discount: ₹${paiseToRupees(pricing.quote.couponDiscount).toLocaleString("en-IN")}` : "Coupon verified for this selection"} errorMessage={pricing.couponError || null} onApply={pricing.applyCoupon} onRemove={pricing.removeCoupon} disabled={pricingBusy} />
    </details>
  ) : null;

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

  const toggleReviewComposer = () => {
    if (!user) {
      window.location.hash = `#/auth?mode=login&return=${encodeURIComponent(window.location.hash)}`;
      return;
    }
    setReviewComposerOpen((open) => !open);
  };
  const openReviewsPage = () => {
    window.location.hash = `#/product/${encodeURIComponent(product.id)}?reviews=1`;
  };
  const backToProduct = () => {
    window.location.hash = `#/product/${encodeURIComponent(product.id)}`;
  };

  const classLabel = getProductClassLabel(product);
  const subjectLabel = identity.subjectLabel;
  const metadataItems = [
    classLabel ? { label: classLabel.toLowerCase() === "lifetime access" ? "Access" : "Level", text: classLabel } : null,
    subjectLabel ? { label: "Subject", text: subjectLabel } : null,
  ].filter((item): item is { label: string; text: string } => Boolean(item));
  const includedItems = buildIncludedSummaries(includedCurriculum, modulesCount);
  const ratingSummary = getProductRatingSummary(product, productReviews);
  const highlights = [...new Set((product.features || []).map((feature) => feature.trim()).filter(Boolean))];
  const hasPurchaseBuilder = !isProductOwned && !unavailable && Boolean(product.canonicalModules?.length);
  const firstAvailableUpdate = availablePaidUpdates[0];
  const updateBenefits = firstAvailableUpdate ? buildUpdateBenefits(firstAvailableUpdate) : [];

  if (showReviewsPage) {
    return (
      <div data-pdp-root data-pdp-reviews-page className="relative min-h-full pb-8 text-white">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <button
            type="button"
            data-pdp-reviews-back
            onClick={backToProduct}
            className="dc-pdp-text-action mb-4"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4 rotate-180" />
            Back to product
          </button>
          <ReviewsCard
            mode="full"
            product={product}
            reviews={productReviews}
            canReview={Boolean(user)}
            composerOpen={reviewComposerOpen}
            rating={reviewRating}
            comment={reviewComment}
            submitting={reviewSubmitting}
            notice={reviewNotice}
            onToggleComposer={toggleReviewComposer}
            onRating={setReviewRating}
            onComment={setReviewComment}
            onSubmit={() => void submitReview()}
          />
        </div>
      </div>
    );
  }

  return (
    <div data-pdp-root className="relative pb-5 text-white">
      <nav aria-label="Breadcrumb" data-pdp-loose className="dc-scene-ink hidden min-w-0 items-center gap-1.5 px-4 pt-4 text-[11px] text-white/60 sm:flex">
        <button type="button" onClick={onBack} className="min-h-9 shrink-0 px-1 transition hover:text-white">Store</button>
        <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-white/40" />
        <span className="shrink-0 text-white/65">{identity.typeLabel}</span>
        <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-white/40" />
        <span aria-current="page" title={identity.title} className="min-w-0 flex-1 truncate font-semibold text-white">{identity.title}</span>
      </nav>

      <div data-pdp-body className="flex min-w-0 flex-col gap-6 px-4 pb-8 pt-4">
        <section data-pdp-gallery className="flex min-w-0 flex-col gap-3">
          <GlassSurface radius={24} tint={0.25} blur={0} className="dc-scene-plate group relative overflow-hidden" contentClassName="relative">
            <div data-pdp-media aria-busy={Boolean(selectedImage && loadedImageSource !== selectedImage)} className="relative aspect-[16/10] overflow-hidden">
              {selectedImage ? (
                <>
                  {loadedImageSource !== selectedImage && <div aria-hidden="true" className="dc-pdp-image-loading absolute inset-0" />}
                  <img
                    key={selectedImage}
                    data-pdp-hero-img
                    ref={heroImageRef}
                    src={selectedImage}
                    alt={identity.title}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    onLoad={() => setLoadedImageSource(selectedImage)}
                    onError={() => setFailedImageSources((current) => new Set(current).add(selectedImage))}
                    className={`h-full w-full object-contain transition-opacity duration-200 ${loadedImageSource === selectedImage ? "opacity-100" : "opacity-0"}`}
                  />
                </>
              ) : <ProductArtworkFallback product={product} title={identity.title} typeLabel={identity.typeLabel} />}
            </div>
            {selectedImage ? (
              <button type="button" onClick={() => setExpandedImage(selectedImage)} aria-label="View product image fullscreen" className="dc-pdp-image-expand">
                <Expand aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
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
                  className={`h-14 min-w-14 overflow-hidden rounded-lg border-2 transition ${selectedImageIndex === index ? "border-indigo-300/80" : "border-transparent opacity-75 hover:opacity-100"}`}
                >
                  <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section data-pdp-buy className="flex min-w-0 flex-col gap-4">
          <div data-pdp-titleblock className="dc-pdp-identity">
            <p className="dc-pdp-type-label">{identity.typeLabel}</p>
            <h1 className="dc-pdp-title">{identity.title}</h1>
            {instructorLabel ? <p data-pdp-instructor className="dc-pdp-byline">By {instructorLabel}</p> : null}
            {ratingSummary.hasRating ? (
              <div className="dc-pdp-identity-rating">
                <RatingStars rating={ratingSummary.rating} />
                <button type="button" className="dc-pdp-text-action" onClick={() => document.getElementById("product-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  {ratingSummary.count.toLocaleString("en-IN")} rating{ratingSummary.count === 1 ? "" : "s"}
                </button>
              </div>
            ) : null}
          </div>

          {metadataItems.length > 0 && (
            <dl data-pdp-meta className="dc-pdp-meta-list">
              {metadataItems.map((item) => <Meta key={item.label} label={item.label} text={item.text} />)}
            </dl>
          )}

          {isProductOwned ? (
            firstAvailableUpdate ? (
              <section data-pdp-upgrade-box className="dc-pdp-purchase">
                <p className="dc-pdp-type-label">Update available</p>
                <h2 className="dc-pdp-update-title">{firstAvailableUpdate.title}</h2>
                {firstAvailableUpdate.description?.trim() ? <p className="dc-pdp-selection-note">{firstAvailableUpdate.description.trim()}</p> : null}
                {updateBenefits.length > 0 ? <p className="dc-pdp-selection-note">Includes {updateBenefits.join(" · ")}</p> : null}
                <PdpSelectionSummary snapshot={order} pricing={pricingView} />
                <PaymentButton block className="dc-pdp-primary" icon={null} disabled={pricingBlocked} onClick={handleBuyUpgrade} data-pdp-upgrade-checkout="" label="Get update" />
                {onOpenCourse ? <button type="button" data-pdp-library-secondary className="dc-pdp-text-action" onClick={() => onOpenCourse(product)}>{identity.libraryAction}</button> : null}
              </section>
            ) : onOpenCourse ? (
              <button type="button" data-pdp-library-primary onClick={() => onOpenCourse(product)} className="dc-pdp-library-cta">{identity.libraryAction}</button>
            ) : null
          ) : (
            <section data-pdp-price-box className="dc-pdp-purchase">
              {hasPurchaseBuilder ? (
                <PdpPurchaseBuilder
                  compact
                  product={product}
                  isProductOwned={isProductOwned}
                  ownedUpdateIds={updates}
                  ownedModuleIds={ownedModuleIds}
                  ownedResourceIds={ownedResourceIds}
                  returnRoute={`#/product/${encodeURIComponent(product.id)}`}
                  onPreview={handlePreview}
                  onSelectionChange={handleSelectionChange}
                  pricing={pricingView}
                  couponEntry={couponEntry}
                />
              ) : (
                <>
                  {couponEntry}
                  <PdpSelectionSummary snapshot={order} pricing={pricingView} showOriginal={Number.isFinite(product.originalPrice) && product.originalPrice > 0} />
                  <PaymentButton block className="dc-pdp-primary" icon={null} disabled={unavailable || pricingBlocked} onClick={primaryAction} data-pdp-checkout="" label={unavailable ? "Coming soon" : pricingBusy ? "Verifying price" : (pricing.quote ? pricing.quote.cashPayable === 0 : productIsFree) ? "Get free access" : "Get access"} />
                </>
              )}
              {unavailable ? <p data-pdp-unavailable className="dc-pdp-selection-note">Not available for purchase yet.</p> : null}
            </section>
          )}

          <div className="dc-pdp-secondary-actions">
            {!isProductOwned && !productIsFree && !unavailable && purchaseMode === "full_product" && onAddToCart ? (
              <button type="button" disabled={inCart} onClick={() => onAddToCart(product.id)} className="dc-pdp-text-action">{inCart ? "In cart" : "Add to cart"}</button>
            ) : null}
            {onToggleFavorite ? (
              <button type="button" data-pdp-save aria-label={favorite ? "Remove from saved products" : "Save product"} aria-pressed={favorite} onClick={() => onToggleFavorite(product.id)} className="dc-pdp-text-action">{favorite ? "Saved" : "Save"}</button>
            ) : null}
            <div ref={shareRef}>
              <button type="button" onClick={() => setShareOpen((value) => !value)} aria-label="Share product" aria-expanded={shareOpen} aria-controls="product-share-menu" aria-haspopup="menu" className="dc-pdp-text-action">Share</button>
              <div data-product-share role="menu" id="product-share-menu" aria-label="Share product" className="dc-pdp-share-menu" hidden={!shareOpen} onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']"));
                const current = items.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
                items[next]?.focus({ preventScroll: true });
              }}>
                <PopoverItem role="menuitem" onClick={() => void shareNative()}>Share via device</PopoverItem>
                <PopoverItem role="menuitem" onClick={() => shareTo("whatsapp")}>WhatsApp</PopoverItem>
                <PopoverItem role="menuitem" onClick={() => shareTo("telegram")}>Telegram</PopoverItem>
                <PopoverItem role="menuitem" onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy link"}</PopoverItem>
              </div>
            </div>
          </div>

        </section>

        <div data-pdp-stack className="flex min-w-0 flex-col gap-6">
          <DetailsCard product={product} modules={modules} curriculumMode={curriculumMode} includedItems={includedItems} highlights={highlights} tab={activeTab} onTab={setActiveTab} expandedModule={expandedModule} onExpandModule={setExpandedModule} />
          <ReviewsCard
            mode="preview"
            product={product}
            reviews={productReviews}
            canReview={Boolean(user)}
            composerOpen={reviewComposerOpen}
            rating={reviewRating}
            comment={reviewComment}
            submitting={reviewSubmitting}
            notice={reviewNotice}
            onToggleComposer={toggleReviewComposer}
            onSeeAllReviews={openReviewsPage}
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

function ProductArtworkFallback({ title, compact = false }: { product: Product; title: string; typeLabel: string; compact?: boolean }) {
  return <div role="img" aria-label={`Artwork unavailable for ${title}`} className={`dc-pdp-artwork-fallback ${compact ? "dc-pdp-artwork-fallback--compact" : ""}`}><span>Image unavailable</span></div>;
}

function ProductImageThumb({ product, source }: { product: Product; source: string | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const identity = getProductPresentation(product);
  if (!source || failed) return <ProductArtworkFallback product={product} title={identity.title} typeLabel={identity.typeLabel} compact />;
  return <img src={source} alt={identity.title} loading="lazy" decoding="async" width={112} height={96} onError={() => setFailed(true)} className="h-24 w-28 shrink-0 object-contain" />;
}

function ProductDescription({ text }: { text: string }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) setCanExpand(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 4 + 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); };
  }, [text]);
  return (
    <div>
      <p ref={ref} id={id} className="dc-pdp-description" data-expanded={expanded}>{text}</p>
      {canExpand ? <button type="button" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="dc-pdp-text-action">{expanded ? "Show less" : "Read more"}</button> : null}
    </div>
  );
}

function DetailsCard({ product, modules, curriculumMode, includedItems, highlights, tab, onTab, expandedModule, onExpandModule }: { product: Product; modules: CurriculumModule[]; curriculumMode: CurriculumViewMode; includedItems: string[]; highlights: string[]; tab: DetailTab; onTab: (tab: DetailTab) => void; expandedModule: string | null; onExpandModule: (id: string | null) => void }) {
  const tabs: { value: DetailTab; label: string }[] = [
    { value: "Description", label: "About" },
    { value: "Curriculum", label: "Content" },
  ];
  return (
    <section data-pdp-details>
      <div data-pdp-tabbar className="dc-pdp-tabs" role="group" aria-label="Product details">
        {tabs.map((item) => (
          <button key={item.value} type="button" aria-pressed={tab === item.value} onClick={() => onTab(item.value)}>{item.label}</button>
        ))}
      </div>
      <div data-pdp-tab-content aria-live="polite" className="dc-pdp-detail-content">
        {tab === "Description" && (
          <div className="dc-pdp-detail-sections">
            {product.description?.trim() ? <ProductDescription key={product.id} text={product.description.trim()} /> : null}
            {includedItems.length > 0 && (
              <section data-pdp-included>
                <h3 className="dc-pdp-section-heading">Includes</h3>
                <ul className="dc-pdp-included-list">{includedItems.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            )}
            {highlights.length > 0 && (
              <section data-pdp-highlights>
                <h3 className="dc-pdp-section-heading">Highlights</h3>
                <ul className="dc-pdp-highlight-list">{highlights.slice(0, 4).map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                {highlights.length > 4 ? <details className="dc-pdp-more-highlights"><summary>More highlights</summary><ul className="dc-pdp-highlight-list">{highlights.slice(4).map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></details> : null}
              </section>
            )}
            {!product.description?.trim() && includedItems.length === 0 && highlights.length === 0 ? <EmptyDetail text="Details will be available soon." /> : null}
          </div>
        )}
        {tab === "Curriculum" && (
          modules.length === 0 ? <EmptyDetail text={curriculumMode === "paid-upgrade" ? "All updates are in your library." : "No content published yet."} /> : (
            <div data-pdp-curriculum data-pdp-curriculum-mode={curriculumMode}>
              {curriculumMode === "paid-upgrade" ? <p data-pdp-curriculum-upgrade-hint className="dc-pdp-paid-note">Available with a paid update.</p> : null}
              {modules.map((module, index) => <CurriculumModuleRow key={module.id || `${module.title}-${index}`} module={module} index={index} expandedModule={expandedModule} onExpandModule={onExpandModule} />)}
            </div>
          )
        )}
      </div>
    </section>
  );
}

function CurriculumModuleRow({ module, index, expandedModule, onExpandModule, depth = 0 }: { module: CurriculumModule; index: number; expandedModule: string | null; onExpandModule: (id: string | null) => void; depth?: number }) {
  const panelId = useId();
  const childModules = module.modules || [];
  const resources = module.resources || [];
  const open = expandedModule === module.id || Boolean(expandedModule && curriculumContainsId(childModules, expandedModule));
  const paid = Boolean(module.paid);
  return (
    <div data-pdp-curriculum-module data-module-id={module.id} data-paid={paid ? "true" : "false"} className="dc-pdp-curriculum-row" data-depth={depth}>
      <button type="button" className="dc-pdp-module-heading" aria-expanded={open} aria-controls={panelId} onClick={() => onExpandModule(open ? null : module.id)}>
        <span aria-hidden="true" className="dc-pdp-module-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="dc-pdp-module-copy">
          <span className="dc-pdp-module-name">{module.title}</span>
          {paid ? <span className="dc-pdp-paid-note">Paid upgrade{module.paidUpdatePrice ? ` · ${module.paidUpdatePrice}` : ""}</span> : null}
          {resources.length > 0 || childModules.length > 0 ? (
            <span className="dc-pdp-module-count">{[resources.length > 0 ? `${resources.length} resource${resources.length === 1 ? "" : "s"}` : "", childModules.length > 0 ? `${childModules.length} submodule${childModules.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <div id={panelId} hidden={!open} className="dc-pdp-module-content">
        {open ? <>
        {resources.map((resource) => <div key={resource.id} className="dc-pdp-resource"><span>{resource.name}</span><span>{formatResourceType(resource.type)}</span></div>)}
        {childModules.map((child, childIndex) => <CurriculumModuleRow key={child.id || `${module.id}-${childIndex}`} module={child} index={childIndex} expandedModule={expandedModule} onExpandModule={onExpandModule} depth={depth + 1} />)}
        {resources.length === 0 && childModules.length === 0 ? <p className="dc-pdp-selection-note">No resources yet.</p> : null}
        </> : null}
      </div>
    </div>
  );
}

const REVIEW_PREVIEW_SIZE = 2;
const REVIEW_PAGE_SIZE = 8;

function getProductRatingSummary(product: Product, reviews: PublishedProductReview[]) {
  if (Number.isFinite(product.rating) && product.rating > 0 && product.reviews > 0) {
    return { rating: product.rating, count: product.reviews, hasRating: true, source: "catalog" as const };
  }
  const ratings = reviews.map((review) => Number(review.rating)).filter((rating) => Number.isFinite(rating) && rating > 0);
  if (ratings.length === 0) return { rating: 0, count: 0, hasRating: false, source: "published" as const };
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return { rating: average, count: ratings.length, hasRating: true, source: "published" as const };
}

function ReviewsCard({ mode, product, reviews, canReview, composerOpen, rating, comment, submitting, notice, onToggleComposer, onSeeAllReviews, onRating, onComment, onSubmit }: {
  mode: "preview" | "full";
  product: Product;
  reviews: PublishedProductReview[];
  canReview: boolean;
  composerOpen: boolean;
  rating: number;
  comment: string;
  submitting: boolean;
  notice: string;
  onToggleComposer: () => void;
  onSeeAllReviews?: () => void;
  onRating: (rating: number) => void;
  onComment: (comment: string) => void;
  onSubmit: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(REVIEW_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(REVIEW_PAGE_SIZE);
  }, [product.id]);
  const visibleReviews = reviews.slice(0, mode === "preview" ? REVIEW_PREVIEW_SIZE : visibleCount);
  const remaining = mode === "full" ? Math.max(0, reviews.length - visibleCount) : 0;
  const ratingSummary = getProductRatingSummary(product, reviews);
  const identity = getProductPresentation(product);

  return (
    <section data-pdp-reviews data-pdp-review-mode={mode} id={mode === "preview" ? "product-reviews" : undefined} className="dc-pdp-review-section">
      <header className="dc-pdp-section-header">
        <div className="min-w-0">
          <h2 className="dc-pdp-section-heading">{mode === "full" ? "Reviews & Ratings" : "Reviews"}</h2>
          {mode === "full" ? <p className="dc-pdp-selection-note">{identity.title}</p> : null}
        </div>
        <button type="button" onClick={onToggleComposer} aria-controls="pdp-review-composer" aria-expanded={composerOpen} className="dc-pdp-text-action">
          {composerOpen ? "Cancel" : canReview ? "Write a review" : "Sign in to review"}
        </button>
      </header>
      {mode === "full" && ratingSummary.hasRating ? (
        <div data-pdp-rating-summary className="dc-pdp-review-summary">
          <RatingStars rating={ratingSummary.rating} />
          <span>{ratingSummary.count.toLocaleString("en-IN")} rating{ratingSummary.count === 1 ? "" : "s"}</span>
        </div>
      ) : null}
      {composerOpen && canReview && (
        <div id="pdp-review-composer" className="dc-pdp-review-composer">
          <p className="dc-pdp-selection-note">Your rating</p>
          <div className="mt-2 flex gap-1" role="group" aria-label="Choose a rating">
            {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => onRating(value)} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={value === rating} className="dc-pdp-rating-choice"><Star aria-hidden="true" className={`h-5 w-5 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-white/40"}`} /></button>)}
          </div>
          <textarea value={comment} onChange={(event) => onComment(event.target.value.slice(0, 2000))} rows={3} maxLength={2000} aria-label="Your product review" placeholder="Your experience" className="dc-pdp-review-input" />
          <button type="button" disabled={submitting} onClick={onSubmit} className="dc-pdp-review-submit">{submitting ? "Submitting…" : "Submit review"}</button>
        </div>
      )}
      {notice ? <p role="status" aria-live="polite" className="dc-pdp-selection-note">{notice}</p> : null}
      {reviews.length > 0 ? (
        <div data-pdp-review-list data-pdp-review-preview-limit={mode === "preview" ? REVIEW_PREVIEW_SIZE : undefined}>
          {visibleReviews.map((review) => (
            <article className="dc-pdp-review" key={review.id}>
              <header className="dc-pdp-review-header">
                <div className="min-w-0"><p className="dc-pdp-review-name">{review.name}</p><p className="dc-pdp-review-date">{review.date}{review.verifiedPurchase ? <span className="dc-pdp-review-verified">Verified purchase</span> : null}</p></div>
                <RatingStars rating={review.rating} />
              </header>
              <p className="dc-pdp-review-comment">{review.comment}</p>
            </article>
          ))}
          {remaining > 0 ? <button type="button" data-load-more-reviews onClick={() => setVisibleCount((count) => count + REVIEW_PAGE_SIZE)} className="dc-pdp-text-action">Load more reviews</button> : null}
        </div>
      ) : <p className="dc-pdp-selection-note">No written reviews yet.</p>}
      {mode === "preview" && reviews.length > 0 ? (
        <button type="button" data-see-all-reviews onClick={onSeeAllReviews} className="dc-pdp-text-action">See all reviews</button>
      ) : null}
    </section>
  );
}

function RelatedProducts({ products, onNavigate }: { products: Product[]; onNavigate?: (product: Product) => void }) {
  const [activePages, setActivePages] = useState<[number, number]>([0, 0]);
  const productSignature = products.map((item) => item.id).join("|");
  useEffect(() => setActivePages([0, 0]), [productSignature]);
  if (!onNavigate || products.length === 0) return null;

  // Interleave the relevance-ranked catalog so each row starts with a strong
  // match instead of putting every highest-ranked item on the same rail.
  const rows = [
    products.filter((_, index) => index % 2 === 0),
    products.filter((_, index) => index % 2 === 1),
  ];
  const movePage = (rowIndex: 0 | 1, delta: number, pageCount: number) => {
    setActivePages((current) => {
      const next = [...current] as [number, number];
      next[rowIndex] = Math.max(0, Math.min(pageCount - 1, current[rowIndex] + delta));
      return next;
    });
  };

  return (
    <section data-pdp-related>
      <h2 className="dc-pdp-section-heading mb-4">Related products</h2>
      <div data-pdp-related-list className="flex flex-col gap-5">
        {rows.map((rowProducts, rowIndex) => {
          if (rowProducts.length === 0) return null;
          const pages = Array.from({ length: Math.ceil(rowProducts.length / 2) }, (_, pageIndex) =>
            rowProducts.slice(pageIndex * 2, pageIndex * 2 + 2),
          );
          const pageIndex = Math.min(activePages[rowIndex], pages.length - 1);
          const rowNumber = rowIndex + 1;
          const viewportId = `pdp-related-row-${rowNumber}`;
          return (
            <section key={rowNumber} data-pdp-related-row={rowNumber} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="sr-only">Related products, row {rowNumber}</h3>
                {pages.length > 1 ? <div className="flex items-center gap-1.5" aria-label={`Slide controls for related products row ${rowNumber}`}>
                  <button
                    type="button"
                    data-pdp-related-prev={rowNumber}
                    aria-label={`Previous related products, row ${rowNumber}`}
                    aria-controls={viewportId}
                    disabled={pageIndex === 0}
                    onClick={() => movePage(rowIndex as 0 | 1, -1, pages.length)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    data-pdp-related-next={rowNumber}
                    aria-label={`Next related products, row ${rowNumber}`}
                    aria-controls={viewportId}
                    disabled={pageIndex >= pages.length - 1}
                    onClick={() => movePage(rowIndex as 0 | 1, 1, pages.length)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div> : null}
              </div>
              <div id={viewportId} data-pdp-related-viewport className="min-w-0" aria-live="polite">
                <div
                  data-pdp-related-track
                  data-active-page={pageIndex}
                  className="flex min-w-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: `translate3d(-${pageIndex * 100}%, 0, 0)` }}
                >
                  {pages.map((page, index) => (
                    <div key={index} data-pdp-related-page className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                      {page.map((item) => (
                        <RelatedProductCard key={item.id} item={item} onNavigate={onNavigate} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function RelatedProductCard({ item, onNavigate }: { item: Product; onNavigate: (product: Product) => void }) {
  const identity = getProductPresentation(item);
  const image = item.images?.find((source) => source.trim()) || item.image;
  const finalPrice = isFreeProduct(item) ? 0 : item.price;
  return (
    <button type="button" data-pdp-related-card onClick={() => onNavigate(item)} aria-label={`View ${identity.title}`} className="dc-pdp-related-card">
      <ProductImageThumb product={item} source={image} />
      <span className="dc-pdp-related-copy">
        <span className="dc-pdp-related-type">{identity.typeLabel}</span>
        <span className="dc-pdp-related-title">{identity.title}</span>
        {item.reviews > 0 && item.rating > 0 ? <span className="dc-pdp-related-rating"><RatingStars rating={item.rating} /><span>{item.reviews.toLocaleString("en-IN")} ratings</span></span> : null}
        <span className="dc-pdp-price-line">
          {Number.isFinite(item.originalPrice) && item.originalPrice > finalPrice && item.originalPrice > 0 ? <del className="dc-pdp-original-price">{formatPrice(item.originalPrice)}</del> : null}
          <strong className="dc-pdp-related-price">{formatPrice(finalPrice)}</strong>
        </span>
      </span>
    </button>
  );
}

function RatingStars({ rating, className = "" }: { rating: number; className?: string }) {
  const safeRating = Math.max(0, Math.min(5, rating));
  return <span role="img" aria-label={`${safeRating.toFixed(1)} out of 5 stars`} className={`dc-pdp-rating ${className}`}><Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><strong>{safeRating.toFixed(1)}</strong></span>;
}

function Meta({ label, text }: { label: string; text: string }) {
  return <div data-pdp-meta-item><dt>{label}</dt><dd>{text}</dd></div>;
}
function EmptyDetail({ text }: { text: string }) {
  return <p data-pdp-empty-detail className="dc-pdp-selection-note">{text}</p>;
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
    <div data-pdp-root data-pdp-not-found className="grid min-h-[50vh] place-items-center px-6 py-10 text-center">
      <div>
        <h1 className="mt-4 text-2xl font-bold text-white">Product not found</h1>
        <p className="mt-2 text-sm text-white/60">This product is no longer available in the live catalog.</p>
        <button type="button" onClick={onBack} className="dc-pdp-library-cta mt-5">Back to store</button>
      </div>
    </div>
  );
}
