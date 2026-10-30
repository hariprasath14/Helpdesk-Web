import { useId, type Ref, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id' | 'className'
> {
  label: string;
  hint?: string | undefined;
  /** Shown under the field in red; also marks the field invalid for screen readers. */
  error?: string | undefined;
  /** For placing the cursor, such as after inserting text. */
  ref?: Ref<HTMLTextAreaElement>;
}

/** A labelled multi-line text box in the design-system style (label above, hint or error below). */
export function TextAreaField({
  label,
  hint,
  error,
  required,
  rows = 4,
  ...textarea
}: TextAreaFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-text">
            *
          </span>
        )}
      </label>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={cn(
          'rounded-lg border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-brand-focus',
          error ? 'border-danger-text' : 'border-border-strong',
        )}
        {...textarea}
      />
      {(error ?? hint) && (
        <p id={noteId} className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
