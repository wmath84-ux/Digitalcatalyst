// components/CoursePlayer.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebsiteSettings, ProductWithRating, CourseModule, ProductFile, ProductDocPage, QuizAnswerState, User, ProductAccessState, CourseAccessMeta, CourseAccessLevel } from '../App';
import { EconomySettings, normalizeCoinPrice } from '../utils/economy';
import {
  creditWatchSessionCoins,
  EDUCOIN_SECONDS_PER_COIN,
  markWatchSessionPaused,
  startWatchSession,
} from '../utils/coinWallet';
import AiMentor from './AiMentor';
import ProductMusicPlayer, { type AudioTrack } from './ProductMusicPlayer';
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { isDirectAudioUrl, isDirectVideoUrl, isGoogleDriveUrl, normalizeDriveUrl, normalizeMediaSource } from '../utils/mediaCompat';
import MediaFallbackCard from './common/MediaFallbackCard';
import MembershipUpgradeCard from './MembershipUpgradeCard';
import { getUserEduCoinMultiplier, hasPremiumMembership, normalizeSubscriptionPageContent } from '../utils/subscriptionAccess';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }

}


const hostedDocsProviders = ['direct_pdf', 'google_drive_pdf', 'google_drive_doc', 'external_docs_link'] as const;

const extractGoogleDriveFileId = (value: string) => {
  const trimmed = value.trim();
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
    const url = new URL(trimmed);
    return url.searchParams.get('id') || '';
  } catch {
    return '';
  }
};

const toGoogleDrivePreviewUrl = (value: string) => normalizeDriveUrl(value) || value.trim();
const getMediaPreviewUrl = (file: ProductFile) => normalizeMediaSource(file, { type: file.type === 'audio' ? 'audio' : file.type === 'video' ? 'video' : 'document' }).embedUrl || '';
const getMediaProviderBadge = (file: ProductFile) => {
  const normalized = normalizeMediaSource(file, { type: file.type === 'audio' ? 'audio' : file.type === 'video' ? 'video' : 'document' });
  if (normalized.provider === 'drive') return `Google Drive ${file.type === 'audio' ? 'Audio' : file.type === 'video' ? 'Video' : 'Preview'}`;
  if (normalized.provider === 'youtube') return 'YouTube Video';
  if (normalized.provider === 'direct') return `Direct ${file.type === 'audio' ? 'Audio' : 'Video'}`;
  if (normalized.provider === 'firebase-storage') return `Legacy Storage ${file.type === 'audio' ? 'Audio' : 'Video'}`;
  return normalized.isLegacy ? 'Legacy Hosted Media' : 'External Hosted Media';
};
const isHostedDocsFile = (file: ProductFile) => {
  if (hostedDocsProviders.includes(file.provider as typeof hostedDocsProviders[number])) return true;
  if (file.type === 'pdf' && Boolean(file.url)) return true;
  return file.type === 'link' && Boolean(file.url) && (isGoogleDriveUrl(file.url) || /\.(pdf|doc|docx)(?:$|[?#])/i.test(file.url));
};

const getHostedDocsPreviewUrl = (file: ProductFile) => {
  if ((file.provider === 'google_drive_pdf' || file.provider === 'google_drive_doc' || isGoogleDriveUrl(file.url)) && extractGoogleDriveFileId(file.url)) {
    return toGoogleDrivePreviewUrl(file.url);
  }
  return file.url;
};

const FileIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const ModuleIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h6.75v6.75H3.75V3.75zM13.5 3.75h6.75v6.75H13.5V3.75zM3.75 13.5h6.75v6.75H3.75V13.5zM13.5 13.5h6.75v6.75H13.5V13.5z" />
  </svg>
);

const QuizIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
  </svg>
);

const smartDocToolbarCommands: Array<[string, string]> | undefined = [['bold', 'B'], ['italic', 'I'], ['underline', 'U']];
const readingThemeOptions: Array<'dark' | 'sepia' | 'light'> | undefined = ['dark', 'sepia', 'light'];

const VideoUnavailablePlaceholder: React.FC = () => (
  <div className="flex h-full w-full flex-col items-center justify-center bg-white/70 p-4 text-center text-slate-900 backdrop-blur-xl">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/50 bg-white/70">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-900/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
    <h3 className="text-xl font-semibold">Video unavailable</h3>
    <p className="mt-1 text-[#50527a]/70">This video is unavailable in this environment.</p>
  </div>
);

const getViewportMetrics = () => {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }
  const viewport = window.visualViewport;
  return {
    width: Math.floor(viewport?.width || window.innerWidth || 1024),
    height: Math.floor(viewport?.height || window.innerHeight || 768),
  };
};

const useViewportSize = () => {
  const [size, setSize] = useState(getViewportMetrics);

  useEffect(() => {
    const update = () => setSize(getViewportMetrics());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  const width = size.width;
  const height = size.height;
  return {
    width,
    height,
    isCompactWidth: width < 640,
    isShortHeight: height < 560,
    isTinyPlayer: width < 430 || height < 460,
    isLandscapeCompact: width > height && height < 520,
  };
};



const GlassDownloadCard: React.FC<{ file: ProductFile; headline?: string; onDownloadRequest?: (file: ProductFile) => void; }> = ({ file, headline = 'Your download is ready', onDownloadRequest }) => (
  <div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-white/70 p-3 text-slate-900 sm:p-6 custom-scrollbar">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_26%),radial-gradient(circle_at_75%_70%,rgba(125,211,252,0.28),transparent_24%)]" />
    <div className="relative w-full max-w-lg rounded-[1.5rem] border border-white/50 bg-white/70 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/50 bg-white/15 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:mb-5 sm:h-24 sm:w-24">
        <FileIcon className="h-12 w-12 text-slate-900" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-700/90">PDF / Document</p>
      <h2 className="mt-3 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{headline}</h2>
      <p className="mx-auto mt-3 max-w-sm truncate text-base font-semibold text-slate-900/80" title={file.name}>{file.name}</p>
      {onDownloadRequest ? (
        <button type="button" onClick={() => onDownloadRequest(file)} className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm">
          Click here to download <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
        </button>
      ) : (
        <a
          href={file.url}
          download={file.name}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (file.type === 'pdf') {
              console.info('PDF download started. Reward will be claimed by download handler if connected.');
            }
          }}
          className="group mt-8 inline-flex items-center justify-center rounded-2xl bg-cyan-100 px-7 py-4 text-base font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:bg-cyan-50 hover:shadow-sm"
        >
          Download PDF • Earn coins <span className="ml-2 transition group-hover:translate-y-0.5">↓</span>
        </a>
      )}
    </div>
  </div>
);

const getCoursePlayerAccessLevel = (item?: Partial<CourseAccessMeta> | null): CourseAccessLevel => {
  if (item?.accessLevel === 'paidUpdate' || item?.accessLevel === 'hidden') return item.accessLevel;
  return 'included';
};

const resolveCoursePlayerUpdateId = (productId: number, item: Partial<CourseAccessMeta> & { id?: string }) =>
  String(item.paidUpdateId || `product-${productId}-update-${item.id || 'content'}`).trim();

const isCoursePlayerItemHidden = (item: Partial<CourseAccessMeta>) =>
  getCoursePlayerAccessLevel(item) === 'hidden';

export const getRequiredEducoins = (content?: Partial<CourseAccessMeta> & { updateEducoinPrice?: number | string; educoinPrice?: number | string; coinPrice?: number | string; paidUpdateCoinPrice?: number | string } | null) => {
  const raw = content?.paidUpdateCoinPrice ?? content?.updateEducoinPrice ?? content?.educoinPrice ?? content?.coinPrice;
  return normalizeCoinPrice(raw).normalizedCoinPrice;
};

export const getEducoinBalance = (user?: Partial<User> | null) =>
  Math.max(0, Math.floor(Number(user?.coinBalance ?? user?.eduCoins ?? 0) || 0));

const hasCoursePlayerItemAccess = (
  productId: number,
  item: Partial<CourseAccessMeta> & { id?: string },
  productAccess?: ProductAccessState | null
) => {
  const accessLevel = getCoursePlayerAccessLevel(item);

  if (accessLevel === 'hidden') return false;
  if (accessLevel === 'included') return true;
  if (!productAccess?.hasBaseAccess) return false;

  const updateId = resolveCoursePlayerUpdateId(productId, item);
  return productAccess.ownedUpdateIds.includes(updateId);
};


const COURSE_INTRO_MODULE_ID = 'course-intro-module';
const COURSE_INTRO_FILE_ID = 'course-intro';

const isCourseIntroFile = (file?: Partial<ProductFile> | null) => {
  const id = String(file?.id || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return id.includes('course-intro') || id.includes('welcome-intro') || /\b(welcome|course intro|introduction)\b/.test(name);
};

const buildCourseIntroContent = (product: Pick<ProductWithRating, 'title'>, hasLessons: boolean): ProductFile => {
  const emptyCourseNote = hasLessons ? '' : '<p><strong>No lessons added yet.</strong> Your course content will appear in the module panel as soon as lessons are published.</p>';

  return {
    id: COURSE_INTRO_FILE_ID,
    name: 'Welcome / Course Intro',
    type: 'doc',
    url: '',
    accessLevel: 'included',
    paidUpdateId: '',
    paidUpdateTitle: '',
    paidUpdatePrice: '',
    paidUpdateCoinPrice: 0,
    content: `<h1>Welcome to ${product.title}</h1><p>You are inside the course player. Use the module panel to browse lessons, documents, quizzes, and resources.</p><p>Start with this course intro, then select the first lesson in the module list when you are ready to continue.</p><p>If you are on mobile, the module panel opens first so you can immediately see the course structure. You can close it after choosing a lesson.</p>${emptyCourseNote}`,
    docPages: [{
      id: 'course-intro-page',
      title: 'Welcome / Course Intro',
      content: `<h1>Welcome to ${product.title}</h1><p>You are inside the course player. Use the module panel to browse lessons, documents, quizzes, and resources.</p><p>Start with this course intro, then select the first lesson in the module list when you are ready to continue.</p><p>If you are on mobile, the module panel opens first so you can immediately see the course structure. You can close it after choosing a lesson.</p>${emptyCourseNote}`,
      createdAt: 0,
      updatedAt: 0,
    }],
  };
};

const countCourseFiles = (modules?: CourseModule[]): number => (modules || []).reduce(
  (count, module) => count + (module.files || []).length + countCourseFiles(module.modules || []),
  0
);

const removeDuplicateCourseIntroFiles = (modules?: CourseModule[], keepFirst = { kept: false }): CourseModule[] => (modules || []).map(module => ({
  ...module,
  files: (module.files || []).filter(file => {
    if (!isCourseIntroFile(file)) return true;
    if (!keepFirst.kept) {
      keepFirst.kept = true;
      return true;
    }
    return false;
  }),
  modules: removeDuplicateCourseIntroFiles(module.modules || [], keepFirst),
}));

const findCourseIntroFile = (modules?: CourseModule[]): ProductFile | null => {
  for (const module of modules || []) {
    const intro = (module.files || []).find(isCourseIntroFile);
    if (intro) return intro;
    const nestedIntro = findCourseIntroFile(module.modules || []);
    if (nestedIntro) return nestedIntro;
  }
  return null;
};

const stripCourseIntroFiles = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
  ...module,
  files: (module.files || []).filter(file => !isCourseIntroFile(file)),
  modules: stripCourseIntroFiles(module.modules || []),
}));

const ensureCourseIntroModule = (product: ProductWithRating): CourseModule[] => {
  const sourceModules = product.courseContent || [];
  const cleanedModules = removeDuplicateCourseIntroFiles(sourceModules);
  const existingIntro = findCourseIntroFile(cleanedModules);
  const modulesWithoutIntro = stripCourseIntroFiles(cleanedModules)
    .filter(module => module.id !== COURSE_INTRO_MODULE_ID || (module.files || []).length > 0 || (module.modules || []).length > 0);

  if (!existingIntro) return modulesWithoutIntro;

  const introModule: CourseModule = {
    id: COURSE_INTRO_MODULE_ID,
    title: 'Course Intro',
    accessLevel: 'included',
    paidUpdateId: '',
    paidUpdateTitle: '',
    paidUpdatePrice: '',
    paidUpdateCoinPrice: 0,
    files: [{ ...existingIntro, accessLevel: 'included', paidUpdateId: '', paidUpdateTitle: '', paidUpdatePrice: '', paidUpdateCoinPrice: 0 }],
    modules: [],
  };

  return [introModule, ...modulesWithoutIntro];
};

