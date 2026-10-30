import {
  AlarmClock,
  CalendarClock,
  Check,
  Hourglass,
  Inbox,
  Mail,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { FALLBACK_REFRESH_MS, useLiveEvent } from '../../app/live-context';
import type { HomeCounts, HomeSetup } from '../../api/generated/model';
import { useGetApiV1Home } from '../../api/generated/home/home';
import {
  useGetApiV1Notifications,
  usePostApiV1NotificationsRead,
} from '../../api/generated/notifications/notifications';
import { useGetApiV1Tickets } from '../../api/generated/tickets/tickets';
import { toneDotClass } from '../../components/badge-tones';
import { Skeleton } from '../../components/Skeleton';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { NotificationIcon } from '../notifications/NotificationBell';
import { DueBadge } from '../sla/SlaBadges';
import { priorityLabel, priorityTone, ticketRef } from '../tickets/ticket-labels';
import { useSession } from '../workspace/session-context';
import { PRODUCT_NAME } from '../../product';

/** The checklist itself (the API sends null to people who cannot change settings). */
type Setup = NonNullable<HomeSetup>;

/** Many changes at once (a rule run, a merge) refresh the counts once, after this pause. */
const LIVE_REFRESH_DELAY_MS = 2_000;

const UNRESOLVED = 'status=open,pending,waiting_on_customer';

/** The cards, each opening the ticket list the API counted it with. */
const CARDS: {
  key: keyof HomeCounts;
  title: string;
  text: string;
  to: string;
  icon: LucideIcon;
}[] = [
  {
    key: 'mine',
    title: 'Assigned to you',
    text: 'Your unresolved tickets',
    to: `/tickets?view=mine&${UNRESOLVED}&assignee=me`,
    icon: UserCheck,
  },
  {
    key: 'overdue',
    title: 'Overdue',
    text: 'Past an SLA deadline',
    to: '/tickets?overdue=true&sort=due',
    icon: AlarmClock,
  },
  {
    key: 'unassigned',
    title: 'Unassigned',
    text: 'Waiting for someone to take them',
    to: `/tickets?view=unassigned&${UNRESOLVED}&assignee=none`,
    icon: Inbox,
  },
  {
    key: 'waitingOnCustomer',
    title: 'Waiting on customer',
    text: 'Your tickets waiting for a reply',
    to: '/tickets?status=waiting_on_customer&assignee=me',
    icon: Hourglass,
  },
];

const STEPS: {
  key: keyof Setup;
  title: string;
  text: string;
  to: string;
  icon: LucideIcon;
}[] = [
  {
    key: 'teamInvited',
    title: 'Invite your team',
    text: 'Add agents and choose their roles.',
    to: '/settings/members',
    icon: Users,
  },
  {
    key: 'emailConnected',
    title: 'Connect your support email',
    text: `Forward your support mailbox to your ${PRODUCT_NAME} address; every email becomes a ticket.`,
    to: '/settings/email',
    icon: Mail,
  },
  {
    key: 'businessHoursSet',
    title: 'Set your business hours',
    text: 'SLA timers count only your working hours.',
    to: '/settings/business-hours',
    icon: CalendarClock,
  },
];

function WorkCard({ card, count }: { card: (typeof CARDS)[number]; count: number | undefined }) {
  const { icon: Icon } = card;
  const alarm = card.key === 'overdue' && (count ?? 0) > 0;
  return (
    <li>
      <Link
        to={card.to}
        className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand-300"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">{card.title}</span>
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-full',
              alarm ? 'bg-danger-bg text-danger-text' : 'bg-brand-tint text-brand-tint-text',
            )}
          >
            <Icon aria-hidden className="size-4" />
          </span>
        </span>
        {count === undefined ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <span
            className={cn(
              'text-3xl leading-none font-bold tabular-nums',
              alarm ? 'text-danger-text' : 'text-ink',
            )}
          >
            {count}
          </span>
        )}
        <span className="text-xs text-ink-muted">{card.text}</span>
      </Link>
    </li>
  );
}

