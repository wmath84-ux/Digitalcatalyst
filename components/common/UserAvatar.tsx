import React, { useMemo, useState } from 'react';

interface UserAvatarProps {
  name?: string;
  email?: string;
  photoURL?: string;
  size?: number;
  className?: string;
  imageClassName?: string;
}

const getInitials = (name?: string, email?: string) => {
  const source = (name || email || '').trim();
  if (!source) return '';
  const normalized = source.includes('@') ? source.split('@')[0] : source;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const UserAvatar: React.FC<UserAvatarProps> = ({ name, email, photoURL, size = 40, className = '', imageClassName = '' }) => {
  const [hasImageError, setHasImageError] = useState(false);
  const initials = useMemo(() => getInitials(name, email), [name, email]);
  const dimensionStyle = /(?:^|\s)!?[hw]-/.test(className) ? undefined : { width: size, height: size };

  if (photoURL && !hasImageError) {
    return (
      <img
        src={photoURL}
        alt={name || email || 'User avatar'}
        referrerPolicy="no-referrer"
        onError={() => setHasImageError(true)}
        className={`shrink-0 rounded-full object-cover ${className} ${imageClassName}`}
        style={dimensionStyle}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white shadow-sm ${className}`}
      style={dimensionStyle}
      aria-label={name || email || 'User avatar'}
    >
      {initials || '👤'}
    </span>
  );
};

export default UserAvatar;
