import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { TONES, type BadgeTone } from './badge-tones';

interface BadgeProps {
  tone?: BadgeTone;
  /** A small coloured dot before the text; use it when colour alone would carry meaning. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Pill-shaped label for statuses, SLA states, tags and counts. */
export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        TONES[tone].pill,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', TONES[tone].dot)} />}
      {children}
    </span>
  );
}
