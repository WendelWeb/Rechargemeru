import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardTone = 'paper' | 'mist' | 'ink';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const TONES: Record<CardTone, string> = {
  paper: 'border border-line bg-paper text-ink shadow-card',
  mist: 'bg-mist text-ink',
  ink: 'bg-ink text-paper',
};

/* Fluid: 16px of breathing room on a phone, 24-32px on a desk. */
const PADDINGS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-card',
  lg: 'p-card sm:p-8',
};

export type CardProps = Omit<ComponentProps<'div'>, 'children' | 'className' | 'ref'> & {
  as?: 'div' | 'section' | 'article' | 'aside';
  tone?: CardTone;
  padding?: CardPadding;
  className?: string;
  children: ReactNode;
};

/** A surface: paper with a hairline and soft shadow by default. */
export function Card({ as: Tag = 'div', tone = 'paper', padding = 'md', className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn('rounded-card', TONES[tone], PADDINGS[padding], className)} {...rest}>
      {children}
    </Tag>
  );
}

export type CardTitleSize = 'sm' | 'md' | 'lg';

/*
 * `cn()` joins, it does not merge: a `className="text-xl"` passed next to the
 * built-in size wins only by accident of stylesheet order. So the size is a
 * prop, and no caller has to fight the component.
 */
const TITLE_SIZES: Record<CardTitleSize, string> = {
  sm: 'text-body',
  md: 'text-lg',
  lg: 'text-title',
};

export type CardTitleProps = {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  size?: CardTitleSize;
  className?: string;
  children: ReactNode;
};

export function CardTitle({ as: Tag = 'h2', size = 'md', className, children }: CardTitleProps) {
  return (
    <Tag className={cn('font-display font-semibold tracking-tight', TITLE_SIZES[size], className)}>{children}</Tag>
  );
}
