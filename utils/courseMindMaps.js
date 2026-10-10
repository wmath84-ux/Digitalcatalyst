// utils/courseMindMaps.js
//
// Pure rules for MASTER mind maps (admin-created `mind_map` resources) in the
// Course Player. Kept free of React so `node --test` can exercise them.
//
// Placement rule (owner brief): a master mind map is shown in the LOWER study
// pane (the Mind Map tab), never in the upper lesson pane. The upper pane is
// reserved for video/content, so this module decides "is this a mind map?"
// and builds the read-only view; CoursePlayerApp routes it to the Mind Map tab.

import { validateMindMapObject, formatMindMapIssue } from "./mindMapImport.js";

/** True for an admin mind map resource (`type: "mind_map"`). */
export const isMasterMindMapFile = (file) => Boolean(file) && file.type === "mind_map";

/**
 * The read-only view of a master mind map. `mind` is the canonical map when the
 * stored data passes the shared validator; otherwise `error` names the first
 * problem (path + reason) so the panel can say what is wrong instead of blank.
 */
export const masterMindMapView = (file) => {
  if (!isMasterMindMapFile(file)) return null;
  if (!file.mindMapData || typeof file.mindMapData !== "object") {
    return { mind: null, error: "This master map has no stored data yet.", nodeCount: 0 };
  }
  const check = validateMindMapObject(file.mindMapData);
  if (!check.valid || !check.mindMap) {
    const first = check.errors[0];
    return {
      mind: null,
      error: first ? `This master map cannot be shown — ${formatMindMapIssue(first)}` : "This master map cannot be shown.",
      nodeCount: 0,
    };
  }
  return { mind: check.mindMap, error: null, nodeCount: check.stats.nodes };
};
