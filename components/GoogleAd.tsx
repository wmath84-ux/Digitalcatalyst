import React, { CSSProperties, useEffect, useId } from 'react';
import {
  REVIEW_SAFE_MIN_DETAIL_WORDS,
  REVIEW_SAFE_MIN_LIST_CARDS,
} from '../utils/reviewStableMode';

type GoogleAdVariant = 'display' | 'inFeed' | 'inArticle' | 'multiplex';

type GoogleAdPageType =
  | 'homepage'
  | 'news-list'
  | 'blog-list'
  | 'article'
  | 'guide'
  | 'product'
  | 'course'
  | 'blocked'
  | 'unknown';

interface GoogleAdProps {
  variant: GoogleAdVariant;
  className?: string;
  label?: string;
  style?: CSSProperties;
  pageType?: GoogleAdPageType;
  visibleWordCount?: number;
  realContentCardCount?: number;
  isContentLoaded?: boolean;
  disabled?: boolean;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const AD_CLIENT = 'ca-pub-7301571867236257';
const ADSENSE_SCRIPT_ID = 'digital-catalyst-adsense-script';

const adUnitConfig: Record<GoogleAdVariant, React.InsHTMLAttributes<HTMLModElement>> = {
  display: {
    style: { display: 'block' },
    'data-ad-client': AD_CLIENT,
    'data-ad-slot': '4271657770',
    'data-ad-format': 'auto',
    'data-full-width-responsive': 'true',
  },
  inFeed: {
    style: { display: 'block' },
    'data-ad-format': 'fluid',
    'data-ad-layout-key': '+27+oz-c-1o+lh',
    'data-ad-client': AD_CLIENT,
    'data-ad-slot': '5871679901',
  },
  inArticle: {
    style: { display: 'block', textAlign: 'center' },
    'data-ad-layout': 'in-article',
    'data-ad-format': 'fluid',
    'data-ad-client': AD_CLIENT,
    'data-ad-slot': '6092691665',
  },
  multiplex: {
    style: { display: 'block' },
    'data-ad-format': 'autorelaxed',
    'data-ad-client': AD_CLIENT,
    'data-ad-slot': '1262351058',
  },
};

const allowedListingPages: GoogleAdPageType[] = ['homepage', 'news-list', 'blog-list'];
const allowedDetailPages: GoogleAdPageType[] = ['article', 'guide', 'product', 'course'];

const canShowAd = ({
  pageType,
  visibleWordCount,
  realContentCardCount,
  isContentLoaded,
  disabled,
}: Pick<GoogleAdProps, 'pageType' | 'visibleWordCount' | 'realContentCardCount' | 'isContentLoaded' | 'disabled'>) => {
  if (disabled) return false;
  if (!isContentLoaded) return false;
  if (!pageType || pageType === 'unknown' || pageType === 'blocked') return false;

  if (allowedListingPages.includes(pageType)) {
    return (realContentCardCount ?? 0) >= REVIEW_SAFE_MIN_LIST_CARDS;
  }

  if (allowedDetailPages.includes(pageType)) {
    return (visibleWordCount ?? 0) >= REVIEW_SAFE_MIN_DETAIL_WORDS;
  }

  return false;
};

const ensureAdsenseScript = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  document.head.appendChild(script);
};

const GoogleAd: React.FC<GoogleAdProps> = ({
  variant,
  className = '',
  label,
  style,
  pageType = 'unknown' as GoogleAdPageType,
  visibleWordCount = 0,
  realContentCardCount = 0,
  isContentLoaded = false,
  disabled = false,
}) => {
  const id = useId();
  const config = adUnitConfig[variant];

  const shouldRenderAd = canShowAd({
    pageType,
    visibleWordCount,
    realContentCardCount,
    isContentLoaded,
    disabled,
  });

  useEffect(() => {
    if (!shouldRenderAd) return;

    ensureAdsenseScript();

    const pushAd = () => {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch (error) {
        console.warn('AdSense push skipped:', error);
      }
    };

    const timeout = window.setTimeout(pushAd, 100);
    return () => window.clearTimeout(timeout);
  }, [id, variant, shouldRenderAd]);

  if (!shouldRenderAd) return null;

  return (
    <div className={`google-ad-slot ${className}`} data-ad-variant={variant} style={style}>
      {label && <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>}
      <ins key={`${variant}-${id}`} className="adsbygoogle" {...config} />
    </div>
  );
};

export default GoogleAd;
