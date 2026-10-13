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
        <span className="dc-home-continue-image"><Skeleton width="100%" height="100%" radius={14} /></span>
        <span className="dc-home-continue-copy">
          <span className="dc-home-continue-title-row">
            <Skeleton width="62%" height="1.25rem" radius={6} />
            <Skeleton width="2.75rem" height="1.8rem" radius={999} />
          </span>
          <span className="dc-home-continue-details"><Skeleton width="42%" height="0.9rem" radius={6} /></span>
          <span className="dc-home-continue-lesson">
            <Skeleton width="1rem" height="1rem" radius={999} />
            <span className="dc-home-continue-lesson-copy"><Skeleton width="72%" height="0.9rem" radius={6} /></span>
          </span>
          <span className="dc-home-continue-progress-row">
            <span className="dc-home-progress-track"><Skeleton width="100%" height="100%" radius={999} /></span>
          </span>
          <span className="dc-home-continue-footer">
            <Skeleton width="6rem" height="0.9rem" radius={6} />
            <Skeleton width="6rem" height="2.5rem" radius={999} />
          </span>
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
