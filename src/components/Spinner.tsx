import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn';

interface SpinnerProps {
  className?: string;
  /** Read by screen readers; omit when the surrounding element already says what is loading. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <LoaderCircle
      className={cn('size-4 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
