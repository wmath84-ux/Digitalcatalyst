import React, { forwardRef } from 'react';
import './liquidMetalButton.css';

export type LiquidMetalTone = 'silver' | 'blue' | 'dark';

export interface LiquidMetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: LiquidMetalTone;
}

const resetPointerEffect = (button: HTMLButtonElement) => {
  button.style.setProperty('--liquid-x', '50%');
  button.style.setProperty('--liquid-y', '35%');
  button.style.setProperty('--liquid-rotate-x', '0deg');
  button.style.setProperty('--liquid-rotate-y', '0deg');
};

const canTrackPointer = (pointerType: string) => {
  if (typeof window === 'undefined' || pointerType === 'touch') return false;

  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(({
  children,
  className = '',
  tone = 'blue',
  onBlur,
  onPointerLeave,
  onPointerMove,
  ...buttonProps
}, ref) => {
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(event);
    if (event.defaultPrevented || !canTrackPointer(event.pointerType)) return;

    const button = event.currentTarget;
    const bounds = button.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const x = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
    const rotateY = ((x - 50) / 50) * 7;
    const rotateX = ((50 - y) / 50) * 6;

    button.style.setProperty('--liquid-x', `${x}%`);
    button.style.setProperty('--liquid-y', `${y}%`);
    button.style.setProperty('--liquid-rotate-x', `${rotateX.toFixed(2)}deg`);
    button.style.setProperty('--liquid-rotate-y', `${rotateY.toFixed(2)}deg`);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(event);
    resetPointerEffect(event.currentTarget);
  };

  const handleBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    onBlur?.(event);
    resetPointerEffect(event.currentTarget);
  };

  return (
    <button
      ref={ref}
      data-liquid-tone={tone}
      className={`liquid-metal-button ${className}`.trim()}
      onBlur={handleBlur}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      {...buttonProps}
    >
      <span className="liquid-metal-button__content">{children}</span>
    </button>
  );
});

LiquidMetalButton.displayName = 'LiquidMetalButton';

export default LiquidMetalButton;
