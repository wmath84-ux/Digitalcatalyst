// src/hooks/useDocsEditorAccess.ts
//
// Live admin switches for the Course Player's in-frame Google editors.
//
// The admin decides — in Admin → Content → Course Player — what learners
// get PER GOOGLE FILE TYPE (Docs, Sheets, Slides — each independently):
//
//   · "off"     — preview only; the Edit toggle never renders.
//   · "toolbar" — the compact Google editor (`/edit?rm=embedded`): the
//                 complete formatting toolbar, but Google's outer header
//                 (doc title, File/Edit/View menu bar, share) stays hidden.
//   · "full"    — the COMPLETE docs.google.com experience (`/edit`):
//                 title, whole menu bar, toolbar, tabs/outline side panel,
//                 comments, share — everything.
//
// Types WITHOUT an in-place editor never get a switch: a Google Form's
// /edit page is the form BUILDER (owner-only; learners fill the embedded
// viewform instead), and PDFs / Drive binaries have no editor at all.
//
// Stored on the public `settings/adminContent` document (world-readable
// per firestore.rules, admin-writable only), so the player picks up a
// change instantly via the snapshot listener — no redeploy, no reload.
//
// Storage shape (both fields optional):
//   docsEditorAccess:       "off" | "toolbar" | "full"   // legacy single switch
//   docsEditorAccessByType: { doc?, sheet?, slides? }     // per-type override
// A missing per-type entry inherits the legacy single value, so settings
// saved before the per-type control keep exactly their old behaviour.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import {
  normalizeDocsEditorAccess,
  normalizeDocsEditorAccessMap,
  normalizeDrivePersonalCopySettings,
  type DocsEditorAccess,
  type DocsEditorAccessMap,
  type DrivePersonalCopySettings,
} from "../utils/courseEmbed";
import { getGoogleClientId } from "../../utils/googleIdentity";

/** What ships when the admin has never touched the switches.
 *  "full" — the complete docs.google.com page (header, menu bar AND
 *  toolbar) — because the in-player editor now opens by default for
 *  editable Google files, and the full page is what learners expect
 *  when the owner has granted editor permission. */
export const DEFAULT_DOCS_EDITOR_ACCESS: DocsEditorAccess = "full";

const DEFAULT_MAP: DocsEditorAccessMap = {
  doc: DEFAULT_DOCS_EDITOR_ACCESS,
  sheet: DEFAULT_DOCS_EDITOR_ACCESS,
  slides: DEFAULT_DOCS_EDITOR_ACCESS,
};

const DEFAULT_PERSONAL_COPY: DrivePersonalCopySettings = {
  clientId: "",
  byType: { doc: false, sheet: false, slides: false, drive: false },
};

export interface CourseGoogleSettings {
  editorAccess: DocsEditorAccessMap;
  personalCopy: DrivePersonalCopySettings;
}

export function useDocsEditorAccess(): CourseGoogleSettings {
  const [settings, setSettings] = useState<CourseGoogleSettings>({
    editorAccess: DEFAULT_MAP,
    personalCopy: DEFAULT_PERSONAL_COPY,
  });

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "adminContent"),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : null;
        // The legacy single switch is the inherited default for any type
        // the admin hasn't overridden individually.
        const legacy = normalizeDocsEditorAccess(data?.docsEditorAccess, DEFAULT_DOCS_EDITOR_ACCESS);
        setSettings({
          editorAccess: normalizeDocsEditorAccessMap(data?.docsEditorAccessByType, legacy),
          // The stored Client ID wins; the VITE_GOOGLE_CLIENT_ID env value
          // (already used for Google sign-in) is the fallback so most
          // installs need zero extra configuration.
          personalCopy: normalizeDrivePersonalCopySettings(data?.drivePersonalCopy, getGoogleClientId()),
        });
      },
      // Settings being unreadable must never break the player — fall back
      // to the compact defaults rather than surfacing an error.
      () => setSettings({ editorAccess: DEFAULT_MAP, personalCopy: DEFAULT_PERSONAL_COPY }),
    );
  }, []);

  return settings;
}

export default useDocsEditorAccess;
