// src/components/PortraitOnlyGuard.tsx
//
// HARD RULE - Mobile Portrait Only (except Course Player):
// - Mobile phones (<768px) are locked to portrait EVERYWHERE except course player
// - If a mobile user rotates to landscape outside course player, show "Rotate your phone" overlay
// - This applies to ALL contexts: PWA, mobile browser, Capacitor native app
// - Tablet/desktop (>=768px) NEVER show overlay - their layouts work in landscape
// - Course player is the ONLY screen allowed to be landscape on phones
//
// Enforcement layers:
//   1. AndroidManifest.xml screenOrientation="portrait" (native)
//   2. Web Manifest orientation="portrait" (PWA)
//   3. JS Screen Orientation API + Capacitor plugins (runtime)
//   4. This overlay (visual fallback when API lock fails - e.g. browser tabs, iOS)

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  isCoursePlayerRotationActive,
  lockAppToPortrait,
  onCoursePlayerRotationChange,
} from "../utils/appOrientation";
import { isMobileDevice } from "../utils/courseStatusBar";
import { useBranding } from "../context/BrandingContext";
import { isMobileScreenSize } from "../utils/responsive";

export default function PortraitOnlyGuard() {
  const { appName } = useBranding();
  const [playerOpen, setPlayerOpen] = useState<boolean>(isCoursePlayerRotationActive);
  const [landscape, setLandscape] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [phoneViewport, setPhoneViewport] = useState(true);

  useEffect(() => {
    setMobile(isMobileDevice());
    setPhoneViewport(isMobileScreenSize());

    const updateViewport = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setLandscape(isLandscape);
      setPhoneViewport(isMobileScreenSize());
      setMobile(isMobileDevice());

      // HARD RULE: Re-lock to portrait whenever viewport changes and we're NOT in course player
      // This handles cases where user rotates with auto-rotate ON
      if (!isCoursePlayerRotationActive() && isMobileScreenSize() && window.innerWidth < 768) {
        lockAppToPortrait();
      }
    };

    updateViewport();

    // Initial hard lock for mobile phones outside course player
    if (!isCoursePlayerRotationActive() && isMobileScreenSize() && window.innerWidth < 768) {
      lockAppToPortrait();
      // Retry after short delay for PWA/Capacitor
      setTimeout(() => {
        if (!isCoursePlayerRotationActive()) lockAppToPortrait();
      }, 500);
    }

    const unsubscribe = onCoursePlayerRotationChange(() => {
      setPlayerOpen(isCoursePlayerRotationActive());
    });

    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener?.("resize", updateViewport);
    window.screen.orientation?.addEventListener?.("change", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener?.("resize", updateViewport);
      window.screen.orientation?.removeEventListener?.("change", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  // HARD RULE LOGIC:
  // - Show overlay ONLY on mobile phones in landscape outside course player
  // - Tablet/desktop never show it (layouts work in landscape)
  // - Course player never shows it (only screen allowed to rotate)
  // - This applies to ALL mobile contexts: browser, PWA, Capacitor
  if (!mobile || !phoneViewport || playerOpen || !landscape) return null;

  // Extra safety: ensure we're actually on a phone-sized viewport (<768px)
  // and landscape
  if (typeof window !== "undefined" && window.innerWidth >= 768) return null;

  return (
    <div
      data-app-portrait-overlay
      role="alert"
      aria-label="Rotate your phone to portrait"
      className="fixed inset-0 z-[500] grid place-items-center bg-[#05060f] px-8 text-center text-white"
      style={{
        // Ensure overlay covers everything including safe areas
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className="app-portrait-card">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_50px_-10px_rgba(129,140,248,0.35)]">
          <RotateCcw className="app-rotate-hint h-9 w-9 text-violet-300 animate-pulse" />
        </div>
        <h2 className="mt-6 text-xl font-black tracking-tight">Rotate your phone</h2>
        <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-slate-300">
          {appName} is designed for portrait mode. Please rotate your device to continue.
          <br />
          <span className="mt-2 inline-block text-xs text-violet-300">
            Rotation works only inside course lessons.
          </span>
        </p>
      </div>
    </div>
  );
}
