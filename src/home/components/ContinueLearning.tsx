import { ArrowRight, BookOpen } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";
import HomeSectionHeader from "./HomeSectionHeader";
import { clampProgress } from "../data/homeDashboardData";

export interface ContinueLearningItem {
  id: string;
  title: string;
  author: string;
  image: string;
  /** Class / subject metadata from the catalog, when available. */
  details?: string;
  /** The actual last-opened module and resource, when saved in course progress. */
  currentLesson?: string;
  /** Completion percentage, 0-100. */
  progress: number;
  onResume: () => void;
  onOpen?: () => void;
}

interface ContinueLearningProps {
  items: ContinueLearningItem[];
}

export default function ContinueLearning({ items }: ContinueLearningProps) {
  if (items.length === 0) return null;
  const recentProgress = clampProgress(items[0].progress);

  return (
    <section className="dc-home-section dc-home-continue-section" aria-labelledby="home-continue-title">
      <HomeSectionHeader
        id="home-continue-title"
        title="Continue Learning"
        trailing={<span className="dc-home-progress-summary dc-scene-ink" aria-label={`${recentProgress}% complete in your most recently opened course`}>{recentProgress}%</span>}
      />
      <div className="dc-home-continue-grid">
        {items.map((item) => <ContinueLearningCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function ContinueLearningCard({ item }: { item: ContinueLearningItem }) {
  const progress = clampProgress(item.progress);
  const open = item.onOpen || item.onResume;

  return (
    <GlassCard
      tint={0.25}
      blur={0}
      radius={20}
      contentClassName="p-0"
      className="dc-scene-plate dc-home-card dc-home-continue-card"
    >
      <button
        type="button"
        onClick={open}
        className="dc-home-continue-action"
        aria-label={`Resume ${item.title}`}
      >
        <span className="dc-home-continue-image h-16 w-16">
          <img src={item.image} alt="" loading="lazy" decoding="async" />
        </span>
        <span className="dc-home-continue-copy">
          <span className="dc-home-continue-title-row">
            <span className="dc-home-continue-title" title={item.title}>{item.title}</span>
            <span className="dc-home-continue-percent">{progress}%</span>
          </span>
          {item.details || item.author ? <span className="dc-home-continue-details">{item.details || item.author}</span> : null}
          {item.currentLesson ? (
            <span className="dc-home-continue-lesson">
              <BookOpen size={14} aria-hidden="true" />
              <span><span className="dc-home-continue-lesson-label">Last opened</span>{item.currentLesson}</span>
            </span>
          ) : null}
          <span className="dc-home-continue-progress-row">
            <span className="dc-home-progress-track h-1.5" role="progressbar" aria-label={`Progress in ${item.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <span className="dc-home-progress-fill" style={{ width: `${progress}%` }} />
            </span>
            <span className="dc-home-continue-progress-label">{progress}% complete</span>
          </span>
          <span className="dc-home-continue-cta">Resume <ArrowRight size={15} aria-hidden="true" /></span>
        </span>
      </button>
    </GlassCard>
  );
}
