import { ArrowRight, MessageSquare } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";

interface FeedbackSectionProps {
  onOpen: () => void;
}

/** Compact Home entry point; the full feedback and social cards live on their own page. */
export default function FeedbackSection({ onOpen }: FeedbackSectionProps) {
  return (
    <section className="dc-home-section dc-home-feedback-section" aria-labelledby="home-feedback-title">
      <GlassCard
        tint={0.25}
        blur={0}
        radius={20}
        contentClassName="p-4 sm:p-5"
        className="dc-scene-plate dc-home-card dc-home-feedback-card"
      >
        <div className="dc-home-feedback-content">
          <span className="dc-home-feedback-icon" aria-hidden="true"><MessageSquare size={19} /></span>
          <div className="dc-home-feedback-copy">
            <h2 id="home-feedback-title">Have something to share?</h2>
            <p>Visit the feedback wall or connect with us.</p>
          </div>
          <button type="button" onClick={onOpen} className="dc-home-feedback-button">
            Open feedback <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </GlassCard>
    </section>
  );
}
