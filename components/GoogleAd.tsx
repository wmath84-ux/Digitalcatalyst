import React, { CSSProperties, useEffect, useId } from 'react';

type GoogleAdVariant = 'display' | 'inFeed' | 'inArticle' | 'multiplex';

interface GoogleAdProps {
  variant: GoogleAdVariant;
  className?: string;
  label?: string;
  style?: CSSProperties;
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

const GoogleAd: React.FC<GoogleAdProps> = ({ variant, className = '', label, style }) => {
  const id = useId();
  const config = adUnitConfig[variant];

  useEffect(() => {
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
  }, [id, variant]);

  return (
    <div className={`google-ad-slot ${className}`} data-ad-variant={variant} style={style}>
      {label && <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>}
      <ins key={`${variant}-${id}`} className="adsbygoogle" {...config} />
    </div>
  );
};

export default GoogleAd;
