import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Banner } from "../types";
import { GlassSurface } from "../../components/ui/glass";
import { wrapCarouselIndex } from "../data/homeDashboardData";

interface HeroCarouselProps {
  banners: Banner[];
  /**
   * Called when the learner selects a linked slide. A completed swipe never
   * triggers the slide action.
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
  const suppressTapRef = useRef(false);

  const total = banners.length;
  const isBannerLinked = (banner: Banner) => Boolean(onOpen) && banner.linkType !== "none";

  const goTo = useCallback((index: number) => {
    if (total === 0) return;
    setActiveIndex(wrapCarouselIndex(index, total));
  }, [total]);

  useEffect(() => {
    setActiveIndex((current) => wrapCarouselIndex(current, total));
  }, [total]);

  useEffect(() => {
    if (total < 2 || isDragging || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % total);
    }, 6200);
    return () => window.clearInterval(timer);
  }, [isDragging, total]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (total < 2 || event.button !== 0) return;
    setIsDragging(true);
    suppressTapRef.current = false;
    startX.current = event.clientX;
    currentX.current = event.clientX;
    widthRef.current = trackRef.current?.clientWidth ?? 1;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging) return;
    currentX.current = event.clientX;
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
      suppressTapRef.current = false;
      return;
    }
    if (!isBannerLinked(banner)) return;
    onOpen?.(banner);
  };

  if (total === 0) return null;

  const percentOffset = (dragOffset / widthRef.current) * 100;

  return (
    <div role="region" className="dc-home-hero-module" aria-label="Featured learning content" aria-roledescription="carousel">
      <GlassSurface
        ref={trackRef}
        radius={24}
        tint={0.25}
        blur={0}
        className="dc-scene-plate select-none overflow-hidden touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="dc-home-hero-track flex"
          style={{
            transform: `translateX(calc(${-activeIndex * 100}% + ${isDragging ? percentOffset : 0}%))`,
            transition: isDragging ? "none" : "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {banners.map((banner, bannerIndex) => {
            const linked = isBannerLinked(banner);
            const metadata = (banner.metadata || []).map((item) => item.trim()).filter(Boolean).slice(0, 3);
            return (
              <div key={banner.id} className="w-full flex-shrink-0 basis-full">
                <div
                  role={linked ? "button" : undefined}
                  tabIndex={linked ? 0 : undefined}
                  onClick={() => handleBannerTap(banner)}
                  onKeyDown={(event) => {
                    if (!linked) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleBannerTap(banner);
                    }
                  }}
                  aria-label={linked ? `Explore ${banner.title}` : undefined}
                  data-banner-id={banner.id}
                  data-banner-linked={linked ? "true" : "false"}
                  className={`dc-home-hero-slide ${banner.gradient} ${linked ? "cursor-pointer" : ""}`}
                >
                  <div className="dc-home-hero-copy">
                    {banner.eyebrow ? <span className="dc-home-hero-eyebrow">{banner.eyebrow}</span> : null}
                    <h2 className="dc-home-hero-title">{banner.title}</h2>
                    {banner.subtitle ? <p className="dc-home-hero-description">{banner.subtitle}</p> : null}
                    {metadata.length > 0 ? (
                      <div className="dc-home-hero-metadata" aria-label="Featured item details">
                        {metadata.map((item) => <span key={`${banner.id}-${item}`}>{item}</span>)}
                      </div>
                    ) : null}
                    {banner.cta ? (
                      <span className="dc-home-hero-cta" aria-hidden="true">
                        {banner.cta}<ArrowRight size={16} strokeWidth={2.2} />
                      </span>
                    ) : null}
                  </div>
                  <img
                    src={banner.image}
                    alt=""
                    draggable={false}
                    loading={bannerIndex === 0 ? "eager" : "lazy"}
                    fetchPriority={bannerIndex === 0 ? "high" : "low"}
                    decoding="async"
                    className="dc-home-hero-art"
                    style={{ maskImage: "linear-gradient(to left, black 58%, transparent 100%)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassSurface>

      {total > 1 ? (
        <div className="dc-home-hero-pagination" aria-label="Choose featured content">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => goTo(index)}
              className={`dc-home-hero-dot ${index === activeIndex ? "is-active" : ""}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
