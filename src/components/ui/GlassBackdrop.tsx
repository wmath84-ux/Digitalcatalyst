// src/components/ui/GlassBackdrop.tsx
//
// One route-level background layer for the learner-facing app. Its preference
// is owned by BackgroundPreferenceContext and changed from the Profile page;
// mounting here applies that one saved choice behind every learner route.
// Admin and admin-login are skipped by RouteBackdrop in main.tsx.

import { useBackgroundPreference } from "@/context/BackgroundPreferenceContext";
import WinterScene from "@/components/backgrounds/WinterScene";

export function GlassBackdrop() {
  const { mode } = useBackgroundPreference();

  if (mode === "winter") return <WinterScene />;
  return <div className="dc-clean-backdrop" data-dc-clean-background aria-hidden="true" />;
}

export default GlassBackdrop;
