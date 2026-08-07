import React, { useLayoutEffect, useRef } from 'react';
import { toEditorHtml } from '../../utils/richText';

interface RichTextInputProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
}

const RichTextInput: React.FC<RichTextInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  compact = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = toEditorHtml(value);
    if (el.innerHTML !== current) el.innerHTML = current;
  }, [value]);

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      className={`rich-text-input ${compact ? 'rich-text-input-compact' : ''} ${className || ''}`}
      onInput={handleInput}
      onDrop={handleDrop}
    />
  );
};

export default RichTextInput;
