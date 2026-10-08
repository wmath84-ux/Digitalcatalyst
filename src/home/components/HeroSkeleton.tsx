import { GlassSurface } from "../../components/ui/glass";
import Skeleton from "../../components/ui/Skeleton";

export default function HeroSkeleton() {
  return (
    <GlassSurface
      radius={24}
      tint={0.25}
      blur={0}
      className="dc-scene-plate dc-home-hero-skeleton overflow-hidden"
      contentClassName="p-0"
      aria-hidden="true"
    >
      <div className="dc-home-hero-loading">
        <div className="dc-home-hero-loading-copy">
          <Skeleton width="6rem" height="1.45rem" radius={999} />
          <Skeleton width="min(19rem, 95%)" height="2rem" radius={8} />
          <Skeleton width="min(16rem, 85%)" height="0.8rem" radius={6} />
          <Skeleton width="7rem" height="2.5rem" radius={999} />
        </div>
        <div className="dc-home-hero-loading-art"><Skeleton width="100%" height="100%" radius={20} /></div>
      </div>
    </GlassSurface>
  );
}
