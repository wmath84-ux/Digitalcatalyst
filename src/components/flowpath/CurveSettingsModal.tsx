import { GlassSlider } from "../ui/glass-slider";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { GitBranch, RotateCcw, X } from "lucide-react";
import type { CurveOverride } from "../../flowpath/types/curve";
import { DEFAULT_CURVE_OVERRIDE } from "../../flowpath/types/curve";

interface CurveSettingsModalProps {
  open: boolean;
  onClose: () => void;
  value: CurveOverride;
  onChange: (value: CurveOverride) => void;
}

export function CurveSettingsModal({ open, onClose, value, onChange }: CurveSettingsModalProps) {
  if (typeof document === "undefined") return null;

  function set<K extends keyof CurveOverride>(key: K, val: CurveOverride[K]) {
    onChange({ ...value, [key]: val });
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10 w-full max-w-sm"
          >
          {/* Wave 13c: pack GlassSurface (Dialog values) replaces the
              `.glass-panel-strong` gradient plate + violet glow shadow. */}
          <GlassSurface radius={24} className="text-fp-text" contentClassName="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-400">
                <GitBranch className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-fp-muted">Customize</p>
                <h2 className="font-display text-lg font-semibold text-fp-text">Flow Curve</h2>
              </div>
              <GlassButton
                onClick={onClose}
                className="ml-auto [&_.size-12]:size-8"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </GlassButton>
            </div>

            <div className="space-y-5">
              <Slider
                label="Curve amount"
                min={0}
                max={2}
                step={0.05}
                value={value.amplitude}
                onChange={(v) => set("amplitude", v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Curve tightness"
                min={0.3}
                max={2}
                step={0.05}
                value={value.frequency}
                onChange={(v) => set("frequency", v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Slider
                label="Spacing"
                min={0.6}
                max={1.6}
                step={0.05}
                value={value.spacing}
                onChange={(v) => set("spacing", v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>

            <div className="mt-6 flex gap-2.5">
              <GlassButton
                variant="capsule"
                onClick={() => onChange(DEFAULT_CURVE_OVERRIDE)}
                className="[&>span>div]:h-11 [&>span>div]:rounded-full [&>span>div]:px-4"
              >
                <span className="inline-flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reset</span>
              </GlassButton>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </GlassSurface>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      {/* Wave 6 (a11y): this was a <label>, but a `role="slider"` div is not a
          labelable element, so the label pointed at nothing. The slider names
          itself via aria-label; the caption is plain text now. */}
      <div className="mb-2 flex justify-between text-[11px] font-medium uppercase tracking-wide text-fp-muted">
        <span>{label}</span>
        <span>{format(value)}</span>
      </div>
      {/* Wave 4: native range -> registry glass-slider. The thumb is a lens
          that squashes with drag velocity, and ←/→/Home/End come with it.
          Wave 6 note: this used to carry `dc-slider-on-dark` to force the dark
          palette. `flowpath/hooks/useTheme.ts` already writes `data-theme` on
          <html>` (dark default, removed on unmount), so the pack picks the
          right ink by itself — and the forced rule was wrong for FlowPath's
          light theme, which is why it is gone. */}
      <GlassSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onChange}
        ariaLabel={label}
        className="w-full"
      />
    </div>
  );
}