const ModuleItem: React.FC<{
  module: CourseModule;
  productId: number;
  productAccess?: ProductAccessState | null;
  activeFile: ProductFile | null;
  onSelectFile: (file: ProductFile) => void;
  onPurchaseLatestUpdate?: (updateId?: string) => void;
  onUnlockWithEducoins?: (item: CourseModule | ProductFile) => Promise<void> | void;
  educoinBalance?: number;
  level?: number;
  parentLocked?: boolean;
  defaultExpanded?: boolean;
  resetKey?: number;
}> = ({ module, productId, productAccess, activeFile, onSelectFile, onPurchaseLatestUpdate, onUnlockWithEducoins, educoinBalance = 0, level = 0, parentLocked = false, defaultExpanded = false, resetKey = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, module.id, resetKey]);
  const moduleHidden = isCoursePlayerItemHidden(module);
  const moduleUpdateId = resolveCoursePlayerUpdateId(productId, module);
  const moduleUnlocked = !parentLocked && hasCoursePlayerItemAccess(productId, module, productAccess);
  const visibleFiles = (module.files || []).filter(file => !isCoursePlayerItemHidden(file));
  const visibleModules = (module.modules || []).filter(subModule => !isCoursePlayerItemHidden(subModule));

  if (moduleHidden) return null;

  return (
    <div className={`${level > 0 ? "ml-4 border-l border-[#E3E8F5] pl-3" : ""}`}>
      <button
        onClick={() => {
          if (moduleUnlocked) {
            setIsExpanded(!isExpanded);
            return;
          }
          onPurchaseLatestUpdate?.(moduleUpdateId);
        }}
        className={`module-item-button group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition sm:py-4 ${
          moduleUnlocked
            ? 'border border-transparent bg-white/65 text-[#071735] shadow-[0_8px_24px_rgba(8,26,69,0.04)] hover:border-[#C9C2FF] hover:bg-[#F1EEFF] hover:text-[#5B4BFF]'
            : 'paid-module-unlock-action border border-blue-300 bg-gradient-to-r from-blue-600 via-[#1769ff] to-cyan-500 text-white shadow-[0_16px_38px_rgba(23,105,255,0.24)] hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(23,105,255,0.30)]'
        }`}
        aria-expanded={isExpanded}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          moduleUnlocked
            ? 'bg-[#F1EEFF] text-[#5B4BFF] ring-1 ring-[#C9C2FF]/70'
            : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
        }`}>
          <ModuleIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-black leading-tight">{module.title}</span>
          <span className="mt-1 block text-xs font-bold text-[#667085]">
            {visibleFiles.length} lessons • {visibleModules.length} sections
          </span>
        </span>
        {!moduleUnlocked ? (
          <span className="shrink-0 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-inner">
            🔒 Unlock
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-[#5B4BFF] shadow-sm">
            {isExpanded ? '−' : '+'}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-1.5 pb-2">
          {visibleFiles.map((file) => {
            const fileUpdateId = resolveCoursePlayerUpdateId(productId, file);
            const filePurchaseUpdateId = productAccess?.lockedPaidUpdateIds.includes(fileUpdateId) ? fileUpdateId : moduleUpdateId;
            const fileUnlocked = moduleUnlocked && hasCoursePlayerItemAccess(productId, file, productAccess);
            const isActive = activeFile?.id === file.id;

            return (
              <React.Fragment key={file.id}>
                <button
                  type="button"
                  aria-disabled={!fileUnlocked}
                  onClick={() => fileUnlocked ? onSelectFile(file) : onPurchaseLatestUpdate?.(filePurchaseUpdateId)}
                  className={`module-item-button flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition sm:py-3 ${
                    isActive
                      ? "border-[#C9C2FF] bg-white font-black text-[#5B4BFF] shadow-[0_14px_34px_rgba(91,75,255,0.16)]"
                      : fileUnlocked
                        ? "border-transparent bg-white/45 font-semibold text-[#344054] hover:border-[#E3E8F5] hover:bg-[#F1EEFF] hover:text-[#5B4BFF]"
                        : "paid-lesson-unlock-action cursor-pointer border-blue-300 bg-blue-50 font-black text-blue-800 hover:-translate-y-0.5 hover:bg-blue-100"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    !fileUnlocked
                      ? 'bg-amber-100 text-amber-700'
                      : isActive
                        ? 'bg-[#F1EEFF] text-[#5B4BFF]'
                        : 'bg-[#F8FBFF] text-[#6D5DFC]'
                  }`}>
                    {!fileUnlocked ? (
                      <span className="text-sm">🔒</span>
                    ) : file.type === 'quiz' ? (
                      <QuizIcon className="h-5 w-5" />
                    ) : (
                      <FileIcon className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  {!fileUnlocked && (
                    <span className="shrink-0 rounded-full bg-[#F5B82E] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-950 ring-1 ring-amber-300">
                      Buy
                    </span>
                  )}
                </button>              </React.Fragment>
            );
          })}

          {visibleModules.map((subModule) => (
            <ModuleItem
              key={`${resetKey}-${subModule.id}`}
              module={subModule}
              productId={productId}
              productAccess={productAccess}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              onPurchaseLatestUpdate={onPurchaseLatestUpdate}
              onUnlockWithEducoins={onUnlockWithEducoins}
              educoinBalance={educoinBalance}
              level={level + 1}
              parentLocked={!moduleUnlocked}
              defaultExpanded={false}
              resetKey={resetKey}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const extractYouTubeID = (value?: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(raw)) return raw;

  try {
    const normalizedRaw = raw.startsWith('http://')
      ? raw.replace(/^http:\/\//i, 'https://')
      : raw;
    const parsedUrl = new URL(normalizedRaw);
    const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    const queryId = parsedUrl.searchParams.get('v') || parsedUrl.searchParams.get('video_id');

    if (queryId && idPattern.test(queryId)) return queryId;

    if (host === 'youtu.be') {
      const shortId = parts[0] || '';
      if (idPattern.test(shortId)) return shortId;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const route = parts[0] || '';
      const routeId = ['embed', 'shorts', 'live', 'v'].includes(route) ? parts[1] || '' : '';
      if (idPattern.test(routeId)) return routeId;
    }
  } catch {
    // Fallback regex below handles pasted iframe/src fragments or partial URLs.
  }

  const fallbackMatch = raw.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  return fallbackMatch?.[1] || null;
};

const getYouTubeVideoIdFromFile = (file?: Partial<ProductFile> | null): string | null => {
  if (!file) return null;

  return extractYouTubeID(
    file.youtubeVideoId ||
    file.youtubeUrl ||
    file.embedUrl ||
    (file as any).videoUrl ||
    file.url ||
    ''
  );
};

let youtubeIframeApiPromise: Promise<void> | null = null;

const ensureYouTubeIframeApi = (): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = finish;
      document.body.appendChild(script);
    }

    const pollTimer = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(pollTimer);
        finish();
      }
    }, 100);

    window.setTimeout(() => {
      window.clearInterval(pollTimer);
      finish();
    }, 5000);
  });

  return youtubeIframeApiPromise;
};

const getCourseBackground = (product: ProductWithRating, activeFile: ProductFile | null) => {
  if (activeFile?.type === 'youtube') {
    const videoId = extractYouTubeID(activeFile.url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/1600/900`;
};

const OPEN_DOCS_DEFAULT_HTML = '<h1>Open Docs Workspace</h1><p>Start writing here.</p>';
const OPEN_DOCS_NOTES_COLLECTION = 'open_docs_notes';

const htmlFromPlainText = (value: string) => {
  const trimmed = (value || '').trim();
  return trimmed.startsWith('<') ? trimmed : `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
};

const getMeaningfulDocText = (html: string) =>
  (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

const createOpenDocsPage = (title: string, content = OPEN_DOCS_DEFAULT_HTML): ProductDocPage => {
  const now = Date.now();
  return {
    id: `open-doc-page-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim() || 'Untitled Page',
    content,
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeDocPages = (file: ProductFile): ProductDocPage[] => {
  const pages = (file.docPages || [])
    .filter(page => page && page.id && page.title)
    .map(page => ({
      ...page,
      title: page.title.trim() || 'Untitled Page',
      content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
    }));

  if (pages.length > 0) return pages;

  return [
    {
      id: 'page-1',
      title: file.name || 'Page 1',
      content: htmlFromPlainText(file.content || OPEN_DOCS_DEFAULT_HTML),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
};

const readOpenDocsPagesFromStorage = (storageKey: string, fallback: ProductDocPage[]): ProductDocPage[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as ProductDocPage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    return parsed
      .filter(page => page && page.id && page.title)
      .map(page => ({
        ...page,
        title: page.title.trim() || 'Untitled Page',
        content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
      }));
  } catch {
    return fallback;
  }
};

const writeOpenDocsPagesToStorage = (storageKey: string, pages: ProductDocPage[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pages));
  } catch {
    // Keep editor usable even if browser storage is full.
  }
};

const normalizeStoredOpenDocsPages = (value: unknown, fallback: ProductDocPage[]): ProductDocPage[] => {
  const source = Array.isArray(value) ? value : [];

  const pages = source
    .filter((page): page is ProductDocPage => Boolean(page && typeof page === 'object'))
    .map(page => {
      const now = Date.now();

      return {
        id: String(page.id || `open-doc-page-${now}-${Math.random().toString(36).slice(2, 7)}`),
        title: String(page.title || 'Untitled Page').trim() || 'Untitled Page',
        content: htmlFromPlainText(String(page.content || OPEN_DOCS_DEFAULT_HTML)),
        createdAt: Number(page.createdAt) || now,
        updatedAt: Number(page.updatedAt) || now,
      };
    });

  return pages.length ? pages : fallback;
};

const cleanOpenDocsPagesForSave = (pages: ProductDocPage[], fallback: ProductDocPage[]): ProductDocPage[] =>
  normalizeStoredOpenDocsPages(pages, fallback).map(page => ({
    id: page.id,
    title: page.title.trim() || 'Untitled Page',
    content: htmlFromPlainText(page.content || OPEN_DOCS_DEFAULT_HTML),
    createdAt: Number(page.createdAt) || Date.now(),
    updatedAt: Number(page.updatedAt) || Date.now(),
  }));

const sanitizeOpenDocsDocIdPart = (value: string | number) =>
  String(value || 'unknown').replace(/[^\w-]/g, '_').slice(0, 80);

const buildOpenDocsCloudDocId = (uid: string, productId: number, fileId: string) =>
  `${sanitizeOpenDocsDocIdPart(uid)}_${sanitizeOpenDocsDocIdPart(productId)}_${sanitizeOpenDocsDocIdPart(fileId)}`;

const saveEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor) return;

  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    selectionRef.current = range.cloneRange();
  }
};

const restoreEditorSelection = (editor: HTMLDivElement | null, selectionRef: React.MutableRefObject<Range | null>) => {
  const selection = window.getSelection();
  const range = selectionRef.current;
  if (!selection || !range || !editor || !editor.contains(range.commonAncestorContainer)) return;

  selection.removeAllRanges();
  selection.addRange(range);
};

const runBrowserRichTextCommand = (
  editor: HTMLDivElement | null,
  selectionRef: React.MutableRefObject<Range | null>,
  command: string,
  value?: string
) => {
  if (!editor) return false;

  editor.focus();
  restoreEditorSelection(editor, selectionRef);

  try {
    const supported = typeof document.queryCommandSupported === 'function'
      ? document.queryCommandSupported(command)
      : true;

    if (!supported && command !== 'formatBlock') return false;

    const ok = document.execCommand(command, false, value);
    saveEditorSelection(editor, selectionRef);
    return ok;
  } catch {
    return false;
  }
};

