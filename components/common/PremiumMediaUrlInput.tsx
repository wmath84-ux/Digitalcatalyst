import React, { useMemo, useState } from 'react';
import { MEDIA_LINK_NOT_LOADING_MESSAGE, MEDIA_PASTE_URL_MESSAGE, MEDIA_UPLOAD_FUTURE_MESSAGE, URL_FIRST_MEDIA_MODE_LABEL, getMediaModeHelperCopy, getStorageDisabledMessage } from '../../utils/mediaMode';

export type PremiumMediaKind = 'audio' | 'video' | 'image';
export type PremiumMediaUrlStatus = 'empty' | 'valid' | 'warning' | 'invalid';

const directAudioPattern = /\.(mp3|m4a|aac|wav|ogg|oga|opus)(?:$|[?#])/i;
const directVideoPattern = /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i;
const drivePattern = /https:\/\/(?:drive|docs)\.google\.com\//i;

const isHttpsUrl = (value: string) => {
  try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; }
};

const getStatusFor = (kind: PremiumMediaKind, value: string): PremiumMediaUrlStatus => {
  const trimmed = value.trim();
  if (!trimmed) return 'empty';
  if (!isHttpsUrl(trimmed)) return 'invalid';
  if (drivePattern.test(trimmed)) return 'valid';
  if (kind === 'audio') return directAudioPattern.test(trimmed) ? 'valid' : 'warning';
  if (kind === 'video') return directVideoPattern.test(trimmed) ? 'valid' : 'warning';
  return 'valid';
};

const PremiumMediaUrlInput: React.FC<{
  kind: PremiumMediaKind;
  value: string;
  onChange: (value: string) => void;
  onStatusChange?: (status: PremiumMediaUrlStatus) => void;
  label?: string;
  helperText?: string;
}> = ({ kind, value, onChange, onStatusChange, label, helperText }) => {
  const [helperOpen, setHelperOpen] = useState(false);
  const status = useMemo(() => getStatusFor(kind, value), [kind, value]);
  React.useEffect(() => onStatusChange?.(status), [onStatusChange, status]);
  const mediaLabel = kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : 'Image';
  const helperCopy = getMediaModeHelperCopy(mediaLabel.toLowerCase());
  const badge = status === 'valid' ? 'Preview ready' : status === 'warning' ? 'Fallback card ready' : status === 'invalid' ? 'URL needed' : 'Paste URL';
  const message = status === 'invalid' ? 'Please paste a valid https media URL.' : status === 'warning' ? MEDIA_LINK_NOT_LOADING_MESSAGE : status === 'valid' ? `${mediaLabel} URL ready.` : MEDIA_PASTE_URL_MESSAGE;

  return <section className="overflow-hidden rounded-[1.75rem] border border-[#D9E7F8] bg-white/85 shadow-[0_20px_60px_rgba(23,105,255,0.12)] backdrop-blur-xl">
    <div className="bg-gradient-to-r from-[#1769FF] to-[#7B61FF] p-4 text-white">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/75">{URL_FIRST_MEDIA_MODE_LABEL}</p>
      <h3 className="mt-1 text-xl font-black">{label || helperCopy.primaryAction}</h3>
      <p className="mt-2 text-sm font-bold text-white/85">{helperText || helperCopy.helper}</p>
    </div>
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
      <div>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://example.com/media.mp4" className="w-full rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold text-[#081A45] outline-none focus:border-[#1769FF] focus:ring-4 focus:ring-[#1769FF]/10" />
        <p className={`mt-3 rounded-2xl px-4 py-3 text-xs font-black ${status === 'valid' ? 'bg-emerald-50 text-emerald-700' : status === 'warning' ? 'bg-amber-50 text-amber-700' : status === 'invalid' ? 'bg-rose-50 text-rose-700' : 'bg-[#F8FBFF] text-[#536178]'}`}>{message}</p>
        <button type="button" onClick={() => setHelperOpen(open => !open)} className="mt-3 rounded-2xl border border-[#BFD7FF] bg-[#EEF6FF] px-4 py-2 text-xs font-black text-[#1769FF]">Need help getting a URL?</button>
        {helperOpen ? <div className="mt-3 rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] p-4 text-sm font-bold text-[#536178]"><p>{helperCopy.helper}</p><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><span className="rounded-2xl bg-white px-3 py-2 text-[#1769FF]">Primary: Paste URL</span><span className="rounded-2xl bg-white px-3 py-2 text-[#7C879A]">{MEDIA_UPLOAD_FUTURE_MESSAGE}</span></div><p className="mt-3 text-xs text-[#EF4444]">{getStorageDisabledMessage(mediaLabel)}</p></div> : null}
      </div>
      <div className="rounded-[1.5rem] border border-[#D9E7F8] bg-gradient-to-br from-[#EEF6FF] via-white to-[#F1EEFF] p-4 text-center">
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#1769FF]">{badge}</span>
        <div className="mt-4 flex aspect-video items-center justify-center rounded-2xl bg-white/75 text-5xl shadow-inner">{kind === 'audio' ? '🎧' : kind === 'video' ? '▶️' : '🖼️'}</div>
        <button type="button" onClick={() => onChange('')} className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-[#EF4444]">Remove</button>
      </div>
    </div>
  </section>;
};

export default PremiumMediaUrlInput;
