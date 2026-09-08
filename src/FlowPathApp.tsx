import { useState } from "react";
import { FlowPathView } from "./components/flowpath/FlowPathView";
import Header from "./home/components/Header";
import { useAuth } from "./context/AuthContext";

interface FlowPathAppProps {
  onNavigateToHome: () => void;
  favoritesCount?: number;
  onOpenFavorites?: () => void;
  onOpenNotifications?: () => void;
}

/**
 * FlowPath 3D Dashboard — integrated as a full-page route.
 *
 * The page now opens with the same greeting header the Home page uses
 * (brand gradient, search, leaderboard / profile / notifications /
 * favorites actions). The header is sticky so it stays seated while the
 * flow ribbon scrolls underneath, and its collapse animation is driven by
 * the window scroller (see Header's window fallback). The sticky host is
 * sized to the header's seat so collapsing cannot move the scroll position.
 *
 * The footer dock's Home button navigates back to the main home page
 * on a single click.
 */
export default function FlowPathApp({
  onNavigateToHome,
  favoritesCount = 0,
  onOpenFavorites,
  onOpenNotifications,
}: FlowPathAppProps) {
  const { user } = useAuth();
  const userName = user?.name?.trim().split(/\s+/)[0] || "Learner";
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flowpath-app relative min-h-screen text-fp-text">
      {/* A8 (Wave 13c): the page fill (`--fp-bg-0`) and the ambient layer
          (radial gradients, grid, orbs, particles) are gone — FlowPath sits on
          the app's single blurred backdrop like every other page. */}

      {/* Home-style greeting header, pinned above the flow ribbon. The sticky
          host keeps a constant height (`--dc-home-header-seat`, measured by
          the header) so the collapse animation never changes the document
          height — that feedback loop was the flicker on slow scrolls. */}
      <div data-home-header-host className="sticky top-0 z-40">
        <Header
          userName={userName}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          suggestions={[]}
          onSelectSuggestion={() => {}}
          favoritesCount={favoritesCount}
          onOpenFavorites={onOpenFavorites}
          onOpenNotifications={onOpenNotifications}
        />
      </div>

      <div className="relative z-10">
        <FlowPathView onNavigateToHome={onNavigateToHome} />
      </div>
    </div>
  );
}
