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
 * the window scroller (see Header's window fallback).
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
    <div className="flowpath-app relative min-h-screen bg-[var(--fp-bg-0)] text-fp-text">
      {/* ambient dimensional background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,123,255,0.16), transparent), radial-gradient(ellipse 60% 40% at 85% 20%, rgba(94,234,212,0.08), transparent), radial-gradient(ellipse 60% 50% at 10% 70%, rgba(139,123,255,0.10), transparent)",
          }}
        />
        <div className="fp-bg-grid absolute inset-0" />
        <div className="fp-orb absolute left-[10%] top-[12%] h-72 w-72 rounded-full bg-violet-500/10 blur-[100px]" />
        <div
          className="fp-orb absolute right-[8%] top-[45%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[110px]"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="fp-orb absolute left-[20%] bottom-[10%] h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[100px]"
          style={{ animationDelay: "9s" }}
        />

        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="fp-particle absolute block h-[3px] w-[3px] rounded-full bg-fp-text/40"
            style={
              {
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
                "--op": 0.15 + ((i * 13) % 40) / 100,
                animationDuration: `${8 + (i % 7)}s`,
                animationDelay: `${(i % 5) * 0.8}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Home-style greeting header, pinned above the flow ribbon. */}
      <div className="sticky top-0 z-40">
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
