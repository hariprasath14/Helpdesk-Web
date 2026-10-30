import { Building, Check, ChevronDown, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useId, useState } from 'react';
import { useGetApiV1Companies } from '../../api/generated/contacts/contacts';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { cn } from '../../lib/cn';
import { useDebouncedValue } from '../../lib/use-debounced-value';

export interface CompanyRef {
  id: string;
  name: string;
}

interface CompanyPickerProps {
  label: string;
  value: CompanyRef | null;
  onChange: (company: CompanyRef | null) => void;
  /** What "nothing chosen" is called: "No company" in a form, "All companies" in a filter. */
  noneLabel?: string;
  hint?: string | undefined;
  error?: string | undefined;
}

/** Choose a company by searching its name or domain. Results load as you type. */
export function CompanyPicker({
  label,
  value,
  onChange,
  noneLabel = 'No company',
  hint,
  error,
}: CompanyPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 250);
  const results = useGetApiV1Companies(
    { limit: 8, ...(q ? { q } : {}) },
    { query: { enabled: open } },
  );

  const choose = (company: CompanyRef | null) => {
    onChange(company);
    setOpen(false);
    setSearch('');
  };
  const option = (company: CompanyRef | null, text: string, detail?: string) => {
    const chosen = (company?.id ?? null) === (value?.id ?? null);
    return (
      <li key={company?.id ?? 'none'}>
        <button
          type="button"
          aria-pressed={chosen}
          onClick={() => {
            choose(company);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', company ? 'text-ink' : 'text-ink-muted')}>
              {text}
            </span>
            {detail && <span className="block truncate text-xs text-ink-subtle">{detail}</span>}
          </span>
          {chosen && <Check aria-hidden className="size-4 text-brand-600" />}
        </button>
      </li>
    );
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
            <Building aria-hidden className="size-4 shrink-0 text-ink-subtle" />
            <span
              id={`${id}-value`}
              className={cn('min-w-0 flex-1 truncate', value ? 'text-ink' : 'text-ink-muted')}
            >
              {value?.name ?? noneLabel}
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
                label="Search companies"
                type="search"
                placeholder="Name or domain"
                trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </div>
            <ul aria-label="Companies" className="max-h-64 overflow-y-auto py-1">
              {!q && option(null, noneLabel)}
              {results.isPending ? (
                <li className="flex justify-center py-3 text-ink-muted">
                  <Spinner />
                  <span className="sr-only">Loading companies</span>
                </li>
              ) : (
                results.data?.companies.map((company) =>
                  option(company, company.name, company.domains.join(', ') || undefined),
                )
              )}
              {results.data?.companies.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-ink-muted">
                  {q ? 'No companies match.' : 'No companies yet. Add them under Companies.'}
                </li>
              )}
            </ul>
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
