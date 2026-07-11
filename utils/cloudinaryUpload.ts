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
const HEIC_IMAGE_EXTENSIONS = /\.(heic|heif)$/i;
const ACCEPTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
const CLOUDINARY_UPLOAD_SEGMENT = '/image/upload/';

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

const isLikelyImageFile = (file: File) => {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime === 'application/octet-stream' || !mime) return ACCEPTED_IMAGE_EXTENSIONS.test(file.name || '');
  return ACCEPTED_IMAGE_EXTENSIONS.test(file.name || '');
};

const isHeicImageFile = (file: File) => /image\/(heic|heif)/i.test(file.type || '') || HEIC_IMAGE_EXTENSIONS.test(file.name || '');

const withAutomaticCloudinaryDelivery = (url: string) => {
  const trimmed = String(url || '').trim();
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.endsWith('cloudinary.com') || !parsed.pathname.includes(CLOUDINARY_UPLOAD_SEGMENT)) return trimmed;
    if (/\/image\/upload\/[^/]*(?:f_auto|q_auto)[^/]*\//.test(parsed.pathname)) return trimmed;
    parsed.pathname = parsed.pathname.replace(CLOUDINARY_UPLOAD_SEGMENT, `${CLOUDINARY_UPLOAD_SEGMENT}f_auto,q_auto/`);
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

export const uploadImageToCloudinary = async (file: File, options: CloudinaryUploadOptions = {}) => {
  const config = getCloudinaryImageUploadConfig();

  if (!config) {
    throw new Error('Cloudinary upload is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, then restart the app.');
  }

  if (!isLikelyImageFile(file)) {
    throw new Error('Please select a valid image file. JPG, PNG, WebP, GIF, HEIC and HEIF are supported.');
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
    const message = payload.error?.message || 'Cloudinary image upload failed. Check upload preset and cloud name.';
    if (isHeicImageFile(file)) {
      throw new Error(`${message} If this is a phone HEIC/HEIF photo, allow HEIC and HEIF in your unsigned Cloudinary preset, then upload again.`);
    }
    throw new Error(message);
  }

  const hostedUrl = payload.secure_url || payload.url;
  if (!hostedUrl) {
    throw new Error('Cloudinary upload finished but no image URL was returned.');
  }

  return withAutomaticCloudinaryDelivery(hostedUrl);
};
