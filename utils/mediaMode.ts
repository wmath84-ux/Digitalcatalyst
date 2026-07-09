export type MediaStorageMode = 'url-only' | 'storage-enabled';
export type MediaSourceProvider = 'direct' | 'drive' | 'ai' | 'external' | 'storage' | 'future_provider';

export const mediaStorageMode = 'url-only' as MediaStorageMode;

export const isStorageUploadEnabled = () => mediaStorageMode === 'storage-enabled';

export const MEDIA_UPLOAD_DISABLED_MESSAGE = 'File upload is not available right now. Please use a media URL.';
export const MEDIA_STORAGE_SETUP_MESSAGE = 'Storage upload requires Firebase Storage setup.';
export const MEDIA_PASTE_URL_MESSAGE = 'Paste a public media URL to continue.';
export const MEDIA_LINK_NOT_LOADING_MESSAGE = 'This media link is not loading. Try another URL.';

export const getStorageDisabledMessage = (mediaLabel = 'media') =>
  `File upload requires Firebase Storage. Use ${mediaLabel} URL for now.`;

export const getFriendlyStorageErrorMessage = (error: unknown) => {
  const raw = `${(error as any)?.code || ''} ${(error as any)?.message || String(error || '')}`.toLowerCase();
  if (raw.includes('storage/') || raw.includes('bucket') || raw.includes('permission') || raw.includes('upload task') || raw.includes('canceled')) {
    return MEDIA_UPLOAD_DISABLED_MESSAGE;
  }
  return MEDIA_PASTE_URL_MESSAGE;
};

export const buildUrlMediaSource = ({
  provider = 'external',
  url,
  embedUrl = '',
}: {
  provider?: Exclude<MediaSourceProvider, 'storage'>;
  url: string;
  embedUrl?: string;
}) => ({
  sourceType: 'url' as const,
  provider,
  url,
  embedUrl,
  storagePath: undefined,
});
