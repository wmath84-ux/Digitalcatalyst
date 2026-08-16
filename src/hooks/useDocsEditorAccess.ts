// src/hooks/useDocsEditorAccess.ts
//
// Live admin switch for the Course Player's in-frame Google Docs editor.
//
// The admin decides — in Admin → Content → Course Player — what learners
// get when they open a native Google Doc / Sheet / Slides file:
//
//   · "off"     — preview only; the Edit toggle never renders.
//   · "toolbar" — the compact Google editor (`/edit?rm=embedded`): the
//                 complete formatting toolbar, but Google's outer header
//                 (doc title, File/Edit/View menu bar, share) stays hidden.
//   · "full"    — the COMPLETE docs.google.com experience (`/edit`):
//                 title, whole menu bar, toolbar, tabs/outline side panel,
//                 comments, share — everything.
//
// Stored on the public `settings/adminContent` document (world-readable
// per firestore.rules, admin-writable only), so the player picks up a
// change instantly via the snapshot listener — no redeploy, no reload.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { normalizeDocsEditorAccess, type DocsEditorAccess } from "../utils/courseEmbed";

/** What ships when the admin has never touched the switch. */
export const DEFAULT_DOCS_EDITOR_ACCESS: DocsEditorAccess = "toolbar";

export function useDocsEditorAccess(): DocsEditorAccess {
  const [access, setAccess] = useState<DocsEditorAccess>(DEFAULT_DOCS_EDITOR_ACCESS);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "adminContent"),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : null;
        setAccess(normalizeDocsEditorAccess(data?.docsEditorAccess, DEFAULT_DOCS_EDITOR_ACCESS));
      },
      // Settings being unreadable must never break the player — fall back
      // to the compact default rather than surfacing an error.
      () => setAccess(DEFAULT_DOCS_EDITOR_ACCESS),
    );
  }, []);

  return access;
}

export default useDocsEditorAccess;
