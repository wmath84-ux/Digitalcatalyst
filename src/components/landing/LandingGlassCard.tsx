import { GlassSurface, type GlassSurfaceProps } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

/**
 * The SAME surface as the Store product cards. The dc-store-glass rules in
 * store-glass.css read --dc-store-glass-blur (18.4px) and
 * --dc-store-glass-tint (light blue at 26%) from glass.css, and apply the
 * matching sheen/rim/fallbacks. Only the material is shared — landing copy
 * and font styles remain untouched.
 */
type LandingGlassCardProps = Omit<GlassSurfaceProps, "tint" | "tintColor" | "blur">;

export default function LandingGlassCard({ className, ...props }: LandingGlassCardProps) {
  return (
    <GlassSurface
      tint={0.62}
      tintColor="173,216,255"
      blur={0}
      radius={22}
      className={cn("dc-store-glass", className)}
      {...props}
    />
  );
}
