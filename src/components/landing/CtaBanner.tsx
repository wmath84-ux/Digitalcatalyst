"use client";

import { motion } from "framer-motion";
import { openApp, openInstallPanel } from "@/utils/pwaInstall";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";

export default function CtaBanner() {
  return (
    <section className="relative px-6 pb-28 sm:px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-6xl"
      >
        <GlassSurface radius={40} className="text-white" contentClassName="px-8 py-16 text-center sm:px-16">

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
            className="rounded-full bg-indigo-600 px-10 py-4 text-lg font-bold text-white transition hover:bg-indigo-500"
          >
            🚀 Open App
          </motion.button>
          <GlassButton
            variant="capsule"
            type="button"
            onClick={openInstallPanel}
            className="[&>span>div]:h-14 [&>span>div]:px-8 [&>span>div]:text-lg [&>span>div]:font-bold [&>span>div]:text-emerald-300"
          >
            ⬇️ Install the PWA
          </GlassButton>
        </div>
        </GlassSurface>
      </motion.div>
    </section>
  );
}
