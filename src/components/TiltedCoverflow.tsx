import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import type { Product } from "../data/products";

/**
 * AI Canvas "Tilted Coverflow"
 * (https://aicanvas.me/components/tilted-coverflow)
 *
 * Ported 1:1 — the 3D fan (CSS perspective + rotateY, no Three.js), the size
 * gradient from center to edge, per-card breathing loops, the word-by-word
 * focused caption, drag / click / arrow-key focus, circular wrap, the dot row
 * and the hint line are all exactly the source component.
 *
 * Store integration on top of the source design (looks identical):
 * - Slides come from the catalog's TOP-RATED products (Bayesian weighted
 *   rating — see `topRatedSlides`), refreshed automatically whenever the
 *   catalog snapshot updates. Until seven products exist, the source demo's
 *   default cards fill the remaining slots.
 * - Tapping the FOCUSED card opens that product (side-card taps focus, as in
 *   the source).
 * - Responsive visible-card count: 3 side cards on desktop (≥1024px), 2 on
 *   tablet (≥640px), 1 on phones — the fan re-fans automatically on resize.
 * - The page already paints the fixed Black Ice backdrop, so the component
 *   is transparent and uses the source's dark-theme dot/hint/ring inks.
 */

/* ── Layout constants (source values) ─────────────────────────────────── */

const TOTAL = 7;
const HALF = 3;
const ROTATION_PER_STEP = 14;
const ARC_Y = 8;
const GAP_PX = 30;
const SCALE_BY_OFFSET = [1.0, 0.88, 0.76, 0.64];
const SPRING = { type: "spring", stiffness: 240, damping: 30 } as const;
const MOUNT_SPRING = { type: "spring", stiffness: 180, damping: 18 } as const;
const STAGGER_MS = 0.09;

type CoverSlide = {
  id: number;
  caption: string;
  image: string;
  /** Present when the slide is a live catalog product. */
  product?: Product;
};

/** The source component's seven default cards — used to fill empty slots. */
const DEFAULT_SLIDES: { caption: string; image: string }[] = [
  { caption: "Alley Sentinel", image: "https://images.unsplash.com/photo-1550532422-378e93ec379c?w=600&h=750&fit=crop&auto=format" },
  { caption: "Sticker Riot", image: "https://images.unsplash.com/photo-1700222720939-60f0e91d691d?w=600&h=750&fit=crop&auto=format" },
  { caption: "Quiet Vandals", image: "https://images.unsplash.com/photo-1597355797858-35ffba85673c?w=600&h=750&fit=crop&auto=format" },
  { caption: "Soft Beast", image: "https://images.unsplash.com/photo-1612486524816-d7aaa8ac7bd6?w=600&h=750&fit=crop&auto=format" },
  { caption: "City Gaze", image: "https://images.unsplash.com/photo-1644424428722-b6f950e4b22d?w=600&h=750&fit=crop&auto=format" },
  { caption: "Loud Letters", image: "https://images.unsplash.com/photo-1581010105372-caf9ed5ab50f?w=600&h=750&fit=crop&auto=format" },
  { caption: "Color Crash", image: "https://images.unsplash.com/photo-1589236095092-1f7ea6f09cdd?w=600&h=750&fit=crop&auto=format" },
];

/* ── Top-rated ranking ─────────────────────────────────────────────────── */

/**
 * Solid top-rated ordering: a Bayesian weighted rating, the same shape IMDb
 * uses for its Top 250. A product with a 5.0 from 2 reviews must NOT outrank
 * a 4.8 from 900 reviews, so every rating is pulled toward the catalog mean
 * until the product has earned enough reviews to speak for itself:
 *
 *   score = (v / (v + m)) · R  +  (m / (v + m)) · C
 *
 * where R = the product's rating, v = its review count, m = the confidence
 * threshold (10 reviews), and C = the catalog's mean rating. Ties break on
 * review count, then raw rating. The top seven products become slides; the
 * source demo's default cards fill any remaining slots, so the fan is always
 * exactly seven cards and new products slot in automatically as the catalog
 * snapshot updates.
 */
const CONFIDENCE_REVIEWS = 10;

