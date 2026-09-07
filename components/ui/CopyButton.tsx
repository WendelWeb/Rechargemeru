'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './Button';
import { cn } from '@/lib/cn';

/** Copies text; falls back to a hidden textarea where the async clipboard is unavailable (http, old WebViews). */
async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type CopyButtonProps = {
  value: string;
  /** Idle label, e.g. « Copier ». */
  label?: string;
  /** Label shown for two seconds after a successful copy, e.g. « Copié ». */
  copiedLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  /** Hides the text and keeps only the icon (label becomes the accessible name). */
  iconOnly?: boolean;
};

export function CopyButton({
  value,
  label = 'Copier',
  copiedLabel = 'Copié',
  size = 'sm',
  variant = 'ghost',
  className,
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function onClick() {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const Icon = copied ? Check : Copy;
  const text = copied ? copiedLabel : label;

  return (
    <button
      type="button"
      onClick={onClick}
      className={buttonClasses(variant, size, cn(iconOnly && 'px-2.5', copied && 'text-mint-deep', className))}
      aria-label={iconOnly ? `${label} : ${value}` : undefined}
      title={iconOnly ? label : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {iconOnly ? null : text}
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </button>
  );
}
