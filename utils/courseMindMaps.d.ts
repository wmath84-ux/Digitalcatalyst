// Type declarations for `utils/courseMindMaps.js` (master mind map rules).
import type { MindMap } from "./mindMapTree";

export interface MasterMindMapFileLike {
  type?: string;
  mindMapData?: unknown;
}

export interface MasterMindMapView {
  mind: MindMap | null;
  error: string | null;
  nodeCount: number;
}

export declare function isMasterMindMapFile(file: MasterMindMapFileLike | null | undefined): boolean;
export declare function masterMindMapView(file: MasterMindMapFileLike | null | undefined): MasterMindMapView | null;
