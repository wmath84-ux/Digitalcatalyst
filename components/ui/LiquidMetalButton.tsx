import React, { forwardRef } from 'react';
import './liquidMetalButton.css';

export type LiquidMetalTone = 'silver' | 'blue' | 'dark';

export interface LiquidMetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: LiquidMetalTone;
}

const clickTimers = new WeakMap<HTMLButtonElement, number>();

const setPointerPosition = (
  button: HTMLButtonElement,
  clientX: number,
  clientY: number,
) => {
  const bounds = button.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const x = Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100));
  const y = Math.min(100, Math.max(0, ((clientY - bounds.top) / bounds.height) * 100));

  button.style.setProperty('--liquid-x', `${x}%`);
  button.style.setProperty('--liquid-y', `${y}%`);
};

const resetPointerEffect = (button: HTMLButtonElement) => {
  button.style.setProperty('--liquid-x', '50%');
  button.style.setProperty('--liquid-y', '35%');
};

const canTrackPointer = (pointerType: string) => {
  if (typeof window === 'undefined' || pointerType === 'touch') return false;

  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const restartClickEffect = (button: HTMLButtonElement) => {
  if (typeof window === 'undefined') return;

  const previousTimer = clickTimers.get(button);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);

  button.removeAttribute('data-liquid-clicked');
  window.requestAnimationFrame(() => {
    button.setAttribute('data-liquid-clicked', 'true');
    const timer = window.setTimeout(() => {
      button.removeAttribute('data-liquid-clicked');
      clickTimers.delete(button);
    }, 520);
    clickTimers.set(button, timer);
  });
};

const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(({
  children,
  className = '',
  tone = 'blue',
  onBlur,
  onClick,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  ...buttonProps
}, ref) => {
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(event);
    if (event.defaultPrevented || !canTrackPointer(event.pointerType)) return;
    setPointerPosition(event.currentTarget, event.clientX, event.clientY);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(event);
    if (event.defaultPrevented) return;
    setPointerPosition(event.currentTarget, event.clientX, event.clientY);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(event);
    resetPointerEffect(event.currentTarget);
  };

  const handleBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    onBlur?.(event);
    resetPointerEffect(event.currentTarget);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    restartClickEffect(event.currentTarget);
  };

  return (
    <button
      {...buttonProps}
      ref={ref}
      data-liquid-tone={tone}
      className={`liquid-metal-button ${className}`.trim()}
      onBlur={handleBlur}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
    >
      <span className="liquid-metal-button__ambient" aria-hidden="true" />
      <span className="liquid-metal-button__rim" aria-hidden="true" />
      <span className="liquid-metal-button__surface" aria-hidden="true" />
      <span className="liquid-metal-button__pulse" aria-hidden="true" />
      <span className="liquid-metal-button__content">{children}</span>
    </button>
  );
});

LiquidMetalButton.displayName = 'LiquidMetalButton';

export default LiquidMetalButton;
