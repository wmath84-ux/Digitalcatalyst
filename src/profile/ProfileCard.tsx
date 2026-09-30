import type { ComponentProps } from "react";
import { GlassSurface } from "../components/ui/glass";
import { cn } from "@/lib/utils";

/**
 * The Profile page's one card material — the STORE's light-blue glass lens
 * (owner brief 2026-09-30: "Store page ka design aur specification card
 * design profile page par transfer karo — professional, clean, classic").
 *
 * Identical recipe to the store hero + product cards: `.dc-store-glass`
 * (src/store-glass.css — blur 46%, rgb(173,216,255) @ 26%), radius 22, the
 * `.dc-scene-ink` scrim so white copy survives the bright scene, and the
 * `.dc-profile-card` hook for the profile type scale.
 */
export function ProfileCard({ className, ...props }: ComponentProps<typeof GlassSurface>) {
  return (
    <GlassSurface
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={22}
      {...props}
      className={cn("dc-store-glass dc-scene-ink dc-profile-card", className)}
    />
  );
}
