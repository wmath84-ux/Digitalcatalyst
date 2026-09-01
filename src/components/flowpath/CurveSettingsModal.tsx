import { GlassSlider } from "../ui/glass-slider";
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
          <div className="fp-overlay absolute inset-0" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="glass-panel-strong relative z-10 w-full max-w-sm rounded-t-3xl p-5 sm:rounded-3xl sm:p-6"
            style={{
              boxShadow: "0 0 60px -14px rgba(139,123,255,0.45), 0 40px 90px -30px rgba(0,0,0,0.85)",
            }}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-400">
                <GitBranch className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-fp-muted">Customize</p>
                <h2 className="font-display text-lg font-semibold text-fp-text">Flow Curve</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-fp-muted transition hover:bg-fp-surface hover:text-fp-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
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
              <button
                type="button"
                onClick={() => onChange(DEFAULT_CURVE_OVERRIDE)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-fp-border bg-fp-surface py-2.5 text-sm font-medium text-fp-muted transition hover:bg-fp-surface-hover"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110"
              >
                Done
              </button>
            </div>
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
      <label className="mb-2 flex justify-between text-[11px] font-medium uppercase tracking-wide text-fp-muted">
        <span>{label}</span>
        <span>{format(value)}</span>
      </label>
      {/* Wave 4: native range -> registry glass-slider. The thumb is a lens
          that squashes with drag velocity, and ←/→/Home/End come with it.
          `dc-slider-on-dark` re-inks rail + fill for FlowPath's dark canvas,
          because the pack picks its palette from prefers-color-scheme. */}
      <GlassSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onChange}
        ariaLabel={label}
        className="dc-slider-on-dark w-full"
      />
    </div>
  );
}
