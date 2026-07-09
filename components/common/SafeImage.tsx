import React, { useEffect, useState } from 'react';
import MediaFallbackCard from './MediaFallbackCard';

type SafeImageProps = {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loading?: 'lazy' | 'eager';
  fallbackTitle?: string;
  fallbackBadge?: string;
  fallbackIcon?: string;
  fallbackMessage?: string;
  aspect?: 'square' | 'video' | 'auto';
};

const SafeImage: React.FC<SafeImageProps> = ({
  src = '',
  fallbackSrc = '',
  alt,
  className = 'h-full w-full object-cover',
  wrapperClassName = 'h-full w-full',
  loading = 'lazy',
  fallbackTitle,
  fallbackBadge,
  fallbackIcon = '🖼️',
  fallbackMessage = 'Image preview unavailable',
  aspect = 'auto',
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed');
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setStatus(src ? 'loading' : 'failed');
    setFallbackFailed(false);
  }, [src, fallbackSrc]);

  if (!src || status === 'failed') {
    if (fallbackSrc && fallbackSrc !== src && !fallbackFailed) {
      return (
        <div className={`relative block overflow-hidden ${wrapperClassName}`}>
          <img src={fallbackSrc} alt={alt} className={className} loading={loading} onError={() => setFallbackFailed(true)} />
        </div>
      );
    }
    return (
      <div className={`relative block overflow-hidden ${wrapperClassName}`}>
        <MediaFallbackCard title={fallbackTitle || alt || 'Media'} badge={fallbackBadge || 'Fallback'} icon={fallbackIcon} message={fallbackMessage} aspect={aspect} className="h-full w-full rounded-none" />
      </div>
    );
  }

  return (
    <div className={`relative block overflow-hidden ${wrapperClassName}`}>
      {status === 'loading' ? <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-[#EEF6FF] via-white to-[#E8F2FF]" /> : null}
      <img
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        loading={loading}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
    </div>
  );
};

export default SafeImage;
