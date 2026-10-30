import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Ticket, TicketSummary } from '../../api/generated/model';
import {
  getApiV1Tickets,
  usePostApiV1TicketsNumberMerge,
} from '../../api/generated/tickets/tickets';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Drawer } from '../../components/Drawer';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { formError } from '../auth/api-errors';
import { statusLabel, statusTone, ticketRef } from './ticket-labels';
import { refreshTickets } from './tickets-cache';

/** Tickets merged into a main one at once, besides it (the API's limit). */
const MAX_OTHERS = 4;

type Choice = Pick<TicketSummary, 'number' | 'subject' | 'status'> & { contact: { name: string } };

/**
 * Merge (F28; admins and supervisors): choose up to 4 other tickets and which one is kept. Their
 * messages, notes, files and tags move into it and they are closed. No undo, so it asks once more.
 */
export function MergeDrawer({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [chosen, setChosen] = useState<Choice[]>([]);
  const [mainNumber, setMainNumber] = useState(ticket.number);
  const [tellCustomers, setTellCustomers] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Open tickets that could be merged: by default the same requester's, otherwise what was searched.
  const found = useQuery({
    queryKey: ['merge-candidates', ticket.contact.id, q],
    queryFn: () =>
      getApiV1Tickets({
        limit: 10,
        status: 'open,pending,waiting_on_customer,resolved',
        ...(q ? { q } : { contactId: ticket.contact.id }),
      }),
  });
  const merge = usePostApiV1TicketsNumberMerge({
    mutation: {
      onSuccess: (main) => {
        void refreshTickets(queryClient);
        toast({ tone: 'success', message: `Merged into ticket ${ticketRef(main.number)}.` });
        onClose();
        void navigate(`/tickets/${String(main.number)}`);
      },
      onError: (failure) => {
        setConfirming(false);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  const all: Choice[] = [ticket, ...chosen];
  const candidates = (found.data?.tickets ?? []).filter(
    (item) => item.number !== ticket.number && !chosen.some((pick) => pick.number === item.number),
  );
  const others = all.filter((item) => item.number !== mainNumber).map((item) => item.number);
  const main = all.find((item) => item.number === mainNumber) ?? ticket;

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Merge ${ticketRef(ticket.number)} with other tickets`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Merge tickets
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <section aria-labelledby="merge-find" className="flex flex-col gap-3">
          <h3 id="merge-find" className="text-sm font-bold">
            Find tickets to merge
          </h3>
          <TextField
            label="Search tickets"
            type="search"
            placeholder="Number, subject or requester"
            trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
            value={search}
            hint={q ? undefined : `Showing ${ticket.contact.name}'s other tickets.`}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {found.isPending ? 'Looking…' : 'No other tickets found.'}
            </p>
          ) : (
            <ul aria-label="Tickets found" className="divide-y divide-border">
              {candidates.map((item) => (
                <li key={item.number} className="flex items-center gap-3 py-2">
                  <span className="text-xs text-ink-muted tabular-nums">
                    {ticketRef(item.number)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{item.subject}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {item.contact.name}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={chosen.length >= MAX_OTHERS}
                    onClick={() => {
                      setChosen([...chosen, item]);
                    }}
                  >
                    Add {ticketRef(item.number)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {chosen.length >= MAX_OTHERS && (
            <p className="text-xs text-ink-muted">Up to {MAX_OTHERS} tickets at a time.</p>
          )}
        </section>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Keep this ticket</legend>
          <p className="mb-1 text-xs text-ink-muted">
            The others are closed and their messages, notes, files and tags move into it.
          </p>
          {all.map((item) => (
            <div
              key={item.number}
              className="flex items-center gap-3 rounded-lg border border-border p-2"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="main"
                  className="size-4 shrink-0 accent-brand-600"
                  checked={mainNumber === item.number}
                  onChange={() => {
                    setMainNumber(item.number);
                  }}
                />
                <span className="text-xs text-ink-muted tabular-nums">
                  {ticketRef(item.number)}
                </span>
                <span className="truncate">{item.subject}</span>
              </label>
              <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              {item.number !== ticket.number && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChosen(chosen.filter((pick) => pick.number !== item.number));
                    if (mainNumber === item.number) setMainNumber(ticket.number);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </fieldset>

        <CheckboxField
          checked={tellCustomers}
          onChange={(event) => {
            setTellCustomers(event.target.checked);
          }}
        >
          Email the requesters of the merged tickets that {ticketRef(mainNumber)} now carries their
          request
        </CheckboxField>
      </div>
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(false);
          }}
          destructive
          pending={merge.isPending}
          title={`Merge ${String(others.length + 1)} tickets into ${ticketRef(main.number)}?`}
          description={`${others.map(ticketRef).join(', ')} will be closed and read-only, and their messages, notes, files and tags move into ${ticketRef(main.number)} ${main.subject}. This can't be undone.`}
          confirmLabel="Merge tickets"
          onConfirm={() => {
            merge.mutate({ number: main.number, data: { numbers: others, tellCustomers } });
          }}
        />
      )}
    </Drawer>
  );
}
