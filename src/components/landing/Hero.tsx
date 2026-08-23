"use client";

import { motion } from "framer-motion";
import HeroScene from "./HeroScene";
import { openApp, openInstallPanel } from "@/utils/pwaInstall";
import { useBranding } from "@/context/BrandingContext";

export default function Hero() {
  const { appName, tagline } = useBranding();
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-[#05060f] pt-24">
      <HeroScene />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#05060f]/40 to-[#05060f]" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-6 py-16 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="max-w-3xl"
        >
          <span className="glass-panel inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            ✨ The Future of Learning, Rendered in 3D
          </span>

          <h1 className="mt-6 text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[1.03] tracking-tight text-white">
            Welcome to <span className="gradient-text">{appName}</span>
            {tagline ? (
              <>
                <br />
                Your {tagline}.
              </>
            ) : null}
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Premium PDFs, cinematic video lectures, and a focused study planner —
            one immersive platform engineered to accelerate how you learn.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={openApp}
              className="pulse-glow rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-8 py-4 text-base font-bold text-white shadow-2xl shadow-fuchsia-500/40 transition"
            >
              🚀 Open App
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={openInstallPanel}
              className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-7 py-4 text-base font-bold text-emerald-300 backdrop-blur transition hover:bg-emerald-400/20"
            >
              ⬇️ Install the PWA
            </motion.button>
          </div>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> 50k+ Students
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400" /> 1200+ Video Lectures
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> My Day Planner
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-slate-500"
      >
        ▼ Scroll to Explore
      </motion.div>
    </section>
  );
}
