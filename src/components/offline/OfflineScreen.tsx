"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import BrandMark from "@/components/BrandMark";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassSurface } from "@/components/ui/glass";
import { useBranding } from "@/context/BrandingContext";
import BlurFade from "./BlurFade";
import ConnectionRipple from "./ConnectionRipple";
import "@/offline.css";

const CONNECTION_HOLD_MS = 1100;

type OfflineScreenProps = {
  checking: boolean;
  onRetry: () => void;
  /**
   * Reachability-check failure code ("timeout" / "refused"). Only carried
   * when the browser itself reports being online — the suspicious case —
   * so a screenshot sent to support names the broken leg.
   */
  detail?: string | null;
};

export default function OfflineScreen({ checking, onRetry, detail = null }: OfflineScreenProps) {
  const { appName } = useBranding();
  const reduce = useReducedMotion();
  const [connection, setConnection] = useState<"live" | "lost">(reduce ? "lost" : "live");
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? false : navigator.onLine !== false,
  );

  useEffect(() => {
    const read = () => setBrowserOnline(navigator.onLine !== false);
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  useEffect(() => {
    if (reduce) {
      setConnection("lost");
      return undefined;
    }
    const timer = window.setTimeout(() => setConnection("lost"), CONNECTION_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  return (
    <div
      data-offline-screen
      className="fixed inset-0 z-[2147482500] grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(12,28,58,0.28),rgba(8,16,36,0.46))] px-5 py-10 sm:px-8"
      role="status"
      aria-live="polite"
      aria-busy={checking}
      aria-label="You're Offline"
    >
      <GlassSurface
        tint={0.48}
        tintColor="18,28,52"
        blur={22}
        radius={32}
        className="relative w-full max-w-[22.5rem] overflow-visible sm:max-w-[24rem]"
        contentClassName="flex flex-col items-center px-7 pb-8 pt-10 text-center sm:px-9"
      >
        <div className="relative mb-8 grid h-[9.5rem] w-[9.5rem] place-items-center sm:h-44 sm:w-44">
          <ConnectionRipple connection={connection} />
          <motion.div
            className="relative z-10 grid size-[4.75rem] place-items-center overflow-hidden rounded-[1.35rem] ring-1 ring-cyan-200/25 sm:size-20"
            animate={
              reduce
                ? { scale: 1 }
                : connection === "live"
                  ? { scale: [1, 1.045, 1] }
                  : { scale: 1 }
            }
            transition={
              reduce
                ? { duration: 0 }
                : connection === "live"
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                  : { type: "spring", stiffness: 180, damping: 22 }
            }
          >
            <BrandMark className="h-full w-full" alt={appName} />
          </motion.div>
        </div>

        <BlurFade delay={reduce ? 0 : 0.08}>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-white sm:text-[1.85rem]">
            You&apos;re Offline
          </h1>
        </BlurFade>
        <BlurFade delay={reduce ? 0 : 0.18}>
          <p className="mt-2.5 max-w-[17.5rem] text-sm leading-relaxed text-cyan-50/75 sm:text-[0.95rem]">
            Connect to the internet to continue learning.
          </p>
        </BlurFade>
        {detail && browserOnline ? (
          <BlurFade delay={reduce ? 0 : 0.22}>
            <p className="mt-2 max-w-[17.5rem] text-[11px] leading-relaxed text-cyan-50/50">
              Your device reports an active connection, but this app&apos;s reachability
              check could not finish (code {detail}). Tap Try Again — the app also
              re-checks on its own every few seconds.
            </p>
          </BlurFade>
        ) : null}
        <BlurFade delay={reduce ? 0 : 0.28} className="mt-7 w-full">
          <GlassButton
            variant="capsule"
            tint={0.55}
            disabled={checking}
            onClick={() => {
              if (!checking) onRetry();
            }}
            className="w-full disabled:opacity-60"
            aria-label="Try Again"
          >
            {checking ? "Checking…" : "Try Again"}
          </GlassButton>
        </BlurFade>
      </GlassSurface>
    </div>
  );
}
