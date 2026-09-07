import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardTone = 'paper' | 'mist' | 'ink';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const TONES: Record<CardTone, string> = {
  paper: 'border border-line bg-paper text-ink shadow-card',
  mist: 'bg-mist text-ink',
  ink: 'bg-ink text-paper',
};

const PADDINGS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
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

export type CardTitleProps = {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  className?: string;
  children: ReactNode;
};

export function CardTitle({ as: Tag = 'h2', className, children }: CardTitleProps) {
  return <Tag className={cn('font-display text-lg font-semibold tracking-tight', className)}>{children}</Tag>;
}
