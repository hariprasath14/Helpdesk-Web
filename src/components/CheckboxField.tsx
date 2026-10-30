import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface CheckboxFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'id' | 'children'
> {
  children: ReactNode;
  error?: string | undefined;
}

/** A checkbox with its label to the right and an error underneath. */
export function CheckboxField({ children, error, ...input }: CheckboxFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-4 shrink-0 accent-brand-600"
          {...input}
        />
        <label htmlFor={id} className="text-sm text-ink-body">
          {children}
        </label>
      </div>
      {error && (
        <p id={errorId} className="pl-6.5 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
