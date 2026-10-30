import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks, so a slow save is never sent twice. */
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={(disabled ?? false) || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'loading'> {
  /** Required: an icon alone has no text for screen readers. */
  label: string;
  children: ReactNode;
}

/** A square button with only an icon. `label` is announced to screen readers and shown on hover. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn(size === 'sm' ? 'w-8 px-0' : 'w-9 px-0', className)}
      {...props}
    >
      {children}
    </Button>
  );
}
