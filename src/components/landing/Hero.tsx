"use client";

import { motion } from "framer-motion";
import { openApp, openInstallPanel } from "@/utils/pwaInstall";
import { useBranding } from "@/context/BrandingContext";
import LandingGlassCard from "./LandingGlassCard";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import ApkDownloadButton from "./ApkDownloadButton";

export default function Hero() {
  const { appName, tagline } = useBranding();
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pt-24">
      <div className="landing-container relative z-10 grid w-full items-center gap-10 py-16 lg:grid-cols-2 lg:gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="w-full min-w-0 max-w-3xl lg:max-w-none"
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

            <ApkDownloadButton />

            <GlassButton
              variant="capsule"
              type="button"
              onClick={openInstallPanel}
              className="[&>span>div]:h-14 [&>span>div]:px-7 [&>span>div]:text-base [&>span>div]:font-bold [&>span>div]:text-emerald-300"
            >
              ⬇️ Install the PWA
            </GlassButton>
          </div>
          <p className="mt-3 text-xs text-white/55">
            APK for Android only. Your browser may ask you to allow installs from this source.
          </p>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/55 lg:hidden">
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

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="hidden w-full min-w-0 lg:block"
        >
          <LandingGlassCard radius={32} className="w-full text-white" contentClassName="p-8 xl:p-10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              All your learning, in one place
            </span>
            <h2 className="mt-4 text-2xl font-black leading-tight text-white xl:text-3xl">
              Study smarter, every day.
            </h2>
            <div className="mt-8 grid gap-3">
              {[
                { icon: "📚", title: "Explore", text: "Premium notes and a digital library" },
                { icon: "🎬", title: "Watch", text: "Expert-led video lectures" },
                { icon: "🗓️", title: "Plan", text: "Keep your day on track" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-4 border-b border-white/15 px-1 py-4 last:border-b-0">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-400/15 text-xl" aria-hidden="true">{item.icon}</span>
                  <div>
                    <p className="font-bold text-white">{item.title}</p>
                    <p className="text-sm text-white/60">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </LandingGlassCard>
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
