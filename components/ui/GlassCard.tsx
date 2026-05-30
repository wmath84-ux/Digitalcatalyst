import React from 'react';

const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-[1.75rem] border border-white/50 bg-white/15 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl ${className}`}>{children}</div>
);

export default GlassCard;
