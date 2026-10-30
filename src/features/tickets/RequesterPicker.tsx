import { Check, ChevronDown, Search, UserRound } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';
import { useGetApiV1Contacts } from '../../api/generated/contacts/contacts';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { cn } from '../../lib/cn';
import { useDebouncedValue } from '../../lib/use-debounced-value';

export interface ContactRef {
  id: string;
  name: string;
  email: string | null;
}

interface RequesterPickerProps {
  label: string;
  value: ContactRef | null;
  onChange: (contact: ContactRef) => void;
  /** Shown at the end of the list, for example "New contact" on the new ticket form. */
  onNew?: (typed: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
}

/** Choose a contact by searching their name, email or phone. Results load as you type. */
export function RequesterPicker({
  label,
  value,
  onChange,
  onNew,
  hint,
  error,
}: RequesterPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 250);
  const results = useGetApiV1Contacts(
    { limit: 8, sort: 'name', ...(q ? { q } : {}) },
    { query: { enabled: open } },
  );

  const choose = (contact: ContactRef) => {
    onChange(contact);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        id={`${id}-label`}
        htmlFor={`${id}-button`}
        className="text-[13px] font-medium text-ink"
      >
        {label}
      </label>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            id={`${id}-button`}
            type="button"
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={error || hint ? `${id}-hint` : undefined}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-focus',
              error ? 'border-danger-text' : 'border-border-strong',
            )}
          >
            <UserRound aria-hidden className="size-4 shrink-0 text-ink-subtle" />
            <span
              id={`${id}-value`}
              className={cn('min-w-0 flex-1 truncate', value ? 'text-ink' : 'text-ink-muted')}
            >
              {value
                ? `${value.name}${value.email ? ` (${value.email})` : ''}`
                : 'Choose a contact'}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            aria-label={`Choose ${label.toLowerCase()}`}
            className="z-50 w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-md"
          >
            <div className="border-b border-border p-2">
              <TextField
                label="Search contacts"
                type="search"
                placeholder="Name, email or phone"
                trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </div>
            <ul aria-label="Contacts" className="max-h-64 overflow-y-auto py-1">
              {results.isPending ? (
                <li className="flex justify-center py-3 text-ink-muted">
                  <Spinner />
                  <span className="sr-only">Loading contacts</span>
                </li>
              ) : (
                results.data?.contacts.map((contact) => (
                  <li key={contact.id}>
                    <button
                      type="button"
                      aria-pressed={contact.id === value?.id}
                      onClick={() => {
                        choose({ id: contact.id, name: contact.name, email: contact.email });
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{contact.name}</span>
                        <span className="block truncate text-xs text-ink-subtle">
                          {[contact.email ?? contact.phone, contact.company?.name]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {contact.id === value?.id && (
                        <Check aria-hidden className="size-4 text-brand-600" />
                      )}
                    </button>
                  </li>
                ))
              )}
              {results.data?.contacts.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-ink-muted">
                  {q ? 'No contacts match.' : 'No contacts yet.'}
                </li>
              )}
            </ul>
            {onNew && (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => {
                    onNew(search.trim());
                    setOpen(false);
                    setSearch('');
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-brand-link hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                >
                  + New contact{search.trim() ? ` "${search.trim()}"` : ''}
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {(error ?? hint) && (
        <p
          id={`${id}-hint`}
          className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
