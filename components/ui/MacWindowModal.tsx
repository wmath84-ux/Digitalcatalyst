import React, { useEffect } from 'react';
import TrafficLights from './TrafficLights';

interface MacWindowModalProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  zIndex?: string;
  className?: string;
}

const MacWindowModal: React.FC<MacWindowModalProps> = ({ title, subtitle, children, onClose, maxWidth = 'max-w-3xl', zIndex = 'z-[80]', className = '' }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-white/70 backdrop-blur-xl animate-fade-in`} role="dialog" aria-modal="true" aria-labelledby="mac-modal-title" onMouseDown={onClose}>
      <div className={`w-full ${maxWidth} max-h-[92vh] overflow-hidden rounded-[1.75rem] border border-white/35 bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl animate-scale-in-up ${className}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200/70 bg-white/80 px-5 py-4 backdrop-blur-2xl">
          <TrafficLights onClose={onClose} />
          <div className="min-w-0">
            <h2 id="mac-modal-title" className="truncate text-lg font-black text-slate-900">{title}</h2>
            {subtitle && <p className="truncate text-xs font-medium text-slate-600">{subtitle}</p>}
          </div>
        </div>
        <div className="max-h-[calc(92vh-4.5rem)] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default MacWindowModal;
