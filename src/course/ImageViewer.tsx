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
import GlassDock, { type GlassDockItem } from "../components/glass-dock/GlassDock";

interface ImageViewerProps {
  url: string;
  name: string;
  /** Zoom level to restore when returning to this image. */
  initialScale?: number;
  /** Pan offset to restore when returning to this image. */
  initialOffset?: { x: number; y: number };
  /** Reports zoom + pan so the Course Player can persist them. */
  onViewChange?: (scale: number, offset: { x: number; y: number }) => void;
}

interface PointerPosition {
  x: number;
  y: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

export default function ImageViewer({ url, name, initialScale, initialOffset, onViewChange }: ImageViewerProps) {
  // Restoring zoom + pan is the image equivalent of resuming a video at the
  // right second: the learner comes back to exactly the view they left.
  const startScale = Number.isFinite(initialScale) && Number(initialScale) > 0 ? Number(initialScale) : 1;
  const startOffset = initialOffset && Number.isFinite(initialOffset.x) ? initialOffset : { x: 0, y: 0 };
  const [scale, setScale] = useState(startScale);
  const [offset, setOffset] = useState(startOffset);
  const scaleRef = useRef(startScale);
  const offsetRef = useRef(startOffset);
  offsetRef.current = offset;
  const viewChangeRef = useRef(onViewChange);
  viewChangeRef.current = onViewChange;
  const pointers = useRef(new Map<number, PointerPosition>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const applyZoom = (next: number) => {
    const value = clamp(next);
    scaleRef.current = value;
    setScale(value);
    const nextOffset = value === 1 ? { x: 0, y: 0 } : offsetRef.current;
    if (value === 1) setOffset(nextOffset);
    viewChangeRef.current?.(value, nextOffset);
  };

  const applyOffset = (next: { x: number; y: number }) => {
    setOffset(next);
    offsetRef.current = next;
    viewChangeRef.current?.(scaleRef.current, next);
  };

  useEffect(() => {
    // Reset state when the URL changes (Course Player switches file).
    scaleRef.current = startScale;
    setScale(startScale);
    setOffset(startOffset);
    setLoadError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className="relative h-full w-full overflow-hidden touch-none"
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
          applyOffset({
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
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--course-soft-hover)] px-3 py-1.5 text-[11px] font-black"
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
      <div
        className="absolute inset-x-0 bottom-0 z-10 px-2"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <GlassDock
          leading={
            <span
              className="mb-2 min-w-12 self-center text-center text-xs font-black text-white/90"
              data-course-image-zoom-pct
            >
              {Math.round(scale * 100)}%
            </span>
          }
          items={
            [
              { id: "zoom-out", label: "Zoom out", icon: Minus, color: "#B388FF", dataAttrs: { "data-course-image-zoom-out": "" } },
              { id: "zoom-in", label: "Zoom in", icon: Plus, color: "#FFBE0B", dataAttrs: { "data-course-image-zoom-in": "" } },
              { id: "reset", label: "Reset", icon: RotateCcw, color: "#C9A96E", dataAttrs: { "data-course-image-zoom-reset": "" } },
              { id: "fit", label: "Fit", icon: Maximize, color: "#06D6A0", dataAttrs: { "data-course-image-zoom-fit": "" } },
              { id: "download", label: "Download", icon: Download, color: "#FF5C8A", dataAttrs: { "data-course-image-download": "" } },
            ] satisfies GlassDockItem[]
          }
          onSelect={(id) => {
            if (id === "zoom-out") applyZoom(scaleRef.current - 0.25);
            else if (id === "zoom-in") applyZoom(scaleRef.current + 0.25);
            else if (id === "reset" || id === "fit") applyZoom(1);
            else if (id === "download") void download();
          }}
        />
      </div>
      <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-bold text-white/70">
        Pinch/wheel to zoom · double-click zoom · drag to pan
      </p>
    </div>
  );
}
