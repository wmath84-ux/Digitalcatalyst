"use client";

import { openApp } from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";
import { useBranding } from "@/context/BrandingContext";

export default function Footer() {
  const { appName, tagline } = useBranding();
  return (
    <footer className="border-t border-white/10 bg-[#05060f] px-6 py-10 text-slate-500 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark className="h-8 w-8 rounded-lg" fallbackLetter />
          <span className="text-sm font-semibold text-slate-300">
            {appName}
            {tagline ? <span className="text-slate-500"> | {tagline}</span> : null}
          </span>
        </div>
        <p className="text-xs">© {new Date().getFullYear()} {appName}. All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            className="hover:text-slate-300"
          >
            Features
          </button>
          <button type="button" onClick={openApp} className="hover:text-slate-300">
            Open App
          </button>
          <a href="/privacy-policy.html" className="hover:text-slate-300">
            Privacy Policy
          </a>
          <a href="/terms-of-service.html" className="hover:text-slate-300">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}
