import { useRef, useState } from "react";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";

export default function ImageViewer({ url, name }: { url: string; name: string }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const clamp = (value: number) => Math.min(5, Math.max(0.5, value));
  const zoom = (next: number) => { const value = clamp(next); scaleRef.current = value; setScale(value); if (value === 1) setOffset({ x: 0, y: 0 }); };
  const distance = () => { const values = Array.from(pointers.current.values()); return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); };
  const download = async () => {
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error();
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = name || "course-image"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch { window.open(url, "_blank", "noopener,noreferrer"); }
  };
  return <div className="relative h-full min-h-[420px] overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b,#020617)] touch-none" onWheel={(event) => { event.preventDefault(); zoom(scaleRef.current + (event.deltaY < 0 ? 0.2 : -0.2)); }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size === 2) { pinch.current = { distance: distance(), scale: scaleRef.current }; drag.current = null; } else if (scaleRef.current > 1) drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; }} onPointerMove={(event) => { if (!pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size >= 2 && pinch.current) { const currentDistance = distance(); if (pinch.current.distance > 0) zoom(pinch.current.scale * currentDistance / pinch.current.distance); return; } if (drag.current) setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }); }} onPointerUp={(event) => { pointers.current.delete(event.pointerId); drag.current = null; pinch.current = null; }} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); drag.current = null; pinch.current = null; }}>
    <div className="absolute inset-0 grid place-items-center p-4"><img src={url} alt={name} draggable={false} onDoubleClick={() => zoom(scaleRef.current === 1 ? 2 : 1)} className={`max-h-full max-w-full select-none object-contain transition-transform duration-100 ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`} style={{ transform: `translate(${offset.x / scale}px, ${offset.y / scale}px) scale(${scale})` }} /></div>
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-slate-950/85 p-1.5 text-white shadow-2xl backdrop-blur"><button onClick={() => zoom(scaleRef.current - 0.25)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Zoom out"><Minus size={16} /></button><span className="min-w-12 text-center text-xs font-black">{Math.round(scale * 100)}%</span><button onClick={() => zoom(scaleRef.current + 0.25)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Zoom in"><Plus size={16} /></button><button onClick={() => zoom(1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Reset zoom"><RotateCcw size={15} /></button><button onClick={() => void download()} className="flex h-9 items-center gap-1.5 rounded-full bg-violet-500 px-3 text-xs font-black" aria-label="Download image"><Download size={14} /> Download</button></div>
    <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-bold text-white/60">Pinch/wheel to zoom · double-click zoom · drag to pan</p>
  </div>;
}
