import { ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FilterMenuProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Extra content under the options, for example a tag box. */
  children?: ReactNode;
  /** A full-width row (the phone filter sheet) instead of a chip. */
  stacked?: boolean;
}

/**
 * One filter of the ticket list: a button naming what is chosen ("Status: Open, Pending") that
 * opens a list of checkboxes. Choices apply at once.
 */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  children,
  stacked = false,
}: FilterMenuProps) {
  const names = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);
  const summary =
    selected.length === 0
      ? label
      : names.length > 0 && names.length <= 2
        ? `${label}: ${names.join(', ')}`
        : `${label}: ${String(selected.length)}`;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border font-medium',
            stacked
              ? 'h-11 w-full justify-between px-3.5 text-sm'
              : 'h-8 max-w-64 px-3 text-[13px]',
            selected.length > 0
              ? 'border-brand-600 bg-brand-tint text-brand-tint-text'
              : 'border-border-strong bg-surface text-ink hover:bg-surface-sunken',
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 flex max-h-80 w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          <fieldset className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <legend className="sr-only">{label}</legend>
            {options.length === 0 && (
              <p className="py-1 text-sm text-ink-muted">Nothing to choose yet.</p>
            )}
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2.5 py-1.5 text-sm text-ink-body"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-brand-600"
                  checked={selected.includes(option.value)}
                  onChange={(event) => {
                    onChange(
                      event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((value) => value !== option.value),
                    );
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {children && <div className="border-t border-border p-3">{children}</div>}
          {selected.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                }}
                className="text-sm font-medium text-brand-link hover:underline"
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
