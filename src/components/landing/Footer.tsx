"use client";

import { openApp } from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";
import { useBranding } from "@/context/BrandingContext";

const legalLinkClass =
  "text-sm font-semibold text-slate-100 underline decoration-sky-300/50 underline-offset-4 transition hover:text-cyan-200 hover:decoration-cyan-200 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200";

export default function Footer() {
  const { appName, tagline } = useBranding();
  return (
    <footer className="relative border-t border-sky-200/25 bg-[#0a1426]/95 py-10 text-slate-100 shadow-[0_-12px_32px_rgba(2,6,16,0.24)] sm:py-12">
      <div className="landing-container">
        <div className="flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:items-start lg:text-left">
          <div className="max-w-2xl">
            <div className="flex items-center justify-center gap-3 lg:justify-start">
              <BrandMark className="h-11 w-11 shrink-0 rounded-xl" fallbackLetter />
              <div>
                <p className="text-lg font-extrabold leading-tight tracking-tight text-white sm:text-xl">{appName}</p>
                {tagline && <p className="mt-0.5 text-sm font-medium text-cyan-200">{tagline}</p>}
              </div>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-200">
              Google Sign-In uses basic account details to create your account. Course-player personal access uses an email you provide and does not request Google Drive permission.
            </p>
          </div>

          <nav aria-label="Site and legal links" className="flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-4 lg:justify-end">
            <button type="button" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className={legalLinkClass}>
              Features
            </button>
            <button type="button" onClick={openApp} className={legalLinkClass}>
              Open App
            </button>
            <a href="https://eduvora.shop/privacy-policy.html#storage" className={legalLinkClass}>
              Security
            </a>
            <a href="https://eduvora.shop/privacy-policy.html" className={legalLinkClass}>
              Privacy Policy
            </a>
            <a href="https://eduvora.shop/terms-of-service.html" className={legalLinkClass}>
              Terms of Service
            </a>
          </nav>
        </div>

        <div className="mt-9 flex flex-col items-center justify-between gap-3 border-t border-white/20 pt-6 text-center text-sm text-slate-300 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} {appName}. All rights reserved.</p>
          <a href="https://eduvora.shop" className="font-semibold text-cyan-200 underline decoration-cyan-200/50 underline-offset-4 transition hover:text-white">
            eduvora.shop
          </a>
        </div>
      </div>
    </footer>
  );
}
