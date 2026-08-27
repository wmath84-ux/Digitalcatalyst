// src/components/PortraitOnlyGuard.tsx
//
// Global sibling mounted next to <Root /> (same pattern as RenewalNotice).
// Portrait lock + the "rotate your phone" overlay apply ONLY inside the
// installed PWA (display-mode: standalone / iOS home-screen) AND only on
// phone-sized viewports. A regular browser tab is left free so visitors
// can use the site and install the app from any orientation, and tablet
// / desktop users never see the overlay (their layouts are designed to
// look correct in any orientation — locking them to portrait was the
// "black screen with rotation guide" the latest UX feedback asked us
// to remove).
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
import { isMobileScreenSize } from "../utils/responsive";

export default function PortraitOnlyGuard() {
  const { appName } = useBranding();
  const [playerOpen, setPlayerOpen] = useState<boolean>(isCoursePlayerRotationActive);
  const [landscape, setLandscape] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [phoneViewport, setPhoneViewport] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const syncInstallState = () => setInstalled(isPwaInstalled());
    setMobile(isMobileDevice());
    // The "phone viewport" check is what actually gates the overlay. A
    // tablet that reports a coarse pointer (so `isMobileDevice` is true)
    // still has plenty of room to render the whole app in landscape, so
    // locking IT to portrait would just push the user to a black screen
    // with a rotation guide — which is exactly the bug the latest UX
    // feedback asked us to remove. Phone-sized viewports are the only
    // place where the "rotate your phone" prompt adds value.
    setPhoneViewport(isMobileScreenSize());
    const updateViewport = () => {
      setLandscape(window.innerWidth > window.innerHeight);
      setPhoneViewport(isMobileScreenSize());
    };
    updateViewport();
    syncInstallState();

    // Portrait lock is an installed-PWA + phone-viewport concern only.
    // Browser tabs reject Screen Orientation lock anyway, and must stay
    // usable so the landing page / Install PWA buttons remain reachable
    // in landscape. Tablet + desktop are never locked — the layouts
    // are designed to work in any orientation.
    if (isPwaInstalled() && isMobileScreenSize() && !isCoursePlayerRotationActive()) lockAppToPortrait();
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
  // reachable). Desktop never shows it. Tablets never show it either —
  // the tablet layouts are designed to work in any orientation. The
  // overlay is reserved for the phone-only installed-PWA case, and
  // the open Course Player is the one screen that is allowed to be
  // landscape even on a phone.
  if (!installed || !mobile || !phoneViewport || playerOpen || !landscape) return null;

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
          {appName} runs in portrait mode on phones. The screen can only rotate while a course lesson is open.
        </p>
      </div>
    </div>
  );
}
