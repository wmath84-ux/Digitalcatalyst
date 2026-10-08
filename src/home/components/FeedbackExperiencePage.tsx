import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import DeferredVisible from "../../components/DeferredVisible";
import { useBranding } from "../../context/BrandingContext";
import { createUserQuery } from "../../utils/userQueries";
import { prefetchRoute } from "../../utils/lazyRoute";
import SocialProfileCard from "./SocialProfileCard";

const StickerWall = lazy(() => import("../../components/StickerWall"));

interface FeedbackExperiencePageProps {
  onBack: () => void;
}

/** The former Home wall and branded social card, now together on a focused page. */
export default function FeedbackExperiencePage({ onBack }: FeedbackExperiencePageProps) {
  const branding = useBranding();

  return (
    <div data-home-feedback-page className="dc-home-feedback-page">
      <div className="dc-home-feedback-page-heading">
        <button type="button" onClick={onBack} className="dc-home-feedback-back">
          <ArrowLeft size={17} aria-hidden="true" /> Back to Home
        </button>
        <div>
          <p className="dc-home-feedback-page-eyebrow">Community</p>
          <h1>Feedback &amp; social</h1>
          <p className="dc-home-feedback-page-description">Share a note with the learning team or connect through our social channels.</p>
        </div>
      </div>

      <section data-home-sticker-wall className="dc-home-feedback-wall-section">
        <div className="dc-home-feedback-wall-frame h-[520px] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F0F12] sm:h-[640px] md:h-[740px]">
          <DeferredVisible className="h-full w-full">
            <Suspense fallback={<div className="h-full w-full" aria-label="Loading feedback wall" />}>
              <StickerWall
                onSubmitNote={async (note) => { await createUserQuery(note).catch(() => undefined); }}
                footer={(
                  <button
                    type="button"
                    onClick={() => {
                      prefetchRoute("#/queries");
                      window.location.hash = "#/queries";
                    }}
                    className="rounded-full border border-white/15 bg-white/[0.07] px-5 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-white/[0.14]"
                    data-home-explore-queries
                  >
                    Explore user queries
                  </button>
                )}
              />
            </Suspense>
          </DeferredVisible>
        </div>
      </section>

      <section data-home-social-card-section className="dc-home-feedback-social-section">
        <div data-home-social-slot className="dc-home-feedback-social-slot h-[520px] w-full sm:h-[640px] md:h-[740px]">
          <SocialProfileCard
            logoUrl={branding.logoUrl}
            name={branding.appName}
            bio={branding.tagline}
            links={branding.socialLinks}
          />
        </div>
      </section>
    </div>
  );
}
