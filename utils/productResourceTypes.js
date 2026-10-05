// Canonical Admin Product Builder resource-type registry.
//
// The `value` is the durable data identity; `label` is presentation only.
// Keep this list outside the selector so resource types are also normalized by
// the product mapping / publishing pipeline. `note` is registered through the
// same idempotent validator used when the Product Builder config is loaded.

export const CORE_PRODUCT_RESOURCE_TYPES = Object.freeze([
  { value: "youtube", label: "YouTube" },
  { value: "video_url", label: "Video URL (MP4/web)" },
  { value: "audio_url", label: "Audio URL" },
  { value: "image_url", label: "Image (URL or Cloudinary)" },
  { value: "gdrive", label: "Google Drive" },
  { value: "pdf", label: "PDF" },
  { value: "gdoc", label: "Google Doc" },
  { value: "gsheet", label: "Google Sheet" },
  { value: "gslides", label: "Google Slides" },
  { value: "gform", label: "Google Form" },
  { value: "ebook", label: "E-book" },
  { value: "github_pages", label: "GitHub Pages" },
  { value: "whimsical", label: "Whimsical" },
  { value: "iframe", label: "Other embed / iframe" },
  { value: "brain", label: "Brain · practice set" },
  { value: "interactive", label: "Interactive 2D experiment" },
  { value: "read", label: "Read · PDF / library" },
]);

export const NOTE_RESOURCE_TYPE = Object.freeze({ value: "note", label: "Block Note" });

const noteAliases = new Set([
  "note",
  "notes",
  "blocknote",
  "blocknotes",
  "studynote",
  "studynotes",
]);

const registryValue = (entry) => {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return String(entry.value || entry.type || entry.key || "");
};

const compactType = (value) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

/** True for the canonical Note type and all known legacy/equivalent names. */
export const isNoteResourceType = (value) => noteAliases.has(compactType(value));

/** Canonical identity normalizer used by both editor and product publishing. */
export const canonicalProductResourceType = (value) =>
  isNoteResourceType(value) ? "note" : String(value || "").trim();

/** Whether a registry already contains Note / Block Note under any alias. */
export const hasNoteResourceType = (registry) =>
  Array.isArray(registry) && registry.some((entry) => isNoteResourceType(registryValue(entry)));

/**
 * Add exactly one canonical Note entry to a registry. Existing `note`,
 * `block_note`, `Block Note`, etc. registrations collapse into the stable
 * `note` identity instead of creating another selector option.
 */
export const registerNoteResourceType = (registry = CORE_PRODUCT_RESOURCE_TYPES) => {
  const entries = Array.isArray(registry) ? registry : [];
  const result = [];
  let noteRegistered = false;

  for (const entry of entries) {
    if (isNoteResourceType(registryValue(entry))) {
      if (!noteRegistered) {
        const existing = entry && typeof entry === "object" ? entry : {};
        result.push({ ...existing, value: "note", type: "note", label: "Block Note" });
        noteRegistered = true;
      }
      continue;
    }
    result.push(entry);
  }

  if (!noteRegistered) result.push({ ...NOTE_RESOURCE_TYPE, type: "note" });
  return result;
};

/** Product Builder's validated, duplicate-free registry. */
export const ADMIN_PRODUCT_RESOURCE_TYPES = Object.freeze(
  registerNoteResourceType(CORE_PRODUCT_RESOURCE_TYPES),
);
