// utils/sketchScene.d.ts
//
// Types for the Course Player Sketch scene model (utils/sketchScene.js).
// The runtime is plain JS so Node's test runner can import it directly; the
// React side (src/course/useCourseSketch.ts, src/course/SketchPanel.tsx)
// consumes these declarations.

/** One Excalidraw element, kept opaque on purpose: the editor owns its shape. */
export type SketchElement = Record<string, unknown>;

/** One embedded image, Excalidraw's `BinaryFileData`. */
export interface SketchFile {
  id?: string;
  mimeType?: string;
  dataURL: string;
  created?: number;
  lastRetrieved?: number;
  [key: string]: unknown;
}

export interface SketchScene {
  version: number;
  elements: SketchElement[];
  appState: Record<string, unknown>;
  files: Record<string, SketchFile>;
}

export interface SketchMeta {
  uid?: string | number | null;
  productId?: string | number | null;
  moduleId?: string | number | null;
  sketchKey?: string;
  updatedAt?: number;
  createdAt?: number;
  /** Optional lecture association — the resource open beside the board. */
  resourceId?: string | null;
  resourceName?: string | null;
}

export interface StoredSketch {
  uid: string;
  productId: string;
  moduleId: string;
  sketchKey: string;
  version: number;
  /** The whole scene as JSON (Firestore cannot store nested arrays). */
  scene: string;
  elementCount: number;
  updatedAt: number;
  createdAt: number;
  resourceId?: string;
  resourceName?: string;
}

export const SKETCH_SCENE_VERSION: number;
export const SKETCH_COLLECTION: "sketches";
export const SKETCH_DEFAULT_KEY: "main";
export const MAX_SKETCH_ELEMENTS: number;
export const MAX_SKETCH_FILE_CHARS: number;
export const MAX_SKETCH_SCENE_CHARS: number;

export function createSketchScene(): SketchScene;
export function isSketchScene(value: unknown): boolean;
export function sketchSceneIsEmpty(scene: unknown): boolean;
export function sketchElementCount(scene: unknown): number;
export function sketchSceneSignature(elements: unknown): number;
export function sanitizeSketchAppState(raw: unknown): Record<string, unknown>;
export function sanitizeSketchElements(raw: unknown): SketchElement[];
export function sanitizeSketchFiles(
  raw: unknown,
  budget?: number,
): { files: Record<string, SketchFile>; dropped: number };
export function parseSketchScene(raw: unknown): SketchScene;
export function serializeSketchScene(scene: unknown): string;
export function sanitizeSketchKey(value: unknown): string;
export function sketchDocId(
  uid: string | number,
  productId: string | number,
  moduleId: string | number,
  sketchKey?: string,
): string;
export function toFirestoreSketch(scene: unknown, meta?: SketchMeta): StoredSketch;
