// src/components/PortraitOnlyGuard.tsx
//
// Keep phone layouts in portrait everywhere except the Course Player, which
// supports rotating lessons. If a phone is held in landscape outside the
// player, show a rotate-back overlay; tablets and desktops remain unrestricted.
// The phone check is orientation-independent (see appOrientation.ts), so a
// rotated phone is still recognized as a phone.

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  isPhoneDevice,
  isRotationUnlockedActive,
  lockAppToPortrait,
  onCoursePlayerRotationChange,
} from "../utils/appOrientation";
import { useBranding } from "../context/BrandingContext";

export default function PortraitOnlyGuard() {
  const { appName } = useBranding();
  // True while the Course Player is open. One subscription is enough: the
  // Course Player notifies through the listener set in appOrientation.
  const [rotationFree, setRotationFree] = useState<boolean>(isRotationUnlockedActive);
  const [landscape, setLandscape] = useState(false);
  const [phone, setPhone] = useState(isPhoneDevice);

  useEffect(() => {
    setPhone(isPhoneDevice());

    const updateViewport = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setLandscape(isLandscape);
      setPhone(isPhoneDevice());

      // HARD RULE: Re-lock to portrait whenever the viewport changes and we're
      // NOT on a rotation-free screen (Course Player).
      // `isPhoneDevice()` is orientation-independent, so a phone that is rotated to landscape
      // (auto-rotate ON) is still recognised as a phone and gets re-locked + overlay — it can
      // never slip through as a "tablet" just because its width grew past 768px.
      if (!isRotationUnlockedActive() && isPhoneDevice()) {
        lockAppToPortrait();
      }
    };

    updateViewport();

    // Initial hard lock for phones outside rotation-free screens
    if (!isRotationUnlockedActive() && isPhoneDevice()) {
      lockAppToPortrait();
      // Retry after short delay for PWA/Capacitor
      setTimeout(() => {
        if (!isRotationUnlockedActive()) lockAppToPortrait();
      }, 500);
    }

    const unsubscribe = onCoursePlayerRotationChange(() => {
      setRotationFree(isRotationUnlockedActive());
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
  // - Show overlay ONLY on phones in landscape outside rotation-free screens
  // - Tablet/desktop never show it (layouts work in landscape)
  // - The Course Player never shows it (lessons are allowed to rotate)
  // - `isPhoneDevice()` is orientation-independent, so a phone rotated to
  //   landscape is still detected as a phone and the overlay shows — the old
  //   `innerWidth < 768` check failed here because landscape width exceeds 768.
  // - This applies to ALL mobile contexts: browser, PWA, Capacitor
  if (!phone || rotationFree || !landscape) return null;

  return (
    <div
      data-app-portrait-overlay
      role="alert"
      aria-label="Rotate your phone to portrait"
      className="fixed inset-0 z-[500] grid place-items-center bg-[#0a0c12]/92 px-8 text-center text-white"
      style={{
        // Ensure overlay covers everything including safe areas
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className="app-portrait-card">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-white/10">
          <RotateCcw className="app-rotate-hint h-9 w-9 text-violet-300 animate-pulse" />
        </div>
        <h2 className="mt-6 text-xl font-black tracking-tight">Rotate your phone</h2>
        <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-white/75">
          {appName} is designed for portrait mode. Please rotate your device to continue.
          <br />
          <span className="mt-2 inline-block text-xs text-violet-300">
            Rotation is available inside course lessons.
          </span>
        </p>
      </div>
    </div>
  );
}
