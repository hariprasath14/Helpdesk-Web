import { Inbox, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useGetApiV1Tickets } from '../../api/generated/tickets/tickets';
import { Badge } from '../../components/Badge';
import { toneDotClass } from '../../components/badge-tones';
import { buttonClasses } from '../../components/button-styles';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/StateMessage';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { priorityLabel, priorityTone, statusLabel, statusTone, ticketRef } from './ticket-labels';

/** Table columns once the box is wide enough (a container query, so it fits any column). */
const COLUMNS =
  '@2xl:grid @2xl:grid-cols-[3rem_minmax(0,1fr)_10rem_5.5rem_9rem_5.5rem] @2xl:gap-x-3';

interface RelatedTicketsProps {
  /** Whose tickets: a contact's or a company's. */
  filter: { contactId: string } | { companyId: string };
  /** For example "Tickets from Neha Iyer will show here." */
  emptyText: string;
  /** Where "New ticket" goes, when the page offers one. */
  newTicketTo?: string;
}

/**
 * A contact's or company's latest tickets (up to 20), newest first (Step 5b): a compact table when
 * there is room, two lines per ticket when there is not. Each opens the ticket.
 */
export function RelatedTickets({ filter, emptyText, newTicketTo }: RelatedTicketsProps) {
  const tickets = useGetApiV1Tickets({ ...filter, limit: 20 });
  const newLink = newTicketTo && (
    <Link to={newTicketTo} className={buttonClasses('outline', 'sm')}>
      <Plus aria-hidden className="size-4" />
      New ticket
    </Link>
  );

  let body;
  if (tickets.isPending) body = <Skeleton className="mx-5 mb-4 h-20" />;
  else if (tickets.isError) {
    body = (
      <p className="px-5 pb-4 text-sm text-danger-text">
        Tickets didn&apos;t load. Reload the page to try again.
      </p>
    );
  } else if (tickets.data.tickets.length === 0) {
    body = <EmptyState icon={Inbox} title="No tickets yet" description={emptyText} />;
  } else {
    body = (
      <>
        <div
          aria-hidden
          className={`hidden h-8 items-center border-y border-border bg-surface-sunken px-5 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase ${COLUMNS}`}
        >
          <span>#</span>
          <span>Subject</span>
          <span>Status</span>
          <span>Priority</span>
          <span>Assignee</span>
          <span>Updated</span>
        </div>
        <ul aria-label="Their tickets" className="divide-y divide-border">
          {tickets.data.tickets.map((ticket) => (
            <li
              key={ticket.number}
              className={cn(
                'relative flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px] hover:bg-surface-page @2xl:items-center',
                COLUMNS,
              )}
            >
              <span className="text-ink-muted tabular-nums">{ticketRef(ticket.number)}</span>
              <span className="min-w-0 flex-1 truncate">
                <Link
                  to={`/tickets/${String(ticket.number)}`}
                  className={cn(
                    'after:absolute after:inset-0 hover:text-brand-link hover:underline',
                    ticket.mergedInto ? 'text-ink-muted' : 'font-semibold text-ink',
                  )}
                >
                  {ticket.subject}
                </Link>
              </span>
              {/* Narrow boxes: the rest goes on a second line. */}
              <span className="basis-full @2xl:hidden" aria-hidden />
              <span>
                {ticket.mergedInto ? (
                  <Badge tone="neutral">Merged into {ticketRef(ticket.mergedInto.number)}</Badge>
                ) : (
                  <Badge tone={statusTone(ticket.status)} dot>
                    {statusLabel(ticket.status)}
                  </Badge>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-body">
                <span
                  aria-hidden
                  className={cn('size-2 rounded-full', toneDotClass(priorityTone(ticket.priority)))}
                />
                <span className="sr-only">Priority </span>
                <span>{priorityLabel(ticket.priority)}</span>
              </span>
              <span className="truncate text-ink-muted">
                <span className="sr-only">Assignee: </span>
                {ticket.assignee?.name ?? 'Unassigned'}
              </span>
              <span className="text-xs text-ink-muted">
                <span className="sr-only">Updated </span>
                {relativeTime(ticket.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const total = tickets.data?.total;
  return (
    <section aria-label="Tickets" className="@container rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 px-5 py-3">
        <h2 className="text-base font-bold">
          Tickets
          {total !== undefined && total !== null && total > 0 && (
            <span className="ml-1.5 text-sm font-normal text-ink-muted">{total}</span>
          )}
        </h2>
        {newLink}
      </div>
      {body}
    </section>
  );
}