const SmartDocsWorkspace: React.FC<{ file: ProductFile; productId: number; }> = ({ file, productId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  const legacyStorageKey = `smart-docs-workspace-${productId}-${file.id}`;
  const pagesStorageKey = `open-docs-pages-${productId}-${file.id}`;

  const defaultPages = useMemo(() => normalizeDocPages(file), [file]);
  const [pages, setPages] = useState<ProductDocPage[]>(defaultPages);
  const [activePageId, setActivePageId] = useState(defaultPages[0]?.id || 'page-1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [savedAt, setSavedAt] = useState('Loaded admin version');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans');
  const [theme, setTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [learnerUid, setLearnerUid] = useState(() => auth.currentUser?.uid || '');
  const cloudSaveTimerRef = useRef<number | null>(null);
  const cloudDocId = useMemo(
    () => learnerUid ? buildOpenDocsCloudDocId(learnerUid, productId, file.id) : '',
    [learnerUid, productId, file.id]
  );
  const docsViewport = useViewportSize();
  const isCompactDocs = docsViewport.width < 768;
  const editorShellClass = isSidebarOpen && !isCompactDocs
    ? 'lg:pl-[22.5rem]'
    : '';
  const editorPageWidthClass = isSidebarOpen && !isCompactDocs
    ? 'max-w-5xl'
    : 'max-w-[min(96rem,calc(100vw-2rem))] xl:max-w-[104rem]';
  const panelTitleId = `open-docs-panel-title-${sanitizeOpenDocsDocIdPart(file.id)}`;
  const panelDescriptionId = `open-docs-panel-description-${sanitizeOpenDocsDocIdPart(file.id)}`;

  const activePage = pages.find(page => page.id === activePageId) || pages[0];
  const activeContent = activePage?.content || OPEN_DOCS_DEFAULT_HTML;

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setLearnerUid(user?.uid || '');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoredPages = readOpenDocsPagesFromStorage(pagesStorageKey, defaultPages);
    const legacyHtml = localStorage.getItem(legacyStorageKey);

    const nextPages = legacyHtml && !localStorage.getItem(pagesStorageKey)
      ? restoredPages.map((page, index) => index === 0 ? { ...page, content: legacyHtml, updatedAt: Date.now() } : page)
      : restoredPages;

    const cleanLocalPages = cleanOpenDocsPagesForSave(nextPages, defaultPages);

    setPages(cleanLocalPages);
    setActivePageId(cleanLocalPages[0]?.id || 'page-1');
    setSavedAt(legacyHtml || localStorage.getItem(pagesStorageKey) ? 'Restored from this device' : 'Loaded admin version');

    if (!learnerUid || !cloudDocId) return () => {
      cancelled = true;
    };

    setSavedAt('Loading account sync…');

    getDoc(doc(db, OPEN_DOCS_NOTES_COLLECTION, cloudDocId))
      .then(snapshot => {
        if (cancelled || !snapshot.exists()) return;

        const cloudPages = normalizeStoredOpenDocsPages(snapshot.data()?.pages, cleanLocalPages);
        const cleanCloudPages = cleanOpenDocsPagesForSave(cloudPages, cleanLocalPages);

        setPages(cleanCloudPages);
        setActivePageId(cleanCloudPages[0]?.id || 'page-1');
        writeOpenDocsPagesToStorage(pagesStorageKey, cleanCloudPages);
        setSavedAt('Synced from your account');
      })
      .catch(() => {
        if (!cancelled) setSavedAt('Saved on this device · cloud sync unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [pagesStorageKey, legacyStorageKey, defaultPages, learnerUid, cloudDocId]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== activeContent) {
      editorRef.current.innerHTML = activeContent;
    }
  }, [activePageId, activeContent]);

  const persistPages = (nextPages: ProductDocPage[], status = 'Saved locally') => {
    const cleanPages = cleanOpenDocsPagesForSave(nextPages, defaultPages);

    setPages(cleanPages);
    writeOpenDocsPagesToStorage(pagesStorageKey, cleanPages);
    setSavedAt(status);

    if (!learnerUid || !cloudDocId) return;

    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    cloudSaveTimerRef.current = window.setTimeout(() => {
      setDoc(doc(db, OPEN_DOCS_NOTES_COLLECTION, cloudDocId), {
        ownerId: learnerUid,
        productId,
        fileId: file.id,
        fileName: file.name,
        pages: cleanPages,
        updatedAt: Date.now(),
      }, { merge: true })
        .then(() => setSavedAt('Saved to your account'))
        .catch(() => setSavedAt('Saved on this device · cloud sync unavailable'));
    }, 700);
  };

  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, []);

  const saveCurrentPage = () => {
    const nextContent = editorRef.current?.innerHTML || activeContent;
    const now = Date.now();

    const nextPages = pages.map(page =>
      page.id === activePageId
        ? { ...page, content: nextContent, updatedAt: now }
        : page
    );

    persistPages(nextPages, `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const selectPage = (pageId: string) => {
    saveCurrentPage();
    setActivePageId(pageId);
  };

  const addPage = () => {
    saveCurrentPage();
    const title = prompt('New Open Docs page title', `Page ${pages.length + 1}`)?.trim();
    if (!title) return;

    const nextPage = createOpenDocsPage(title);
    const nextPages = [...pages, nextPage];

    persistPages(nextPages, 'New page created locally');
    setActivePageId(nextPage.id);
    setIsSidebarOpen(true);
  };

  const renamePage = () => {
    if (!activePage) return;

    const title = prompt('Rename Open Docs page', activePage.title)?.trim();
    if (!title) return;

    const nextPages = pages.map(page =>
      page.id === activePage.id ? { ...page, title, updatedAt: Date.now() } : page
    );

    persistPages(nextPages, 'Page renamed locally');
  };

  const deletePage = () => {
    if (!activePage || pages.length <= 1) return;
    if (!confirm('Delete this Open Docs page from this device?')) return;

    const nextPages = pages.filter(page => page.id !== activePage.id);
    persistPages(nextPages, 'Page deleted locally');
    setActivePageId(nextPages[0]?.id || 'page-1');
  };


  useEffect(() => {
    if (!isSidebarOpen) return;

    panelRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  const runCommand = (command: string, value?: string) => {
    const ok = runBrowserRichTextCommand(editorRef.current, selectionRef, command, value);
    if (!ok) {
      setSavedAt('Formatting failed — click inside the page and try again');
      return;
    }
    saveCurrentPage();
  };

  const readingThemeClass = {
    dark: 'bg-white/70 text-slate-900',
    sepia: 'bg-[#2b2118]/95 text-[#f7e7c6]',
    light: 'bg-slate-100/95 text-slate-900',
  }[theme];

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-white text-slate-900">
      <div className="open-docs-toolbar flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-[#D9E7F8] bg-white p-2 shadow-sm sm:gap-2 sm:p-3 custom-scrollbar">
        <button type="button" onClick={() => setIsSidebarOpen(value => !value)} className={`min-h-11 shrink-0 rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-widest shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/45 ${isSidebarOpen ? 'border-[#7B61FF] bg-gradient-to-r from-[#5B4BFF] to-[#7B61FF] text-white' : 'border-[#D9E7F8] bg-white/90 text-[#5B4BFF] hover:bg-[#F7F5FF]'}`} aria-label={isSidebarOpen ? 'Close Open Docs panel' : 'Open Open Docs panel'} aria-expanded={isSidebarOpen} aria-controls="open-docs-panel">Open Docs</button>
        <button type="button" onClick={() => { saveCurrentPage(); setIsReadingMode(true); }} className="min-h-11 shrink-0 rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-2 text-xs font-black uppercase tracking-widest text-[#536178] shadow-sm transition hover:-translate-y-0.5 hover:border-[#C9C2FF] hover:bg-[#F1EEFF] hover:text-[#5B4BFF] hover:shadow-md">Reading Mode</button>
        {(smartDocToolbarCommands || []).map(([cmd, label]) => (<button key={cmd} type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand(cmd)} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 shadow-sm transition active:scale-95 hover:bg-white/90 hover:shadow-sm">{label}</button>))}
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', '<h1>')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H1</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('formatBlock', '<h2>')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">H2</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">• List</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyLeft')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Left</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyCenter')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Center</button>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => runCommand('justifyRight')} className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black text-slate-900 hover:bg-white/90 hover:shadow-sm">Right</button>
        <span className="ml-auto shrink-0 rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-slate-600/90">{savedAt}</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isSidebarOpen && isCompactDocs && (<button type="button" aria-label="Close Open Docs panel" onClick={() => setIsSidebarOpen(false)} className="absolute inset-0 z-10 bg-[#081A45]/35 backdrop-blur-[2px]" />)}
        {isSidebarOpen && (
          <div
            id="open-docs-panel"
            ref={panelRef}
            role="dialog"
            aria-modal={isCompactDocs}
            aria-labelledby={panelTitleId}
            aria-describedby={panelDescriptionId}
            tabIndex={-1}
            className={`${isCompactDocs ? 'fixed inset-y-0 left-0 z-20 w-[min(92svw,24rem)] max-w-full rounded-r-[2rem] border-r border-[#D9E7F8] bg-white shadow-[0_24px_70px_rgba(8,26,69,0.24)]' : 'absolute left-4 top-4 z-20 h-[calc(100%-2rem)] w-[21rem] rounded-[1.75rem] border border-[#D9E7F8] bg-white shadow-[0_24px_70px_rgba(91,75,255,0.16)]'} flex min-h-0 flex-col overflow-hidden outline-none transition-transform duration-300`}
            style={isCompactDocs ? { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
          >
            <div className="shrink-0 border-b border-[#E3E8F5] bg-gradient-to-br from-white via-[#F8FBFF] to-[#F1EEFF] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7B61FF]">Workspace drawer</p>
                  <h2 id={panelTitleId} className="mt-1 text-2xl font-black text-[#081A45]">Open Docs</h2>
                  <p id={panelDescriptionId} className="mt-1 text-sm font-bold text-[#7C879A]">Pages saved for this course file.</p>
                </div>
                <button type="button" onClick={() => setIsSidebarOpen(false)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-xl font-black text-[#081A45] shadow-sm transition hover:bg-[#F7F5FF] focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/45" aria-label="Close Open Docs panel">×</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#536178]">Pages on this device</p>
              {pages.length === 0 ? <div className="rounded-2xl border border-dashed border-[#C9C2FF] bg-[#F7F5FF] p-4 text-sm font-bold text-[#536178]">No pages yet. Create your first note page.</div> : (
                <div className="space-y-2.5">{pages.map(page => {
                  const selected = page.id === activePageId;
                  return (
                    <button key={page.id} type="button" onClick={() => { selectPage(page.id); if (isCompactDocs) setIsSidebarOpen(false); }} aria-current={selected ? 'page' : undefined} className={`min-h-16 w-full rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/45 ${selected ? 'border-[#B7E7FF] bg-gradient-to-br from-[#F1EEFF] via-white to-[#EAFBFF] text-[#081A45] shadow-[0_14px_34px_rgba(91,75,255,0.12)]' : 'border-[#E3E8F5] bg-white text-[#536178] hover:border-[#C9C2FF] hover:bg-[#F8FBFF]'}`}>
                      <span className="block truncate text-sm font-black">{page.title}</span>
                      <span className="mt-1 block truncate text-xs font-bold text-[#7C879A]">{getMeaningfulDocText(page.content).slice(0, 64) || 'Empty page'}</span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-widest text-[#9AA4B5]">Updated {new Date(page.updatedAt || Date.now()).toLocaleDateString()}</span>
                    </button>
                  );
                })}</div>
              )}
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={addPage} className="min-h-11 w-full rounded-2xl bg-gradient-to-r from-[#5B4BFF] to-[#7B61FF] px-4 py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(91,75,255,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(91,75,255,0.28)]">+ New Page</button>
                <button type="button" onClick={renamePage} className="min-h-11 w-full rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-black text-[#536178] transition hover:border-[#C9C2FF] hover:bg-[#F7F5FF] hover:text-[#5B4BFF]">Rename Page</button>
                {pages.length > 1 && (<button type="button" onClick={deletePage} className="min-h-11 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100">Delete Page</button>)}
              </div>
              <p className="mt-4 rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-3 text-xs font-bold leading-5 text-[#536178]">{savedAt.includes('cloud') ? savedAt : `${savedAt} · saved locally and synced when available`}</p>
            </div>
          </div>
        )}
        <div className={`h-full min-h-0 overflow-y-auto p-3 transition-[padding] duration-300 sm:p-4 md:p-8 custom-scrollbar ${editorShellClass}`}>
          <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={saveCurrentPage} onBlur={saveCurrentPage} onKeyUp={() => saveEditorSelection(editorRef.current, selectionRef)} onMouseUp={() => saveEditorSelection(editorRef.current, selectionRef)} onTouchEnd={() => saveEditorSelection(editorRef.current, selectionRef)} onFocus={() => saveEditorSelection(editorRef.current, selectionRef)} className={`open-docs-page mx-auto min-h-full w-full ${editorPageWidthClass} rounded-[1.25rem] border border-white/50 bg-white/80 px-4 py-6 text-base leading-7 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline-none backdrop-blur-xl transition-[max-width] duration-300 sm:rounded-[1.5rem] sm:px-8 sm:py-10 sm:text-lg sm:leading-8 md:px-14 [&_h1]:text-3xl sm:[&_h1]:text-4xl [&_h1]:font-black [&_h2]:text-2xl sm:[&_h2]:text-3xl [&_h2]:font-black [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6`} />
        </div>
      </div>

      {isReadingMode && (
        <div className="absolute inset-2 z-20 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:inset-4 sm:rounded-[2rem]">
          <div className="open-docs-toolbar flex shrink-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/50 bg-white/70 p-2 sm:gap-2 sm:p-3 custom-scrollbar">
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setIsReadingMode(false)} aria-label="Close reading mode" className="min-h-9 shrink-0 rounded-xl border border-white/50 bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Close</button>
              <span className="shrink-0 text-sm font-black text-slate-900 sm:text-base">Reading Mode</span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setFontSize(value => Math.max(14, value - 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A-</button>
              <button type="button" onClick={() => setFontSize(value => Math.min(28, value + 2))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">A+</button>
              <button type="button" onClick={() => setLineSpacing(value => Math.max(1.25, Number((value - 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line -</button>
              <button type="button" onClick={() => setLineSpacing(value => Math.min(2.4, Number((value + 0.15).toFixed(2))))} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">Line +</button>
              <button type="button" onClick={() => setFontStyle(value => value === 'sans' ? 'serif' : 'sans')} className="min-h-9 shrink-0 rounded-xl bg-white/75 px-3 py-2 text-sm font-black hover:bg-white/90 hover:shadow-sm">{fontStyle === 'sans' ? 'Serif' : 'Sans'}</button>
              {(readingThemeOptions || []).map(option => (<button key={option} type="button" onClick={() => setTheme(option)} className={`min-h-9 shrink-0 rounded-xl px-3 py-2 text-sm font-black capitalize ${theme === option ? 'bg-cyan-200 text-slate-900' : 'bg-white/75 hover:bg-white/90 hover:shadow-sm'}`}>{option}</button>))}
            </div>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar ${readingThemeClass}`}>
            <style>{`.reader-content, .reader-content * { line-height: ${lineSpacing} !important; } .reader-content p, .reader-content li, .reader-content div, .reader-content span, .reader-content blockquote { font-size: ${fontSize}px !important; } .reader-content h1 { font-size: ${Math.round(fontSize * 2)}px !important; } .reader-content h2 { font-size: ${Math.round(fontSize * 1.65)}px !important; } .reader-content h3 { font-size: ${Math.round(fontSize * 1.35)}px !important; }`}</style>
            <article className={`reader-content mx-auto max-w-3xl ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'} [&_h1]:mb-5 [&_h1]:font-black [&_h2]:mb-4 [&_h2]:font-black [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6`} dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || activeContent }} />
          </div>
        </div>
      )}
    </div>
  );
};


