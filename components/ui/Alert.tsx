import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const STYLES: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-mist text-ink', icon: 'text-ink-soft', Icon: Info },
  success: { box: 'bg-mint-soft text-ink', icon: 'text-mint', Icon: CircleCheck },
  warning: { box: 'bg-sun-soft text-ink', icon: 'text-sun-deep', Icon: TriangleAlert },
  danger: { box: 'bg-coral-soft text-ink', icon: 'text-coral', Icon: CircleX },
};

export type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Actions (buttons, links) rendered under the text. */
  actions?: ReactNode;
};

/** An inline message that says what happened and what to do next. */
export function Alert({ tone = 'info', title, children, className, actions }: AlertProps) {
  const { box, icon, Icon } = STYLES[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl px-4 py-3.5 text-[15px] leading-snug', box, className)}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
