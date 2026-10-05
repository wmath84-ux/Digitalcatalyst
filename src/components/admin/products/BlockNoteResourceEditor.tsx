import { lazy, Suspense, useState } from "react";
import type { NoteDraft } from "@/course/noteEditor/editorTypes";
import type { ProductResource } from "@/lib/admin/types";
import { MAX_NOTE_HTML_LENGTH } from "../../../../utils/courseNotes.js";

// The admin uses the Course Player's editor and renderer verbatim; preview is
// the same component in read-only mode, not a second HTML rendering path.
const NoteEditor = lazy(() => import("@/course/NoteEditor"));

export default function BlockNoteResourceEditor({
  resource,
  onChange,
}: {
  resource: ProductResource;
  onChange: (patch: Partial<ProductResource>) => void;
}) {
  const [preview, setPreview] = useState(false);
  const bodyHtml = String(resource.noteHtml || "");
  const overLimit = bodyHtml.length > MAX_NOTE_HTML_LENGTH;

  const handleDraftChange = (draft: NoteDraft) => {
    onChange({
      name: draft.title,
      noteHtml: draft.bodyHtml,
      noteSource: "master",
      ownerType: "course",
      moduleId: resource.parentModuleId || resource.moduleId || "",
      updatedAt: Date.now(),
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-indigo-100 bg-white p-3" data-admin-block-note-editor>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-indigo-700">Block Note · Master</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Uses the Course Player BlockNote editor, serializer, math nodes and KaTeX renderer. The note title is the resource title.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Block Note editor view">
          <button
            type="button"
            role="tab"
            aria-selected={!preview}
            onClick={() => setPreview(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${preview ? "text-slate-500" : "bg-white text-indigo-700 shadow-sm"}`}
            data-admin-block-note-edit
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preview}
            onClick={() => setPreview(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${preview ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
            data-admin-block-note-preview
          >
            Preview
          </button>
        </div>
      </div>

      <p className={`text-[11px] ${overLimit ? "font-semibold text-red-700" : "text-slate-500"}`} role={overLimit ? "alert" : undefined}>
        {bodyHtml.length.toLocaleString()} / {MAX_NOTE_HTML_LENGTH.toLocaleString()} serialized body characters
        {overLimit ? " · shorten this note before saving or publishing" : ""}
      </p>

      <div className="h-[60vh] min-h-[320px] max-h-[680px] overflow-hidden rounded-xl border border-slate-200 bg-white" data-admin-block-note-surface={preview ? "preview" : "edit"}>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500" aria-busy="true">Loading Block Note editor…</div>}>
          {preview ? (
            <NoteEditor
              key={`preview:${resource.id}`}
              initialTitle={resource.name}
              initialBodyHtml={bodyHtml}
              readOnly
              autoFocus={false}
              ariaLabel="Block Note course-player preview"
              dataAttribute="data-admin-block-note-preview-renderer"
            />
          ) : (
            <NoteEditor
              key={`edit:${resource.id}`}
              initialTitle={resource.name}
              initialBodyHtml={bodyHtml}
              autoFocus={false}
              ariaLabel="Admin Block Note editor"
              dataAttribute="data-admin-block-note-edit-input"
              onDraftChange={handleDraftChange}
            />
          )}
        </Suspense>
      </div>
      <p className="text-[11px] leading-5 text-slate-500">
        Learners see this document in <strong>MASTER</strong>. It is not copied into their private SELF notes and is read-only in the player.
      </p>
    </section>
  );
}
