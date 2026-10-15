import Dexie, { type Table } from "dexie";
import type { SketchScene } from "../../../utils/sketchScene.js";
import type { SketchLibraryDeviceStore } from "../../course/useSketchLibrary";

/** Large, device-only Work canvases live in IndexedDB, not localStorage. */
export interface WorkSketchSceneRow {
  key: string;
  scene: SketchScene;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** Excalidraw's personal library can contain embedded files, so it is also IDB-backed. */
export interface WorkSketchLibraryRow {
  key: string;
  items: unknown[];
  createdAt: number;
  updatedAt: number;
}

class WorkSketchDexie extends Dexie {
  scenes!: Table<WorkSketchSceneRow, string>;
  libraries!: Table<WorkSketchLibraryRow, string>;

  constructor() {
    super("digitalcatalyst-work-sketches");
    this.version(1).stores({
      scenes: "key, updatedAt",
      libraries: "key, updatedAt",
    });
  }
}

let instance: WorkSketchDexie | null = null;

/** Create the database lazily so importing Work code outside a browser is safe. */
export function workSketchDb(): WorkSketchDexie {
  if (!instance) instance = new WorkSketchDexie();
  return instance;
}

export function workSketchDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

export const workSketchSceneKey = (scope: string, board: string) => `work-scene:v1:${scope}:${board}`;
export const workSketchLibraryKey = (uid: string) => `work-library:v1:${uid}`;

export async function readWorkSketchScene(key: string): Promise<WorkSketchSceneRow | null> {
  if (!workSketchDbAvailable()) throw new Error("IndexedDB is unavailable. Work sketches need device storage enabled in this browser.");
  return (await workSketchDb().scenes.get(key)) ?? null;
}

export async function writeWorkSketchScene(row: WorkSketchSceneRow): Promise<void> {
  if (!workSketchDbAvailable()) throw new Error("IndexedDB is unavailable. Work sketches need device storage enabled in this browser.");
  await workSketchDb().scenes.put(row);
}

export async function removeWorkSketchScene(key: string): Promise<void> {
  if (!workSketchDbAvailable()) throw new Error("IndexedDB is unavailable. Work sketches need device storage enabled in this browser.");
  await workSketchDb().scenes.delete(key);
}

export async function readWorkSketchLibrary(uid: string): Promise<WorkSketchLibraryRow | null> {
  if (!workSketchDbAvailable()) throw new Error("IndexedDB is unavailable. Your Work sketch library needs device storage enabled in this browser.");
  return (await workSketchDb().libraries.get(workSketchLibraryKey(uid))) ?? null;
}

export async function writeWorkSketchLibrary(row: WorkSketchLibraryRow): Promise<void> {
  if (!workSketchDbAvailable()) throw new Error("IndexedDB is unavailable. Your Work sketch library needs device storage enabled in this browser.");
  await workSketchDb().libraries.put(row);
}

/** Test/runtime cleanup without making the feature depend on a browser at import time. */
export async function closeWorkSketchDb(): Promise<void> {
  if (!instance) return;
  instance.close();
  instance = null;
}

/** Plug the Dexie table into the reused Excalidraw library hook. */
export const workSketchLibraryStore: SketchLibraryDeviceStore = {
  async read(uid) {
    const row = await readWorkSketchLibrary(uid);
    return row ? { items: row.items, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;
  },
  async write(uid, snapshot) {
    await writeWorkSketchLibrary({
      key: workSketchLibraryKey(uid),
      ...snapshot,
    });
  },
};
