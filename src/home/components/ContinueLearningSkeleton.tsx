import { GlassCard } from "../../components/ui/GlassCard";
import Skeleton from "../../components/ui/Skeleton";
import HomeSectionHeader from "./HomeSectionHeader";

export function ContinueLearningCardSkeleton() {
  return (
    <GlassCard
      aria-hidden="true"
      tint={0.25}
      blur={0}
      radius={20}
      contentClassName="p-0"
      className="dc-scene-plate dc-home-card dc-home-continue-card"
    >
      <div className="dc-home-continue-action dc-home-continue-skeleton">
        <span className="dc-home-continue-image h-16 w-16"><Skeleton width="100%" height="100%" radius={14} /></span>
        <span className="dc-home-continue-copy">
          <Skeleton width="82%" height="1rem" radius={6} />
          <Skeleton width="58%" height="0.75rem" radius={6} />
          <Skeleton width="90%" height="0.75rem" radius={6} />
          <span className="dc-home-progress-track h-1.5"><Skeleton width="100%" height="100%" radius={999} /></span>
          <Skeleton width="5rem" height="1.7rem" radius={999} />
        </span>
      </div>
    </GlassCard>
  );
}

export default function ContinueLearningSkeleton({ count = 2 }: { count?: number }) {
  return (
    <section className="dc-home-section dc-home-continue-section" aria-busy="true" aria-label="Loading continue learning">
      <HomeSectionHeader
        title="Continue Learning"
        trailing={<Skeleton width="3rem" height="0.9rem" radius={6} />}
      />
      <div className="dc-home-continue-grid">
        {Array.from({ length: count }).map((_, index) => <ContinueLearningCardSkeleton key={index} />)}
      </div>
    </section>
  );
}
