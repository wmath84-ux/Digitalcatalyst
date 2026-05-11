import React from 'react';

const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-[1.75rem] border border-white/25 bg-white/15 shadow-2xl backdrop-blur-2xl ${className}`}>{children}</div>
);

export default GlassCard;
