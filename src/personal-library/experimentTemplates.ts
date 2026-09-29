// src/personal-library/experimentTemplates.ts
//
// The starter experiments the builder offers ("Interactive 2D experiment" →
// Start from a template).
//
// Why ship working templates at all? Three reasons, all of them learner-facing:
//
//   1. The type works with ZERO AI. A learner can add a real, interactive
//      experiment to their course in one tap and see what the format is.
//   2. They are the reference for the AI prompt: "make one like this, but for
//      photosynthesis" is a far better instruction than a wall of rules — and
//      the file can be copied into any AI chat as an example.
//   3. They prove the contract (responsive canvas, pointer/touch controls, the
//      `dc:pause` / `dc:play` bridge, dark + light themes) so a learner can
//      tell a broken AI answer from a working one.
//
// The HTML lives in `./experiments/*.html` and is imported with Vite's `?raw`
// so the exact same bytes are previewed, saved and re-downloaded: no build step
// and no second copy to drift.

import projectileMotion from "./experiments/projectile-motion.html?raw";
import simplePendulum from "./experiments/simple-pendulum.html?raw";
import waveSuperposition from "./experiments/wave-superposition.html?raw";
import sortingVisualizer from "./experiments/sorting-visualizer.html?raw";
import { experimentByteLength } from "../utils/experimentSpec";

export interface ExperimentTemplate {
  id: string;
  /** Shown on the chip in the builder. */
  label: string;
  /** One line of "what this teaches", used as the resource's description. */
  summary: string;
  /** Subject hint, so a learner can find a fitting template fast. */
  subject: string;
  html: string;
}

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  {
    id: "projectile",
    label: "Projectile motion",
    subject: "Physics",
    summary: "Angle, speed and gravity sliders, with the trajectory, velocity vectors and live range/height/time readouts.",
    html: projectileMotion,
  },
  {
    id: "pendulum",
    label: "Simple pendulum",
    subject: "Physics",
    summary: "Drag the bob to set the amplitude and watch the period follow T = 2π√(L/g) — mass never matters.",
    html: simplePendulum,
  },
  {
    id: "waves",
    label: "Wave superposition",
    subject: "Physics / Maths",
    summary: "Two travelling waves plus their sum: constructive and destructive interference, with the resultant amplitude.",
    html: waveSuperposition,
  },
  {
    id: "sorting",
    label: "Sorting algorithms",
    subject: "Computer Science",
    summary: "Bubble, selection, insertion and merge sort racing on the same bars, with comparison / swap / step counters.",
    html: sortingVisualizer,
  },
];

export const experimentTemplate = (id: string): ExperimentTemplate | null =>
  EXPERIMENT_TEMPLATES.find((template) => template.id === id) || null;

/** Bytes per template — the builder shows the size before the learner adds it. */
export const templateBytes = (template: ExperimentTemplate): number => experimentByteLength(template.html);
