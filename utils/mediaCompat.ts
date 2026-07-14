export type NormalizedMediaType = 'image' | 'audio' | 'video' | 'document' | 'unknown';
export type NormalizedMediaSourceType = 'url' | 'storage' | 'ai' | 'legacy' | 'unknown';
export type NormalizedMediaProvider = 'direct' | 'drive' | 'youtube' | 'ai' | 'external' | 'firebase-storage' | 'unknown';

export interface NormalizedMediaSource {
  url: string;
  type: NormalizedMediaType;
  sourceType: NormalizedMediaSourceType;
  provider: NormalizedMediaProvider;
  embedUrl?: string;
  storagePath?: string;
  isLegacy: boolean;
  isPlayable: boolean;
  fallbackReason?: string;
}

type AnyMediaRecord = Record<string, any>;

const PRODUCT_IMAGE_SLOT_FALLBACKS: Record<string, string[]> = {
  card: ['card', 'detailMobile', 'purchaseCard', 'galleryThumb', 'homeTopRated'],
  detailMobile: ['detailMobile', 'card', 'purchaseCard', 'detailDesktop'],
  detailDesktop: ['detailDesktop', 'detailMobile', 'card', 'purchaseCard'],
  homeTopRated: ['homeTopRated', 'purchaseSquare', 'galleryThumb', 'card'],
  homeList: ['homeList', 'card', 'detailMobile', 'purchaseCard'],
  purchaseSquare: ['purchaseSquare', 'purchaseCard', 'homeTopRated', 'galleryThumb', 'card', 'detailMobile'],
  purchaseCard: ['purchaseCard', 'purchaseSquare', 'card', 'detailMobile', 'detailDesktop', 'homeTopRated', 'galleryThumb'],
  galleryThumb: ['galleryThumb', 'homeTopRated', 'purchaseSquare', 'card'],
};

