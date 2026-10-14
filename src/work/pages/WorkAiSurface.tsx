import LumenChat from "../../lumen/App";
import type { UseCourseNotesResult } from "../../course/useCourseNotes";
import { WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID } from "../workIdentity";
import type { WorkTheme } from "../storage/workPrefs";

export default function WorkAiSurface({ theme, notes }: { theme: WorkTheme; notes: UseCourseNotesResult["notes"] }) {
  return (
    <div className="h-full min-h-0 min-w-0" data-work-ai="" data-work-ai-storage="device-only">
      <LumenChat
        uid={WORK_DEVICE_UID}
        productId={`${WORK_PRODUCT_ID}-ai`}
        courseTitle="Work"
        courseShort="Work"
        moduleId={WORK_MODULE_ID}
        moduleTitle="Personal workspace"
        notes={notes}
        profile={{ name: "Work" }}
        storageOnly
        themeOverride={theme}
      />
    </div>
  );
}
