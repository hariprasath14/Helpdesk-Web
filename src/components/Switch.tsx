import { Switch as RadixSwitch } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface SwitchFieldProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Keep the label for screen readers only, when the row around it already names the setting. */
  hideLabel?: boolean;
}

/** An on/off setting: label and description on the left, the switch on the right. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  hideLabel = false,
}: SwitchFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className={cn('flex items-start justify-between', !hideLabel && 'gap-4')}>
      <div className={cn('min-w-0', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-border-strong transition-colors focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-button"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </div>
  );
}
