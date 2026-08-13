import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import type { Product } from "../data/products";

export type PublishedProductReview = {
  id: string;
  productId: string;
  productTitle: string;
  name: string;
  initials: string;
  avatarColor: string;
  rating: number;
  comment: string;
  createdAtMs: number;
  date: string;
  verifiedPurchase: boolean;
  source: "live" | "fallback";
};

type FallbackReview = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  rating: number;
  date: string;
  comment: string;
};

const timestampMs = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const relativeDate = (milliseconds: number): string => {
  if (!milliseconds) return "Recently";
  const days = Math.max(0, Math.floor((Date.now() - milliseconds) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "L";
const COLORS = ["bg-pink-500", "bg-indigo-500", "bg-emerald-500", "bg-orange-500", "bg-sky-500", "bg-violet-500"];

const mapReview = (id: string, data: DocumentData, productsById: Map<string, Product>, index: number): PublishedProductReview | null => {
  const productId = String(data.productId || data.productDocumentId || "").trim();
  const product = productsById.get(productId);
  const comment = String(data.comment || data.review || data.body || "").trim();
  if (!product || !comment) return null;
  const name = String(data.customerName || data.userName || data.name || "Verified learner").trim();
  const rating = Math.max(1, Math.min(5, Math.round(Number(data.rating || 0))));
  const createdAtMs = timestampMs(data.createdAt || data.updatedAt);
  return {
    id,
    productId,
    productTitle: product.title,
    name,
    initials: initials(name),
    avatarColor: COLORS[index % COLORS.length],
    rating,
    comment,
    createdAtMs,
    date: relativeDate(createdAtMs),
    verifiedPurchase: Boolean(data.verifiedPurchase),
    source: "live",
  };
};

/** Select the newest reviews while keeping the home rail diverse: one review
 * per product first, then at most a second review per product, up to six. */
export const selectHomepageReviews = (reviews: PublishedProductReview[], limit = 6) => {
  const sorted = [...reviews].sort((a, b) => b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id));
  const selected: PublishedProductReview[] = [];
  const counts = new Map<string, number>();
  for (const maxPerProduct of [1, 2]) {
    for (const review of sorted) {
      if (selected.length >= limit) break;
      if (selected.some((item) => item.id === review.id)) continue;
      const count = counts.get(review.productId) || 0;
      if (count >= maxPerProduct) continue;
      selected.push(review);
      counts.set(review.productId, count + 1);
    }
  }
  // A very small catalog may not have three products yet. Keep the promised
  // six-card rail full in that temporary case; as soon as more products or
  // live reviews exist, the one-then-two diversity passes above take over.
  for (const review of sorted) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === review.id)) selected.push(review);
  }
  return selected;
};

const buildFallbackReviews = (products: Product[], reviews: FallbackReview[]): PublishedProductReview[] => {
  if (products.length === 0) return [];
  return reviews.map((review, index) => {
    const product = products[index % products.length];
    return {
      ...review,
      id: `fallback:${product.id}:${review.id}`,
      productId: product.id,
      productTitle: product.title,
      createdAtMs: -index - 1,
      verifiedPurchase: false,
      source: "fallback" as const,
    };
  });
};

export function usePublishedProductReviews(products: Product[]) {
  const [rawReviews, setRawReviews] = useState<Array<{ id: string; data: DocumentData }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firestore rules expose only moderation-approved reviews. Sorting stays
    // client-side, avoiding a composite-index requirement for new projects.
    const published = query(collection(db, "siteReviews"), where("status", "==", "published"));
    return onSnapshot(published, (snapshot) => {
      setRawReviews(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Published review sync failed", error);
      setRawReviews([]);
      setLoading(false);
    });
  }, []);

  const reviews = useMemo(() => {
    const productsById = new Map(products.map((product) => [product.id, product]));
    return rawReviews
      .map((review, index) => mapReview(review.id, review.data, productsById, index))
      .filter((review): review is PublishedProductReview => Boolean(review))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [products, rawReviews]);

  return { reviews, loading };
}

export function useHomepageProductReviews(products: Product[], fallback: FallbackReview[], limit = 6) {
  const { reviews: liveReviews, loading } = usePublishedProductReviews(products);
  const reviews = useMemo(() => {
    const fallbackReviews = buildFallbackReviews(products, fallback);
    // Live reviews always sort before placeholders and progressively replace
    // them. Diversity still stays capped at two cards per product.
    return selectHomepageReviews([...liveReviews, ...fallbackReviews], limit);
  }, [products, fallback, limit, liveReviews]);
  return { reviews, loading, hasLiveReviews: liveReviews.length > 0 };
}
