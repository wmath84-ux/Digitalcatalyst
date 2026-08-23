// src/components/PortraitOnlyGuard.tsx
//
// Global sibling mounted next to <Root /> (same pattern as RenewalNotice).
// Portrait lock + the "rotate your phone" overlay apply ONLY inside the
// installed PWA (display-mode: standalone / iOS home-screen). A regular
// browser tab is left free so visitors can use the site and install the
// app from any orientation.
//
// Rotation is unlocked in exactly one place: the Course Player itself, via
// enterCoursePlayerRotation / exitCoursePlayerRotation.

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  isCoursePlayerRotationActive,
  lockAppToPortrait,
  onCoursePlayerRotationChange,
} from "../utils/appOrientation";
import { isMobileDevice } from "../utils/courseStatusBar";
import { isPwaInstalled } from "../utils/pwaInstall";
import { useBranding } from "../context/BrandingContext";

export default function PortraitOnlyGuard() {
  const { appName } = useBranding();
  const [playerOpen, setPlayerOpen] = useState<boolean>(isCoursePlayerRotationActive);
  const [landscape, setLandscape] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const syncInstallState = () => setInstalled(isPwaInstalled());
    setMobile(isMobileDevice());
    const updateViewport = () => setLandscape(window.innerWidth > window.innerHeight);
    updateViewport();
    syncInstallState();

    // Portrait lock is an installed-PWA concern only. Browser tabs reject
    // Screen Orientation lock anyway, and must stay usable so the landing
    // page / Install PWA buttons remain reachable in landscape.
    if (isPwaInstalled() && !isCoursePlayerRotationActive()) lockAppToPortrait();
    const unsubscribe = onCoursePlayerRotationChange(() => {
      setPlayerOpen(isCoursePlayerRotationActive());
    });

    const displayMode = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener?.("resize", updateViewport);
    window.screen.orientation?.addEventListener?.("change", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.addEventListener("appinstalled", syncInstallState);
    displayMode.addEventListener?.("change", syncInstallState);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener?.("resize", updateViewport);
      window.screen.orientation?.removeEventListener?.("change", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.removeEventListener("appinstalled", syncInstallState);
      displayMode.removeEventListener?.("change", syncInstallState);
    };
  }, []);

  // Regular browser tabs never show the overlay (so Install PWA stays
  // reachable). Desktop never shows it. The open Course Player is the
  // single installed-PWA screen that is allowed to be landscape.
  if (!installed || !mobile || playerOpen || !landscape) return null;

  return (
    <div
      data-app-portrait-overlay
      role="alert"
      aria-label="Rotate your phone to portrait"
      className="fixed inset-0 z-[500] grid place-items-center bg-[#05060f] px-8 text-center text-white"
    >
      <div className="app-portrait-card">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_50px_-10px_rgba(129,140,248,0.35)]">
          <RotateCcw className="app-rotate-hint h-9 w-9 text-violet-300" />
        </div>
        <h2 className="mt-6 text-xl font-black tracking-tight">Rotate your phone</h2>
        <p className="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-slate-300">
          {appName} runs in portrait mode. The screen can only rotate while a course lesson is open.
        </p>
      </div>
    </div>
  );
}
