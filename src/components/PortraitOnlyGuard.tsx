// src/components/PortraitOnlyGuard.tsx
//
// Global sibling mounted next to <Root /> (same pattern as RenewalNotice).
// It keeps the app portrait-locked on every screen and shows a full-screen
// "rotate your phone" overlay when a mobile viewport is landscape while the
// Course Player is closed.
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

export default function PortraitOnlyGuard() {
  const [playerOpen, setPlayerOpen] = useState<boolean>(isCoursePlayerRotationActive);
  const [landscape, setLandscape] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobileDevice());
    const updateViewport = () => setLandscape(window.innerWidth > window.innerHeight);
    updateViewport();

    // Keep the screen locked to portrait everywhere the player is closed,
    // and re-sync whenever the player mounts/unmounts.
    if (!isCoursePlayerRotationActive()) lockAppToPortrait();
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

  // Desktop browsers never show the overlay, and the open Course Player is
  // the single screen that is allowed to be landscape.
  if (!mobile || playerOpen || !landscape) return null;

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
          Eduvora runs in portrait mode. The screen can only rotate while a course lesson is open.
        </p>
      </div>
    </div>
  );
}
