import React, { useEffect, useMemo, useState } from 'react';
import { buildImageFallbackDataUrl, type ImageFallbackAspect } from '../../utils/imageFallbacks';

interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'aspect'> {
  src?: string | null;
  fallbackSrc?: string;
  fallbackTitle?: string;
  fallbackBadge?: string;
  fallbackMessage?: string;
  fallbackIcon?: string;
  wrapperClassName?: string;
  aspect?: ImageFallbackAspect;
  loadTimeoutMs?: number;
}

const SafeImage: React.FC<SafeImageProps> = ({
  src,
  fallbackSrc,
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

  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  const [activeSrc, setActiveSrc] = useState(normalizedSrc || generatedFallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setActiveSrc(normalizedSrc || generatedFallback);
    setLoaded(false);
  }, [normalizedSrc, generatedFallback]);

  useEffect(() => {
    if (loaded || activeSrc === generatedFallback || loadTimeoutMs <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setActiveSrc(generatedFallback);
      setLoaded(false);
    }, loadTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [activeSrc, generatedFallback, loadTimeoutMs, loaded]);

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
        if (activeSrc !== generatedFallback) {
          setActiveSrc(generatedFallback);
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
