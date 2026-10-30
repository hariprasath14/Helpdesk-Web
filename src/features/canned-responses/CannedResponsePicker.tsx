import { MessageSquareText, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  getApiV1CannedResponsesCannedResponseIdFilled,
  useGetApiV1CannedResponses,
} from '../../api/generated/canned-responses/canned-responses';
import type { CannedResponse } from '../../api/generated/model';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { matchesSearch } from './canned-search';

interface CannedResponsePickerProps {
  ticketNumber: number;
  disabled?: boolean;
  /** Gets the chosen text with its placeholders filled in for the ticket. */
  onInsert: (text: string) => void;
}

/** "Canned response" in the reply box: search the saved replies and drop one in. */
export function CannedResponsePicker({
  ticketNumber,
  disabled = false,
  onInsert,
}: CannedResponsePickerProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filling, setFilling] = useState<string | null>(null);
  const list = useGetApiV1CannedResponses({ query: { enabled: open } });
  const options = (list.data?.cannedResponses ?? []).filter((item) => matchesSearch(item, search));

  const choose = async (item: CannedResponse) => {
    setFilling(item.id);
    try {
      const filled = await getApiV1CannedResponsesCannedResponseIdFilled(item.id, { ticketNumber });
      onInsert(filled.body);
      setOpen(false);
      setSearch('');
    } catch (failure) {
      toast({ tone: 'danger', message: formError(failure) });
    } finally {
      setFilling(null);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          icon={<MessageSquareText aria-hidden />}
        >
          Canned response
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          aria-label="Canned responses"
          className="z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          <div className="border-b border-border p-2">
            <TextField
              label="Search canned responses"
              type="search"
              placeholder="Title or text"
              trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <ul aria-label="Saved replies" className="max-h-72 overflow-y-auto py-1">
            {list.isPending && (
              <li className="flex justify-center py-3 text-ink-muted">
                <Spinner />
                <span className="sr-only">Loading canned responses</span>
              </li>
            )}
            {options.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={filling !== null}
                  onClick={() => {
                    void choose(item);
                  }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none disabled:cursor-wait"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    {item.title}
                    {item.shared ? null : (
                      <span className="text-xs font-normal text-ink-subtle">(only you)</span>
                    )}
                    {filling === item.id && <Spinner />}
                  </span>
                  <span className="line-clamp-1 text-xs text-ink-muted">{item.body}</span>
                </button>
              </li>
            ))}
            {list.data && options.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-ink-muted">
                {list.data.cannedResponses.length === 0
                  ? 'No canned responses yet.'
                  : 'No canned responses match.'}
              </li>
            )}
            {list.isError && (
              <li className="px-3 py-2.5 text-sm text-danger-text">
                Couldn&apos;t load canned responses. Close and try again.
              </li>
            )}
          </ul>
          <div className="border-t border-border px-3 py-2 text-xs">
            <Link to="/settings/canned-responses" className="text-brand-link hover:underline">
              Manage canned responses
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
