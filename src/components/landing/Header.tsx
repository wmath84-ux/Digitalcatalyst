"use client";

import { motion } from "framer-motion";
import { openApp } from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";
import { useBranding } from "@/context/BrandingContext";
import { GlassSurface } from "@/components/ui/glass";

export default function Header() {
  const { appName, tagline } = useBranding();
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* The glass strip stays full-bleed, but its content rides the same
          max-w-7xl column as the hero/features so ultra-wide desktop and
          tablet-landscape no longer stretch the brand and the button to
          opposite screen edges. Below 1280px the container is full width,
          so mobile and small tablets render exactly as before. */}
      {/* Wave 12: the strip is the pack GlassSurface (landing.css `.glass-panel`
          paint retired); the wrapper only clips the bottom corners. */}
      <div className="w-full overflow-hidden rounded-b-2xl">
      <GlassSurface radius={0} className="w-full text-white" contentClassName="px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <a href="#/landing" className="flex items-center gap-2 shrink-0">
          <BrandMark className="h-9 w-9 rounded-xl" fallbackLetter />
          <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
            {appName}
            {tagline ? <span className="text-white/55 font-medium"> | {tagline}</span> : null}
          </span>
        </a>

        <button
          type="button"
          onClick={openApp}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 sm:px-4 sm:text-sm"
        >
          <span aria-hidden>🚀</span>
          <span className="hidden sm:inline">Open App</span>
          <span className="sm:hidden">Open</span>
        </button>
        </div>
      </GlassSurface>
      </div>
    </motion.header>
  );
}