const HostedDocumentViewer: React.FC<{ file: ProductFile }> = ({ file }) => {
  const previewUrl = getHostedDocsPreviewUrl(file);
  const isDrive = file.provider === 'google_drive_pdf' || file.provider === 'google_drive_doc' || isGoogleDriveUrl(file.url);
  const fallbackLabel = isDrive ? 'Open Drive' : file.type === 'pdf' || file.provider === 'direct_pdf' ? 'Open PDF' : 'Open in new tab';
  const badge = isDrive ? 'Google Drive Preview' : file.type === 'pdf' || file.provider === 'direct_pdf' ? 'PDF Viewer' : 'Hosted Docs';
  const [isDriveInterfaceOpen, setIsDriveInterfaceOpen] = useState(false);

  useEffect(() => {
    if (!isDriveInterfaceOpen || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDriveInterfaceOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDriveInterfaceOpen]);

  const openExternalDocument = () => {
    const target = file.url || previewUrl;
    if (!target || typeof window === 'undefined') return;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white/70 text-slate-900">
      <div className="flex shrink-0 flex-col gap-3 border-b border-white/60 bg-white/80 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">{badge}</p>
          <h2 className="truncate text-lg font-black text-slate-900 sm:text-2xl">{file.name}</h2>
          {isDrive && <p className="mt-1 text-xs font-bold text-amber-700">Normal preview keeps pinch zoom locked. Use Open Drive for the interactive zoom-enabled Drive interface.</p>}
        </div>
        {isDrive ? (
          <button type="button" onClick={() => setIsDriveInterfaceOpen(true)} className="shrink-0 rounded-xl border border-cyan-200 bg-cyan-100 px-5 py-3 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-200/60">
            {fallbackLabel}
          </button>
        ) : (
          <button type="button" onClick={openExternalDocument} className="shrink-0 rounded-xl border border-cyan-200 bg-cyan-100 px-5 py-3 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-200/60">
            {fallbackLabel}
          </button>
        )}
      </div>
      <div className="course-hosted-document-stage min-h-0 flex-1 bg-slate-100/70 p-2 [touch-action:pan-x_pan-y] sm:p-4" data-pinch-zoom="disabled">
        {previewUrl ? (
          <iframe
            title={file.name || 'Document preview'}
            src={previewUrl}
            className="course-hosted-document-frame h-full w-full rounded-[1.5rem] border border-white/70 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] [touch-action:pan-x_pan-y]"
            style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
            allow="fullscreen"
            data-pinch-zoom="disabled"
          />
        ) : (
          <GlassDownloadCard file={file} headline="Document preview unavailable" />
        )}
      </div>

      {isDrive && isDriveInterfaceOpen && previewUrl && (
        <div className="fixed inset-0 z-[2600] flex min-h-0 flex-col bg-slate-950/95 text-white" role="dialog" aria-modal="true" aria-label={`Interactive Drive interface for ${file.name}`}>
          <header className="flex shrink-0 items-center gap-3 border-b border-white/15 bg-slate-950 px-3 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Interactive Drive mode · pinch zoom enabled</p>
              <h3 className="truncate text-sm font-black sm:text-lg">{file.name}</h3>
            </div>
            <button type="button" onClick={openExternalDocument} className="hidden rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-black hover:bg-white/15 sm:inline-flex">Open new tab</button>
            <button type="button" onClick={() => setIsDriveInterfaceOpen(false)} className="rounded-lg border border-white/20 bg-white px-4 py-2 text-xs font-black text-slate-950 hover:bg-cyan-100" aria-label="Close interactive Drive interface">Close</button>
          </header>
          <div className="min-h-0 flex-1 bg-white" data-pinch-zoom="enabled">
            <iframe
              title={`Interactive Drive: ${file.name || 'Document'}`}
              src={previewUrl}
              className="h-full w-full border-0 bg-white [touch-action:auto]"
              style={{ touchAction: 'auto', overscrollBehavior: 'auto' }}
              allow="fullscreen"
              allowFullScreen
              data-pinch-zoom="enabled"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const ExternalResourceCard: React.FC<{ file: ProductFile }> = ({ file }) => (
  <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-3 text-slate-900 sm:p-6 custom-scrollbar">
    <div className="w-full max-w-2xl rounded-[1.5rem] border border-white/50 bg-white/70 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-4xl">↗</div>
      <p className="font-black uppercase tracking-[0.25em] text-cyan-700">External Resource</p>
      <h2 className="mt-3 text-3xl font-black">{file.name}</h2>
      <p className="mt-3 break-all text-slate-900/75">{file.url}</p>
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex rounded-2xl bg-cyan-100 px-7 py-4 font-black text-slate-900 transition hover:-translate-y-1 hover:bg-cyan-50">Open resource</a>
    </div>
  </div>
);


const PremiumCourseMediaCard: React.FC<{ file: ProductFile; onError?: () => void; onVideoFullscreen?: () => void; showFullscreen?: boolean; }> = ({ file, onError, onVideoFullscreen, showFullscreen = false }) => {
  const isAudio = file.type === 'audio';
  const normalizedMedia = normalizeMediaSource(file, { type: isAudio ? 'audio' : 'video' });
  const isDrive = normalizedMedia.provider === 'drive';
  const directPlayable = normalizedMedia.provider === 'direct' && normalizedMedia.isPlayable;
  const previewUrl = normalizedMedia.embedUrl || getMediaPreviewUrl(file);
  const badge = getMediaProviderBadge(file);
  const openUrl = normalizedMedia.url || file.url || previewUrl;
  const title = file.name || (isAudio ? 'Audio lesson' : 'Video lesson');
  const [mediaFailed, setMediaFailed] = useState(false);
  const driveStageRef = useRef<HTMLDivElement | null>(null);
  const [driveStageSize, setDriveStageSize] = useState(() => {
    if (typeof window === 'undefined') return { width: 1280, height: 720 };
    const viewport = window.visualViewport;
    return {
      width: Math.floor(viewport?.width || window.innerWidth || 1280),
      height: Math.floor((viewport?.height || window.innerHeight || 720) * 0.72),
    };
  });

  useEffect(() => { setMediaFailed(false); }, [file.id, openUrl, previewUrl]);

  useEffect(() => {
    if (!isDrive || !previewUrl) return;

    const stage = driveStageRef.current;
    if (!stage) return;

    let frame = 0;
    const updateSize = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = stage.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        setDriveStageSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      });
    };

    updateSize();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(stage);

    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);
    window.visualViewport?.addEventListener('resize', updateSize);
    window.visualViewport?.addEventListener('scroll', updateSize);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
      window.visualViewport?.removeEventListener('resize', updateSize);
      window.visualViewport?.removeEventListener('scroll', updateSize);
    };
  }, [file.id, isDrive, previewUrl]);

  const handleMediaError = () => { setMediaFailed(true); onError?.(); };

  if (isDrive && previewUrl && !mediaFailed) {
    const baseWidth = isAudio ? 960 : 1280;
    const baseHeight = isAudio ? 360 : 720;
    const scale = Math.min(1, driveStageSize.width / baseWidth, driveStageSize.height / baseHeight);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const scaledWidth = Math.max(1, Math.floor(baseWidth * safeScale));
    const scaledHeight = Math.max(1, Math.floor(baseHeight * safeScale));

    const viewportStyle: React.CSSProperties = {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
    };

    const iframeStyle: React.CSSProperties = {
      width: `${baseWidth}px`,
      height: `${baseHeight}px`,
      transform: `scale(${safeScale})`,
      transformOrigin: 'top left',
    };

    return (
      <div className="course-drive-fixed-stage h-full min-h-0 w-full overflow-hidden bg-black" aria-label={`${badge}: ${title}`}>
        <div ref={driveStageRef} className="course-drive-fixed-body">
          <div className={`course-drive-fixed-viewport ${isAudio ? 'course-drive-fixed-audio-viewport' : 'course-drive-fixed-video-viewport'}`} style={viewportStyle}>
            <iframe
              title={title}
              src={previewUrl}
              className="course-drive-fixed-iframe"
              style={iframeStyle}
              allow="autoplay; fullscreen"
              allowFullScreen
              onError={handleMediaError}
            />
          </div>
        </div>
        {openUrl ? (
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className="course-drive-fixed-open" aria-label="Open this Drive file in a new tab">
            ↗
          </a>
        ) : null}
      </div>
    );
  }

  if (isAudio) {
    return directPlayable && !mediaFailed ? (
      <div className="course-direct-audio-stage flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black p-4">
        <audio src={openUrl} controls className="course-direct-audio-player" onError={handleMediaError} />
      </div>
    ) : (
      <MediaFallbackCard title={title} badge={isDrive ? 'Drive audio' : 'Audio'} icon="🎧" message={isDrive ? 'This Drive file needs public access.' : 'Audio source unavailable'} actionHref={openUrl} actionLabel={isDrive ? 'Open in Drive' : 'Open source'} aspect="auto" className="h-full min-h-40 rounded-none" />
    );
  }

  return directPlayable && !mediaFailed ? (
    <div className="course-direct-video-stage relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black">
      <video src={openUrl} controls playsInline className="course-direct-video-player h-full w-full object-contain" onError={handleMediaError} />
      {showFullscreen ? <button type="button" onClick={onVideoFullscreen} className="absolute bottom-4 right-4 rounded-full border border-white/25 bg-black/75 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">⛶ Fullscreen</button> : null}
    </div>
  ) : (
    <MediaFallbackCard title={title} badge={isDrive ? 'Drive video' : 'Video'} icon="▶️" message={isDrive ? 'This Drive file needs public access.' : 'Video preview unavailable'} actionHref={openUrl} actionLabel={isDrive ? 'Open in Drive' : 'Open video'} aspect="video" className="h-full rounded-none" />
  );
};

