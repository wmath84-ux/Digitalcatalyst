import React from 'react';

type MediaFallbackCardProps = {
  title?: string;
  badge?: string;
  icon?: string;
  message?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  aspect?: string;
};

const getAspectClass = (aspect?: string): string => {
  if (aspect === 'square') return 'aspect-square';
  if (aspect === 'auto') return 'min-h-40';
  return 'aspect-video';
};

const MediaFallbackCard: React.FC<MediaFallbackCardProps> = ({
  title = 'Media preview unavailable',
  badge = 'Fallback',
  icon = '✦',
  message = 'This media link needs public access.',
  actionHref,
  actionLabel = 'Open source',
  className = '',
  aspect = 'video',
}) => (
  <div className={`${getAspectClass(aspect)} relative flex h-full w-full overflow-hidden rounded-[1.5rem] border border-white/65 bg-gradient-to-br from-[#1769FF] via-[#7B61FF] to-[#081A45] p-4 text-white shadow-[0_18px_50px_rgba(23,105,255,0.22)] ${className}`}>
    <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/15 blur-sm" />
    <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-white/10 blur-sm" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.32),transparent_34%)]" />
    <div className="relative z-10 flex h-full w-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-white/92 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#1769FF] shadow-sm">{badge}</span>
        <span className="rounded-2xl border border-white/25 bg-white/15 px-3 py-2 text-2xl shadow-inner">{icon}</span>
      </div>
      <div>
        <h3 className="line-clamp-2 text-lg font-black leading-tight drop-shadow sm:text-2xl">{title}</h3>
        <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-white/86 sm:text-sm">{message}</p>
        {actionHref ? (
          <a href={actionHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-2xl bg-white px-4 py-2 text-xs font-black text-[#1769FF] shadow-lg">
            {actionLabel}
          </a>
        ) : null}
      </div>
    </div>
  </div>
);

export default MediaFallbackCard;
