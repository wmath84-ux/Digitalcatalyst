"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "./components/landing/Header";
import Hero from "./components/landing/Hero";
import Features from "./components/landing/Features";
import CtaBanner from "./components/landing/CtaBanner";
import Footer from "./components/landing/Footer";
import LandingOverlays from "./components/landing/LandingOverlays";
import { OPEN_APP_EVENT } from "@/utils/pwaInstall";

/** Hash that routes to the main HomeApp inside Root (src/main.tsx). */
const HOME_HASH = "#/home";

export default function LandingApp() {
  const [isExiting, setIsExiting] = useState(false);
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
          className="min-h-screen bg-[#05060f]"
        >
          <Header />
          <Hero />
          <Features />
          <CtaBanner />
          <Footer />
          <LandingOverlays />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
