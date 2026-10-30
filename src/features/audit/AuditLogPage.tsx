import { useInfiniteQuery } from '@tanstack/react-query';
import { Download, ScrollText } from 'lucide-react';
import { useState } from 'react';
import {
  getApiV1AuditLog,
  getGetApiV1AuditLogExportUrl,
  getGetApiV1AuditLogQueryKey,
} from '../../api/generated/audit/audit';
import { useGetApiV1Members } from '../../api/generated/members/members';
import type {
  AuditEntry,
  GetApiV1AuditLogCategory,
  GetApiV1AuditLogParams,
} from '../../api/generated/model';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/button-styles';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { config } from '../../config';
import { formatInZone, startOfDayInZone } from '../../lib/time-zone';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { can, useSession } from '../workspace/session-context';

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom dates' },
  { value: 'all', label: 'All time' },
];
const CATEGORIES: { value: GetApiV1AuditLogCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'members', label: 'Members' },
  { value: 'security', label: 'Security' },
  { value: 'settings', label: 'Settings' },
  { value: 'sign_in', label: 'Sign-in' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'tickets', label: 'Tickets' },
];
const CATEGORY_TONES = {
  members: 'brand',
  security: 'warning',
  settings: 'info',
  sign_in: 'neutral',
  contacts: 'success',
  tickets: 'danger',
} as const;
const ROLE_NAMES = { admin: 'Admin', supervisor: 'Supervisor', agent: 'Agent' } as const;

interface Filters {
  period: string;
  fromDay: string;
  toDay: string;
  actorId: string;
  category: GetApiV1AuditLogCategory | 'all';
  search: string;
}

/**
 * The API filters. `chosenAt` is when the period was picked: "last 30 days" counts back from that
 * moment, so the query stays the same between renders.
 */
function toParams(
  filters: Filters,
  search: string,
  timeZone: string,
  chosenAt: number,
): GetApiV1AuditLogParams {
  const params: GetApiV1AuditLogParams = {};
  if (filters.period === 'custom') {
    if (filters.fromDay) params.from = startOfDayInZone(filters.fromDay, timeZone).toISOString();
    if (filters.toDay) {
      // Up to the end of the "to" day: the start of the next one.
      const end = startOfDayInZone(filters.toDay, timeZone).getTime() + DAY;
      params.to = new Date(end).toISOString();
    }
  } else if (filters.period !== 'all') {
    params.from = new Date(chosenAt - Number(filters.period) * DAY).toISOString();
  }
  if (filters.actorId) params.actorId = filters.actorId;
  if (filters.category !== 'all') params.category = filters.category;
  if (search.trim()) params.q = search.trim();
  return params;
}

function EntryRow({ entry, timeZone }: { entry: AuditEntry; timeZone: string }) {
  const occurredAt = new Date(entry.occurredAt);
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
      <time
        dateTime={occurredAt.toISOString()}
        title={occurredAt.toISOString()}
        className="shrink-0 text-xs text-ink-muted sm:w-40 sm:pt-0.5"
      >
        {formatInZone(occurredAt, timeZone)}
      </time>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{entry.summary}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {entry.actor.email ?? entry.actor.name}
          {entry.actor.role && ` · ${ROLE_NAMES[entry.actor.role]}`}
          {entry.ip && ` · ${entry.ip}`} · {entry.device}
        </p>
      </div>
      <div className="shrink-0">
        <Badge tone={CATEGORY_TONES[entry.category]}>
          {CATEGORIES.find((category) => category.value === entry.category)?.label}
        </Badge>
      </div>
    </li>
  );
}

function AuditLog() {
  const me = useSession();
  const timeZone = me.workspace.timezone;
  const [filters, setFilters] = useState<Filters>({
    period: '30',
    fromDay: '',
    toDay: '',
    actorId: '',
    category: 'all',
    search: '',
  });
  const search = useDebouncedValue(filters.search, 300);
  const [chosenAt, setChosenAt] = useState(() => Date.now());
  const params = toParams(filters, search, timeZone, chosenAt);
  const people = useGetApiV1Members({ query: { enabled: can(me, 'members.view') } });

  const log = useInfiniteQuery({
    queryKey: getGetApiV1AuditLogQueryKey(params),
    queryFn: ({ pageParam }) =>
      getApiV1AuditLog({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const exportUrl = `${config.apiUrl}${getGetApiV1AuditLogExportUrl()}${exportQuery ? `?${exportQuery}` : ''}`;

  const entries = log.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Audit log' }]}
        meta={`Times in ${timeZone}`}
        actions={
          <a href={exportUrl} download className={buttonClasses('outline')}>
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
        }
      />
      <section className="rounded-xl border border-border bg-surface px-5 pt-4 pb-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Period"
            value={filters.period}
            options={PERIODS}
            onChange={(event) => {
              setChosenAt(Date.now());
              set('period', event.target.value);
            }}
          />
          <SelectField
            label="Who"
            value={filters.actorId}
            options={[
              { value: '', label: 'Everyone' },
              ...(people.data?.members.map((member) => ({
                value: member.userId,
                label: member.name,
              })) ?? []),
            ]}
            onChange={(event) => {
              set('actorId', event.target.value);
            }}
          />
          <SelectField
            label="Category"
            value={filters.category}
            options={CATEGORIES}
            onChange={(event) => {
              set('category', event.target.value as Filters['category']);
            }}
          />
          <TextField
            label="Search"
            type="search"
            placeholder="Name or email"
            value={filters.search}
            onChange={(event) => {
              set('search', event.target.value);
            }}
          />
        </div>
        {filters.period === 'custom' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:w-1/2">
            <TextField
              label="From"
              type="date"
              value={filters.fromDay}
              onChange={(event) => {
                set('fromDay', event.target.value);
              }}
            />
            <TextField
              label="To"
              type="date"
              value={filters.toDay}
              onChange={(event) => {
                set('toDay', event.target.value);
              }}
            />
          </div>
        )}

        <div className="mt-4 border-t border-border">
          {log.isPending ? (
            <div
              role="status"
              aria-label="Loading the audit log"
              className="flex flex-col gap-3 py-4"
            >
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          ) : log.isError ? (
            <div className="py-4">
              <ErrorState
                what="the audit log"
                retrying={log.isFetching}
                onRetry={() => {
                  void log.refetch();
                }}
              />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-4">
              <EmptyState
                icon={ScrollText}
                title="Nothing recorded for these filters"
                description="Try a longer period or clear the filters."
              />
            </div>
          ) : (
            <>
              <ul aria-label="Audit log entries" className="divide-y divide-border">
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} timeZone={timeZone} />
                ))}
              </ul>
              {log.hasNextPage && (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    loading={log.isFetchingNextPage}
                    onClick={() => {
                      void log.fetchNextPage();
                    }}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** Settings → Audit log (admins): who changed what, and when. */
export function AuditLogPage() {
  const me = useSession();
  if (!can(me, 'audit_log.view')) {
    return (
      <>
        <PageHeader
          title="Audit log"
          breadcrumbs={[{ label: 'Settings' }, { label: 'Audit log' }]}
        />
        <NoAccessState
          area="the audit log"
          explanation={`Only admins can see the audit log of ${me.workspace.name}.`}
        />
      </>
    );
  }
  return <AuditLog />;
}
