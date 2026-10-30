import { ChevronDown } from 'lucide-react';
import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'className'
> {
  label: string;
  options: { value: string; label: string }[];
  hint?: string | undefined;
  /** Shown under the field in red; also marks the field invalid for screen readers. */
  error?: string | undefined;
  /** Hide the label visually (screen readers still read it), for example in a table's cells. */
  hideLabel?: boolean;
  /** 32px tall, for toolbars (the ticket list's order). */
  compact?: boolean;
  /** The label beside the select instead of above it, for compact property lists (Step 5b). */
  inline?: boolean;
}

/** A labelled native select in the design-system style (native, so it works well on phones). */
export function SelectField({
  label,
  options,
  hint,
  error,
  required,
  hideLabel = false,
  compact = false,
  inline = false,
  ...select
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div
      className={
        inline
          ? 'grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1'
          : 'flex flex-col gap-1.5'
      }
    >
      <label
        htmlFor={id}
        className={cn(
          'text-[13px] font-medium',
          inline ? 'text-ink-muted' : 'text-ink',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-text">
            *
          </span>
        )}
      </label>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'w-full appearance-none rounded-lg border bg-surface pr-9 pl-3 text-ink outline-none focus:ring-2 focus:ring-brand-focus disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted',
            compact ? 'h-8 text-[13px]' : 'h-10 text-sm',
            error ? 'border-danger-text' : 'border-border-strong',
          )}
          {...select}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {error ? (
        <p id={errorId} className={cn('text-xs text-danger-text', inline && 'col-start-2')}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={cn('text-xs text-ink-subtle', inline && 'col-start-2')}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
