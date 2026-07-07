export const PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

export const validateProductImageUpload = (file) => {
  if (!file || typeof file.size !== 'number' || typeof file.name !== 'string') {
    return { valid: false, error: 'Please choose a valid image file.' };
  }

  const normalizedName = file.name.toLowerCase();
  const extension = normalizedName.includes('.') ? normalizedName.split('.').pop() || '' : '';
  const hasAllowedMime = ALLOWED_IMAGE_MIME_TYPES.has(file.type);
  const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.has(extension);

  if (!hasAllowedMime && !hasAllowedExtension) {
    return { valid: false, error: 'Please choose a valid image file (PNG, JPG, JPEG, GIF, WEBP, or SVG).' };
  }

  if (file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
    return {
      valid: false,
      error: `Product image is too large. Max allowed size is ${Math.round(PRODUCT_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`,
    };
  }

  return { valid: true };
};
