import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '../lib/cn';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className' | 'children'
> {
  label: string;
  /** Shown under the field when there is no error. */
  hint?: ReactNode;
  /** Shown under the field in red; also marks the field invalid for screen readers. */
  error?: string | undefined;
  /** Text inside the right edge, for example ".helpdesk.example.com". */
  suffix?: ReactNode;
  /** Extra content at the right edge, for example a show/hide button. */
  trailing?: ReactNode;
  /** Live status under the field (for example "acme.helpdesk.example.com is available"), announced politely. */
  status?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  /** Hide the label visually (screen readers still read it), for example in a table's cells. */
  hideLabel?: boolean;
  /** 32px tall, for toolbars (the ticket list's search). */
  compact?: boolean;
}

/**
 * A labelled input in the design-system style (label above, required marker, hint or error below).
 * Hint, status and error are linked to the input, so screen readers read them with it.
 */
export function TextField({
  label,
  hint,
  error,
  suffix,
  trailing,
  status,
  required,
  hideLabel = false,
  compact = false,
  ref,
  ...input
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const describedBy = [error ? errorId : hint ? hintId : null, status ? statusId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn('text-[13px] font-medium text-ink', hideLabel && 'sr-only')}
      >
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-text">
            *
          </span>
        )}
      </label>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-surface pr-1 focus-within:ring-2 focus-within:ring-brand-focus',
          compact ? 'h-8' : 'h-10',
          error ? 'border-danger-text' : 'border-border-strong',
        )}
      >
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'h-full min-w-0 flex-1 rounded-lg bg-transparent text-ink outline-none placeholder:text-ink-subtle',
            compact ? 'px-2.5 text-[13px]' : 'px-3 text-sm',
          )}
          {...input}
        />
        {suffix && <span className="shrink-0 pr-2 text-sm text-ink-muted">{suffix}</span>}
        {trailing}
      </div>
      {status && (
        <div id={statusId} aria-live="polite" className="text-xs">
          {status}
        </div>
      )}
      {error ? (
        <p id={errorId} className="text-xs text-danger-text">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-ink-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
