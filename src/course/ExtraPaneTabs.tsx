// src/course/ExtraPaneTabs.tsx
//
// The tab chooser of an EXTRA pane — the third / fourth part the Split Deck's
// divider adds on a tablet-sized or desktop stage.
//
// The deck's own study pane has no in-pane footer: the player's footer
// navigation is the compact strip BELOW the deck (CoursePeekDock), and it
// speaks for the main study pane only. An extra part therefore carries this
// one-row chooser at its top, in the same language as the strip (a circular
// plate in the course's footer colour + the readable name), so every extra
// part can still change what it shows — the owner's "us pane ka apna tab ho,
// jise badal sakein".
//
// Only the tabs that render real content WITHOUT a singleton canvas behind
// them (mind map / sketch), a chat session (AI), a video element (Player) or
// a live experiment stage are offered here: two of those would fight over one
// screenful, not share it.

import { TABS, type DockTab } from "./CourseOverlay";
import "./extra-pane-tabs.css";

/** One-letter plate for each tab the extra panes offer. */
const LETTERS: Partial<Record<DockTab, string>> = {
  modules: "M",
  brain: "B",
  notes: "N",
  read: "R",
  paid: "P",
};

export default function ExtraPaneTabs({
  tab,
  tabs,
  onChange,
  paneId,
}: {
  tab: DockTab;
  /** The tabs this pane may show (already filtered by `hiddenTabs`). */
  tabs: DockTab[];
  onChange: (tab: DockTab) => void;
  /** Marks the row for CSS / tests ("lesson" | "study"). */
  paneId: string;
}) {
  return (
    <div
      className="extra-pane-tabs"
      role="tablist"
      aria-label="This part's study tool"
      data-extra-pane-tabs={paneId}
    >
      {tabs.map((key) => {
        const item = TABS.find((entry) => entry.key === key);
        if (!item) return null;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            className="extra-pane-tab"
            data-extra-pane-tab={key}
            aria-selected={tab === key}
            aria-label={item.heading}
            title={item.heading}
            onClick={() => onChange(key)}
          >
            <span className="extra-pane-tab-plate" aria-hidden="true">
              {LETTERS[key] ?? item.label.slice(0, 1)}
            </span>
            <span className="extra-pane-tab-name" aria-hidden="true">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
