import { Eye, EyeOff } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import { passwordStrength } from '../lib/password-strength';
import { TextField, type TextFieldProps } from './TextField';

const BAR_COLOURS = ['', 'bg-danger-dot', 'bg-warning-dot', 'bg-info-dot', 'bg-success-dot'];

interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing' | 'status'> {
  value: string;
  /** Show the four-part strength bar (new passwords only). */
  showStrength?: boolean;
}

/**
 * Password input with a show/hide button, a Caps Lock warning, and, for new passwords, a strength
 * bar.
 */
export function PasswordField({
  value,
  showStrength = false,
  onKeyDown,
  onKeyUp,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const strength = passwordStrength(value);
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState('CapsLock'));
  };
  const strengthBar =
    showStrength && value.length > 0 ? (
      <span className="flex items-center gap-2">
        <span aria-hidden className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                'h-1 flex-1 rounded-full',
                strength.score >= step ? BAR_COLOURS[strength.score] : 'bg-surface-sunken',
              )}
            />
          ))}
        </span>
        <span className="w-40 text-right text-ink-muted">
          <span className="sr-only">Password strength: </span>
          {strength.label}
        </span>
      </span>
    ) : null;

  return (
    <TextField
      {...props}
      value={value}
      type={visible ? 'text' : 'password'}
      onKeyDown={(event) => {
        readCapsLock(event);
        onKeyDown?.(event);
      }}
      onKeyUp={(event) => {
        readCapsLock(event);
        onKeyUp?.(event);
      }}
      onBlur={(event) => {
        setCapsLock(false);
        props.onBlur?.(event);
      }}
      trailing={
        <button
          type="button"
          onClick={() => {
            setVisible((current) => !current);
          }}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      }
      status={
        capsLock || strengthBar ? (
          <span className="flex flex-col gap-1">
            {capsLock && <span className="font-medium text-warning-text">Caps Lock is on</span>}
            {strengthBar}
          </span>
        ) : undefined
      }
    />
  );
}
