import React, { useEffect, useState } from 'react';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  photoURL?: string | null;
  size?: number;
  className?: string;
  imageClassName?: string;
}

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[58%] w-[58%]" fill="none">
    <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" fill="currentColor" />
    <path d="M4.75 20.25c.52-4 3.14-6.25 7.25-6.25s6.73 2.25 7.25 6.25H4.75Z" fill="currentColor" />
  </svg>
);

const UserAvatar: React.FC<UserAvatarProps> = ({ name, email, photoURL, size = 40, className = '', imageClassName = '' }) => {
  const label = String(name || email || 'User profile').trim();
  const image = typeof photoURL === 'string' ? photoURL.trim() : '';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  return (
    <span role="img" aria-label={`${label || 'User'} profile picture`} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-500 shadow-sm ${className}`.trim()} style={{ width: size, height: size }}>
      {image && !failed ? <img src={image} alt={`${label || 'User'} profile picture`} loading="eager" decoding="async" className={`h-full w-full object-cover ${imageClassName}`.trim()} onError={() => setFailed(true)} /> : <PersonIcon />}
    </span>
  );
};

export default UserAvatar;
