"use client";

import { motion } from "framer-motion";
import { openApp, openInstallPanel } from "@/utils/pwaInstall";

export default function CtaBanner() {
  return (
    <section className="relative px-6 pb-28 sm:px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6 }}
        className="glass-panel relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] px-8 py-16 text-center shadow-2xl shadow-fuchsia-500/10 sm:px-16"
      >
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />

        <span className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
          Ready when you are
        </span>
        <h2 className="mx-auto mt-4 max-w-2xl text-[clamp(1.8rem,4vw,2.75rem)] font-black leading-tight text-white">
          Step into your <span className="gradient-text">personalized learning universe</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/55">
          One click takes you to your dashboard — libraries, lectures, and your
          daily study planner, all in one place.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={openApp}
            className="pulse-glow rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-10 py-4 text-lg font-bold text-white shadow-2xl shadow-fuchsia-500/40"
          >
            🚀 Open App
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={openInstallPanel}
            className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-8 py-4 text-lg font-bold text-emerald-300 hover:bg-emerald-400/20"
          >
            ⬇️ Install the PWA
          </motion.button>
        </div>
      </motion.div>
    </section>
  );
}
