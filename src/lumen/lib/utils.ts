import type { Attachment } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml";

export function isImageFile(f: File): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(f.type);
}

function estimateBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return 0;
  return Math.round(((dataUrl.length - i - 1) * 3) / 4);
}

/** Read an image File into an Attachment; raster images are downscaled to keep things snappy. */
export async function readImageAttachment(file: File): Promise<Attachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });

  const base: Attachment = { id: uid(), kind: "upload", name: file.name || "image", src: dataUrl, size: file.size };

  if (file.type === "image/gif" || file.type === "image/svg+xml") return base;

  try {
    const dims = await new Promise<{ w: number; h: number; src: string }>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 1) return resolve({ w: img.naturalWidth, h: img.naturalHeight, src: dataUrl });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve({ w: img.naturalWidth, h: img.naturalHeight, src: dataUrl });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ w: canvas.width, h: canvas.height, src: out });
      };
      img.onerror = () => resolve({ w: 0, h: 0, src: dataUrl });
      img.src = dataUrl;
    });
    return { ...base, ...dims, size: estimateBytes(dims.src) };
  } catch {
    return base;
  }
}

export function makeScreenshotAttachment(src: string, w: number, h: number): Attachment {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return {
    id: uid(),
    kind: "screenshot",
    name: `Screenshot ${hh}-${mm}.png`,
    src,
    w,
    h,
    size: estimateBytes(src),
  };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function formatBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
