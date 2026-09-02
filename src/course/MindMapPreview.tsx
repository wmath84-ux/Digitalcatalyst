// TEMPORARY dev sandbox — course-player mind map toolbar preview.
//
// Renders `MindMapPanel` on its own (no Firestore, no auth, no course
// ownership) inside three fixed frames — phone, tablet and desktop — so the
// toolbar's icon sizing and drop-downs can be reviewed on one screen.
// Reachable at `#/dev/mindmap-preview`.

import { useEffect, useMemo, useRef, useState } from "react";
import MindMapPanel from "./MindMapPanel";
import { GlassToggleGroup, GlassToggleItem } from "../components/ui/glass-toggle-group";
import { GlassButton } from "../components/ui/glass-button";
import type { MindMapSaveStatus, MindMapSummary } from "./useCourseMindMap";
import { addChildNode, createMindMap, countNodes, rootId, type MindMap } from "../../utils/mindMapTree";

const FRAMES = [
  { id: "phone", label: "Phone", width: 390, height: 720 },
  { id: "tablet", label: "Tablet", width: 820, height: 900 },
  { id: "desktop", label: "Desktop", width: 1180, height: 760 },
] as const;

const STATUSES: MindMapSaveStatus[] = ["idle", "loading", "ready", "saving", "saved", "error"];

const buildDemoMap = (): MindMap => {
  let mind = createMindMap("Photosynthesis kya hai?", "Chapter 4 map");
  const branches: [string, string[]][] = [
    ["Light reaction", ["Sunlight absorbed", "ATP banega", "Oxygen release"]],
    ["Dark reaction", ["Carbon dioxide", "Glucose banta hai"]],
    ["Chloroplast", ["Thylakoid", "Stroma", "Grana stacks hote hain aur yeh line lambi hai"]],
    ["Factors affecting rate", ["Light intensity", "CO2 concentration", "Temperature", "Water availability"]],
  ];
  for (const [branch, leaves] of branches) {
    const created = addChildNode(mind, rootId(), branch);
    mind = created.mind;
    if (created.nodeId) {
      for (const leaf of leaves) {
        mind = addChildNode(mind, created.nodeId, leaf).mind;
      }
    }
  }
  return mind;
};

export default function MindMapPreview() {
  const [mind, setMind] = useState<MindMap>(buildDemoMap);
  const [status, setStatus] = useState<MindMapSaveStatus>("saved");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [frame, setFrame] = useState<(typeof FRAMES)[number]["id"]>("phone");

  const maps: MindMapSummary[] = useMemo(
    () => [
      {
        mapKey: "main",
        title: "Chapter 4 map",
        rootTopic: mind.rootTopic,
        nodeCount: countNodes(mind),
        updatedAt: Date.now(),
        createdAt: Date.now() - 86400000,
      },
      {
        mapKey: "map-2",
        title: "Formula sheet",
        rootTopic: "Formula sheet",
        nodeCount: 4,
        updatedAt: Date.now() - 3600000,
        createdAt: Date.now() - 7200000,
      },
    ],
    [mind],
  );

  const active = FRAMES.find((entry) => entry.id === frame) ?? FRAMES[0];

  // The panel's home screen is the map library, which covers the canvas —
  // open the demo map once so the toolbar can be reviewed over real nodes.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      stageRef.current
        ?.querySelector<HTMLButtonElement>('[data-course-mindmap-open-map="main"]')
        ?.click();
    }, 260);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[100dvh] p-6 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-xs font-bold">
        <span className="uppercase tracking-widest text-white/55">Mind map toolbar preview</span>
        <GlassToggleGroup className="dc-segment" value={frame} onValueChange={(next) => setFrame(next as typeof frame)} aria-label="Frame">
          {FRAMES.map((entry) => (
            <GlassToggleItem key={entry.id} value={entry.id} className="px-3 py-1.5 text-xs">
              {entry.label} · {entry.width}
            </GlassToggleItem>
          ))}
        </GlassToggleGroup>
        <GlassButton
          variant="capsule"
          onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
          className="[&>span>div]:h-8 [&>span>div]:px-3 [&>span>div]:text-xs"
        >
          Player theme: {theme}
        </GlassButton>
        <span className="ml-2 text-white/55">Save status:</span>
        <GlassToggleGroup className="dc-segment" value={status} onValueChange={(next) => setStatus(next as typeof status)} aria-label="Save status">
          {STATUSES.map((value) => (
            <GlassToggleItem key={value} value={value} className="px-2.5 py-1.5 text-xs">
              {value}
            </GlassToggleItem>
          ))}
        </GlassToggleGroup>
      </div>

      <div ref={stageRef} className="mt-6 flex flex-wrap items-start gap-6">
        {FRAMES.map((entry) => (
          <div key={entry.id} style={{ width: entry.width }} className="shrink-0">
            <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-white/55">
              {entry.label} · {entry.width}px
            </p>
            <div
              className="overflow-hidden rounded-3xl border border-white/10"
              style={{ width: entry.width, height: entry.height }}
            >
              <MindMapPanel
                key={entry.id}
                mind={mind}
                onMindChange={(updater) =>
                  setMind((current) => (typeof updater === "function" ? updater(current) : updater))
                }
                status={status}
                errorMessage={status === "error" ? "Cloud save fail ho gaya — dobara try ho raha hai." : null}
                onFlush={() => setStatus("saving")}
                playerTheme={theme}
                open
                maps={maps}
                activeMapKey="main"
                onSelectMap={() => undefined}
                onCreateMap={() => undefined}
                onRenameMap={() => undefined}
                onDeleteMap={() => undefined}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[11px] text-white/55">
        Rendered frame: {active.label}. All three frames share one map, so edits show up everywhere.
      </p>
    </div>
  );
}
