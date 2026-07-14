import React, { useEffect, useMemo, useState } from 'react';
import { buildImageFallbackDataUrl, type ImageFallbackAspect } from '../../utils/imageFallbacks';

interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'aspect'> {
  src?: string | null;
  fallbackSrc?: string;
  fallbackCandidates?: string[];
  fallbackTitle?: string;
  fallbackBadge?: string;
  fallbackMessage?: string;
  fallbackIcon?: string;
  wrapperClassName?: string;
  aspect?: ImageFallbackAspect;
  loadTimeoutMs?: number;
}

const cleanImageSource = (value?: string | null) => typeof value === 'string' ? value.trim() : '';

const SafeImage: React.FC<SafeImageProps> = ({
  src,
  fallbackSrc,
  fallbackCandidates = [],
  alt = '',
  className = '',
  wrapperClassName,
  fallbackTitle,
  fallbackBadge,
  fallbackMessage,
  fallbackIcon,
  aspect = 'video',
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  loadTimeoutMs = 9000,
  onLoad,
  onError,
  ...props
}) => {
  const fallbackAspect: ImageFallbackAspect =
    aspect === 'square' ||
    aspect === 'video' ||
    aspect === 'portrait' ||
    aspect === 'wide' ||
    aspect === 'original' ||
    aspect === 'auto'
      ? aspect
      : 'video';

  const generatedFallback = useMemo(() => fallbackSrc || buildImageFallbackDataUrl({
    title: fallbackTitle || String(alt || 'Digital Catalyst'),
    badge: fallbackBadge || 'Learning resource',
    message: fallbackMessage || 'Image preview unavailable',
    icon: fallbackIcon || '🎓',
    aspect: fallbackAspect,
  }), [fallbackSrc, fallbackTitle, fallbackBadge, fallbackMessage, fallbackIcon, alt, fallbackAspect]);

  const normalizedSrc = cleanImageSource(src);
  const fallbackCandidateKey = Array.isArray(fallbackCandidates) ? fallbackCandidates.join('|') : '';
  const candidateSources = useMemo(() => {
    const orderedSources = [normalizedSrc, ...(Array.isArray(fallbackCandidates) ? fallbackCandidates : []), generatedFallback]
      .map(cleanImageSource)
      .filter(Boolean);
    return Array.from(new Set(orderedSources));
  }, [normalizedSrc, fallbackCandidateKey, generatedFallback]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const activeSrc = candidateSources[candidateIndex] || generatedFallback;

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
  }, [candidateSources]);

  useEffect(() => {
    if (loaded || candidateIndex >= candidateSources.length - 1 || loadTimeoutMs <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCandidateIndex((currentIndex) => Math.min(currentIndex + 1, candidateSources.length - 1));
      setLoaded(false);
    }, loadTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [candidateIndex, candidateSources.length, loadTimeoutMs, loaded]);

  const image = (
    <img
      {...props}
      src={activeSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      className={className}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        if (candidateIndex < candidateSources.length - 1) {
          setCandidateIndex((currentIndex) => Math.min(currentIndex + 1, candidateSources.length - 1));
          setLoaded(false);
        } else {
          setLoaded(true);
        }
        onError?.(event);
      }}
    />
  );

  if (!wrapperClassName) return image;

  return (
    <span className={`relative block overflow-hidden ${wrapperClassName}`}>
      {image}
    </span>
  );
};

export default SafeImage;
