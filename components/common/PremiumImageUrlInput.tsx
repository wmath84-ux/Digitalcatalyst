import React, { useEffect, useMemo, useState } from 'react';
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
  notLoading: 'Image URL could not be verified. Try another image or upload again.',
  ready: 'Image URL ready.',
  storageDisabled: 'Direct upload is unavailable.',
  saved: 'Image URL ready.',
};

const IMAGE_FILE_ACCEPT = 'image/*,.heic,.heif,image/heic,image/heif';

const isHttpsImageUrl = (value: string) => {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

const PremiumImageUrlInput: React.FC<PremiumImageUrlInputProps> = ({
  value,
  onChange,
  label = 'Image',
  helperText = 'Upload an image or paste a public HTTPS image URL. The URL is saved automatically in this form.',
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
  const [mode, setMode] = useState<'upload' | 'url'>(() => providerReady ? 'upload' : 'url');

  useEffect(() => {
    if (!providerReady) setMode('url');
  }, [providerReady]);

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
    if (providerBusy) return `Uploading to ${providerLabel}…`;
    if (status === 'valid') return IMAGE_URL_MESSAGES.ready;
    if (status === 'checking') return 'Checking…';
    if (status === 'invalid') return IMAGE_URL_MESSAGES.notLoading;
    return 'No image';
  }, [providerBusy, providerLabel, status]);

  const statusClass = status === 'valid'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : status === 'invalid'
      ? 'bg-rose-50 text-rose-700 ring-rose-100'
      : 'bg-slate-100 text-slate-600 ring-slate-200';

  const uploadFile = async (file: File) => {
    setProviderBusy(true);
    setProviderError('');
    try {
      const upload = provider?.enabled && provider.upload ? provider.upload : uploadImageToCloudinary;
      const hostedUrl = await upload(file);
      onChange(hostedUrl);
      setMode('upload');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Upload failed. Try again or paste a public HTTPS URL.');
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
    <section className={`rounded-[1.15rem] border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} shadow-[0_10px_30px_rgba(15,23,42,0.05)]`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900">{label}</p>
          {helperText ? <p className="mt-0.5 max-w-2xl text-[11px] font-semibold leading-4 text-slate-500">{helperText}</p> : null}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusClass}`}>{statusText}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => setMode('upload')} disabled={!providerReady} className={`rounded-xl px-3 py-2 text-xs font-black transition ${mode === 'upload' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'} disabled:cursor-not-allowed disabled:opacity-45`}>Upload image</button>
        <button type="button" onClick={() => setMode('url')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${mode === 'url' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>Use URL</button>
      </div>

      {mode === 'upload' ? (
        <div className="mt-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 p-3">
          {providerReady ? (
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)] transition hover:bg-blue-700">
              <input type="file" accept={IMAGE_FILE_ACCEPT} className="sr-only" disabled={providerBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ''; }} />
              {providerBusy ? `Uploading to ${providerLabel}…` : 'Choose image'}
            </label>
          ) : (
            <p className="text-xs font-bold leading-5 text-amber-700">Direct upload is not configured. Use a public HTTPS image URL.</p>
          )}
          <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">Supports JPG, PNG, WebP, GIF, HEIC and HEIF when your Cloudinary preset allows them.</p>
        </div>
      ) : (
        <label className="mt-3 block">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Public HTTPS image URL</span>
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://example.com/image.jpg" inputMode="url" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" />
        </label>
      )}

      {trimmed ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          <p className="truncate text-[11px] font-bold text-slate-500">{trimmed}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={copyUrl} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">{copied ? 'Copied' : 'Copy URL'}</button>
            <button type="button" onClick={() => onChange('')} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Remove</button>
          </div>
        </div>
      ) : null}

      {providerError ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-700">{providerError}</p> : null}
    </section>
  );
};

export default PremiumImageUrlInput;
