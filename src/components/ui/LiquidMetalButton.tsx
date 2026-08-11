import React, { forwardRef } from 'react';
import './liquidMetalButton.css';

export type LiquidMetalTone = 'silver' | 'blue' | 'dark';

export interface LiquidMetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: LiquidMetalTone;
}

const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(({
  children,
  className = '',
  tone = 'blue',
  ...buttonProps
}, ref) => (
  <button
    {...buttonProps}
    ref={ref}
    data-liquid-tone={tone}
    className={`liquid-metal-button eduvora-primary-action ${className}`.trim()}
  >
    <span className="liquid-metal-button__surface" aria-hidden="true" />
    <span className="liquid-metal-button__content">{children}</span>
  </button>
));

LiquidMetalButton.displayName = 'LiquidMetalButton';

export default LiquidMetalButton;
