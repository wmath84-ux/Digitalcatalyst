"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "./components/landing/Header";
import Hero from "./components/landing/Hero";
import Features from "./components/landing/Features";
import CtaBanner from "./components/landing/CtaBanner";
import Footer from "./components/landing/Footer";
import LandingOverlays from "./components/landing/LandingOverlays";
import GradientWaves from "./components/GradientWaves";
import { OPEN_APP_EVENT } from "@/utils/pwaInstall";

/** Hash that routes to the main HomeApp inside Root (src/main.tsx). */
const HOME_HASH = "#/home";

/**
 * The React Bits Gradient Waves shader is `#version 300 es`, so it needs a
 * WebGL2 context. ogl falls back to WebGL1 when WebGL2 is missing, and the
 * shader then fails inside the mount effect — an uncaught error there would
 * blank the whole landing page. This one-shot probe keeps the page usable on
 * those devices (the app's own backdrop stays as the background).
 */
function supportsWebgl2() {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function LandingApp() {
  const [isExiting, setIsExiting] = useState(false);
  const [showWaves] = useState(supportsWebgl2);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenApp = useCallback(() => {
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      window.location.hash = HOME_HASH;
    }, 650);
  }, []);

  useEffect(() => {
    // Listen for the global Open App event dispatched by child buttons
    const onOpenApp = () => handleOpenApp();
    window.addEventListener(OPEN_APP_EVENT, onOpenApp);
    return () => {
      window.removeEventListener(OPEN_APP_EVENT, onOpenApp);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [handleOpenApp]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          key="landing"
          initial={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60, scale: 0.96 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative min-h-screen overflow-hidden"
        >
          {/* ── Landing background: React Bits "Gradient Waves" ────────────
              https://reactbits.dev/c/backgrounds/gradient-waves
              Drop-in component (src/components/GradientWaves.tsx, `ogl`) at
              its documented defaults — purple horizon, pink wave bodies,
              white crests, grain on, cursor parallax on.

              React Bits ships it as a self-sizing block (`relative h-full
              w-full`), so it is mounted inside a viewport-fixed, non-
              interactive shell: the waves then cover the WHOLE landing page
              (every section, mobile → desktop) and stay behind the content
              while the page scrolls, the same way the effect is used on
              reactbits.dev. It paints above the app's clean backdrop
              (z-index -1) and below the page content (z-index 10). */}
          <div
            className="pointer-events-none fixed inset-0 z-0"
            aria-hidden="true"
            data-dc-landing-waves
          >
            {showWaves ? <GradientWaves /> : null}
          </div>

          <div className="relative z-10">
            <Header />
            <Hero />
            <Features />
            <CtaBanner />
            <Footer />
            <LandingOverlays />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