const escapeSvgText = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
const cleanUrl = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const isValidHttpsUrl = (url = '') => /^https:\/\//i.test(cleanUrl(url));
export const isDataImageUrl = (url = '') => /^data:image\//i.test(cleanUrl(url));
export const isLegacyBase64Image = (url = '') => isDataImageUrl(url) || (/^[A-Za-z0-9+/=]{120,}$/.test(cleanUrl(url)) && cleanUrl(url).length > 120);
export const isFirebaseStorageUrl = (url = '') => /firebasestorage\.googleapis\.com|storage\.googleapis\.com/i.test(cleanUrl(url));
export const isGoogleDriveUrl = (url = '') => /https:\/\/(?:drive|docs)\.google\.com\//i.test(cleanUrl(url));
export const isYouTubeUrl = (url = '') => /(?:youtube(?:-nocookie)?\.com|youtu\.be)/i.test(cleanUrl(url));
export const isAiGeneratedImageUrl = (url = '') => /image\.pollinations\.ai|pollinations\.ai|replicate\.delivery|oaidalleapiprodscus\.blob\.core\.windows\.net/i.test(cleanUrl(url));
export const isDirectAudioUrl = (url = '') => /\.(mp3|m4a|aac|wav|ogg|oga|opus)(?:$|[?#])/i.test(cleanUrl(url));
export const isDirectVideoUrl = (url = '') => /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(cleanUrl(url));
export const isDirectImageUrl = (url = '') => /\.(png|jpe?g|gif|webp|avif|svg)(?:$|[?#])/i.test(cleanUrl(url)) || isDataImageUrl(url);

export const extractGoogleDriveFileId = (value = '') => {
  const trimmed = cleanUrl(value);
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/?#]+)/i,
    /drive\.google\.com\/open\?id=([^&#]+)/i,
    /drive\.google\.com\/uc\?id=([^&#]+)/i,
    /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([^/?#]+)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  try {
    return new URL(trimmed).searchParams.get('id') || '';
  } catch {
    return '';
  }
};

export const normalizeDriveUrl = (url = '') => {
  const fileId = extractGoogleDriveFileId(url);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : '';
};

export const detectMediaProvider = (url = '', type: NormalizedMediaType = 'unknown'): NormalizedMediaProvider => {
  const trimmed = cleanUrl(url);
  if (!trimmed) return 'unknown';
  if (isYouTubeUrl(trimmed)) return 'youtube';
  if (isGoogleDriveUrl(trimmed)) return 'drive';
  if (isAiGeneratedImageUrl(trimmed)) return 'ai';
  if (isFirebaseStorageUrl(trimmed)) return 'firebase-storage';
  if ((type === 'audio' && isDirectAudioUrl(trimmed)) || (type === 'video' && isDirectVideoUrl(trimmed)) || (type === 'image' && isDirectImageUrl(trimmed))) return 'direct';
  if (isValidHttpsUrl(trimmed)) return 'external';
  return 'unknown';
};

const normalizeProviderAlias = (provider: unknown, url = '', type: NormalizedMediaType = 'unknown'): NormalizedMediaProvider => {
  const raw = String(provider || '').toLowerCase();
  if (raw.includes('youtube')) return 'youtube';
  if (raw.includes('drive') || isGoogleDriveUrl(url)) return 'drive';
  if (raw.includes('ai') || isAiGeneratedImageUrl(url)) return 'ai';
  if (raw.includes('firebase') || raw.includes('storage') || raw === 'upload' || isFirebaseStorageUrl(url)) return 'firebase-storage';
  if (raw.includes('direct') || (type === 'audio' && isDirectAudioUrl(url)) || (type === 'video' && isDirectVideoUrl(url)) || (type === 'image' && isDirectImageUrl(url))) return 'direct';
  if (raw.includes('external')) return 'external';
  return detectMediaProvider(url, type);
};

const inferMediaType = (media: unknown, fallback: NormalizedMediaType): NormalizedMediaType => {
  if (!media || typeof media === 'string') return fallback;
  const record = media as AnyMediaRecord;
  const raw = String(record.type || record.postType || '').toLowerCase();
  if (raw.includes('audio')) return 'audio';
  if (raw.includes('video') || record.youtubeUrl || record.youtubeVideoId) return 'video';
  if (raw.includes('pdf') || raw.includes('doc') || raw.includes('ebook')) return 'document';
  if (raw.includes('image') || record.imagePreview || record.imageUrl || record.coverImage || record.thumbnailImage) return 'image';
  return fallback;
};

const pickMediaUrl = (media: unknown): string => {
  if (typeof media === 'string') return cleanUrl(media);
  if (!media) return '';
  const record = media as AnyMediaRecord;
  return cleanUrl(record.url || record.imagePreview || record.imageUrl || record.coverImage || record.thumbnailImage || record.youtubeUrl || record.src || '');
};

export const normalizeMediaSource = (media: unknown, options: { type?: NormalizedMediaType; title?: string } = {}): NormalizedMediaSource => {
  const type = inferMediaType(media, options.type || 'unknown');
  const record = typeof media === 'object' && media ? media as AnyMediaRecord : {};
  const url = pickMediaUrl(media);
  const provider = normalizeProviderAlias(record.provider, url, type);
  const storagePath = cleanUrl(record.storagePath);
  const explicitSourceType = String(record.sourceType || '').toLowerCase();
  const sourceType: NormalizedMediaSourceType = explicitSourceType === 'url' || explicitSourceType === 'storage' || explicitSourceType === 'ai' || explicitSourceType === 'legacy' || explicitSourceType === 'unknown'
    ? explicitSourceType as NormalizedMediaSourceType
    : provider === 'ai'
      ? 'ai'
      : provider === 'firebase-storage' || storagePath
        ? 'storage'
        : isLegacyBase64Image(url)
          ? 'legacy'
          : isValidHttpsUrl(url) || isDataImageUrl(url)
            ? 'url'
            : 'unknown';
  const embedUrl = cleanUrl(record.embedUrl) || (provider === 'drive' ? normalizeDriveUrl(url) : '');
  const isPlayable = Boolean(url) && (
    provider === 'youtube'
    || provider === 'drive'
    || (type === 'audio' && isDirectAudioUrl(url))
    || (type === 'video' && isDirectVideoUrl(url))
    || (type === 'image' && (isDirectImageUrl(url) || isValidHttpsUrl(url) || isDataImageUrl(url)))
  );
  const isLegacy = sourceType === 'legacy' || (!record.sourceType && Boolean(url)) || Boolean(storagePath && provider === 'firebase-storage');
  const fallbackReason = !url
    ? 'Media source unavailable'
    : !isPlayable && (type === 'audio' || type === 'video')
      ? `${type === 'audio' ? 'Audio source unavailable' : 'Video preview unavailable'}`
      : provider === 'unknown'
        ? 'Unknown media provider'
        : undefined;

  return { url, type, sourceType, provider, embedUrl, storagePath: storagePath || undefined, isLegacy, isPlayable, fallbackReason };
};

export const getMediaFallbackReason = (media: unknown) => normalizeMediaSource(media).fallbackReason || 'Media source unavailable';

export const getMediaBadge = (media: unknown) => {
  const normalized = normalizeMediaSource(media);
  if (normalized.provider === 'drive') return 'Drive media';
  if (normalized.provider === 'youtube') return 'YouTube media';
  if (normalized.provider === 'ai') return 'AI image';
  if (normalized.provider === 'firebase-storage') return 'Storage image';
  if (normalized.isLegacy) return 'Legacy image';
  if (normalized.sourceType === 'url') return 'URL image';
  if (normalized.provider === 'external') return 'External media';
  return 'Media fallback';
};

export const buildPremiumImageFallback = ({ title = 'Media', badge = 'Fallback', icon = '✦' }: { title?: string; badge?: string; icon?: string } = {}) => {
  const safeTitle = escapeSvgText((title || 'Media').slice(0, 72));
  const safeBadge = escapeSvgText((badge || 'Fallback').slice(0, 24).toUpperCase());
  const safeIcon = escapeSvgText(icon || '✦');
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1769FF"/><stop offset="0.55" stop-color="#7B61FF"/><stop offset="1" stop-color="#081A45"/></linearGradient><radialGradient id="r" cx="20%" cy="15%" r="75%"><stop stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="900" rx="58" fill="url(#g)"/><rect width="1200" height="900" fill="url(#r)"/><circle cx="1000" cy="145" r="190" fill="#ffffff" opacity="0.12"/><circle cx="185" cy="735" r="260" fill="#ffffff" opacity="0.10"/><path d="M70 650 C240 520 360 700 535 560 S825 385 1130 520" fill="none" stroke="#ffffff" stroke-opacity="0.23" stroke-width="22" stroke-linecap="round"/><rect x="80" y="80" width="235" height="64" rx="32" fill="#ffffff" opacity="0.94"/><text x="198" y="121" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="900" fill="#1769FF" letter-spacing="4">${safeBadge}</text><text x="600" y="420" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="118" font-weight="900" fill="#ffffff" opacity="0.92">${safeIcon}</text><foreignObject x="120" y="500" width="960" height="190"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:54px;line-height:1.08;font-weight:900;color:white;text-align:center;letter-spacing:-1.2px;">${safeTitle}</div></foreignObject><text x="600" y="790" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#E8F2FF">Premium fallback · Media stays safe</text></svg>`)}`;
};

export const buildProductImageFallback = (product: { title?: string; category?: string; imageSeed?: string }) => buildPremiumImageFallback({ title: product.title || product.imageSeed || 'Product', badge: product.category || 'Product', icon: '🎓' });
export const buildPostImageFallback = (post: { title?: string; body?: string; type?: string; postType?: string }) => buildPremiumImageFallback({ title: post.title || post.body || 'Community post', badge: post.type || post.postType || 'Post', icon: '💬' });
export const buildArticleImageFallback = (article: { title?: string; category?: string; type?: string }) => buildPremiumImageFallback({ title: article.title || 'Premium Reading', badge: article.type === 'news' ? 'News' : article.category || 'Blog', icon: '📰' });

export const resolveProductImage = (product: AnyMediaRecord, slot = 'card') => {
  const slotCandidates = PRODUCT_IMAGE_SLOT_FALLBACKS[slot] || [slot, 'card'];
  const candidate = slotCandidates.map((name) => product?.productImages?.[name]).find(Boolean) || (Array.isArray(product?.images) ? product.images.find(Boolean) : '') || product?.imageUrl || product?.coverImage || '';
  const normalized = normalizeMediaSource(candidate, { type: 'image', title: product?.title });
  return normalized.url || buildProductImageFallback(product || {});
};

export const resolvePostImage = (post: AnyMediaRecord) => {
  const normalized = normalizeMediaSource(post, { type: 'image', title: post?.title || post?.body });
  return normalized.url || '';
};

export const resolveNewsCover = (post: AnyMediaRecord) => {
  const candidate = post?.coverImage || post?.thumbnailImage || (isValidHttpsUrl(post?.imageSeed) || isDataImageUrl(post?.imageSeed) ? post.imageSeed : '');
  const normalized = normalizeMediaSource(candidate, { type: 'image', title: post?.title });
  return normalized.url || buildArticleImageFallback(post || {});
};
