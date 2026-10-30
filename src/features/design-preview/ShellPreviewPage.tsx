import {
  Bell,
  Building2,
  ChevronDown,
  Filter,
  Plus,
  Settings,
  Ticket,
  UserRound,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, IconButton } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { TableSkeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { AppShell } from '../../app/shell/AppShell';
import type { ShellConfig } from '../../app/shell/types';
import { cn } from '../../lib/cn';

const STATES = ['content', 'loading', 'empty', 'error', 'no-access'] as const;
type State = (typeof STATES)[number];

/**
 * The full app shell with sample data (Figma "App shell" frames), for review before the features
 * that fill it exist. Local and dev only.
 */
export function ShellPreviewPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const state: State = STATES.find((s) => s === params.get('state')) ?? 'content';
  const notice = (message: string) => () => {
    toast({ tone: 'info', message });
  };

  const sample: ShellConfig = {
    nav: [
      { label: 'Tickets', to: '/design/shell', icon: Ticket, count: 12, attention: true },
      { label: 'Contacts', to: '/design/shell/contacts', icon: UserRound },
      { label: 'Companies', to: '/design/shell/companies', icon: Building2 },
    ],
    footerNav: [{ label: 'Settings', to: '/design/shell/settings', icon: Settings }],
    search: {
      placeholder: 'Search tickets, contacts, companies',
      onSearch: (query) => {
        toast({ tone: 'info', message: `Search for "${query}" arrives with F10.` });
      },
    },
    trial: { daysLeft: 12, onUpgrade: notice('Upgrade arrives with F30.') },
    newActions: [
      { label: 'Ticket', icon: Ticket, onSelect: notice('New ticket arrives with F9.') },
      { label: 'Contact', icon: UserRound, onSelect: notice('New contact arrives with F7.') },
      { label: 'Company', icon: Building2, onSelect: notice('New company arrives with F7.') },
    ],
    notifications: (
      <IconButton label="Notifications, 3 unread" onClick={notice('A sample bell.')}>
        <Bell aria-hidden className="size-5" />
      </IconButton>
    ),
    onHelp: notice('Help arrives later.'),
    user: {
      name: 'Ravi Shankar',
      email: 'ravi@acme.com',
      roleLine: 'Admin · Acme Support',
      menu: [
        { label: 'My profile', onSelect: notice('Profile arrives with F4.') },
        { label: 'Notification settings', onSelect: notice('Arrives with F25.') },
        { label: 'Two-factor authentication', onSelect: notice('Arrives with F3.') },
        { label: 'Log out', onSelect: notice('Arrives with F2.'), danger: true },
      ],
    },
  };

  let body;
  switch (state) {
    case 'loading':
      body = <TableSkeleton label="Loading tickets" />;
      break;
    case 'empty':
      body = (
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="Connect your support email and every message your customers send becomes a ticket here. You can also create one by hand."
          actions={
            <>
              <Button>Connect support email</Button>
              <Button variant="outline" icon={<Plus aria-hidden className="size-4" />}>
                Create ticket
              </Button>
            </>
          }
        />
      );
      break;
    case 'error':
      body = <ErrorState what="your tickets" code="LD-503" onRetry={() => undefined} />;
      break;
    case 'no-access':
      body = (
        <NoAccessState
          area="Settings"
          explanation="Only Admins can change workspace settings. Ask an Admin, like Arun Kumar, to update your role."
          action={<Button variant="outline">Back to tickets</Button>}
        />
      );
      break;
    default:
      body = (
        <div className="flex min-h-96 items-center justify-center rounded-xl border-2 border-dashed border-brand-200 p-6 text-center text-brand-tint-text">
          Page content: fluid width, 24px gutters. Lists, detail pages and settings render here.
        </div>
      );
  }

  return (
    <AppShell config={sample}>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Preview state">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === state}
            onClick={() => {
              setParams(s === 'content' ? {} : { state: s });
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              s === state
                ? 'border-brand-600 bg-brand-tint text-brand-tint-text'
                : 'border-border bg-surface text-ink-muted',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <PageHeader
        breadcrumbs={[{ label: 'Tickets' }]}
        title={
          <span className="inline-flex items-center gap-1">
            All tickets <ChevronDown aria-hidden className="size-4 text-ink-muted" />
          </span>
        }
        meta={state === 'loading' ? 'Loading…' : state === 'empty' ? '0 tickets' : '128 tickets'}
        actions={
          state === 'no-access' ? undefined : (
            <>
              <Button variant="outline" icon={<Filter aria-hidden className="size-4" />}>
                Filter
              </Button>
              <Button variant="outline">
                Actions <ChevronDown aria-hidden className="size-4" />
              </Button>
              {/* On phones the floating button replaces this (Figma "Phone · 390"). */}
              <Button
                icon={<Plus aria-hidden className="size-4" />}
                className="hidden md:inline-flex"
              >
                New ticket
              </Button>
            </>
          )
        }
      />
      {body}
    </AppShell>
  );
}
