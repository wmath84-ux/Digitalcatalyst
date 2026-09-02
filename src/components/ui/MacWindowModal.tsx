import React, { useEffect } from "react";
import TrafficLights from "./TrafficLights";
import { GlassSurface } from "./glass";

interface MacWindowModalProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  zIndex?: string;
  className?: string;
}

/**
 * The desktop "window" modal — traffic-light controls, a title row, a single
 * scrollable body.
 *
 * Wave 1 (liquid glass): the window is now a `GlassSurface` panel (frost +
 * specular rim + corner sheen) floating over a blurred scrim, which is what
 * the traffic lights were always pretending to belong to. Everything structural
 * is unchanged: the scroll-lock/pointer-events restore on unmount, `mousedown`
 * on the scrim closing, the 92 vh cap, and the body scroller sitting below a
 * sticky header. Zero call-sites today, so this file exists as the windowed
 * variant that later waves can reach for on desktop.
 */
const MacWindowModal: React.FC<MacWindowModalProps> = ({ title, subtitle, children, onClose, maxWidth = "max-w-3xl", zIndex = "z-[80]", className = "" }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.pointerEvents = "";
      document.body.classList.remove("overflow-hidden", "pointer-events-none");
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-black/55 animate-fade-in`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-modal-title"
      onMouseDown={onClose}
    >
      <GlassSurface
        radius={24}
        className={`glass-dialog-in w-full ${maxWidth} max-h-[92vh] overflow-hidden text-white ${className}`}
        contentClassName="flex max-h-[92vh] min-h-0 flex-col"
        onMouseDown={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center gap-4 border-b border-white/10 px-5 py-4">
          <TrafficLights onClose={onClose} />
          <div className="min-w-0">
            <h2 id="mac-modal-title" className="truncate text-lg font-black text-white">{title}</h2>
            {subtitle && <p className="truncate text-xs font-medium text-white/55">{subtitle}</p>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      </GlassSurface>
    </div>
  );
};

export default MacWindowModal;
