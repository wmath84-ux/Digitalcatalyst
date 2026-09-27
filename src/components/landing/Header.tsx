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
      className="fixed inset-x-0 top-0 z-50 w-full"
    >
      {/* A square, full-width strip: no rounded bottom corners or max-width
          wrapper leaving visible gaps at either edge of the viewport. */}
      <GlassSurface
        radius={0}
        className="w-full border-b border-white/10 text-white shadow-lg shadow-black/10"
        contentClassName="landing-container flex items-center justify-between gap-3 py-3"
      >
        <a href="#/landing" className="flex shrink-0 items-center gap-2">
          <BrandMark className="h-9 w-9 rounded-xl" fallbackLetter />
          <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
            {appName}
            {tagline ? <span className="font-medium text-white/55"> | {tagline}</span> : null}
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
      </GlassSurface>
    </motion.header>
  );
}
