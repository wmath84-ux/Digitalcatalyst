"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PWA_INSTALL_OPEN_EVENT,
  isInstallPromptReady,
  isPwaInstalled,
  promptInstall,
} from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";
import { GlassSurface } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import { useBranding } from "@/context/BrandingContext";

export default function LandingOverlays() {
  const { appName } = useBranding();
  const [installOpen, setInstallOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [manualHelp, setManualHelp] = useState(false);

  useEffect(() => {
    const showInstall = () => {
      const alreadyInstalled = isPwaInstalled();
      setInstalled(alreadyInstalled);
      // iOS and browsers that never fire beforeinstallprompt must see the
      // manual Add-to-Home-Screen steps immediately — waiting for a failed
      // Install tap made it look like the web app could not be installed.
      setManualHelp(!alreadyInstalled && !isInstallPromptReady());
      setInstallOpen(true);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstalling(false);
    };

    window.addEventListener(PWA_INSTALL_OPEN_EVENT, showInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener(PWA_INSTALL_OPEN_EVENT, showInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed) {
      setInstallOpen(false);
      return;
    }
    setInstalling(true);
    const accepted = await promptInstall();
    setInstalling(false);
    if (accepted) {
      setInstalled(true);
      window.setTimeout(() => setInstallOpen(false), 900);
    } else if (!isInstallPromptReady()) {
      setManualHelp(true);
    }
  };

  return (
    <AnimatePresence>
      {installOpen && (
        <motion.div
          initial={{ y: -180, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -180, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-md"
        >
          <GlassSurface radius={24} className="text-white ring-1 ring-emerald-300/20" contentClassName="p-5">
            <div>
              <div className="flex items-start gap-3">
                <BrandMark className="h-12 w-12 shrink-0 rounded-2xl" fallbackLetter />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black text-white">{`Install ${appName}`}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/40">
                    Add the secure PWA to your home screen for fullscreen access, faster loading, and offline support.
                  </p>
                </div>
                <GlassButton type="button" onClick={() => setInstallOpen(false)} aria-label="Close install panel" className="[&_.size-12]:size-8 [&_svg]:text-white/70"><span className="text-white/70">✕</span></GlassButton>
              </div>

              {manualHelp && (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100">
                  Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On iPhone, use Share → Add to Home Screen.
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <GlassButton
                  variant="capsule"
                  type="button"
                  onClick={() => setInstallOpen(false)}
                  className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-bold"
                >
                  Not now
                </GlassButton>
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => void handleInstall()}
                  className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-black text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {installed ? "Installed ✓" : installing ? "Opening…" : "Install"}
                </button>
              </div>
            </div>
          </GlassSurface>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
