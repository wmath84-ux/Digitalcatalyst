// src/components/subscription/UnlockCelebration.tsx
//
// Full-screen sparkle-blast celebration shown the moment a subscription
// is activated. Replaces the flat "Go to my library" hand-off, which
// treated a membership unlock like an ordinary product receipt.
//
// The burst is pure CSS/SVG driven by framer-motion — no canvas, no
// confetti dependency, and it respects `prefers-reduced-motion` by
// falling back to a simple fade.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, PartyPopper, Sparkles, Star } from "lucide-react";
import { GlassSurface } from "../ui/glass";

/** Deterministic-ish particle field so every burst looks hand-tuned. */
const buildParticles = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.25;
    const distance = 90 + ((index * 37) % 130);
    return {
      id: index,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      scale: 0.45 + ((index * 17) % 70) / 100,
      delay: ((index * 13) % 32) / 100,
      hue: ["#a78bfa", "#f472b6", "#facc15", "#34d399", "#60a5fa"][index % 5],
      shape: index % 3,
    };
  });

interface Props {
  open: boolean;
  planName: string;
  featureNames: string[];
  expiresAtLabel?: string;
  onDismiss: () => void;
  onPrimaryAction: () => void;
  primaryLabel?: string;
}

export default function UnlockCelebration({
  open,
  planName,
  featureNames,
  expiresAtLabel,
  onDismiss,
  onPrimaryAction,
  primaryLabel = "Start exploring",
}: Props) {
  const reduceMotion = useReducedMotion();
  const particles = useMemo(() => buildParticles(28), []);
  const [showContent, setShowContent] = useState(false);

  // Let the burst land before the card slides in.
  useEffect(() => {
    if (!open) { setShowContent(false); return undefined; }
    const timer = window.setTimeout(() => setShowContent(true), reduceMotion ? 0 : 260);
    return () => window.clearTimeout(timer);
  }, [open, reduceMotion]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          data-unlock-celebration
          role="dialog"
          aria-modal="true"
          aria-label={`${planName} activated`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-5 backdrop-blur-sm"
          onClick={onDismiss}
        >
          {/* Sparkle blast */}
          {!reduceMotion ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" aria-hidden="true">
              {particles.map((particle) => (
                <motion.span
                  key={particle.id}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
                  animate={{
                    x: particle.x,
                    y: particle.y,
                    scale: particle.scale,
                    opacity: 0,
                    rotate: particle.shape === 1 ? 220 : -160,
                  }}
                  transition={{
                    duration: 1.15,
                    delay: particle.delay,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute block"
                  style={{
                    width: particle.shape === 2 ? 6 : 10,
                    height: particle.shape === 2 ? 6 : 10,
                    background: particle.hue,
                    borderRadius: particle.shape === 0 ? "9999px" : particle.shape === 2 ? "2px" : "3px",
                    boxShadow: `0 0 12px ${particle.hue}`,
                  }}
                />
              ))}
              {/* Expanding shock ring */}
              <motion.span
                initial={{ scale: 0, opacity: 0.75 }}
                animate={{ scale: 3.4, opacity: 0 }}
                transition={{ duration: 0.95, ease: "easeOut" }}
                className="absolute -left-16 -top-16 block h-32 w-32 rounded-full border-2 border-violet-400/30"
              />
            </div>
          ) : null}

          {/* Card */}
          <AnimatePresence>
            {showContent ? (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { scale: 0.82, opacity: 0, y: 16 }}
                animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                onClick={(event) => event.stopPropagation()}
                className="relative z-10 w-full max-w-sm"
              >
                <GlassSurface radius={24} className="overflow-hidden text-white">
                {/* Gradient header with a pulsing seal */}
                <div className="relative overflow-hidden bg-violet-600/40 px-6 pb-7 pt-8 text-center text-white">

                  <motion.div
                    initial={reduceMotion ? undefined : { scale: 0 }}
                    animate={reduceMotion ? undefined : { scale: [0, 1.18, 1] }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                    className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-8 w-8" strokeWidth={3} />
                    </span>
                    {!reduceMotion ? (
                      <motion.span
                        animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full border-2 border-white/60"
                      />
                    ) : null}
                  </motion.div>

                  <p className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                    <PartyPopper className="h-3 w-3" /> Welcome aboard
                  </p>
                  <h2 className="relative mt-2 text-2xl font-black leading-tight" data-celebration-title>
                    You're a {planName} member!
                  </h2>
                  <p className="relative mt-1.5 text-xs leading-5 text-white/80">
                    Payment confirmed. Everything below is unlocked right now.
                  </p>
                </div>

                {/* Unlocked list */}
                <div className="px-6 py-5">
                  {featureNames.length > 0 ? (
                    <>
                      <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/55">
                        <Sparkles className="h-3 w-3" /> Just unlocked
                      </p>
                      <ul className="space-y-1.5" data-celebration-features>
                        {featureNames.slice(0, 5).map((name, index) => (
                          <motion.li
                            key={name}
                            initial={reduceMotion ? undefined : { opacity: 0, x: -12 }}
                            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                            transition={{ delay: 0.12 + index * 0.07 }}
                            className="flex items-center gap-2.5 rounded-xl bg-emerald-500/15 px-3 py-2"
                          >
                            <Star className="h-3.5 w-3.5 shrink-0 fill-emerald-500 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-950">{name}</span>
                          </motion.li>
                        ))}
                        {featureNames.length > 5 ? (
                          <li className="px-3 pt-0.5 text-[11px] font-bold text-white/55">
                            +{featureNames.length - 5} more
                          </li>
                        ) : null}
                      </ul>
                    </>
                  ) : (
                    <p className="rounded-xl border border-white/15 px-3 py-3 text-center text-xs font-semibold text-white/75">
                      Your membership is active and ready to use.
                    </p>
                  )}

                  {expiresAtLabel ? (
                    <p className="mt-3 text-center text-[11px] font-semibold text-white/55">
                      Access valid until {expiresAtLabel}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    data-celebration-cta
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 py-3.5 text-sm font-black text-white transition hover:bg-indigo-500 active:scale-[0.98]"
                  >
                    {primaryLabel} <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="mt-2 w-full py-2 text-xs font-bold text-white/55 transition hover:text-white/75"
                  >
                    Maybe later
                  </button>
                </div>
                </GlassSurface>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
