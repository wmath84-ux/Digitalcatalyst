// src/components/ui/GlassBackdrop.tsx
//
// The permanent Clean Board background layer for the learner-facing app.
// Mounted behind every learner route in main.tsx; admin routes are skipped.

import { useBackgroundPreference } from "@/context/BackgroundPreferenceContext";

export function GlassBackdrop() {
  useBackgroundPreference();
  return <div className="dc-clean-backdrop" data-dc-clean-background aria-hidden="true" />;
}

export default GlassBackdrop;
