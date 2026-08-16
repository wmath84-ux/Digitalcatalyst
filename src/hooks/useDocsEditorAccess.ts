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
  type DocsEditorAccess,
  type DocsEditorAccessMap,
} from "../utils/courseEmbed";

/** What ships when the admin has never touched the switches. */
export const DEFAULT_DOCS_EDITOR_ACCESS: DocsEditorAccess = "toolbar";

const DEFAULT_MAP: DocsEditorAccessMap = {
  doc: DEFAULT_DOCS_EDITOR_ACCESS,
  sheet: DEFAULT_DOCS_EDITOR_ACCESS,
  slides: DEFAULT_DOCS_EDITOR_ACCESS,
};

export function useDocsEditorAccess(): DocsEditorAccessMap {
  const [access, setAccess] = useState<DocsEditorAccessMap>(DEFAULT_MAP);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "adminContent"),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : null;
        // The legacy single switch is the inherited default for any type
        // the admin hasn't overridden individually.
        const legacy = normalizeDocsEditorAccess(data?.docsEditorAccess, DEFAULT_DOCS_EDITOR_ACCESS);
        setAccess(normalizeDocsEditorAccessMap(data?.docsEditorAccessByType, legacy));
      },
      // Settings being unreadable must never break the player — fall back
      // to the compact default rather than surfacing an error.
      () => setAccess(DEFAULT_MAP),
    );
  }, []);

  return access;
}

export default useDocsEditorAccess;
