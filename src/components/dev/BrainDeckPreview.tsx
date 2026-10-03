// src/components/dev/BrainDeckPreview.tsx
//
// Developer sandbox for the Course Player's Brain practice deck (`#/dev/brain-deck`).
//
// The Brain tab renders the AI Canvas "Product Card Deck" the owner picked as
// the design reference (https://aicanvas.me/components/product-card-deck) —
// see src/course/BrainQuestionDeck.tsx. That card lives inside the player's
// study pane, which is exactly the environment that is hard to reach while
// designing: sign in, open a course, wait for the catalog, pick the module,
// drag the Split Deck divider. This page mounts the REAL panel (its own
// source, not a copy) with the demo course's REAL practice set, so the card
// design and its fit can be looked at on any pane size, in isolation.
//
// Query parameters (dev convenience only):
//   ?w=390&h=720   the box the deck is given — i.e. what the study pane's size
//                  would be. Drag the Split Deck and this is what changes, so
//                  this is how a divider drag is reproduced by hand.
//   ?long=1        prepends a deliberately enormous 6-option question to the
//                  set, for the "content taller than any card can be" case.
//
// Read-only by design: it never writes Firestore, never touches the learner's
// practice history beyond this page's own localStorage key, and styles nothing
// of its own — what you see is what the player paints.
import { useState } from "react";
import CourseBrainPanel from "@/course/CourseBrainPanel";
import { demoCourseContent } from "@/data/demoCourseContent";
import { collectBrainPracticeSets } from "../../../utils/practiceSet.js";

/** The same shape the player hands the panel (see utils/practiceSet.js). */
type Set = Parameters<typeof CourseBrainPanel>[0]["sets"][number];

const params = new URLSearchParams(window.location.search);
const boxWidth = Number(params.get("w") ?? 390);
const boxHeight = Number(params.get("h") ?? 720);

/**
 * The REAL practice sets the demo course ships (`utils/practiceSet.js` builds
 * them exactly the way the player does), so this page shows what a learner
 * actually sees — not a mock-up of it.
 */
const SETS: Set[] = collectBrainPracticeSets(
  demoCourseContent,
  new Set(demoCourseContent.map((module) => String(module.id))),
);

if (params.has("long")) {
  (SETS[0].questions as unknown[]).unshift(
    { id: "q6", prompt: "A train leaves the station at 09:40 and travels 240 km at a steady speed, arriving at 12:40. Another train leaves the same station at 10:10 travelling the same route at 90 km/h. At what time does the second train catch up with the first, and how far from the station is that?", options: ["11:40, 150 km", "12:10, 180 km", "12:40, 240 km", "13:10, 270 km", "11:10, 120 km", "12:25, 210 km"], correctIndex: 1, explanation: "Relative speed.", difficulty: "hard", topic: "Speed" } as never,
  );
}

export default function BrainDeckPreview() {
  const [width, setWidth] = useState(boxWidth);
  const [height, setHeight] = useState(boxHeight);

  return (
    <div style={{ minHeight: "100vh", background: "#141414", padding: 16, color: "#9E9E98", fontFamily: "inherit" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <strong style={{ color: "#F5F1E8", fontSize: 13 }}>Brain practice deck — the study pane's box</strong>
        {([["width", width, setWidth], ["height", height, setHeight]] as const).map(([label, value, set]) => (
          <label key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {label}
            <input
              type="range"
              min={label === "width" ? 200 : 260}
              max={label === "width" ? 900 : 1000}
              value={value}
              onChange={(event) => set(Number(event.target.value))}
              style={{ width: 180 }}
            />
            <span style={{ width: 44 }}>{value}px</span>
          </label>
        ))}
        <span style={{ fontSize: 11 }}>?long=1 adds an oversized 6-option question</span>
      </div>
      <div style={{ display: "grid", placeItems: "start" }}>
        <div style={{ width, height, display: "flex", flexDirection: "column", background: "#1A1A19", borderRadius: 18, overflow: "hidden" }}>
          <CourseBrainPanel productId="dev-brain-deck" sets={SETS} />
        </div>
      </div>
    </div>
  );
}
