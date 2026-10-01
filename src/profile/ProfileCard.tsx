import type { ComponentProps } from "react";
import { GlassSurface } from "../components/ui/glass";
import { cn } from "@/lib/utils";

/**
 * The Profile page's one card material — the HOME page's card (owner brief
 * 2026-09-30: "home page ke card ka design look badhiya lagta hai … vahi
 * exactly hi look aur design profile ke cards per apply karo").
 *
 * Byte-for-byte the surface every Home card paints: `GlassSurface` at the
 * pinned docs sensitivity the Home tiles / Continue Learning / review cards
 * use — tint 0.25 · blur 0 · radius 24 — wearing `.dc-scene-plate` (the navy
 * contrast plate in src/glass.css) plus the Profile type ramp
 * (src/profile-glass.css).
 *
 * No scrim class: `.dc-scene-ink` belongs to the copy that sits on the scene
 * with no surface under it (Home's section headings). glass.css already lifts
 * the muted utilities inside a plate, so a Profile card reads exactly like a
 * Home card without one.
 *
 * Padding is the card's own (Home's review cards use p-4), so every call site
 * gets the same interior rhythm and a card that needs more can still override
 * with `contentClassName`.
 */
export function ProfileCard({ className, contentClassName, ...props }: ComponentProps<typeof GlassSurface>) {
  return (
    <GlassSurface
      tint={0.25}
      blur={0}
      radius={24}
      {...props}
      className={cn("dc-scene-plate dc-profile-card text-white", className)}
      contentClassName={cn("p-4", contentClassName)}
    />
  );
}
