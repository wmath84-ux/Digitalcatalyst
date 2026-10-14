// Durable device-only reference. Never store a temporary blob: URL in a module.
export const parseLocalReadReference = (value) => {
  const match = /^eduvora-local-pdf:([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9][A-Za-z0-9-]{5,119})$/.exec(String(value || ""));
  return match ? { uid: match[1], id: match[2] } : null;
};
export const localReadReference = (uid, id) => {
  const value = `eduvora-local-pdf:${uid}/${id}`;
  if (!parseLocalReadReference(value)) throw new Error("Invalid local PDF reference.");
  return value;
};
