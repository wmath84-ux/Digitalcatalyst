import React from 'react';
import { User } from '../App';

const SynergyMarkIcon: React.FC<{ className?: string }> = ({ className = 'h-10 w-10' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 6.75c-1.55-1.6-4.1-2.2-7.5-2.2-.6 0-1.1.5-1.1 1.1v11.1c0 .6.5 1.1 1.1 1.1 3.4 0 5.95.6 7.5 2.2 1.55-1.6 4.1-2.2 7.5-2.2.6 0 1.1-.5 1.1-1.1V5.65c0-.6-.5-1.1-1.1-1.1-3.4 0-5.95.6-7.5 2.2Z" />
    <path d="M12 6.75v12.3" />
    <circle cx="17.75" cy="3.4" r="0.9" />
    <circle cx="20.9" cy="6.2" r="0.9" />
    <path d="M18.45 4.25l1.55 1.7" />
    <circle cx="6.25" cy="3.4" r="0.9" />
    <circle cx="3.1" cy="6.2" r="0.9" />
    <path d="M5.55 4.25L4 5.95" />
  </svg>
);

const SearchIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20.5 20.5l-4.35-4.35" />
  </svg>
);

const NotificationBellIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const ProfileSilhouetteIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 12a4 4 0 100-8 4 4 0 000 8Zm0 2c-4.1 0-7.2 2.2-7.9 6.2-.1.7.4 1.3 1.1 1.3h13.6c.7 0 1.2-.6 1.1-1.3-.7-4-3.8-6.2-7.9-6.2Z" />
  </svg>
);

const CommunityIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87" />
    <path d="M12 12a4 4 0 100-8 4 4 0 000 8Zm6.5 1.5a3 3 0 100-6" />
  </svg>
);

interface CoursePlayerHeaderProps {
  currentUser?: User | null;
  notificationCount?: number;
  onSearchClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onCommunityClick?: () => void;
  className?: string;
}

const CoursePlayerHeader: React.FC<CoursePlayerHeaderProps> = ({
  currentUser = null,
  notificationCount = 2,
  onSearchClick,
  onNotificationsClick,
  onProfileClick,
  onCommunityClick,
  className = '',
}) => {
  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const userName = String(currentUser?.name || '').trim();
  const userEmail = String(currentUser?.email || '').trim();
  const profileLabel = userName || (userEmail ? userEmail.split('@')[0] : 'Learner profile');
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => setAvatarFailed(false), [resolvedPhotoURL]);

  return (
    <header
      className={`course-player-header relative z-[60] flex w-full shrink-0 items-center justify-between gap-3 bg-gradient-to-b from-[#E6F0FA] to-white px-4 py-3 ${className}`.trim()}
      data-testid="course-player-header"
    >
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF1FB] to-[#DCE8F7] text-[#1A2B4C] ring-1 ring-[#1A2B4C]/8 shadow-[0_8px_20px_rgba(26,43,76,0.08)]">
          <SynergyMarkIcon className="h-[1.35rem] w-[1.35rem] sm:h-10 sm:w-10" />
        </span>
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[17px] font-black uppercase tracking-[0.14em] text-[#1A2B4C] sm:text-lg">
            SYNERGY
          </span>
          <span className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.28em] text-[#1A2B4C]/55 sm:text-[11px]">
            LMS Portal
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onSearchClick}
          aria-label="Search course content"
          title="Search"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1A2B4C]/10 bg-white/70 text-[#1A2B4C] shadow-[0_6px_18px_rgba(26,43,76,0.06)] backdrop-blur-sm transition hover:bg-white hover:text-[#1A2B4C] hover:shadow-[0_10px_24px_rgba(26,43,76,0.10)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30"
        >
          <SearchIcon />
        </button>

        <button
          type="button"
          onClick={onNotificationsClick}
          aria-label={`Notifications with ${notificationCount} unread`}
          title="Notifications"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1A2B4C]/10 bg-white/70 text-[#1A2B4C] shadow-[0_6px_18px_rgba(26,43,76,0.06)] backdrop-blur-sm transition hover:bg-white hover:text-[#1A2B4C] hover:shadow-[0_10px_24px_rgba(26,43,76,0.10)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30"
        >
          <NotificationBellIcon />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white ring-2 ring-white">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onCommunityClick}
          aria-label="Open community"
          title="Community"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1A2B4C]/10 bg-white/70 text-[#1A2B4C] shadow-[0_6px_18px_rgba(26,43,76,0.06)] backdrop-blur-sm transition hover:bg-white hover:text-[#1A2B4C] hover:shadow-[0_10px_24px_rgba(26,43,76,0.10)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30"
        >
          <CommunityIcon />
        </button>

        <button
          type="button"
          onClick={onProfileClick}
          aria-label={`Open ${profileLabel} profile`}
          title="Profile"
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#1A2B4C]/10 bg-white/70 text-[#1A2B4C] shadow-[0_6px_18px_rgba(26,43,76,0.06)] backdrop-blur-sm transition hover:bg-white hover:shadow-[0_10px_24px_rgba(26,43,76,0.10)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30"
        >
          {resolvedPhotoURL && !avatarFailed ? (
            <img src={resolvedPhotoURL} alt={`${profileLabel} profile picture`} loading="eager" decoding="async" className="h-full w-full object-cover" onError={() => setAvatarFailed(true)} />
          ) : (
            <ProfileSilhouetteIcon className="h-[1.35rem] w-[1.35rem]" />
          )}
        </button>
      </div>
    </header>
  );
};

export default CoursePlayerHeader;
