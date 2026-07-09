import React, { useEffect, useMemo, useState } from 'react';

export type PremiumImageUrlStatus = 'empty' | 'checking' | 'valid' | 'invalid';

type ProviderConfig = {
  enabled?: boolean;
  label?: string;
  upload?: (file: File) => Promise<string>;
};

type PremiumImageUrlInputProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  previewAlt?: string;
  aspect?: 'square' | 'video' | 'original';
  compact?: boolean;
  onStatusChange?: (status: PremiumImageUrlStatus) => void;
  provider?: ProviderConfig;
};

export const IMAGE_URL_MESSAGES = {
  invalidHttps: 'Please paste a valid https image URL.',
  notLoading: 'This image link is not loading. Try another direct image URL.',
  ready: 'Image preview ready.',
  storageDisabled: 'Storage upload is currently disabled. Please use an image URL.',
  saved: 'Image URL saved successfully.',
};

const isHttpsImageUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

const aspectClass = (aspect: PremiumImageUrlInputProps['aspect']) => aspect === 'video' ? 'aspect-video' : aspect === 'original' ? 'min-h-56' : 'aspect-square';

const PremiumImageUrlInput: React.FC<PremiumImageUrlInputProps> = ({
  value,
  onChange,
  label = 'Image URL',
  helperText = 'Paste a direct https image link. The URL is saved as text; Firebase Storage upload is not used.',
  previewAlt = 'Image preview',
  aspect = 'square' as const,
  compact = false,
  onStatusChange,
  provider,
}) => {
  const [status, setStatus] = useState<PremiumImageUrlStatus>(value.trim() ? 'checking' : 'empty');
  const [message, setMessage] = useState(value.trim() ? 'Checking image…' : IMAGE_URL_MESSAGES.invalidHttps);
  const [helperOpen, setHelperOpen] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const trimmed = value.trim();
  const providerReady = Boolean(provider?.enabled && provider.upload);

  useEffect(() => {
    let cancelled = false;
    if (!trimmed) {
      setStatus('empty');
      setMessage(IMAGE_URL_MESSAGES.invalidHttps);
      onStatusChange?.('empty');
      return;
    }
    if (!isHttpsImageUrl(trimmed)) {
      setStatus('invalid');
      setMessage(IMAGE_URL_MESSAGES.invalidHttps);
      onStatusChange?.('invalid');
      return;
    }
    setStatus('checking');
    setMessage('Checking image…');
    onStatusChange?.('checking');
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setStatus('valid');
      setMessage(IMAGE_URL_MESSAGES.ready);
      onStatusChange?.('valid');
    };
    image.onerror = () => {
      if (cancelled) return;
      setStatus('invalid');
      setMessage(IMAGE_URL_MESSAGES.notLoading);
      onStatusChange?.('invalid');
    };
    image.src = trimmed;
    return () => { cancelled = true; };
  }, [trimmed, onStatusChange]);

  const badge = useMemo(() => status === 'valid' ? 'Image ready' : status === 'checking' ? 'Checking…' : status === 'invalid' && trimmed ? 'Broken link' : 'URL required', [status, trimmed]);

  const handleProviderFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file || !provider?.upload) return;
    setProviderBusy(true);
    try {
      const hostedUrl = await provider.upload(file);
      onChange(hostedUrl);
      setHelperOpen(false);
    } finally {
      setProviderBusy(false);
    }
  };

  return (
    <section className={`rounded-[1.75rem] border border-[#D9E7F8] bg-white/85 p-4 shadow-[0_18px_55px_rgba(23,105,255,0.10)] backdrop-blur-xl ${compact ? '' : 'sm:p-5'}`}>
      <div className={`grid gap-4 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start'}`}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#7B61FF]">Paste Image URL</p>
              <label className="mt-1 block text-lg font-black text-[#081A45]">{label}</label>
            </div>
            <button type="button" onClick={() => setHelperOpen(open => !open)} className="rounded-2xl border border-[#BFD7FF] bg-[#EEF6FF] px-4 py-2 text-xs font-black text-[#1769FF]">Need image URL?</button>
          </div>
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://example.com/image.jpg" className="mt-4 w-full rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold text-[#081A45] outline-none transition focus:border-[#1769FF] focus:ring-4 focus:ring-[#1769FF]/10" />
          <p className="mt-2 text-xs font-bold leading-5 text-[#536178]">{helperText}</p>
          <p className={`mt-3 rounded-2xl px-4 py-3 text-xs font-black ${status === 'valid' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'invalid' && trimmed ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-[#D9E7F8] bg-[#F8FBFF] text-[#536178]'}`}>{message}</p>
          {helperOpen ? (
            <div className="mt-4 rounded-[1.5rem] border border-[#D9E7F8] bg-gradient-to-br from-[#F8FBFF] via-white to-[#F1EEFF] p-4">
              <h3 className="text-base font-black text-[#081A45]">Smart Image-to-URL Helper</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">Image URL generate karne ke liye image ko kisi public image hosting service par upload karna hota hai. Firebase Storage abhi disabled hai, isliye direct website ke andar permanent image URL tabhi banega jab external image hosting provider connect hoga.</p>
              {providerReady ? (
                <label className="mt-4 inline-flex cursor-pointer rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-4 py-3 text-sm font-black text-white shadow-lg"><input type="file" accept="image/*" onChange={handleProviderFile} className="hidden" />{providerBusy ? 'Generating URL…' : `Generate with ${provider?.label || 'connected provider'}`}</label>
              ) : (
                <div className="mt-4 space-y-3 text-sm font-bold text-[#081A45]"><p className="rounded-2xl bg-white/80 p-3">1. Image ko public hosting service par upload karo.<br />2. Direct image link copy karo.<br />3. Yahan paste karo, preview check karo, phir save karo.</p><a href="https://postimages.org/" target="_blank" rel="noreferrer" className="inline-flex rounded-2xl border border-[#BFD7FF] bg-white px-4 py-3 text-sm font-black text-[#1769FF]">Open Image URL Generator</a><p className="text-xs text-[#C5221F]">{IMAGE_URL_MESSAGES.storageDisabled}</p></div>
              )}
            </div>
          ) : null}
        </div>
        <div className={`overflow-hidden rounded-[1.5rem] border bg-gradient-to-br from-[#EEF6FF] via-white to-[#F1EEFF] p-2 shadow-inner ${status === 'valid' ? 'border-[#7B61FF] shadow-[0_0_0_4px_rgba(123,97,255,0.10)]' : status === 'invalid' && trimmed ? 'border-rose-200' : 'border-[#D9E7F8]'}`}>
          <div className={`${aspectClass(aspect)} flex w-full items-center justify-center overflow-hidden rounded-[1.15rem] bg-white/80`}>
            {status === 'checking' ? <div className="h-full w-full animate-pulse bg-gradient-to-r from-[#EEF6FF] via-white to-[#E8F2FF]" /> : status === 'valid' ? <img src={trimmed} alt={previewAlt} className="h-full w-full object-contain" /> : <div className="p-6 text-center"><div className="text-5xl">🖼️</div><p className="mt-3 text-sm font-black text-[#536178]">Preview Image</p></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${status === 'valid' ? 'bg-emerald-100 text-emerald-700' : status === 'invalid' && trimmed ? 'bg-rose-100 text-rose-700' : 'bg-[#EEF6FF] text-[#1769FF]'}`}>{badge}</span><div className="flex gap-2"><button type="button" onClick={() => onChange('')} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-[#EF4444]">Remove Image</button><button type="button" onClick={() => setHelperOpen(true)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-[#1769FF]">Change URL</button></div></div>
        </div>
      </div>
    </section>
  );
};

export default PremiumImageUrlInput;
