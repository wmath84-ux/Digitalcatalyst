"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DESKTOP_MAINTENANCE_EVENT,
  PWA_INSTALL_OPEN_EVENT,
  OPEN_APP_EVENT,
  isDesktopBrowserLocked,
  isInstallPromptReady,
  isPwaInstalled,
  openInstallPanel,
  promptInstall,
  showDesktopMaintenanceNotice,
} from "@/utils/pwaInstall";
import BrandMark from "@/components/BrandMark";

export default function LandingOverlays() {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [manualHelp, setManualHelp] = useState(false);
  const maintenanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showMaintenance = () => {
      setMaintenanceOpen(true);
      if (maintenanceTimer.current) clearTimeout(maintenanceTimer.current);
      maintenanceTimer.current = setTimeout(() => setMaintenanceOpen(false), 5200);
    };
    const showInstall = () => {
      setInstalled(isPwaInstalled());
      setManualHelp(false);
      setInstallOpen(true);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstalling(false);
    };

    /**
     * Handle the global Open App event.
     * - Mobile / portrait-sized screen → navigate to home (landing page
     *   animation is handled by LandingApp's own listener).
     * - Desktop-sized screen → show the "Under Preparation" notification.
     */
    const handleOpenApp = () => {
      if (isDesktopBrowserLocked()) {
        showDesktopMaintenanceNotice();
      }
    };

    window.addEventListener(DESKTOP_MAINTENANCE_EVENT, showMaintenance);
    window.addEventListener(PWA_INSTALL_OPEN_EVENT, showInstall);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(OPEN_APP_EVENT, handleOpenApp);
    return () => {
      window.removeEventListener(DESKTOP_MAINTENANCE_EVENT, showMaintenance);
      window.removeEventListener(PWA_INSTALL_OPEN_EVENT, showInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(OPEN_APP_EVENT, handleOpenApp);
      if (maintenanceTimer.current) clearTimeout(maintenanceTimer.current);
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
    <>
      <AnimatePresence>
        {maintenanceOpen && (
          <motion.div
            initial={{ y: -120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed inset-x-3 top-3 z-[90] mx-auto max-w-xl"
          >
            <div className="glass-panel rounded-2xl border border-amber-300/20 px-4 py-3 shadow-2xl shadow-black/40">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-xl">🛠️</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">Under Preparation</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
                    The desktop website is under preparation. Instead of using the website, install the PWA app and use it for the complete Eduvora experience.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMaintenanceOpen(false);
                      openInstallPanel();
                    }}
                    className="mt-2 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950"
                  >
                    Install PWA
                  </button>
                </div>
                <button type="button" onClick={() => setMaintenanceOpen(false)} className="text-slate-400">✕</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    <h2 className="text-base font-black text-white">Install Eduvora</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      Add the secure PWA to your home screen for fullscreen access, faster loading, and offline support.
                    </p>
                  </div>
                  <button type="button" onClick={() => setInstallOpen(false)} className="text-slate-400">✕</button>
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
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-slate-300"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    disabled={installing}
                    onClick={() => void handleInstall()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
                  >
                    {installed ? "Installed ✓" : installing ? "Opening…" : "Install"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