/** What is left to set up (Step 5b): one band with progress, done steps ticked, the rest linked. */
function GetStarted({ setup }: { setup: Setup }) {
  const done = STEPS.filter((step) => setup[step.key]).length;
  return (
    <section
      aria-labelledby="get-started"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4"
    >
      <div className="flex items-center gap-3">
        <h2 id="get-started" className="text-base font-bold">
          Get started
        </h2>
        <span className="text-sm text-ink-muted">
          {done} of {STEPS.length} done
        </span>
        <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
          <span
            className="block h-full rounded-full bg-brand-500"
            style={{ width: `${String((done / STEPS.length) * 100)}%` }}
          />
        </span>
      </div>
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {STEPS.map(({ key, title, text, to, icon: Icon }) => {
          const finished = setup[key];
          return (
            <li key={key}>
              <Link
                to={to}
                title={text}
                className={cn(
                  'inline-flex items-center gap-2 text-sm',
                  finished ? 'text-ink-muted' : 'font-medium text-brand-link hover:underline',
                )}
              >
                {finished ? (
                  <Check aria-hidden className="size-4 text-success-text" />
                ) : (
                  <Icon aria-hidden className="size-4" />
                )}
                {title}
                {finished ? <span className="sr-only">: Done</span> : <span aria-hidden>→</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The signed-in person's unresolved tickets with the nearest deadline first (Step 5b). */
function DueSoonest() {
  const tickets = useGetApiV1Tickets({
    assignee: 'me',
    status: 'open,pending,waiting_on_customer',
    sort: 'due',
    limit: 5,
  });
  const list = tickets.data?.tickets ?? [];
  return (
    <section
      aria-labelledby="due-soonest"
      className="flex min-w-0 flex-col rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 id="due-soonest" className="text-base font-bold">
          Due soonest
        </h2>
        <Link
          to={`/tickets?view=mine&${UNRESOLVED}&assignee=me`}
          className="text-sm font-medium text-brand-link hover:underline"
        >
          All my tickets
        </Link>
      </div>
      {tickets.isPending ? (
        <Skeleton className="mx-5 mb-4 h-24" />
      ) : list.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-muted">
          Nothing assigned to you is waiting. Unassigned tickets are a good place to start.
        </p>
      ) : (
        <ul className="divide-y divide-border pb-1">
          {list.map((ticket) => (
            <li key={ticket.number} className="relative">
              <div className="flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-page">
                <span className="w-9 shrink-0 text-ink-muted tabular-nums">
                  {ticketRef(ticket.number)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Link
                    to={`/tickets/${String(ticket.number)}`}
                    className="font-semibold text-ink after:absolute after:inset-0 hover:text-brand-link"
                  >
                    {ticket.subject}
                  </Link>
                  <span className="text-ink-muted max-sm:hidden"> · {ticket.contact.name}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-ink-body max-sm:hidden">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      toneDotClass(priorityTone(ticket.priority)),
                    )}
                  />
                  <span className="sr-only">Priority </span>
                  <span>{priorityLabel(ticket.priority)}</span>
                </span>
                <span className="shrink-0">
                  <DueBadge due={ticket.due} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The newest notifications (Step 5b); each opens its ticket and is marked read, as in the bell. */
function LatestNotifications() {
  const notifications = useGetApiV1Notifications({ limit: 4 });
  const markRead = usePostApiV1NotificationsRead();
  const list = notifications.data?.notifications ?? [];
  return (
    <section
      aria-labelledby="latest-notifications"
      className="flex min-w-0 flex-col rounded-xl border border-border bg-surface"
    >
      <h2 id="latest-notifications" className="px-5 pt-4 pb-2 text-base font-bold">
        Latest notifications
      </h2>
      {notifications.isPending ? (
        <Skeleton className="mx-5 mb-4 h-24" />
      ) : list.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-muted">
          Nothing yet. Assignments, mentions and SLA warnings show here and under the bell.
        </p>
      ) : (
        <ul className="divide-y divide-border pb-1">
          {list.map((item) => (
            <li key={item.id} className="relative">
              <div className="flex items-start gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-page">
                <NotificationIcon kind={item.kind} />
                <span className="min-w-0 flex-1">
                  {item.ticket ? (
                    <Link
                      to={`/tickets/${String(item.ticket.number)}`}
                      onClick={() => {
                        if (!item.read) markRead.mutate({ data: { ids: [item.id] } });
                      }}
                      className={cn(
                        'block truncate after:absolute after:inset-0 hover:text-brand-link',
                        item.read ? 'text-ink-body' : 'font-semibold text-ink',
                      )}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <span className="block truncate text-ink-body">{item.title}</span>
                  )}
                  <span className="text-xs text-ink-muted">
                    {!item.read && <span className="sr-only">Unread · </span>}
                    {relativeTime(item.createdAt)}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Good morning" and so on, by the hour on this device. */
function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home (F29): what is left to set up (admins, until it is all done) and the signed-in person's
 * work, each card opening its ticket list. Counts follow live updates and are checked every minute,
 * since tickets also become overdue with time alone.
 */
export function HomePage() {
  const { user, workspace } = useSession();
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const home = useGetApiV1Home({
    // Fresh each time the page opens (a setup step may have just been done), then every minute.
    query: { refetchOnMount: 'always', refetchInterval: FALLBACK_REFRESH_MS },
  });

  const pending = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(pending.current);
    },
    [],
  );
  const refetch = home.refetch;
  useLiveEvent('tickets', () => {
    if (pending.current !== undefined) return;
    pending.current = window.setTimeout(() => {
      pending.current = undefined;
      void refetch();
    }, LIVE_REFRESH_DELAY_MS);
  });

  const setup = home.data?.setup;
  const setupLeft = setup && STEPS.some((step) => !setup[step.key]);
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">
          {greeting(now)}, {firstName}
        </h1>
        <p className="text-sm text-ink-muted">
          {workspace.name} ·{' '}
          {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      {setupLeft && <GetStarted setup={setup} />}
      <section aria-labelledby="your-work">
        <h2 id="your-work" className="sr-only">
          Your work
        </h2>
        {home.isError ? (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            The counts could not be loaded.{' '}
            <button type="button" className="font-medium underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map((card) => (
              <WorkCard key={card.key} card={card} count={home.data?.counts[card.key]} />
            ))}
          </ul>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DueSoonest />
        <LatestNotifications />
      </div>
    </div>
  );
}
