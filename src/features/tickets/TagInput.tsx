import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useGetApiV1TicketsTags } from '../../api/generated/tickets/tickets';
import { useDebouncedValue } from '../../lib/use-debounced-value';

const MAX_TAGS = 20;
const TAG_MAX = 40;

const clean = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string | undefined;
}

/**
 * Free-text tags as removable chips. Enter or a comma adds what was typed; tags already used in
 * the workspace are suggested as you type (a native datalist, so keyboards and screen readers
 * handle it).
 */
export function TagInput({ label, tags, onChange, error }: TagInputProps) {
  const id = useId();
  const [text, setText] = useState('');
  const q = useDebouncedValue(clean(text), 250);
  const suggestions = useGetApiV1TicketsTags(q ? { q } : {}, { query: { enabled: q !== '' } });
  const full = tags.length >= MAX_TAGS;

  const add = (value: string) => {
    const tag = clean(value).slice(0, TAG_MAX);
    if (tag && !tags.includes(tag) && !full) onChange([...tags, tag]);
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(text);
    } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-focus ${error ? 'border-danger-text' : 'border-border-strong'}`}
      >
        <ul aria-label={`${label} added`} className="contents">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex h-6 items-center gap-1 rounded-full bg-neutral-bg pr-1 pl-2.5 text-xs text-neutral-text"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  onChange(tags.filter((item) => item !== tag));
                }}
                className="rounded-full p-0.5 hover:bg-surface-sunken"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          list={`${id}-suggestions`}
          value={text}
          disabled={full}
          maxLength={TAG_MAX}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          placeholder={full ? '' : tags.length === 0 ? 'refund, payroll' : 'Add a tag'}
          onChange={(event) => {
            const value = event.target.value;
            // Choosing a suggestion fills the box with it: add it straight away.
            if (suggestions.data?.tags.includes(value)) add(value);
            else setText(value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text.trim()) add(text);
          }}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.data?.tags
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </div>
      <p
        id={`${id}-hint`}
        className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
      >
        {error ?? `Press Enter or a comma after each tag. Up to ${String(MAX_TAGS)}.`}
      </p>
    </div>
  );
}
