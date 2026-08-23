"use client";

import { motion } from "framer-motion";
import { openApp } from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";
import { useBranding } from "@/context/BrandingContext";

export default function Header() {
  const { appName, tagline } = useBranding();
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="glass-panel flex w-full items-center justify-between gap-3 rounded-b-2xl border-x-0 border-t-0 px-4 py-3 sm:px-6">
        <a href="#/landing" className="flex items-center gap-2 shrink-0">
          <BrandMark className="h-9 w-9 rounded-xl shadow-lg shadow-fuchsia-500/30" fallbackLetter />
          <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
            {appName}
            {tagline ? <span className="text-slate-400 font-medium"> | {tagline}</span> : null}
          </span>
        </a>

        <button
          type="button"
          onClick={openApp}
          className="pulse-glow flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:brightness-110 sm:px-4 sm:text-sm"
        >
          <span aria-hidden>🚀</span>
          <span className="hidden sm:inline">Open App</span>
          <span className="sm:hidden">Open</span>
        </button>
      </div>
    </motion.header>
  );
}
