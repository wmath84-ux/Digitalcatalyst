import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { Banner } from "./types";

interface HeroCarouselProps {
  banners: Banner[];
}

export default function HeroCarousel({ banners }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(1);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = banners.length;

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

  const handlePointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    startX.current = e.clientX;
    currentX.current = e.clientX;
    widthRef.current = trackRef.current?.clientWidth ?? 1;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
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
    } else if (delta < -threshold) {
      goTo(activeIndex + 1);
    }
    setIsDragging(false);
    setDragOffset(0);
  };

  const percentOffset = (dragOffset / widthRef.current) * 100;

  return (
    <div className="px-5 pt-4">
      <div
        ref={trackRef}
        className="relative select-none overflow-hidden rounded-3xl shadow-lg shadow-slate-300/40 touch-pan-y"
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
          {banners.map((banner) => (
            <div key={banner.id} className="w-full flex-shrink-0 basis-full">
              <div
                className={`relative flex h-44 w-full items-center overflow-hidden bg-gradient-to-br ${banner.gradient} px-5`}
              >
                <div className="relative z-10 max-w-[62%] text-white">
                  <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold tracking-wider backdrop-blur-sm">
                    {banner.eyebrow}
                  </span>
                  <h3 className="mt-2 text-lg font-bold leading-tight drop-shadow-sm">
                    {banner.title}
                  </h3>
                  <p className="mt-1 text-xs text-white/85 leading-snug">{banner.subtitle}</p>
                  <button
                    type="button"
                    className="mt-3 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-900 shadow-sm transition active:scale-95"
                  >
                    {banner.cta}
                  </button>
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
          ))}
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
