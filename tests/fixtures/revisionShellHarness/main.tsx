import React from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/landing.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/empty-state-glass.css";
import "../../../src/revision-glass.css";
import "../../../src/profile-glass.css";
import "../../../src/light-theme.css";
import "../../../src/light-theme-pages.css";
import RevisionApp from "../../../src/revision/RevisionApp";
import BottomNav from "../../../src/components/BottomNav";
import { useRecallStore } from "../../../src/revision/recall/stores/recall-store";
import { SafeImage } from "../../../src/components/ui/SafeImage";
import Hero from "../../../src/components/landing/Hero";
import CtaBanner from "../../../src/components/landing/CtaBanner";

const settings = { ...useRecallStore.getState().settings, theme: "dark" as const, onboardingComplete: true };
const deck = { id: "deck-uuid-123", name: "Browser regression deck", description: "Test navigation", color: "#004ac6", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
useRecallStore.setState({
  settings,
  decks: [deck], cards: [], reviewLogs: [], isLoading: false, isInitialized: true,
  initialize: async () => { useRecallStore.setState({ isLoading: false, isInitialized: true, settings }); },
});
Object.assign(window, { recallStore: useRecallStore });
const fixture = new URLSearchParams(location.search).get("fixture");
createRoot(document.getElementById("root")!).render(
  fixture === "home" ? <div style={{ position: "relative", height: "100dvh" }}><BottomNav active="home" peek peekAlwaysOpen onChange={() => {}} /></div> :
  fixture === "image" ? <SafeImage src="/missing-primary.png" secondarySrc="/missing-secondary.png" alt="Brand" fallback={<span>Image fallback</span>} /> :
  fixture === "landing" ? <><Hero /><CtaBanner /></> :
  <><RevisionApp uidOverride="guest" /><div data-fixture-controls>
    <button onClick={() => useRecallStore.getState().showDeck(deck.id)}>Open fixture deck</button>
    <button onClick={() => useRecallStore.getState().showSettings()}>Open fixture settings</button>
  </div></>
);