import { Link } from 'react-router';
import type { TicketSummary } from '../../api/generated/model';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { toneDotClass } from '../../components/badge-tones';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { DueBadge } from '../sla/SlaBadges';
import { priorityLabel, priorityTone, statusLabel, statusTone, ticketRef } from './ticket-labels';

/** One line per ticket from 1024px (Step 5b); narrower screens show cards. */
const TICKET_COLUMNS =
  'lg:grid-cols-[3.5rem_minmax(12rem,1fr)_9rem_6rem_9rem_10rem_5.5rem] lg:gap-x-3';

/** Column titles for TicketRows from 1024px; they stay at the top while the rows scroll. */
export function TicketColumns() {
  return (
    <div
      aria-hidden
      className={`sticky top-0 z-10 hidden h-9 items-center border-b border-border bg-surface-sunken px-4 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase lg:grid ${TICKET_COLUMNS}`}
    >
      <span>#</span>
      <span>Subject · Requester</span>
      <span>Status</span>
      <span>Priority</span>
      <span>Due</span>
      <span>Assignee</span>
      <span>Updated</span>
    </div>
  );
}

/**
 * Tickets as compact rows (Step 5b): one line each from 1024px, cards on phones and tablets. Each opens its
 * ticket; the whole row is the link's target.
 */
export function TicketRows({ tickets, label }: { tickets: TicketSummary[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {tickets.map((ticket) => (
        <li
          key={ticket.number}
          className={cn(
            'relative flex flex-col gap-2 px-4 py-3 text-[13px] hover:bg-surface-page',
            `lg:grid lg:h-11 lg:items-center lg:py-0 ${TICKET_COLUMNS}`,
          )}
        >
          {/* Phones and tablets: number and requester on the first line, the time on the right. */}
          <span className="flex justify-between gap-2 text-xs text-ink-muted lg:contents">
            <span className="min-w-0 truncate tabular-nums lg:text-[13px] lg:font-medium">
              {ticketRef(ticket.number)}
              <span className="lg:hidden"> · {ticket.contact.name}</span>
            </span>
            <span className="shrink-0 lg:order-last lg:text-xs">
              <span className="sr-only">Updated </span>
              {relativeTime(ticket.updatedAt)}
            </span>
          </span>
          <span className="min-w-0 lg:truncate">
            <Link
              to={`/tickets/${String(ticket.number)}`}
              className="text-[15px] leading-snug font-semibold text-ink after:absolute after:inset-0 hover:text-brand-link hover:underline focus-visible:underline focus-visible:outline-none lg:text-[13px]"
            >
              {ticket.subject}
            </Link>
            <span className="hidden text-ink-muted lg:inline">
              <span aria-hidden> · </span>
              <span className="sr-only">from </span>
              {ticket.contact.name}
              {ticket.company && `, ${ticket.company.name}`}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:contents">
            <span>
              <Badge tone={statusTone(ticket.status)} dot>
                {statusLabel(ticket.status)}
              </Badge>
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-body">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', toneDotClass(priorityTone(ticket.priority)))}
              />
              <span className="sr-only">Priority </span>
              <span>{priorityLabel(ticket.priority)}</span>
            </span>
            <span>
              <DueBadge due={ticket.due} />
            </span>
            <span className="inline-flex min-w-0 items-center gap-2 max-lg:ml-auto">
              {ticket.assignee ? (
                <Avatar name={ticket.assignee.name} size="sm" className="max-lg:hidden" />
              ) : (
                <span
                  aria-hidden
                  className="size-6 shrink-0 rounded-full border border-dashed border-border-strong max-lg:hidden"
                />
              )}
              <span className="sr-only">Assignee: </span>
              <span className="min-w-0 truncate text-ink-muted">
                <span className={ticket.assignee ? 'text-ink-body' : undefined}>
                  {ticket.assignee?.name ?? 'Unassigned'}
                </span>
                {ticket.team && (
                  <>
                    <span aria-hidden> · </span>
                    <span className="sr-only">, team </span>
                    <span>{ticket.team.name}</span>
                  </>
                )}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