export function topRatedSlides(products: Product[]): CoverSlide[] {
  const pool = products.filter(
    (product) => product.status !== "draft" && product.status !== "archived",
  );
  const catalogMean =
    pool.length > 0
      ? pool.reduce((sum, product) => sum + (product.rating || 0), 0) / pool.length
      : 4.2;

  const ranked = pool
    .map((product) => {
      const votes = Math.max(0, product.reviews || 0);
      const rating = product.rating || 0;
      const weight = votes / (votes + CONFIDENCE_REVIEWS);
      return { product, score: weight * rating + (1 - weight) * catalogMean };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.product.reviews || 0) - (a.product.reviews || 0) ||
        (b.product.rating || 0) - (a.product.rating || 0),
    );

  const slides: CoverSlide[] = ranked.slice(0, TOTAL).map((entry, index) => ({
    id: index,
    caption: entry.product.title,
    image: entry.product.image || entry.product.images?.[0] || DEFAULT_SLIDES[index].image,
    product: entry.product,
  }));

  for (let index = slides.length; index < TOTAL; index += 1) {
    slides.push({ id: index, caption: DEFAULT_SLIDES[index].caption, image: DEFAULT_SLIDES[index].image });
  }

  return slides;
}

/* ── Geometry helpers (source math) ────────────────────────────────────── */

/** Wraps offsets into -HALF..+HALF so 3 cards always sit on each side. */
function visibleOffset(cardIndex: number, focus: number, total: number): number {
  const half = Math.floor(total / 2);
  let off = cardIndex - focus;
  if (off > half) off -= total;
  if (off < -half) off += total;
  return off;
}

/**
 * Walks outward from the center accumulating the average of two adjacent
 * scaled half-widths plus a constant pixel gap, mirrored to the left — so
 * adjacent cards never overlap at any viewport width.
 */
function buildXPositions(scales: number[], baseWidth: number, gap: number): Map<number, number> {
  const positions = new Map<number, number>();
  positions.set(0, 0);
  let cursor = 0;
  for (let i = 1; i <= HALF; i += 1) {
    const step = (scales[i - 1] / 2 + scales[i] / 2) * baseWidth + gap;
    cursor += step;
    positions.set(i, cursor);
    positions.set(-i, -cursor);
  }
  return positions;
}

/* ── Component ─────────────────────────────────────────────────────────── */

type TiltedCoverflowProps = {
  products: Product[];
  onOpenProduct?: (product: Product) => void;
};