const QuizPlayer: React.FC<{ file: ProductFile; economySettings: EconomySettings; canEarnEduCoins: boolean; eduCoinMultiplier: number; onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean; }> = ({ file, economySettings, canEarnEduCoins, eduCoinMultiplier, onQuizReward }) => {
  const questions = useMemo(() => (Array.isArray(file.quiz?.questions) ? file.quiz?.questions : []).filter(Boolean).map((q: any) => ({ ...q, prompt: String(q.prompt || q.question || q.title || q.text || '').trim(), options: Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : Array.isArray(q.answers) ? q.answers : [] })).filter(q => q.prompt && q.options.length), [file.id, file.quiz]);
  const [answers, setAnswers] = useState<QuizAnswerState>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [rewardCoins, setRewardCoins] = useState(0);
  const quizViewport = useViewportSize();
  const compactQuiz = quizViewport.isShortHeight || quizViewport.isTinyPlayer || quizViewport.isLandscapeCompact || quizViewport.width < 640;
  const veryCompactQuiz = quizViewport.isTinyPlayer || quizViewport.height < 620;
  useEffect(() => { setAnswers({}); setCurrentQuestion(0); setSubmitted(false); setRewardClaimed(false); setRewardCoins(0); }, [file.id]);
  const safeQuestionIndex = Math.min(currentQuestion, Math.max(0, questions.length - 1));
  useEffect(() => { if (currentQuestion !== safeQuestionIndex) setCurrentQuestion(safeQuestionIndex); }, [currentQuestion, safeQuestionIndex]);
  const score = questions.reduce((total, q, index) => total + (answers[index] === q.correctAnswer ? 1 : 0), 0);
  if (!questions.length) return <div className="flex h-full items-center justify-center bg-white/70 p-6 text-center text-lg font-black text-slate-800">No questions available for this quiz.</div>;

  const question = questions[safeQuestionIndex];
  const selected = answers[safeQuestionIndex];
  const answered = selected !== undefined;
  const isLastQuestion = currentQuestion === questions.length - 1;
  const allAnswered = questions.every((_, index) => answers[index] !== undefined);

  const desktopQuizLayout = !compactQuiz && quizViewport.width >= 1024;

  const submitQuiz = () => {
    const coins = score * Math.max(0, Number(economySettings.coinPerQuizCorrect));
    const creditedCoins = canEarnEduCoins ? Math.max(0, Math.floor(coins * eduCoinMultiplier)) : 0;
    setSubmitted(true);
    setRewardCoins(creditedCoins);
    if (canEarnEduCoins && coins > 0 && onQuizReward) setRewardClaimed(onQuizReward(file.id, file.name, score, coins));
  };

  return (
    <div className={`flex h-full min-h-0 overflow-hidden text-slate-900 ${compactQuiz ? 'p-0.5 sm:p-1.5' : 'p-3 sm:p-5 md:p-6'}`}>
      <div className={`mx-auto grid h-full min-h-0 w-full rounded-[1.25rem] border border-white/50 bg-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl sm:rounded-[2rem] ${compactQuiz ? 'grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-1.5 p-1.5' : desktopQuizLayout ? 'max-w-none grid-cols-[minmax(180px,0.45fr)_minmax(0,2.1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-3 p-3 md:p-4 xl:p-5' : 'max-w-5xl grid-rows-[auto_auto_auto_minmax(0,1fr)_auto_auto] gap-4 p-4 sm:p-6 md:p-8'}`}>
        <div className={`${compactQuiz ? 'flex-row items-center gap-1.5' : desktopQuizLayout ? 'col-start-1 row-start-1 flex-col gap-2 rounded-[1.25rem] border border-white/50 bg-white/70 p-3 shadow-sm xl:p-4' : 'gap-4 sm:flex-row sm:items-center sm:justify-between'} flex shrink-0 justify-between`}>
          <div className="min-w-0 flex-1">
            <p className={`${veryCompactQuiz ? 'hidden' : 'block'} text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700 sm:text-xs sm:tracking-[0.3em]`}>Interactive Quiz</p>
            <h2 className={`${compactQuiz ? 'mt-0 text-base' : desktopQuizLayout ? 'mt-1 text-xl xl:text-2xl' : 'mt-2 text-2xl sm:text-3xl'} truncate font-black text-slate-900`}>{file.name}</h2>
          </div>
          <div className={`${compactQuiz ? 'rounded-lg px-2 py-1 text-xs' : desktopQuizLayout ? 'rounded-2xl px-3 py-2 text-sm xl:text-base' : 'rounded-2xl px-4 py-2 text-base sm:px-5 sm:py-3 sm:text-lg'} shrink-0 border border-white/50 bg-white/70 font-black text-slate-900`}>Score: {score}/{questions.length}</div>
        </div>

        <div className={`${compactQuiz ? 'h-1' : desktopQuizLayout ? 'col-start-1 row-start-2 h-2' : 'h-2'} shrink-0 overflow-hidden rounded-full bg-white/70`}>
          <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }} />
        </div>

        {questions.length > 1 && (
          <div className={`${compactQuiz ? 'h-[5.25rem] flex-nowrap items-start gap-1.5 overflow-x-auto rounded-[1.1rem] p-1.5' : desktopQuizLayout ? 'col-start-1 row-start-3 content-start gap-1.5 overflow-y-auto p-2' : 'max-h-28 flex-wrap gap-2 overflow-y-auto p-3'} flex shrink-0 rounded-2xl border border-white/50 bg-white/70 custom-scrollbar`}>
            {questions.map((_, index) => {
              const isActive = currentQuestion === index;
              const isAnswered = answers[index] !== undefined;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentQuestion(index)}
                  className={`${compactQuiz ? 'h-16 min-w-10 rounded-full px-2 py-0 text-[11px] leading-none' : 'rounded-2xl px-4 py-2 text-sm'} shrink-0 font-black transition ${isActive ? 'bg-cyan-200 text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5' : isAnswered ? 'border border-emerald-300/40 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20' : 'border border-white/50 bg-white/70 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  Q{index + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className={`${compactQuiz ? 'rounded-[1.15rem] p-3' : desktopQuizLayout ? 'col-start-2 row-span-5 row-start-1 rounded-[1.75rem] p-6 xl:p-8 2xl:p-10' : 'rounded-[1.5rem] p-3 sm:rounded-3xl sm:p-5 md:p-7'} min-h-0 overflow-y-auto border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] custom-scrollbar`}>
          <p className={`${compactQuiz ? 'mb-1.5 text-[10px]' : 'mb-3 text-sm'} font-black uppercase tracking-[0.24em] text-slate-600`}>Question {safeQuestionIndex + 1} of {questions.length}</p>
          <h3 className={`${compactQuiz ? 'text-base' : 'text-xl sm:text-2xl'} font-black leading-tight text-slate-900`}>{question.prompt}</h3>
          <div className={`${compactQuiz ? 'mt-3 gap-2' : 'mt-5 gap-3'} grid md:grid-cols-2`}>
            {(question.options || []).map((option, oIndex) => {
              const isCorrect = oIndex === question.correctAnswer;
              const isSelected = selected === oIndex;
              const stateClass = !answered
                ? 'border-white/50 bg-white/70 text-slate-900 hover:bg-white/80 hover:shadow-sm hover:shadow-sm'
                : isCorrect
                  ? 'border-emerald-300/80 bg-emerald-400/25 text-emerald-700 shadow-sm'
                  : isSelected
                    ? 'border-rose-300/80 bg-rose-400/25 text-rose-700 shadow-sm'
                    : 'border-white/50 bg-white/70 text-slate-600/70';
              return <button key={`${option}-${oIndex}`} type="button" onClick={() => !answered && setAnswers(prev => ({ ...prev, [safeQuestionIndex]: oIndex }))} className={`${compactQuiz ? 'rounded-xl px-3 py-3 text-sm' : 'rounded-2xl px-4 py-4 sm:px-5'} border text-left font-bold transition ${stateClass}`}>{option}</button>;
            })}
          </div>
          {answered && <div className={`${compactQuiz ? 'mt-3 rounded-xl p-3 text-sm' : 'mt-6 rounded-2xl p-4'} border font-black ${selected === question.correctAnswer ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-700' : 'border-rose-300/50 bg-rose-400/15 text-rose-100'}`}>{selected === question.correctAnswer ? 'Correct! Great work.' : `Incorrect. Correct answer: ${question.options[question.correctAnswer]}`}</div>}
        </div>

        {submitted && (
          <div className={`${compactQuiz ? 'rounded-[1.15rem] p-3' : desktopQuizLayout ? 'col-start-1 row-start-4 rounded-3xl p-4' : 'rounded-3xl p-5'} shrink-0 border border-emerald-200/70 bg-emerald-50/80 shadow-sm backdrop-blur-xl`}>
            <p className={`${compactQuiz ? 'text-base' : 'text-xl'} font-black text-emerald-800`}>Quiz submitted: {score}/{questions.length}</p>
            <p className={`${compactQuiz ? 'mt-1 text-xs' : 'mt-2 text-sm'} font-bold text-emerald-700`}>{!canEarnEduCoins ? 'Upgrade to Pro or Elite to earn EduCoins from quizzes.' : rewardClaimed ? `✦ +${rewardCoins} EduCoins credited to your wallet.` : rewardCoins > 0 ? 'Reward already claimed for this quiz.' : 'No coin reward this time — revise and try another quiz.'}</p>
          </div>
        )}

        <div className={`${compactQuiz ? 'grid grid-cols-3 gap-1' : desktopQuizLayout ? 'col-start-1 row-start-5 grid gap-2 self-end' : 'flex gap-3 sm:items-center sm:justify-between sm:gap-4'} shrink-0`}>
          <button type="button" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion(index => Math.max(0, index - 1))} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-5 py-3'} border border-white/50 bg-white/70 font-black text-slate-900 transition hover:bg-white/80 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40`}>Previous</button>
          <div className={`${compactQuiz ? 'contents' : desktopQuizLayout ? 'grid gap-3' : 'grid gap-3 sm:flex'}`}>
            <button type="button" onClick={() => isLastQuestion ? setCurrentQuestion(0) : setCurrentQuestion(index => Math.min(questions.length - 1, index + 1))} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-6 py-3'} bg-cyan-200 font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-cyan-50`}>{isLastQuestion ? 'Review' : 'Next'}</button>
            <button type="button" disabled={!allAnswered || submitted} onClick={submitQuiz} className={`${compactQuiz ? 'rounded-lg px-1.5 py-1.5 text-[11px]' : desktopQuizLayout ? 'rounded-2xl px-4 py-2.5 text-sm' : 'rounded-2xl px-6 py-3'} bg-gradient-to-r from-indigo-500 to-amber-400 font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50`}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CoursePlayer: React.FC<{
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  product: ProductWithRating;
  currentUser?: User | null;
  onBack: () => void;
  onUpgrade: () => void;
  onQuizReward?: (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => boolean;
  productAccess?: ProductAccessState | null;
  onPurchaseLatestUpdate?: (product: ProductWithRating, updateId?: string) => void;
  onEducoinUnlockComplete?: (product: ProductWithRating, updateIds: string[]) => void;
}> = ({ settings, economySettings, product, currentUser = null, onBack, onUpgrade, onQuizReward, productAccess = null, onPurchaseLatestUpdate, onEducoinUnlockComplete }) => {
  const viewport = useViewportSize();
  const [activeFile, setActiveFile] = useState<ProductFile | null>(null);
  const [mediaHasError, setMediaHasError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => getViewportMetrics().width < 900);
  const [modulePanelResetKey, setModulePanelResetKey] = useState(0);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMentorOpen, setIsMentorOpen] = useState(false);
  const youtubePlayerRef = useRef<any>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoFullscreenSnapshotRef = useRef<{
    activeFileId: string;
    activeFileType: ProductFile['type'];
    currentTime?: number;
    wasPlaying?: boolean;
    requestedMobileLandscape: boolean;
    timestamp: number;
  } | null>(null);
  const youtubeTickTimerRef = useRef<number | null>(null);
  const youtubeSessionRef = useRef<{
    sessionId: string;
    userId: string;
    courseId: string;
    videoId: string;
    youtubeVideoId: string;
    validWatchedSeconds: number;
    lastPlaybackPosition: number;
    isFlushing: boolean;
  } | null>(null);
  const [youtubeRewardNotice, setYoutubeRewardNotice] = useState('');
  const [isYoutubeShellFullscreen, setIsYoutubeShellFullscreen] = useState(false);
  const [educoinBalance, setEducoinBalance] = useState(getEducoinBalance(currentUser));
  const [educoinNotice, setEducoinNotice] = useState('');
  const [youtubeWatchSeconds, setYoutubeWatchSeconds] = useState(0);

  const currentUserId = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');
  const hasPremiumAccess = hasPremiumMembership(currentUser);
  const eduCoinMultiplier = getUserEduCoinMultiplier(currentUser);
  const subscriptionPage = normalizeSubscriptionPageContent(settings.content.subscriptionPage);
  const courseContent = useMemo(() => ensureCourseIntroModule(product), [product]);


  const stopYoutubeTickTimer = useCallback(() => {
    if (youtubeTickTimerRef.current !== null) {
      window.clearInterval(youtubeTickTimerRef.current);
      youtubeTickTimerRef.current = null;
    }
  }, []);

  const flushYoutubeCoins = useCallback(async (nextStatus: 'paused' | 'closed' | 'credited' = 'closed') => {
    if (!hasPremiumAccess) return 0;
    const session = youtubeSessionRef.current;
    if (!session || session.isFlushing) return 0;

    session.isFlushing = true;
    stopYoutubeTickTimer();

    try {
      const player = youtubePlayerRef.current;
      const lastPosition = Number(player?.getCurrentTime?.() || session.lastPlaybackPosition || 0);
      session.lastPlaybackPosition = Math.max(session.lastPlaybackPosition, lastPosition);

      const creditedCoins = await creditWatchSessionCoins({
        sessionId: session.sessionId,
        userId: session.userId,
        courseId: session.courseId,
        videoId: session.videoId,
        youtubeVideoId: session.youtubeVideoId,
        validWatchedSeconds: session.validWatchedSeconds,
        lastPlaybackPosition: session.lastPlaybackPosition,
      });

      if (nextStatus === 'paused') {
        await markWatchSessionPaused(session.sessionId).catch(() => undefined);
      }

      if (creditedCoins > 0) {
        setYoutubeRewardNotice(`+${creditedCoins} EduCoin credited for ${creditedCoins * EDUCOIN_SECONDS_PER_COIN}s valid YouTube watch time.`);
      }

      return creditedCoins;
    } catch (error) {
      console.warn('YouTube EduCoin flush failed:', error);
      return 0;
    } finally {
      session.isFlushing = false;
    }
  }, [hasPremiumAccess, stopYoutubeTickTimer]);

  const handlePlayerBack = () => {
    if (isMentorOpenRef.current) {
      closeCourseMentor();
      return;
    }

    if (
      typeof window !== 'undefined'
      && forceOverlaySidebarRef.current
      && window.history.state?.dcView === 'coursePlayer'
    ) {
      window.history.back();
      return;
    }

    resetCourseModulePanel();
    void flushYoutubeCoins('closed');
    onBack();
  };

  useEffect(() => {
    const findFirstAccessibleFile = (modules?: CourseModule[]): ProductFile | null => {
      if (!modules) return null;

      for (const moduleItem of modules) {
        if (!hasCoursePlayerItemAccess(product.id, moduleItem, productAccess)) continue;

        const firstUnlockedFile = (moduleItem.files || []).find(file => hasCoursePlayerItemAccess(product.id, file, productAccess));
        if (firstUnlockedFile) return firstUnlockedFile;

        const found = findFirstAccessibleFile(moduleItem.modules || []);
        if (found) return found;
      }

      return null;
    };

    const findAccessibleFileById = (modules: CourseModule[] | undefined, fileId: string): ProductFile | null => {
      if (!modules || !fileId) return null;

      for (const moduleItem of modules) {
        if (!hasCoursePlayerItemAccess(product.id, moduleItem, productAccess)) continue;

        const matchedFile = (moduleItem.files || []).find(file =>
          file.id === fileId && hasCoursePlayerItemAccess(product.id, file, productAccess)
        );

        if (matchedFile) return matchedFile;

        const nestedMatch = findAccessibleFileById(moduleItem.modules || [], fileId);
        if (nestedMatch) return nestedMatch;
      }

      return null;
    };

    setActiveFile(previousFile => {
      if (previousFile?.id) {
        const preservedFile = findAccessibleFileById(courseContent, previousFile.id);
        if (preservedFile) return preservedFile;
      }

      return findFirstAccessibleFile(courseContent);
    });
  }, [courseContent, product.id, productAccess]);

  useEffect(() => {
    setMediaHasError(false);
  }, [activeFile]);

  const backgroundImage = useMemo(() => getCourseBackground(product, activeFile), [product, activeFile]);
  const isAudioExperience = activeFile?.type === 'audio';
  const accentGlow = settings.theme?.accentColor || '#a5f3fc';
  const forceOverlaySidebar = viewport.width < 900 || viewport.height < 560 || viewport.isTinyPlayer || viewport.isLandscapeCompact;
  const useDesktopSidebar = !forceOverlaySidebar && !isDesktopSidebarCollapsed;
  const compactPlayerChrome = viewport.isShortHeight || viewport.isTinyPlayer || viewport.isLandscapeCompact;
  const shouldUseMobileVideoFullscreen = viewport.width < 1024 || viewport.isLandscapeCompact;
  const isSidebarOpenRef = useRef(isSidebarOpen);
  const isMentorOpenRef = useRef(isMentorOpen);
  const forceOverlaySidebarRef = useRef(forceOverlaySidebar);
  const courseHistoryRestoringRef = useRef(false);
  const courseHistoryReadyRef = useRef(false);

  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen;
    isMentorOpenRef.current = isMentorOpen;
    forceOverlaySidebarRef.current = forceOverlaySidebar;
  }, [isSidebarOpen, isMentorOpen, forceOverlaySidebar]);

  const writeCourseHistoryLayer = useCallback((layer: 'modules' | 'mentor' | null, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') return;
    const currentLayer = window.history.state?.dcCourseLayer || null;
    if (mode === 'push' && currentLayer === layer) return;
    const nextState = {
      ...(window.history.state || {}),
      dcView: 'coursePlayer',
      dcCourseLayer: layer,
      dcCourseProductId: product.id,
      dcCourseFileId: activeFile?.id || null,
      dcCourseLessonSelection: false,
      dcCourseBackStep: layer === 'mentor' ? 'mentor' : layer === 'modules' ? 'transient-open' : 'closed-cycle',
    };

    if (mode === 'push') window.history.pushState(nextState, '', window.location.href);
    else window.history.replaceState(nextState, '', window.location.href);
  }, [activeFile?.id, product.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    courseHistoryReadyRef.current = false;
    const timer = window.setTimeout(() => {
      const sharedState = {
        ...(window.history.state || {}),
        dcView: 'coursePlayer',
        dcAppEntry: true,
        dcCourseProductId: product.id,
        dcCourseFileId: activeFile?.id || null,
        dcCourseLessonSelection: false,
      };
      const exitReadyModulesState = {
        ...sharedState,
        dcCourseLayer: 'modules',
        dcCourseBackStep: 'exit-ready',
      };
      const closedCycleState = {
        ...sharedState,
        dcCourseLayer: null,
        dcCourseBackStep: 'closed-cycle',
      };
      const initialModulesState = {
        ...sharedState,
        dcCourseLayer: 'modules',
        dcCourseBackStep: 'initial-open',
      };

      if (window.history.state?.dcView === 'coursePlayer') {
        window.history.replaceState(exitReadyModulesState, '', window.location.href);
      } else {
        window.history.pushState(exitReadyModulesState, '', window.location.href);
      }
      window.history.pushState(closedCycleState, '', window.location.href);
      window.history.pushState(initialModulesState, '', window.location.href);

      courseHistoryReadyRef.current = true;
      setIsMentorOpen(false);
      if (forceOverlaySidebarRef.current) setIsSidebarOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      courseHistoryReadyRef.current = false;
    };
  }, [product.id]);

  const closeCourseLayerHistory = useCallback((layer: 'modules' | 'mentor') => {
    if (typeof window !== 'undefined' && window.history.state?.dcView === 'coursePlayer' && window.history.state?.dcCourseLayer === layer) {
      window.history.back();
    }
  }, []);

  const resetCourseModulePanel = useCallback(() => {
    setModulePanelResetKey(value => value + 1);
  }, []);

  const closeCourseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    closeCourseLayerHistory('modules');
  }, [closeCourseLayerHistory]);

  const closeCourseSidebarAfterLessonSelection = useCallback((fileId: string) => {
    setIsSidebarOpen(false);

    if (typeof window === 'undefined' || !forceOverlaySidebarRef.current) {
      closeCourseLayerHistory('modules');
      return;
    }

    const currentState = window.history.state || {};
    if (currentState.dcView !== 'coursePlayer' || currentState.dcCourseLayer !== 'modules') {
      closeCourseLayerHistory('modules');
      return;
    }

    window.history.replaceState({
      ...currentState,
      dcCourseFileId: fileId,
      dcCourseLessonSelection: false,
    }, '', window.location.href);
    window.history.pushState({
      ...currentState,
      dcView: 'coursePlayer',
      dcCourseLayer: null,
      dcCourseProductId: product.id,
      dcCourseFileId: fileId,
      dcCourseLessonSelection: true,
      dcCourseBackStep: 'lesson-closed',
    }, '', window.location.href);
  }, [closeCourseLayerHistory, product.id]);

  const openCourseSidebar = useCallback(() => {
    setIsMentorOpen(false);
    setIsSidebarOpen(true);
  }, []);

  const toggleCourseSidebar = useCallback(() => {
    if (isSidebarOpenRef.current) closeCourseSidebar();
    else openCourseSidebar();
  }, [closeCourseSidebar, openCourseSidebar]);

  const closeCourseMentor = useCallback(() => {
    setIsMentorOpen(false);
    closeCourseLayerHistory('mentor');
  }, [closeCourseLayerHistory]);

  const openCourseMentor = useCallback(() => {
    if (forceOverlaySidebarRef.current) setIsSidebarOpen(false);
    setIsMentorOpen(true);
  }, []);

  const toggleCourseMentor = useCallback(() => {
    if (isMentorOpenRef.current) closeCourseMentor();
    else openCourseMentor();
  }, [closeCourseMentor, openCourseMentor]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleCoursePopState = (event: PopStateEvent) => {
      const state = event.state || {};
      if (state.dcView !== 'coursePlayer') return;

      courseHistoryRestoringRef.current = true;
      const layer = state.dcCourseLayer === 'mentor' || state.dcCourseLayer === 'modules'
        ? state.dcCourseLayer
        : null;

      setIsMentorOpen(layer === 'mentor');
      if (forceOverlaySidebarRef.current) setIsSidebarOpen(layer === 'modules');
      window.setTimeout(() => {
        courseHistoryRestoringRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handleCoursePopState);
    return () => window.removeEventListener('popstate', handleCoursePopState);
  }, []);

  useEffect(() => {
    if (!courseHistoryReadyRef.current || courseHistoryRestoringRef.current) return;
    if (isMentorOpen) {
      writeCourseHistoryLayer('mentor', 'push');
      return;
    }
    if (isSidebarOpen && forceOverlaySidebar) {
      writeCourseHistoryLayer('modules', 'push');
    }
  }, [forceOverlaySidebar, isMentorOpen, isSidebarOpen, writeCourseHistoryLayer]);

  const captureVideoFullscreenSnapshot = useCallback((requestedMobileLandscape = false) => {
    if (!activeFile || (activeFile.type !== 'youtube' && activeFile.type !== 'video')) return;

    let currentTime: number | undefined;
    let wasPlaying: boolean | undefined;

    if (activeFile.type === 'youtube') {
      const player = youtubePlayerRef.current;
      currentTime = Number(player?.getCurrentTime?.() || 0);
      wasPlaying = player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
    } else {
      const video = nativeVideoRef.current;
      currentTime = video?.currentTime;
      wasPlaying = video ? !video.paused : undefined;
    }

    videoFullscreenSnapshotRef.current = {
      activeFileId: activeFile.id,
      activeFileType: activeFile.type,
      currentTime,
      wasPlaying,
      requestedMobileLandscape,
      timestamp: Date.now(),
    };
  }, [activeFile]);

  const tryLockMobileVideoOrientation = useCallback(async () => {
    if (!shouldUseMobileVideoFullscreen) return;

    const orientation = screen.orientation as (ScreenOrientation & { lock?: (orientation: string) => Promise<void> }) | undefined;
    if (!orientation?.lock) return;

    try {
      await orientation.lock('landscape');
    } catch (error) {
      console.warn('Course video landscape orientation lock unavailable. Continuing fullscreen playback.', error);
    }
  }, [shouldUseMobileVideoFullscreen]);

  const tryUnlockMobileVideoOrientation = useCallback(() => {
    const snapshot = videoFullscreenSnapshotRef.current;
    if (!snapshot?.requestedMobileLandscape) return;

    try {
      screen.orientation?.unlock?.();
    } catch (error) {
      console.warn('Course video orientation unlock unavailable.', error);
    } finally {
      videoFullscreenSnapshotRef.current = null;
    }
  }, []);

  const youtubeFrameId = useMemo(() => {
    if (activeFile?.type !== 'youtube') return '';
    return `youtube-player-${product.id}-${activeFile.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }, [activeFile?.id, activeFile?.type, product.id]);

  const youtubeShellId = useMemo(() => {
    if (activeFile?.type !== 'youtube') return '';
    return `${youtubeFrameId}-shell`;
  }, [activeFile?.type, youtubeFrameId]);

  useEffect(() => {
    if (activeFile?.type !== 'youtube' || !youtubeFrameId) return undefined;

    const getElementSize = (element?: Element | null) => {
      const bounds = element?.getBoundingClientRect();
      if (!bounds?.width || !bounds?.height) return null;
      return {
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height),
      };
    };

    const resizeYouTubePlayer = () => {
      const player = youtubePlayerRef.current;
      if (!player?.setSize) return;

      const fullscreenElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const frame = document.getElementById(youtubeFrameId);
      const shell = youtubeShellId ? document.getElementById(youtubeShellId) : frame?.parentElement;
      const isYoutubeFullscreen = !!fullscreenElement && (fullscreenElement === frame || fullscreenElement === shell || shell?.contains(fullscreenElement));

      const fullscreenSize = isYoutubeFullscreen
        ? getElementSize(fullscreenElement) || getElementSize(shell) || getElementSize(frame)
        : null;
      const shellSize = getElementSize(shell);
      const viewport = window.visualViewport;
      const fallbackSize = isYoutubeFullscreen
        ? {
            width: Math.ceil(viewport?.width || window.innerWidth || screen.width || 0),
            height: Math.ceil(viewport?.height || window.innerHeight || screen.height || 0),
          }
        : {
            width: Math.ceil(viewport?.width || window.innerWidth || screen.width),
            height: Math.ceil(viewport?.height || window.innerHeight || screen.height),
          };
      const nextSize = fullscreenSize || shellSize || fallbackSize;

      player.setSize(nextSize.width, nextSize.height);
    };

    const syncFullscreenState = () => {
      const fullscreenElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const shell = youtubeShellId ? document.getElementById(youtubeShellId) : null;
      const isYoutubeFullscreen = !!fullscreenElement && fullscreenElement === shell;
      setIsYoutubeShellFullscreen(isYoutubeFullscreen);
      if (!isYoutubeFullscreen) tryUnlockMobileVideoOrientation();
    };

    const scheduleResize = () => {
      syncFullscreenState();
      [0, 120, 350, 800].forEach((delay) => window.setTimeout(resizeYouTubePlayer, delay));
    };

    scheduleResize();
    document.addEventListener('fullscreenchange', scheduleResize);
    document.addEventListener('webkitfullscreenchange', scheduleResize as EventListener);
    window.addEventListener('resize', scheduleResize);
    window.visualViewport?.addEventListener('resize', scheduleResize);

    return () => {
      document.removeEventListener('fullscreenchange', scheduleResize);
      document.removeEventListener('webkitfullscreenchange', scheduleResize as EventListener);
      window.removeEventListener('resize', scheduleResize);
      window.visualViewport?.removeEventListener('resize', scheduleResize);
    };
  }, [activeFile?.type, tryUnlockMobileVideoOrientation, youtubeFrameId, youtubeShellId]);

  const toggleYoutubeShellFullscreen = useCallback(async () => {
    if (activeFile?.type !== 'youtube' || !youtubeShellId) return;

    const shell = document.getElementById(youtubeShellId) as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!shell) return;

    const fullscreenElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
    const exitFullscreen = document.exitFullscreen?.bind(document) || (document as any).webkitExitFullscreen?.bind(document);

    try {
      if (fullscreenElement === shell) {
        await exitFullscreen?.();
        return;
      }

      captureVideoFullscreenSnapshot(shouldUseMobileVideoFullscreen);
      const requestFullscreen = shell.requestFullscreen?.bind(shell) || shell.webkitRequestFullscreen?.bind(shell);
      if (!requestFullscreen) return;
      await requestFullscreen();
      await tryLockMobileVideoOrientation();
    } catch (error) {
      console.warn('Course YouTube fullscreen toggle failed:', error);
    }
  }, [activeFile?.type, captureVideoFullscreenSnapshot, shouldUseMobileVideoFullscreen, tryLockMobileVideoOrientation, youtubeShellId]);


  useEffect(() => {
    const handleFullscreenExit = () => {
      const fullscreenElement = document.fullscreenElement || (document as any).webkitFullscreenElement;
      if (!fullscreenElement) tryUnlockMobileVideoOrientation();
    };

    document.addEventListener('fullscreenchange', handleFullscreenExit);
    document.addEventListener('webkitfullscreenchange', handleFullscreenExit as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenExit);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenExit as EventListener);
    };
  }, [tryUnlockMobileVideoOrientation]);

  const enterNativeVideoFullscreen = useCallback(async () => {
    if (activeFile?.type !== 'video') return;

    const video = nativeVideoRef.current as (HTMLVideoElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!video) return;

    const wasPlaying = !video.paused;
    const currentTime = video.currentTime;
    captureVideoFullscreenSnapshot(shouldUseMobileVideoFullscreen);

    try {
      const requestFullscreen = video.requestFullscreen?.bind(video) || video.webkitRequestFullscreen?.bind(video);
      if (requestFullscreen) {
        await requestFullscreen();
        await tryLockMobileVideoOrientation();
      } else if (video.webkitEnterFullscreen) {
        video.addEventListener('webkitendfullscreen', tryUnlockMobileVideoOrientation, { once: true });
        video.webkitEnterFullscreen();
        await tryLockMobileVideoOrientation();
      } else {
        return;
      }

      if (Number.isFinite(currentTime) && Math.abs(video.currentTime - currentTime) > 1) {
        video.currentTime = currentTime;
      }
      if (wasPlaying && video.paused) {
        await video.play().catch(() => undefined);
      }
    } catch (error) {
      videoFullscreenSnapshotRef.current = null;
      console.warn('Course native video fullscreen request failed:', error);
    }
  }, [activeFile?.type, captureVideoFullscreenSnapshot, shouldUseMobileVideoFullscreen, tryLockMobileVideoOrientation, tryUnlockMobileVideoOrientation]);

  useEffect(() => {
    if (!hasPremiumAccess || activeFile?.type !== 'youtube') return undefined;

    const youtubeVideoId = getYouTubeVideoIdFromFile(activeFile);
    if (!youtubeVideoId || !currentUserId || !youtubeFrameId) return undefined;

    let cancelled = false;
    const sessionId = `${currentUserId}_${product.id}_${activeFile.id}_${Date.now()}`;

    youtubeSessionRef.current = {
      sessionId,
      userId: currentUserId,
      courseId: String(product.id),
      videoId: activeFile.id,
      youtubeVideoId,
      validWatchedSeconds: 0,
      lastPlaybackPosition: 0,
      isFlushing: false,
    };
    setYoutubeWatchSeconds(0);
    setYoutubeRewardNotice('');

    startWatchSession({
      sessionId,
      userId: currentUserId,
      courseId: String(product.id),
      videoId: activeFile.id,
      youtubeVideoId,
    }).catch((error) => console.warn('YouTube watch session start failed:', error));

    ensureYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;

      youtubePlayerRef.current = new window.YT.Player(youtubeFrameId, {
        width: '100%',
        height: '100%',
        events: {
          onStateChange: (event: any) => {
            const playerState = event?.data;
            const playing = playerState === window.YT.PlayerState.PLAYING;
            const paused = playerState === window.YT.PlayerState.PAUSED;
            const ended = playerState === window.YT.PlayerState.ENDED;

            if (playing) {
              stopYoutubeTickTimer();
              youtubeTickTimerRef.current = window.setInterval(() => {
                const session = youtubeSessionRef.current;
                const player = youtubePlayerRef.current;
                if (!session || !player?.getCurrentTime) return;

                const currentPosition = Number(player.getCurrentTime() || 0);
                const delta = currentPosition - session.lastPlaybackPosition;

                if (delta > 0 && delta < 3) {
                  session.validWatchedSeconds += delta;
                  setYoutubeWatchSeconds(Math.floor(session.validWatchedSeconds));
                }

                session.lastPlaybackPosition = Math.max(session.lastPlaybackPosition, currentPosition);
              }, 1000);
            }

            if (paused) {
              void flushYoutubeCoins('paused');
            }

            if (ended) {
              void flushYoutubeCoins('credited');
            }
          },
        },
      });
    });

    const handleBeforeUnload = () => {
      void flushYoutubeCoins('closed');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void flushYoutubeCoins('closed');
      try {
        youtubePlayerRef.current?.destroy?.();
      } catch {
        // Ignore YouTube iframe destroy errors.
      }
      youtubePlayerRef.current = null;
      youtubeSessionRef.current = null;
      stopYoutubeTickTimer();
    };
  }, [activeFile, currentUserId, flushYoutubeCoins, hasPremiumAccess, product.id, stopYoutubeTickTimer, youtubeFrameId]);

  const unlockContentWithEducoins = async (item: CourseModule | ProductFile) => {
    const requiredCoins = getRequiredEducoins(item);
    if (!currentUserId) { setEducoinNotice('Please login to unlock content with EduCoins.'); return; }
    if (!hasPremiumAccess) { setEducoinNotice('Upgrade to Pro or Elite to unlock paid modules with EduCoins.'); return; }
    if (requiredCoins <= 0) return;
    const updateId = resolveCoursePlayerUpdateId(product.id, item);
    if (productAccess?.ownedUpdateIds.includes(updateId)) { setEducoinNotice('This content is already unlocked.'); return; }
    if (educoinBalance < requiredCoins) { setEducoinNotice(`You need ${requiredCoins} Educoin. Your balance is ${educoinBalance}.`); return; }
    try {
      const result = await runTransaction(db, async transaction => {
        const userRef = doc(db, 'users', currentUserId);
        const userSnap = await transaction.get(userRef);
        const data = userSnap.data() || {};
        const balance = Math.max(0, Number(data.coinBalance ?? data.eduCoins ?? educoinBalance) || 0);
        const purchasedProductUpdateIds = { ...((data as any).purchasedProductUpdateIds || {}) };
        const productKey = String(product.id);
        const ownedIds = Array.isArray(purchasedProductUpdateIds[productKey]) ? purchasedProductUpdateIds[productKey].map(String) : [];
        if (ownedIds.includes(updateId)) return { balance, alreadyUnlocked: true, updates: ownedIds };
        if (balance < requiredCoins) throw new Error(`You need ${requiredCoins} Educoin. Your balance is ${balance}.`);
        const nextBalance = balance - requiredCoins;
        const nextUpdates = [...new Set([...ownedIds, updateId])];
        purchasedProductUpdateIds[productKey] = nextUpdates;
        transaction.set(userRef, { coinBalance: nextBalance, eduCoins: nextBalance, purchasedProductUpdateIds, updatedAt: serverTimestamp() }, { merge: true });
        return { balance: nextBalance, alreadyUnlocked: false, updates: nextUpdates };
      });
      setEducoinBalance(result.balance);
      if (!result.alreadyUnlocked) onEducoinUnlockComplete?.(product, result.updates);
      setEducoinNotice(result.alreadyUnlocked ? 'This content is already unlocked.' : 'Content unlocked with Educoin.');
    } catch (error: any) {
      setEducoinNotice(error?.message || 'Educoin unlock failed. Please try again.');
    }
  };

  const onSelectFile = (file: ProductFile) => {
    void flushYoutubeCoins('closed');
    setActiveFile(file);
    setYoutubeRewardNotice('');
    setYoutubeWatchSeconds(0);
    closeCourseSidebarAfterLessonSelection(file.id);
    closeCourseMentor();
  };

  const requestPdfDownload = (file: ProductFile) => {
    triggerFileDownload(file);
  };

  const triggerFileDownload = (file: ProductFile) => {
    if (typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const completedYoutubeCoins = Math.floor(youtubeWatchSeconds / EDUCOIN_SECONDS_PER_COIN);

  const activeAudioTracks = useMemo<AudioTrack[]>(() => {
    if (activeFile?.type !== 'audio') return [];

    return [{
      id: activeFile.id,
      title: activeFile.name || 'Course audio',
      subtitle: product.title,
      url: activeFile.url,
      cover: backgroundImage,
    }];
  }, [activeFile, backgroundImage, product.title]);

  const modulePanelId = `course-module-panel-${product.id}`;

  useEffect(() => {
    if (!isSidebarOpen || useDesktopSidebar || typeof window === 'undefined') return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCourseSidebar();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeCourseSidebar, isSidebarOpen, useDesktopSidebar]);

  const YoutubeRewardChip = ({ compact = false }: { compact?: boolean }) => {
    if (!hasPremiumAccess || activeFile?.type !== 'youtube') return null;

    const mobileProgressLabel = `${completedYoutubeCoins}/${EDUCOIN_SECONDS_PER_COIN}s`;

    return (
      <div
        className={`${compact ? 'max-w-[42vw] px-2.5 py-1.5 text-[11px] sm:max-w-[16rem] sm:px-3 sm:text-xs' : 'max-w-full px-4 py-3 text-sm'} inline-flex min-w-0 shrink items-center gap-2 rounded-full border border-[#D8D2FF] bg-white/88 font-black text-[#4F46E5] shadow-[0_12px_30px_rgba(91,75,255,0.12)] backdrop-blur-xl`}
        aria-label="Valid YouTube watch time and EduCoin earning progress"
        aria-live="polite"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1EEFF] text-[11px] text-[#5B4BFF] shadow-inner" aria-hidden="true">▶</span>
        {youtubeRewardNotice ? (
          <span className="min-w-0 truncate text-emerald-700">+{completedYoutubeCoins || 1} EduCoin credited</span>
        ) : (
          <>
            <span className="min-w-0 truncate sm:hidden">{youtubeWatchSeconds}s · 🪙 {mobileProgressLabel}</span>
            <span className="hidden min-w-0 truncate sm:inline lg:hidden">YT {youtubeWatchSeconds}s · {mobileProgressLabel}</span>
            <span className="hidden min-w-0 truncate lg:inline">Valid YouTube watch: {youtubeWatchSeconds}s · Earned blocks: {completedYoutubeCoins} / every {EDUCOIN_SECONDS_PER_COIN}s</span>
          </>
        )}
      </div>
    );
  };

  const ThreeDotMenuIcon = () => (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#ded8ff] bg-[#ece7ff] text-slate-950 shadow-[0_10px_30px_rgba(89,71,242,0.10)]" aria-hidden="true">
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
    </span>
  );

  const renderMedia = () => {
    if (!activeFile) return <div className="flex h-full items-center justify-center bg-white/70 text-slate-900/70 backdrop-blur-xl">Select content to begin.</div>;
    if (mediaHasError) return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    switch (activeFile.type) {
      case 'youtube': {
        const videoId = getYouTubeVideoIdFromFile(activeFile);
        const originParam = typeof window !== 'undefined'
          ? `&origin=${encodeURIComponent(window.location.origin)}`
          : '';

        return videoId ? (
          <div id={youtubeShellId} className="course-youtube-player-shell relative h-full w-full overflow-hidden bg-black">
            <iframe
              key={`${activeFile.id}-${videoId}`}
              id={youtubeFrameId}
              className="course-youtube-iframe absolute inset-0 h-full w-full border-0 bg-black"
              width="100%"
              height="100%"
              style={{ width: '100%', height: '100%' }}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&fs=0${originParam}`}
              title={activeFile.name || 'YouTube lesson'}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setMediaHasError(false)}
              onError={() => setMediaHasError(true)}
            />
            <button
              type="button"
              onClick={toggleYoutubeShellFullscreen}
              className="course-youtube-fullscreen-button absolute bottom-20 right-4 z-20 flex items-center gap-2 rounded-full border border-white/25 bg-black/75 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/80"
              aria-label={isYoutubeShellFullscreen ? 'Exit lesson fullscreen' : 'Enter lesson fullscreen'}
            >
              <span aria-hidden="true">{isYoutubeShellFullscreen ? '⤢' : '⛶'}</span>
              <span>{isYoutubeShellFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          </div>
        ) : <VideoUnavailablePlaceholder />;
      }
      case 'video': return activeFile.sourceType === 'url' || activeFile.provider === 'drive' || activeFile.provider === 'external' || activeFile.embedUrl ? <PremiumCourseMediaCard file={activeFile} onError={() => setMediaHasError(true)} onVideoFullscreen={enterNativeVideoFullscreen} showFullscreen={!shouldUseMobileVideoFullscreen} /> : (
        <div className="course-native-video-shell relative h-full w-full overflow-hidden bg-black">
          <video
            key={activeFile.id}
            ref={nativeVideoRef}
            src={activeFile.url}
            controls
            playsInline
            className="course-native-video h-full w-full bg-black object-contain"
            onError={() => setMediaHasError(true)}
          />
          {shouldUseMobileVideoFullscreen && (
            <button
              type="button"
              onClick={enterNativeVideoFullscreen}
              className="course-native-video-fullscreen-button absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border border-white/25 bg-black/75 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/80"
              aria-label="Enter video fullscreen"
            >
              <span aria-hidden="true">⛶</span>
              <span>Fullscreen</span>
            </button>
          )}
        </div>
      );
      case 'audio': {
        if (activeFile.sourceType === 'url' || activeFile.provider === 'drive' || activeFile.provider === 'external' || activeFile.embedUrl) return <PremiumCourseMediaCard file={activeFile} onError={() => setMediaHasError(true)} />;
        return (
          <div className="flex h-full min-h-0 w-full bg-[#d5fbff]/70 text-slate-900">
            <ProductMusicPlayer
              tracks={activeAudioTracks}
              title={activeFile.name || product.title}
              variant="full"
              className="h-full w-full"
              initialTrackId={activeFile.id}
              onError={() => setMediaHasError(true)}
              density={viewport.width < 760 || viewport.height < 720 ? 'compact' : 'comfortable'}
            />
          </div>
        );
      }
      case 'pdf': return activeFile.url ? <HostedDocumentViewer file={activeFile} /> : <GlassDownloadCard file={activeFile} onDownloadRequest={requestPdfDownload} />;
      case 'sheet': return <GlassDownloadCard file={activeFile} />;
      case 'doc':
      case 'ebook': return <SmartDocsWorkspace file={activeFile} productId={product.id} />;
      case 'link': return isHostedDocsFile(activeFile) ? <HostedDocumentViewer file={activeFile} /> : <ExternalResourceCard file={activeFile} />;
      case 'quiz': return <QuizPlayer file={activeFile} economySettings={economySettings} canEarnEduCoins={hasPremiumAccess} eduCoinMultiplier={eduCoinMultiplier} onQuizReward={onQuizReward} />;
      default: return <GlassDownloadCard file={activeFile} headline="Preview unavailable" />;
    }
  };

  return (
    <div className="course-player-mobile-scope relative flex h-[100dvh] min-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden text-slate-900 bg-[#f3f0ff]">
      <div className={`absolute inset-0 scale-110 bg-cover bg-center blur-2xl ${isAudioExperience ? 'opacity-[0.08]' : 'opacity-10'}`} style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className={isAudioExperience ? "absolute inset-0 bg-[linear-gradient(180deg,#d5fbff_0%,#c9f8ff_48%,#d8fbff_100%)]" : "absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(111,82,255,0.16),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(199,190,255,0.32),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(246,243,255,0.86),rgba(238,233,255,0.94))]"} />
      <div className="absolute -bottom-20 left-8 h-96 w-24 rotate-12 rounded-full opacity-50 blur-2xl" style={{ backgroundColor: isAudioExperience ? '#bdf7ff' : '#8b75ff' }} />
      <div className={`absolute -top-12 right-12 h-72 w-72 rounded-full blur-3xl ${isAudioExperience ? 'bg-[#c9f8ff]/70' : 'bg-[#d9d2ff]/45'}`} />

      <header className={`relative z-30 flex min-h-[56px] min-w-0 items-center gap-2 border-b border-[#ded8ff] bg-white/88 shadow-sm backdrop-blur-xl ${forceOverlaySidebar ? '' : 'lg:hidden'} ${compactPlayerChrome ? 'px-2 py-1.5' : 'px-3 py-2.5 sm:px-3 sm:py-3'}`} style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))', paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-[#6b5cff]/80 sm:text-[11px]">Now learning</p>
            <h1 className="truncate text-sm font-black leading-tight text-[#071735] sm:text-lg" title={activeFile?.name || product.title}>{activeFile?.name || product.title}</h1>
          </div>
          <YoutubeRewardChip compact />
          <button onClick={() => toggleCourseMentor()} className={`${viewport.isTinyPlayer ? 'h-10 px-2 text-xs' : 'h-11 px-3 text-xs sm:text-sm'} shrink-0 rounded-2xl border border-[#ded8ff] bg-white/85 font-black text-[#5947f2] shadow-[0_10px_30px_rgba(89,71,242,0.10)] transition hover:-translate-y-0.5 hover:bg-[#f7f5ff] focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/50`}>🧠 AI</button>
          {productAccess?.hasPaidLockedUpdates && onPurchaseLatestUpdate && !viewport.isTinyPlayer && (
            <button onClick={() => onPurchaseLatestUpdate(product)} className="course-player-paid-update-action eduvora-primary-action hidden h-11 shrink-0 items-center gap-2 rounded-[18px] border border-blue-500 px-4 text-xs font-black text-white shadow-[0_14px_34px_rgba(23,105,255,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(23,105,255,0.32)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:inline-flex">
              <span aria-hidden="true">▣</span> Unlock Update
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCourseSidebar}
          className={`${isSidebarOpen ? 'border-[#5B4BFF] bg-[#5B4BFF] text-white shadow-[0_16px_34px_rgba(91,75,255,0.28)]' : 'border-[#C9C2FF] bg-[#F1EEFF] text-[#071735] shadow-[0_14px_30px_rgba(91,75,255,0.16)]'} inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-3 font-black transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(91,75,255,0.22)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/60 focus:ring-offset-2 focus:ring-offset-white`}
          aria-label={isSidebarOpen ? 'Close modules' : 'Open modules'}
          aria-expanded={isSidebarOpen}
          aria-controls={modulePanelId}
        >
          <ModuleIcon className="h-5 w-5" />
          <span className="hidden text-sm sm:inline">Modules</span>
        </button>
      </header>

      <div onClick={closeCourseSidebar} className={`fixed inset-0 z-30 bg-white/70 backdrop-blur-sm transition ${useDesktopSidebar ? 'lg:hidden' : ''} ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />

      <main className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${compactPlayerChrome ? 'gap-1 p-1.5' : 'gap-2 p-2 sm:gap-3 sm:p-3 lg:p-3'}`} style={{ paddingLeft: 'max(0.375rem, env(safe-area-inset-left))', paddingRight: 'max(0.375rem, env(safe-area-inset-right))', paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
        <div className={`${forceOverlaySidebar ? 'hidden' : 'hidden lg:grid'} shrink-0 grid-cols-[minmax(18rem,1fr)_auto_minmax(18rem,1fr)] items-center gap-4 rounded-[1.75rem] border border-[#E3E8F5] bg-white/90 px-5 py-4 text-[#071735] shadow-[0_18px_45px_rgba(8,26,69,0.08)] backdrop-blur-2xl`}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#5B4BFF] to-[#7B61FF] text-white shadow-[0_14px_34px_rgba(91,75,255,0.22)]">
              <ModuleIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#5B4BFF]">Course Player</p>
              <h1 className="mt-1 truncate text-2xl font-black leading-tight text-[#071735]">{product.title}</h1>
              <p className="mt-1 truncate text-sm font-bold text-[#667085]">
                {activeFile?.name ? `Now learning: ${activeFile.name}` : 'Continue your learning journey'}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-center gap-3">
            <YoutubeRewardChip />
            <button onClick={() => { setIsDesktopSidebarCollapsed(value => !value); }} className="shrink-0 rounded-2xl border border-[#D9E7F8] bg-white px-5 py-3 text-base font-black text-[#071735] shadow-[0_8px_24px_rgba(8,26,69,0.06)] transition hover:-translate-y-0.5 hover:border-[#C9C2FF] hover:bg-[#F1EEFF] hover:text-[#5B4BFF]">
              {isDesktopSidebarCollapsed ? 'Show modules' : 'Minimize modules'}
            </button>
            <button onClick={() => toggleCourseMentor()} className="rounded-2xl border border-[#C9C2FF] bg-[#F1EEFF] px-6 py-3 text-base font-black text-[#5B4BFF] shadow-[0_14px_34px_rgba(91,75,255,0.14)] transition hover:-translate-y-0.5 hover:bg-white">
              🧠 {isMentorOpen ? 'Lesson View' : 'AI Mentor'}
            </button>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-3">
            <div className="min-w-0 rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-3 text-right shadow-[0_8px_24px_rgba(8,26,69,0.04)]">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7C879A]">Learning Mode</p>
              <p className="mt-1 truncate text-sm font-black text-[#22A06B]">In Progress</p>
            </div>
            <button onClick={handlePlayerBack} className="shrink-0 rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-black text-[#071735] shadow-[0_8px_24px_rgba(8,26,69,0.06)] transition hover:-translate-y-0.5 hover:border-[#C9C2FF] hover:bg-[#F1EEFF]" aria-label="Back to course details">
              ← Course details
            </button>
          </div>
        </div>

        <section className={`${useDesktopSidebar ? 'lg:grid-cols-[var(--course-sidebar-width)_minmax(0,1fr)]' : 'grid-cols-1'} grid min-h-0 min-w-0 flex-1 overflow-hidden gap-2 sm:gap-3`} style={{ ['--course-sidebar-width' as any]: 'clamp(18rem, 28vw, 28rem)' }}>
          <aside id={modulePanelId} className={`${useDesktopSidebar ? 'lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:translate-x-0 lg:overflow-hidden lg:rounded-2xl' : ''} fixed inset-y-0 left-0 z-40 w-[min(88svw,20rem)] max-w-full transform transition sm:w-80 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex h-full flex-col border-r border-[#ded8ff] bg-white/85 shadow-sm backdrop-blur-xl lg:rounded-2xl lg:border lg:border-[#ded8ff] lg:bg-white/85 lg:shadow-sm">
              <div className="shrink-0 border-b border-[#E3E8F5] bg-white/90 px-4 py-4 shadow-sm lg:border-[#E3E8F5] lg:py-5">
                <div className="rounded-[1.5rem] border border-[#D9E7F8] bg-gradient-to-br from-white via-[#F8FBFF] to-[#F1EEFF] p-4 shadow-[0_8px_24px_rgba(8,26,69,0.06)]">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="course-panel-icon-contrast flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_14px_34px_rgba(91,75,255,0.22)] ring-1 ring-[#dcd7ff]" style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: '#FFFFFF' }}>
                      <ModuleIcon className="h-6 w-6 text-white drop-shadow-sm" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#5B4BFF]">Course Panel</p>
                      <p className="truncate text-sm font-bold text-[#667085]">Modules, lessons, docs & quizzes</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <h2 className="line-clamp-2 min-w-0 flex-1 text-xl font-black leading-tight text-[#071735] sm:text-[25px]">{product.title}</h2>
                    <button type="button" onClick={closeCourseSidebar} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg font-black text-[#071735] shadow-sm transition hover:bg-[#F1EEFF] focus:outline-none focus:ring-2 focus:ring-[#7B61FF]/50 lg:hidden" aria-label="Close modules">×</button>
                  </div>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 sm:p-3">
                {courseContent.length > 0 ? courseContent.map((m, index) => (
                  <ModuleItem
                    key={`${modulePanelResetKey}-${m.id}`}
                    module={m}
                    productId={product.id}
                    productAccess={productAccess}
                    activeFile={activeFile}
                    onSelectFile={onSelectFile}
                    onPurchaseLatestUpdate={onPurchaseLatestUpdate ? (updateId?: string) => onPurchaseLatestUpdate(product, updateId) : undefined}
                    onUnlockWithEducoins={unlockContentWithEducoins}
                    educoinBalance={educoinBalance}
                    defaultExpanded={index === 0}
                    resetKey={modulePanelResetKey}
                  />
                )) : <p className="p-4 text-center font-semibold text-[#50527a]/70">No content added yet.</p>}
              </nav>
            </div>
          </aside>

          <div className={`course-player-content-frame relative min-h-0 min-w-0 overflow-hidden backdrop-blur-2xl ${
            isAudioExperience
              ? 'rounded-none border-0 bg-transparent shadow-none'
              : activeFile?.type === 'youtube'
                ? 'course-youtube-frame rounded-2xl border border-[#111827]/10 bg-black shadow-[0_20px_60px_rgba(8,26,69,0.10)] sm:rounded-3xl'
                : 'rounded-2xl border border-[#E3E8F5] bg-white/76 shadow-[0_20px_60px_rgba(8,26,69,0.06)] sm:rounded-3xl'
          }`}>
            {renderMedia()}
            {isMentorOpen && (
              <div className="absolute inset-0 z-50 flex items-stretch justify-end bg-slate-950/20 p-2 backdrop-blur-[2px] sm:p-3" aria-label="AI Mentor overlay">
                <div className="h-full w-full max-w-full overflow-y-auto sm:max-w-[34rem] lg:max-w-[40rem]">
                  {hasPremiumAccess ? (
                    <AiMentor
                      productTitle={product.title}
                      productId={product.id}
                      courseId={product.id}
                      activeFileId={activeFile?.id || null}
                      activeFileType={activeFile?.type || null}
                      activeContentName={activeFile?.name || null}
                      userId={currentUserId}
                      onClose={closeCourseMentor}
                    />
                  ) : (
                    <div className="flex min-h-full items-center justify-center p-2">
                      <MembershipUpgradeCard message={subscriptionPage.aiMentorLocked} onUpgrade={onUpgrade} onBack={closeCourseMentor} compact />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {educoinNotice && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{educoinNotice}</div>}
        </section>
      </main>

    </div>
  );
};

export default CoursePlayer;
