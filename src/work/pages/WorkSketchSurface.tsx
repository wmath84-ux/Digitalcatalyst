import SketchPanel from "../../course/SketchPanel";
import useWorkSketch from "../storage/useWorkSketch";
import { workSketchLibraryStore } from "../storage/workSketchDb";
import { WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID } from "../workIdentity";
import type { WorkTheme } from "../storage/workPrefs";

export default function WorkSketchSurface({ theme }: { theme: WorkTheme }) {
  const sketch = useWorkSketch();
  return (
    <div className="h-full min-h-0 min-w-0" data-work-sketch="" data-work-surface-theme={theme}>
      <SketchPanel
        getScene={sketch.getScene}
        sceneKey={sketch.sceneKey}
        loading={sketch.loading}
        status={sketch.status}
        errorMessage={sketch.errorMessage}
        pendingSync={false}
        scoped
        onChange={sketch.onChange}
        canvasColor={sketch.canvasColor}
        onCanvasColorChange={sketch.onCanvasColorChange}
        boardName="Work sketch"
        uid={WORK_DEVICE_UID}
        deviceSaved={sketch.deviceSaved}
        onRetry={sketch.retry}
        boards={sketch.boards}
        activeBoardKey={sketch.activeBoardKey}
        activeBoardTitle={sketch.activeBoardTitle}
        onSelectBoard={sketch.onSelectBoard}
        onCreateBoard={sketch.onCreateBoard}
        canCreateBoard={sketch.canCreateBoard}
        onDeleteActive={sketch.onDeleteActive}
        onRenameBoard={sketch.onRenameBoard}
        onDeleteBoard={sketch.onDeleteBoard}
        productId={WORK_PRODUCT_ID}
        moduleId={WORK_MODULE_ID}
        playerTheme={theme}
        storageOnly
        libraryDeviceStore={workSketchLibraryStore}
      />
    </div>
  );
}
