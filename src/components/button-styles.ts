import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-button text-white hover:bg-brand-button-hover',
  secondary: 'bg-brand-tint text-brand-tint-text hover:bg-brand-tint-hover',
  outline: 'border border-border-strong bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger-button text-white hover:bg-danger-button-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-4 text-sm',
};

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  );
