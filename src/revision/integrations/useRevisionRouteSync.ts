import { useEffect, useRef } from "react";
import { useRecallStore } from "../recall/stores/recall-store";
import { hashForRecallView, isRevisionHash, recallViewForPage, type RevisionRoute } from "./routes";

/** URL changes and Recall actions have separate owners; never mirror a stale
 * render back over a Back/Forward navigation or a just-clicked deck. */
export function useRevisionRouteSync(route: RevisionRoute, ready: boolean): void {
  const applyingRoute = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const target = recallViewForPage(route.page);
    if (!target) return;
    applyingRoute.current = true;
    try {
      const state = useRecallStore.getState();
      if (route.page === "decks") {
        if (route.deckId) state.showDeck(route.deckId);
        else state.showDeckBrowser();
      } else if (target === "study") {
        // An in-memory match shares the study URL. A cold study link renders
        // StudyMode's explicit empty-session state, never an unrelated page.
        if (state.view !== "study" && state.view !== "match") {
          useRecallStore.setState({ view: "study" });
        }
      } else if (state.view !== target) {
        const actions = {
          dashboard: state.showDashboard,
          settings: state.showSettings,
          stats: state.showStats,
          browser: state.showBrowser,
          tags: state.showTags,
          "import-hub": state.showImportHub,
          "focus-timer": state.showFocusTimer,
        };
        actions[target as keyof typeof actions]?.();
      }
    } finally {
      applyingRoute.current = false;
    }
  }, [route.hash, ready]);

  useEffect(() => useRecallStore.subscribe((state, previous) => {
    if (!ready || applyingRoute.current || !isRevisionHash(window.location.hash)) return;
    if (state.view === previous.view && state.selectedDeckId === previous.selectedDeckId) return;
    if (state.view === "onboarding") return;
    const target = hashForRecallView(state.view, state.selectedDeckId);
    if (window.location.hash !== target) window.location.hash = target;
  }), [ready]);
}
