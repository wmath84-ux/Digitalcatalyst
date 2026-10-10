import { GlassSurface } from "../../components/ui/glass";
import Skeleton from "../../components/ui/Skeleton";

/** Loading card that mirrors the Home product-card art and copy geometry. */
export default function ProductCardSkeleton() {
  return (
    <GlassSurface
      radius={24}
      tint={0.25}
      blur={0}
      aria-hidden="true"
      className="dc-scene-plate dc-home-product-card dc-home-product-skeleton overflow-hidden text-white"
      contentClassName="flex h-full min-w-0 flex-col p-0"
    >
      <div className="dc-home-product-media aspect-[4/3]">
        <Skeleton width="100%" height="100%" radius={0} />
        <span className="dc-home-product-type"><Skeleton width="3rem" height="0.65rem" radius={999} /></span>
      </div>
      <div className="dc-home-product-copy p-3">
        <div className="flex min-h-[2.5rem] flex-col justify-center gap-1.5">
          <Skeleton width="92%" height="0.78rem" radius={6} />
          <Skeleton width="68%" height="0.78rem" radius={6} />
        </div>
        <Skeleton width="60%" height="0.7rem" radius={6} />
        <div className="dc-home-product-meta-row mt-auto">
          <Skeleton width="3rem" height="0.7rem" radius={6} />
          <Skeleton width="4.5rem" height="0.8rem" radius={6} />
        </div>
      </div>
    </GlassSurface>
  );
}