export default function TiltedCoverflow({ products, onOpenProduct }: TiltedCoverflowProps) {
  const slides = useMemo(() => topRatedSlides(products), [products]);

  const [focus, setFocus] = useState(3);
  const [maxSide, setMaxSide] = useState(3);
  const [cardWidth, setCardWidth] = useState(180);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLButtonElement | null>(null);

  // Entrance transition runs exactly once.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Phone / tablet / desktop card counts: 1, 2 or 3 side cards.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const tablet = window.matchMedia("(min-width: 640px)");
    const apply = () => setMaxSide(desktop.matches ? 3 : tablet.matches ? 2 : 1);
    apply();
    desktop.addEventListener("change", apply);
    tablet.addEventListener("change", apply);
    return () => {
      desktop.removeEventListener("change", apply);
      tablet.removeEventListener("change", apply);
    };
  }, []);

  // Measure one representative card's untransformed width for the fan math.
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setCardWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const step = useCallback((dir: number) => {
    setFocus((current) => (current + dir + TOTAL) % TOTAL);
  }, []);

  // Arrow keys shift focus — but never while the user is typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const distance = info.offset.x;
    const velocity = info.velocity.x;
    if (distance < -80 || velocity < -500) step(1);
    else if (distance > 80 || velocity > 500) step(-1);
  };

  const positions = buildXPositions(SCALE_BY_OFFSET, cardWidth, GAP_PX);

  return (
    <div data-store-coverflow className="flex w-full select-none items-center justify-center overflow-hidden px-4 py-6">
      <div className="relative flex w-full max-w-5xl flex-col items-center gap-8">
        {/* Stage — owns the horizontal drag. */}
        <motion.div
          className="relative flex w-full items-center justify-center"
          style={{ perspective: "1400px", height: "clamp(280px, 36vw, 380px)" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
        >
          {slides.map((slide) => {
            const offset = visibleOffset(slide.id, focus, TOTAL);
            const absOffset = Math.abs(offset);
            const hidden = absOffset > maxSide;
            const isFocus = offset === 0;
            const scale = SCALE_BY_OFFSET[absOffset] ?? 0.6;
            const rotateY = -offset * ROTATION_PER_STEP;
            const translateX = positions.get(offset) ?? 0;
            const translateY = absOffset * ARC_Y;
            const mountDelay = (HALF - absOffset) * STAGGER_MS;
            const transition = mounted ? SPRING : { ...MOUNT_SPRING, delay: mountDelay };
            const breathDuration = 7 + slide.id * 0.6;
            const words = slide.caption.split(" ");

            return (
              /* Layer 1 — fan transform + hit target, no visual chrome. */
              <motion.button
                key={slide.id}
                ref={slide.id === 0 ? cardRef : undefined}
                type="button"
                aria-label={slide.caption}
                className="absolute aspect-[4/5] w-[clamp(160px,17vw,220px)]"
                style={{
                  transformStyle: "preserve-3d",
                  transformOrigin: "center center",
                  pointerEvents: hidden ? "none" : "auto",
                  cursor: isFocus ? "grab" : "pointer",
                  zIndex: TOTAL - absOffset,
                }}
                initial={{ opacity: 0, scale: 0.45, y: 70, x: 0, rotateY: 0 }}
                animate={{ x: translateX, y: translateY, rotateY, scale, opacity: hidden ? 0 : 1 }}
                transition={transition}
                whileTap={isFocus ? { cursor: "grabbing" } : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (hidden) return;
                  if (!isFocus) {
                    setFocus(slide.id);
                    return;
                  }
                  if (slide.product && onOpenProduct) onOpenProduct(slide.product);
                }}
              >
                {/* Layer 2 — visual chrome + breathing loop, one moving unit. */}
                <motion.div
                  className="relative h-full w-full overflow-hidden rounded-[20px] ring-1 ring-white/10"
                  style={{
                    boxShadow: isFocus
                      ? "0 30px 60px rgba(0,0,0,0.35), 0 12px 24px rgba(0,0,0,0.18)"
                      : "0 14px 30px rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.12)",
                  }}
                  animate={{ y: [0, -12, 0, 10, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
                  transition={{ duration: breathDuration, repeat: Infinity, ease: "easeInOut" }}
                >
                  {/* Layer 3 — photo + caption. */}
                  <img
                    src={slide.image}
                    alt={slide.caption}
                    loading="lazy"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pb-3 pt-12">
                    <div
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-2/3"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.18) 70%, rgba(0,0,0,0) 100%)",
                      }}
                    />
                    <span
                      className="relative text-center font-medium leading-tight text-white"
                      style={{ fontSize: "clamp(0.95rem, 1.1vw, 1.25rem)", textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}
                    >
                      {isFocus
                        ? words.map((word, i) => (
                            <motion.span
                              key={`${focus}-${i}`}
                              className="inline-block"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.06, duration: 0.42, ease: [0.2, 0.65, 0.3, 1] }}
                            >
                              {word}
                              {i < words.length - 1 ? "\u00A0" : ""}
                            </motion.span>
                          ))
                        : words.map((word, i) => (
                            <span key={i} className="inline-block">
                              {word}
                              {i < words.length - 1 ? "\u00A0" : ""}
                            </span>
                          ))}
                    </span>
                  </div>
                </motion.div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Dots + hint (source dark-theme inks — the page is always dark). */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {slides.map((slide) => {
              const isCurrent = slide.id === focus;
              return (
                <motion.button
                  key={slide.id}
                  type="button"
                  aria-label={`Focus ${slide.caption}`}
                  className="h-1.5 rounded-full bg-[#FAFAF0]"
                  animate={{ width: isCurrent ? 22 : 6, opacity: isCurrent ? 1 : 0.35 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={() => setFocus(slide.id)}
                />
              );
            })}
          </div>
          <p className="text-xs tracking-wide text-[#9E9E98]">drag, click, or use the arrow keys</p>
        </div>
      </div>
    </div>
  );
}
