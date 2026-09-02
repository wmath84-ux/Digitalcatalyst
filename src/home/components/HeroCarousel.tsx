import { useCallback, useEffect, useRef, useState } from "react";
import type { Banner } from "../types";
import { GlassButton } from "../../components/ui/glass-button";

interface HeroCarouselProps {
  banners: Banner[];
  /**
   * Called when the learner taps a slide (anywhere on the card, CTA
   * included). Slides without a configured link are rendered
   * non-interactive. A real swipe never fires this — the tap is
   * suppressed after the drag crosses the slide threshold.
   */
  onOpen?: (banner: Banner) => void;
}

export default function HeroCarousel({ banners, onOpen }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(1);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set when a drag crosses the slide threshold so the synthetic click
  // that follows the swipe is ignored (a swipe is not a tap).
  const suppressTapRef = useRef(false);

  const total = banners.length;

  const isBannerLinked = (banner: Banner) => Boolean(onOpen) && banner.linkType !== "none";

  const goTo = useCallback(
    (index: number) => {
      const next = ((index % total) + total) % total;
      setActiveIndex(next);
    },
    [total],
  );

  useEffect(() => {
    if (isDragging) return;
    autoPlayRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total);
    }, 4500);
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [isDragging, total]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    suppressTapRef.current = false;
    startX.current = e.clientX;
    currentX.current = e.clientX;
    widthRef.current = trackRef.current?.clientWidth ?? 1;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    currentX.current = e.clientX;
    setDragOffset(currentX.current - startX.current);
  };

  const endDrag = () => {
    if (!isDragging) return;
    const delta = currentX.current - startX.current;
    const threshold = widthRef.current * 0.18;
    if (delta > threshold) {
      goTo(activeIndex - 1);
      suppressTapRef.current = true;
    } else if (delta < -threshold) {
      goTo(activeIndex + 1);
      suppressTapRef.current = true;
    }
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleBannerTap = (banner: Banner) => {
    if (suppressTapRef.current) {
      // The tap was the tail of a swipe — do nothing.
      suppressTapRef.current = false;
      return;
    }
    if (!isBannerLinked(banner)) return;
    onOpen?.(banner);
  };

  const percentOffset = (dragOffset / widthRef.current) * 100;

  return (
    <div className="px-5 pt-4 md:px-8">
      <div
        ref={trackRef}
        className="dc-glass relative select-none overflow-hidden rounded-[28px] shadow-[0_22px_52px_-24px_rgba(79,70,229,0.55)] touch-pan-y md:rounded-[36px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-activeIndex * 100}% + ${isDragging ? percentOffset : 0}%))`,
            transition: isDragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {banners.map((banner) => {
            const linked = isBannerLinked(banner);
            return (
              <div key={banner.id} className="w-full flex-shrink-0 basis-full">
                <div
                  role={linked ? "button" : undefined}
                  tabIndex={linked ? 0 : undefined}
                  onClick={() => handleBannerTap(banner)}
                  onKeyDown={(e) => {
                    if (!linked) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleBannerTap(banner);
                    }
                  }}
                  aria-label={linked ? `Open: ${banner.title}` : undefined}
                  data-banner-id={banner.id}
                  data-banner-linked={linked ? "true" : "false"}
                  className={`relative flex h-44 w-full items-center overflow-hidden bg-gradient-to-br px-5 md:h-56 md:px-8 ${
                    linked ? "cursor-pointer active:brightness-95" : ""
                  } ${banner.gradient}`}
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/10" />
                  <div aria-hidden className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-white/12 blur-3xl" />
                  <div aria-hidden className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-cyan-200/12 blur-3xl" />
                  <div className="relative z-10 max-w-[62%] text-white md:max-w-[58%]">
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold tracking-wider backdrop-blur-sm md:text-xs">
                      {banner.eyebrow}
                    </span>
                    <h3 className="mt-2 text-lg font-bold leading-tight drop-shadow-sm md:text-2xl">
                      {banner.title}
                    </h3>
                    <p className="mt-1 text-xs text-white/85 leading-snug md:text-sm md:mt-2 md:max-w-md">{banner.subtitle}</p>
                    <GlassButton variant="capsule" tabIndex={-1} className="mt-3 md:mt-4 [&_.h-12]:h-9 [&_.h-12]:px-4 md:[&_.h-12]:h-10 [&_.h-12]:text-xs md:[&_.h-12]:text-sm">
                      <span className="inline-flex items-center gap-1.5 font-bold">{banner.cta}
                      {linked && (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span></GlassButton>
                  </div>
                  <img
                    src={banner.image}
                    alt={banner.title}
                    draggable={false}
                    className="pointer-events-none absolute -right-4 bottom-0 h-full w-1/2 object-cover opacity-90 mix-blend-luminosity md:mix-blend-normal"
                    style={{ maskImage: "linear-gradient(to left, black 55%, transparent 100%)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {banners.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => goTo(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === activeIndex ? "w-6 bg-indigo-600" : "w-1.5 bg-slate-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
