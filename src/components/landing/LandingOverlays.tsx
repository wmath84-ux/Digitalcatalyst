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
          <div className="glass-panel overflow-hidden rounded-3xl border border-emerald-300/20 shadow-2xl shadow-black/50">
            <div className="bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-violet-500/20 p-5">
              <div className="flex items-start gap-3">
                <BrandMark className="h-12 w-12 shrink-0 rounded-2xl" fallbackLetter />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black text-white">{`Install ${appName}`}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/40">
                    Add the secure PWA to your home screen for fullscreen access, faster loading, and offline support.
                  </p>
                </div>
                <button type="button" onClick={() => setInstallOpen(false)} className="text-white/55">✕</button>
              </div>

              {manualHelp && (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100">
                  Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On iPhone, use Share → Add to Home Screen.
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setInstallOpen(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-white/40"
                >
                  Not now
                </button>
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => void handleInstall()}
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {installed ? "Installed ✓" : installing ? "Opening…" : "Install"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
