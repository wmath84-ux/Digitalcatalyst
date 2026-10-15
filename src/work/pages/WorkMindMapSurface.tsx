import useCourseMindMap from "../../course/useCourseMindMap";
import MindMapPanel from "../../course/MindMapPanel";
import { WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID } from "../workIdentity";
import type { WorkTheme } from "../storage/workPrefs";

export default function WorkMindMapSurface({
  theme,
  orientation,
  onEditorOpenChange,
}: {
  theme: WorkTheme;
  orientation: "row" | "column";
  onEditorOpenChange?: (open: boolean) => void;
}) {
  const maps = useCourseMindMap({
    uid: WORK_DEVICE_UID,
    productId: WORK_PRODUCT_ID,
    moduleId: WORK_MODULE_ID,
    rootTopic: "My ideas",
    storageOnly: true,
  });
  return (
    <MindMapPanel
      mind={maps.mind}
      onMindChange={maps.setMind}
      status={maps.status}
      errorMessage={maps.errorMessage}
      onFlush={maps.flush}
      landscape={orientation === "row"}
      open
      maps={maps.maps}
      activeMapKey={maps.activeMapKey}
      onSelectMap={maps.selectMap}
      onCreateMap={maps.createMap}
      onRenameMap={maps.renameMap}
      onDeleteMap={maps.deleteMap}
      mapsLoading={maps.mapsLoading}
      atMapLimit={maps.atMapLimit}
      courseTitle="Work"
      moduleId={WORK_MODULE_ID}
      uid={WORK_DEVICE_UID}
      onRetryMaps={maps.reload}
      masterMaps={[]}
      storageOnly
      themeOverride={theme}
      onEditorOpenChange={onEditorOpenChange}
    />
  );
}
