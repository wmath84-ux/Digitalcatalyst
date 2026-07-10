import React, { useEffect, useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import { isCloudinaryImageUploadConfigured, uploadImageToCloudinary } from '../../utils/cloudinaryUpload';

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
  invalidHttps: 'Enter a valid public https image URL.',
  notLoading: 'This image could not be loaded. Try another URL.',
  ready: 'Preview ready.',
  storageDisabled: 'Direct storage upload is unavailable.',
  saved: 'Image URL ready.',
};

const isHttpsImageUrl = (value: string) => {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

const aspectClass = (aspect: PremiumImageUrlInputProps['aspect']) => aspect === 'video' ? 'aspect-video' : aspect === 'original' ? 'min-h-56' : 'aspect-square';

const PremiumImageUrlInput: React.FC<PremiumImageUrlInputProps> = ({
  value,
  onChange,
  label = 'Image',
  helperText = 'Choose an image. The URL fills automatically; preview it, then save this form.',
  previewAlt = 'Image preview',
  aspect = 'square' as const,
  compact = false,
  onStatusChange,
  provider,
}) => {
  const trimmed = value.trim();
  const [status, setStatus] = useState<PremiumImageUrlStatus>(trimmed ? 'checking' : 'empty');
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [copied, setCopied] = useState(false);
  const cloudinaryReady = isCloudinaryImageUploadConfigured();
  const providerReady = Boolean((provider?.enabled && provider.upload) || cloudinaryReady);
  const providerLabel = provider?.label || 'Cloudinary';

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    if (!trimmed) {
      setStatus('empty');
      onStatusChange?.('empty');
      return undefined;
    }

    if (!isHttpsImageUrl(trimmed)) {
      setStatus('invalid');
      onStatusChange?.('invalid');
      return undefined;
    }

    setStatus('checking');
    onStatusChange?.('checking');
    const image = new Image();
    timer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus('invalid');
      onStatusChange?.('invalid');
    }, 10000);
    image.onload = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setStatus('valid');
      onStatusChange?.('valid');
    };
    image.onerror = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      setStatus('invalid');
      onStatusChange?.('invalid');
    };
    image.src = trimmed;

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, onStatusChange]);

  const statusText = useMemo(() => {
    if (providerBusy) return 'Uploading…';
    if (status === 'valid') return 'Preview ready';
    if (status === 'checking') return 'Checking image…';
    if (status === 'invalid') return IMAGE_URL_MESSAGES.notLoading;
    return 'No image selected';
  }, [providerBusy, status]);

  const uploadFile = async (file: File) => {
    setProviderBusy(true);
    setProviderError('');
    try {
      const upload = provider?.enabled && provider.upload ? provider.upload : uploadImageToCloudinary;
      const hostedUrl = await upload(file);
      onChange(hostedUrl);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Upload failed. Try again or paste a public URL.');
    } finally {
      setProviderBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setProviderError('Could not copy automatically. Select the URL manually.');
    }
  };

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{helperText}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-black ${status === 'valid' ? 'bg-emerald-50 text-emerald-700' : status === 'invalid' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{statusText}</span>
      </div>

      <div className={`mt-4 grid gap-4 ${compact ? 'md:grid-cols-[minmax(0,1fr)_180px]' : 'md:grid-cols-[minmax(0,1fr)_240px]'}`}>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">1 · Choose image</p>
            {providerReady ? (
              <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                <input type="file" accept="image/*" className="sr-only" disabled={providerBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ''; }} />
                {providerBusy ? `Uploading to ${providerLabel}…` : 'Choose image'}
              </label>
            ) : (
              <p className="mt-2 text-xs font-semibold text-amber-700">Direct upload is not configured. Use a public HTTPS URL below.</p>
            )}
          </div>

          <details className="rounded-xl border border-slate-200 bg-white p-3" open={!providerReady}>
            <summary className="cursor-pointer text-xs font-black text-slate-700">Use a public image URL instead</summary>
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://example.com/image.jpg" inputMode="url" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white" />
          </details>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!trimmed} onClick={copyUrl} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">{copied ? 'Copied' : 'Copy URL'}</button>
            <button type="button" disabled={!trimmed} onClick={() => onChange('')} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-40">Remove</button>
          </div>
          {providerError ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{providerError}</p> : null}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">2 · Check preview</p>
          <div className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${aspectClass(aspect)}`}>
            {trimmed && status !== 'invalid' ? <SafeImage src={trimmed} alt={previewAlt} aspect={aspect} loading="eager" fetchPriority="high" className="h-full w-full object-cover" fallbackTitle={previewAlt} fallbackBadge="Preview" fallbackIcon="🖼️" /> : <div className="flex h-full min-h-36 items-center justify-center p-4 text-center text-xs font-bold text-slate-500">Your image preview appears here.</div>}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">3 · Save the profile, post, product or settings form.</p>
        </div>
      </div>
    </section>
  );
};

export default PremiumImageUrlInput;
