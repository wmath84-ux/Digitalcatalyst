type CloudinaryUploadOptions = {
  folder?: string;
  tags?: string[];
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  url?: string;
  public_id?: string;
  error?: {
    message?: string;
  };
};

const CLOUDINARY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const getEnvValue = (key: string) => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  return String(env[key] || '').trim();
};

export const getCloudinaryImageUploadConfig = () => {
  const cloudName = getEnvValue('VITE_CLOUDINARY_CLOUD_NAME');
  const uploadPreset = getEnvValue('VITE_CLOUDINARY_UPLOAD_PRESET');
  const folder = getEnvValue('VITE_CLOUDINARY_IMAGE_FOLDER');

  if (!cloudName || !uploadPreset) return null;

  return { cloudName, uploadPreset, folder };
};

export const isCloudinaryImageUploadConfigured = () => Boolean(getCloudinaryImageUploadConfig());

const normalizeCloudinaryFolder = (value?: string) => String(value || '')
  .trim()
  .replace(/^\/+|\/+$/g, '')
  .replace(/[^a-zA-Z0-9/_-]/g, '-');

export const uploadImageToCloudinary = async (file: File, options: CloudinaryUploadOptions = {}) => {
  const config = getCloudinaryImageUploadConfig();

  if (!config) {
    throw new Error('Cloudinary upload is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, then restart the app.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file.');
  }

  if (file.size > CLOUDINARY_MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large. Max allowed size is ${Math.round(CLOUDINARY_MAX_IMAGE_BYTES / (1024 * 1024))}MB.`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', config.uploadPreset);

  const folder = normalizeCloudinaryFolder(options.folder || config.folder || 'website-images');
  if (folder) formData.append('folder', folder);
  if (options.tags?.length) formData.append('tags', options.tags.join(','));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  let payload: CloudinaryUploadResponse = {};
  try {
    payload = await response.json() as CloudinaryUploadResponse;
  } catch {
    payload = {};
  }

  if (!response.ok || payload.error?.message) {
    throw new Error(payload.error?.message || 'Cloudinary image upload failed. Check upload preset and cloud name.');
  }

  const hostedUrl = payload.secure_url || payload.url;
  if (!hostedUrl) {
    throw new Error('Cloudinary upload finished but no image URL was returned.');
  }

  return hostedUrl;
};
