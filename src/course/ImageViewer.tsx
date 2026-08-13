// src/course/ImageViewer.tsx
//
// Part 11 — Course Player image viewer. Six controls
// documented by the Part 11 spec:
//
//   1. Pinch zoom    — two-finger touch gestures.
//   2. Wheel zoom    — trackpad / mouse wheel.
//   3. Buttons       — + / − zoom buttons in the dock.
//   4. Drag          — pan when the image is zoomed in.
//   5. Reset         — return to 100% (clears pan).
//   6. Download      — fetches the image as a blob and saves
//                      it; falls back to a new tab when CORS
//                      blocks the download.
//
// "Fit to screen" was added on top of reset to make the
// behaviour obvious for the user. Double-click toggles
// 100% ↔ 200%. All gestures are pointer-events based so
// the same code path handles mouse, touch, and stylus.

import { useEffect, useRef, useState } from "react";
import { Download, Maximize, Minus, Plus, RotateCcw } from "lucide-react";

interface ImageViewerProps {
  url: string;
  name: string;
}

interface PointerPosition {
  x: number;
  y: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

export default function ImageViewer({ url, name }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const pointers = useRef(new Map<number, PointerPosition>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const applyZoom = (next: number) => {
    const value = clamp(next);
    scaleRef.current = value;
    setScale(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    // Reset state when the URL changes (Course Player switches file).
    scaleRef.current = 1;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoadError(false);
  }, [url]);

  const distance = () => {
    const values = Array.from(pointers.current.values());
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };

  const download = async () => {
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error("Network error");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = name || "course-image";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // CORS fallback — open the original URL in a new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b,#020617)] touch-none"
      data-course-image-viewer
      data-pinch-zoom="enabled"
      onWheel={(event) => {
        event.preventDefault();
        applyZoom(scaleRef.current + (event.deltaY < 0 ? 0.2 : -0.2));
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) {
          pinch.current = { distance: distance(), scale: scaleRef.current };
          drag.current = null;
        } else if (scaleRef.current > 1) {
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size >= 2 && pinch.current) {
          const currentDistance = distance();
          if (pinch.current.distance > 0) applyZoom((pinch.current.scale * currentDistance) / pinch.current.distance);
          return;
        }
        if (drag.current) {
          setOffset({
            x: drag.current.ox + (event.clientX - drag.current.x),
            y: drag.current.oy + (event.clientY - drag.current.y),
          });
        }
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        drag.current = null;
        pinch.current = null;
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        drag.current = null;
        pinch.current = null;
      }}
    >
      <div className="absolute inset-0 grid place-items-center p-4">
        {loadError ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6 text-center text-amber-100">
            <p className="text-sm font-black">Image failed to load</p>
            <p className="mt-1 text-xs text-amber-200/80">The host may be blocking direct image embedding.</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-black"
            >
              Open original
            </a>
          </div>
        ) : (
          <img
            src={url}
            alt={name}
            draggable={false}
            onDoubleClick={() => applyZoom(scaleRef.current === 1 ? 2 : 1)}
            onError={() => setLoadError(true)}
            className={`max-h-full max-w-full select-none object-contain transition-transform duration-100 ${
              scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
            }`}
            style={{ transform: `translate(${offset.x / scale}px, ${offset.y / scale}px) scale(${scale})` }}
          />
        )}
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-slate-950/85 p-1.5 text-white shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={() => applyZoom(scaleRef.current - 0.25)}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Zoom out"
          data-course-image-zoom-out
        >
          <Minus size={16} />
        </button>
        <span className="min-w-12 text-center text-xs font-black" data-course-image-zoom-pct>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => applyZoom(scaleRef.current + 0.25)}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Zoom in"
          data-course-image-zoom-in
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1)}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Reset zoom"
          data-course-image-zoom-reset
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-black hover:bg-white/15"
          aria-label="Fit to screen"
          data-course-image-zoom-fit
        >
          <Maximize size={12} /> Fit
        </button>
        <button
          type="button"
          onClick={() => void download()}
          className="flex h-9 items-center gap-1.5 rounded-full bg-violet-500 px-3 text-xs font-black"
          aria-label="Download image"
          data-course-image-download
        >
          <Download size={14} /> Download
        </button>
      </div>
      <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-bold text-white/60">
        Pinch/wheel to zoom · double-click zoom · drag to pan
      </p>
    </div>
  );
}
