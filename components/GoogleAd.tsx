import React, { CSSProperties, useEffect, useId } from 'react';
import { REVIEW_SAFE_MIN_DETAIL_WORDS, REVIEW_SAFE_MIN_LIST_CARDS, REVIEW_STABLE_MODE } from '../utils/reviewStableMode';

type GoogleAdVariant = 'display' | 'inFeed' | 'inArticle' | 'multiplex';
type AdPageType = 'homepage' | 'article' | 'guide' | 'blog-list' | 'news-list' | 'product' | 'course' | 'blocked' | 'unknown';

interface GoogleAdProps {
  variant: GoogleAdVariant;
  className?: string;
  label?: string;
  style?: CSSProperties;
  disabled?: boolean;
  pageType?: AdPageType;
  visibleWordCount?: number;
  realContentCardCount?: number;
  isContentLoaded?: boolean;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const AD_CLIENT = 'ca-pub-7301571867236257';
const ADSENSE_SCRIPT_ID = 'digital-catalyst-adsense-script';

const listPages: AdPageType[] = ['homepage', 'blog-list', 'news-list'];
const detailPages: AdPageType[] = ['article', 'guide', 'product', 'course'];

const canRenderAd = ({ disabled, pageType = 'unknown', visibleWordCount, realContentCardCount, isContentLoaded = true }: Pick<GoogleAdProps, 'disabled' | 'pageType' | 'visibleWordCount' | 'realContentCardCount' | 'isContentLoaded'>) => {
  if (disabled || !isContentLoaded) return false;
  if (pageType === 'blocked' || pageType === 'unknown') return false;
  if (REVIEW_STABLE_MODE && ![...listPages, ...detailPages].includes(pageType)) return false;
  if (listPages.includes(pageType)) return Number(realContentCardCount || 0) >= REVIEW_SAFE_MIN_LIST_CARDS;
  if (detailPages.includes(pageType)) return Number(visibleWordCount || 0) >= REVIEW_SAFE_MIN_DETAIL_WORDS;
  return false;
};

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

const GoogleAd: React.FC<GoogleAdProps> = ({ variant, className = '', label, style, disabled, pageType = 'unknown', visibleWordCount, realContentCardCount, isContentLoaded = true }) => {
  const id = useId();
  const config = adUnitConfig[variant];
  const shouldRender = canRenderAd({ disabled, pageType, visibleWordCount, realContentCardCount, isContentLoaded });

  useEffect(() => {
    if (!shouldRender) return;
    ensureAdsenseScript();
    const timeout = window.setTimeout(() => {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch (error) {
        console.warn('AdSense push skipped:', error);
      }
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [id, variant, shouldRender]);

  if (!shouldRender) return null;

  return (
    <div className={`google-ad-slot ${className}`} data-ad-variant={variant} style={style}>
      {label && <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>}
      <ins key={`${variant}-${id}`} className="adsbygoogle" {...config} />
    </div>
  );
};

export default GoogleAd;
