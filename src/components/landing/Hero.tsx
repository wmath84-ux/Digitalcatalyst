"use client";

import { motion } from "framer-motion";
import { openApp, openInstallPanel } from "@/utils/pwaInstall";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";

export default function Hero() {
  const { appName, tagline } = useBranding();
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pt-24">
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-6 py-16 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="max-w-3xl"
        >
          <GlassSurface radius={999} className="inline-block text-cyan-300" contentClassName="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]">
            ✨ The Future of Learning
          </GlassSurface>

          <h1 className="mt-6 text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[1.03] tracking-tight text-white">
            Welcome to <span className="gradient-text">{appName}</span>
            {tagline ? (
              <>
                <br />
                Your {tagline}.
              </>
            ) : null}
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/40 sm:text-lg">
            Premium PDFs, cinematic video lectures, and a focused study planner —
            one immersive platform engineered to accelerate how you learn.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={openApp}
              className="rounded-full bg-indigo-600 px-8 py-4 text-base font-bold text-white transition hover:bg-indigo-500"
            >
              🚀 Open App
            </motion.button>

            <GlassButton
              variant="capsule"
              type="button"
              onClick={openInstallPanel}
              className="[&>span>div]:h-14 [&>span>div]:px-7 [&>span>div]:text-base [&>span>div]:font-bold [&>span>div]:text-emerald-300"
            >
              ⬇️ Install the PWA
            </GlassButton>
          </div>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/55">
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
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-white/55"
      >
        ▼ Scroll to Explore
      </motion.div>
    </section>
  );
}
