"use client";

import { useState } from "react";
import { Field } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { isCloudinaryImageUploadConfigured, uploadImageToCloudinary } from "../../../../utils/cloudinaryUpload";

export { imageProviderFromUrl } from "../../../../utils/cloudinaryUpload";

type CloudinaryImageUploadFieldProps = {
  folder: string;
  tags?: string[];
  disabled?: boolean;
  label?: string;
  hint?: string;
  onUploaded: (hostedUrl: string) => void;
};

export function CloudinaryImageUploadField({
  folder,
  tags,
  disabled,
  label = "Upload image from your device",
  hint = "Gallery / camera photo → converted to a Cloudinary URL automatically.",
  onUploaded,
}: CloudinaryImageUploadFieldProps) {
  const { notify } = useToast();
  const [uploading, setUploading] = useState(false);

  if (!isCloudinaryImageUploadConfigured()) {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Cloudinary upload is disabled — set <code>VITE_CLOUDINARY_CLOUD_NAME</code> and <code>VITE_CLOUDINARY_UPLOAD_PRESET</code> to enable gallery uploads.
      </p>
    );
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const hostedUrl = await uploadImageToCloudinary(file, { folder, tags });
      onUploaded(hostedUrl);
      notify("success", "Image uploaded to Cloudinary.");
    } catch (uploadError) {
      notify("error", uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={label} hint={hint}>
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50/40">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading || disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        {uploading ? "Uploading…" : "Choose image to upload"}
      </label>
    </Field>
  );
}
