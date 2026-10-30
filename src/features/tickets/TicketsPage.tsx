import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  EllipsisVertical,
  Inbox,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { Dialog, Popover } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SavedView } from '../../api/generated/model';
import {
  getApiV1Tickets,
  getGetApiV1TicketsQueryKey,
  getGetApiV1TicketViewsQueryKey,
  useDeleteApiV1TicketViewsViewId,
  useGetApiV1TicketViews,
  usePatchApiV1TicketViewsViewId,
} from '../../api/generated/tickets/tickets';
import { buttonClasses } from '../../components/button-styles';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { cn } from '../../lib/cn';
import { formError } from '../auth/api-errors';
import { FALLBACK_REFRESH_MS, useLive, useLiveEvent } from '../../app/live-context';
import { can, useSession } from '../workspace/session-context';
import { FilterBar } from './FilterBar';
import { SaveViewDrawer } from './SaveViewDrawer';
import {
  BUILT_IN_VIEWS,
  filterCount,
  filterParams,
  listParams,
  readFilters,
  sameFilters,
  SORT_OPTIONS,
  type Filters,
  type Sort,
} from './ticket-filters';
import { TicketColumns, TicketRows } from './TicketRows';

interface ViewChoice {
  id: string;
  name: string;
  filters: Filters;
  sort: Sort;
  saved?: SavedView;
}

/**
 * The page title is the current view; it opens the list of views (Step 5b): built-in ones, shared
 * ones and the person's own, with rename and delete for the ones they may change.
 */
function ViewsMenu({
  title,
  groups,
  current,
  onChoose,
  onEdit,
  onDelete,
}: {
  title: string;
  groups: { title: string; views: ViewChoice[] }[];
  current: string | null;
  onChoose: (view: ViewChoice) => void;
  onEdit: (view: SavedView) => void;
  onDelete: (view: SavedView) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1 rounded-md text-left hover:text-brand-link"
        >
          <span className="min-w-0 break-words sm:truncate">{title}</span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 max-h-[min(28rem,70vh)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-md"
        >
          <nav aria-label="Views" className="flex flex-col gap-2">
            {groups
              .filter((group) => group.views.length > 0)
              .map((group) => (
                <div key={group.title}>
                  <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
                    {group.title}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {group.views.map((view) => (
                      <li key={view.id} className="flex items-center">
                        <button
                          type="button"
                          aria-current={view.id === current ? 'page' : undefined}
                          onClick={() => {
                            setOpen(false);
                            onChoose(view);
                          }}
                          className={cn(
                            'min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm',
                            view.id === current
                              ? 'bg-brand-tint font-medium text-brand-tint-text'
                              : 'text-ink-body hover:bg-surface-sunken',
                          )}
                        >
                          {view.name}
                        </button>
                        {view.saved?.canEdit && (
                          <Menu
                            trigger={
                              <IconButton label={`Actions for view ${view.name}`} size="sm">
                                <EllipsisVertical aria-hidden className="size-4" />
                              </IconButton>
                            }
                          >
                            <MenuItem
                              onSelect={() => {
                                setOpen(false);
                                if (view.saved) onEdit(view.saved);
                              }}
                            >
                              Rename or share
                            </MenuItem>
                            <MenuItem
                              danger
                              onSelect={() => {
                                setOpen(false);
                                if (view.saved) onDelete(view.saved);
                              }}
                            >
                              Delete view
                            </MenuItem>
                          </Menu>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </nav>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Phones: every filter and the order in a sheet from the bottom (Step 5b). Choices apply at once. */
function FiltersSheet({
  open,
  onOpenChange,
  filters,
  sort,
  total,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  sort: Sort;
  total: number | null | undefined;
  onChange: (filters: Filters, sort: Sort) => void;
}) {
  const shown =
    total === undefined || total === null
      ? 'Show tickets'
      : `Show ${String(total)} ${total === 1 ? 'ticket' : 'tickets'}`;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface shadow-lg"
        >
          <header className="flex items-center justify-between px-5 pt-4 pb-2">
            <Dialog.Title className="text-base font-bold text-ink">Filters</Dialog.Title>
            <button
              type="button"
              onClick={() => {
                onChange(filters.q ? { q: filters.q } : {}, sort);
              }}
              className="text-sm font-medium text-brand-link hover:underline"
            >
              Clear all
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-2">
            <FilterBar
              stacked
              filters={filters}
              onChange={(next) => {
                onChange(next, sort);
              }}
            />
            <SelectField
              label="Order"
              value={sort}
              options={SORT_OPTIONS}
              onChange={(event) => {
                onChange(filters, event.target.value as Sort);
              }}
            />
          </div>
          <footer className="border-t border-border px-5 py-3">
            <Dialog.Close className={cn(buttonClasses('primary', 'md'), 'h-11 w-full')}>
              {shown}
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Tickets: a view (built-in or saved), filters, search and order, all kept in the address so a
 * list can be shared and reloaded. Starts at "All unresolved".
 */
export function TicketsPage() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const canTrash = can(me, 'tickets.delete');
  const savedViews = useGetApiV1TicketViews();
  const [saving, setSaving] = useState<SavedView | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SavedView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fresh = [...search.keys()].length === 0;
  const defaultView = BUILT_IN_VIEWS[0];
  const viewId = fresh ? (defaultView?.id ?? null) : search.get('view');
  const read = readFilters(search);
  const filters = fresh ? (defaultView?.filters ?? {}) : read.filters;
  const sort = read.sort;
  const trash = viewId === 'trash' && canTrash;

  const builtIns: ViewChoice[] = BUILT_IN_VIEWS.filter((view) => !view.trash || canTrash).map(
    (view) => ({ id: view.id, name: view.name, filters: view.filters, sort: 'updated' }),
  );
  const saved: ViewChoice[] = (savedViews.data?.views ?? []).map((view) => ({
    id: view.id,
    name: view.name,
    filters: view.filters,
    sort: view.sort,
    saved: view,
  }));
  const current = [...builtIns, ...saved].find((view) => view.id === viewId);
  const modified = current
    ? !trash && (!sameFilters(current.filters, filters) || current.sort !== sort)
    : filterCount(filters) > 0;

  // The search box applies 300 ms after typing stops; choosing a view shows that view's search.
  const [text, setText] = useState(filters.q ?? '');
  const [shownQ, setShownQ] = useState(filters.q ?? '');
  if ((filters.q ?? '') !== shownQ) {
    setShownQ(filters.q ?? '');
    setText(filters.q ?? '');
  }
  const typing = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(typing.current);
    },
    [],
  );

  const show = (next: Filters, nextSort: Sort, id: string | null = viewId) => {
    setSearch({ ...(id ? { view: id } : {}), ...filterParams(next, nextSort) });
  };
  const choose = (view: ViewChoice) => {
    setSearch({ view: view.id, ...filterParams(view.filters, view.sort) });
  };

  const params = { ...listParams(filters, sort), ...(trash ? { deleted: 'true' as const } : {}) };
  const { connected } = useLive();
  const listKey = getGetApiV1TicketsQueryKey(params);
  const pages = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      getApiV1Tickets({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // Without live updates (F26) the list checks every minute instead of offering "Show".
    refetchInterval: connected ? false : FALLBACK_REFRESH_MS,
  });
  const total = pages.data?.pages[0]?.total;
  const tickets = pages.data?.pages.flatMap((page) => page.tickets) ?? [];

  // Live updates (F26): new and changed tickets are counted, not moved in under the reader; Show
  // reloads the list. Kept per list, so changing filters starts afresh.
  const listId = JSON.stringify(listKey);
  const [arrivals, setArrivals] = useState({ listId, created: [] as string[], changed: false });
  const pending = arrivals.listId === listId ? arrivals : { listId, created: [], changed: false };
  const shownIds = new Set(tickets.map((ticket) => ticket.id));
  useLiveEvent<{ ticketId: string; created: boolean }>('tickets', ({ ticketId, created }) => {
    if (trash) return;
    setArrivals((current) => {
      const base =
        current.listId === listId ? current : { listId, created: [] as string[], changed: false };
      if (base.created.includes(ticketId)) return base;
      if (created) return { ...base, created: [...base.created, ticketId] };
      return shownIds.has(ticketId) && !base.changed ? { ...base, changed: true } : base;
    });
  });
  const showArrivals = () => {
    setArrivals({ listId, created: [], changed: false });
    void pages.refetch();
  };

  const refreshViews = () =>
    queryClient.invalidateQueries({ queryKey: getGetApiV1TicketViewsQueryKey() });
  const updateView = usePatchApiV1TicketViewsViewId({
    mutation: {
      onSuccess: (view) => {
        void refreshViews();
        toast({ tone: 'success', message: `View ${view.name} updated.` });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const removeView = useDeleteApiV1TicketViewsViewId({
    mutation: {
      onSuccess: () => {
        toast({ tone: 'success', message: `View ${deleting?.name ?? ''} deleted.` });
        if (deleting?.id === viewId) setSearch({});
        setDeleting(null);
        void refreshViews();
      },
      onError: (failure) => {
        setDeleting(null);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  const newButton = (
    <Link to="/tickets/new" className={buttonClasses('primary', 'md')}>
      <Plus aria-hidden className="size-4" />
      New ticket
    </Link>
  );
  const groups = [
    { title: 'Views', views: builtIns },
    { title: 'Shared views', views: saved.filter((view) => view.saved?.shared) },
    { title: 'Your views', views: saved.filter((view) => !view.saved?.shared) },
  ];

  let body;
  if (pages.isPending) {
    body = (
      <div role="status" aria-label="Loading tickets" className="flex flex-col gap-3 py-4">
        {[1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (pages.isError) {
    body = (
      <ErrorState
        what="tickets"
        retrying={pages.isFetching}
        onRetry={() => {
          void pages.refetch();
        }}
      />
    );
  } else if (tickets.length === 0) {
    if (trash) {
      body = (
        <EmptyState
          icon={Trash2}
          title="The trash is empty"
          description="Deleted tickets show here until you restore them."
        />
      );
    } else if (filterCount(filters) > 0 && viewId !== 'unresolved') {
      body = (
        <EmptyState
          icon={SearchX}
          title="No tickets match"
          description="Try fewer filters, or another view."
          actions={
            <Button
              variant="outline"
              onClick={() => {
                show({}, 'updated', 'all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      );
    } else {
      body = (
        <EmptyState
          icon={Inbox}
          title={viewId === 'unresolved' ? 'Nothing waiting' : 'No tickets yet'}
          description={
            viewId === 'unresolved'
              ? 'Every ticket is resolved or closed. New ones show here.'
              : 'Tickets your customers raise show here. Log one from a call or a chat with New ticket.'
          }
          actions={newButton}
        />
      );
    }
  } else {
    const count = pending.created.length;
    body = (
      // From 768px the rows scroll inside this box (under a pinned header from 1024px, Step 5b);
      // phones scroll the whole page instead.
      <section className="rounded-xl border border-border bg-surface md:min-h-0 md:flex-1 md:overflow-auto">
        {(count > 0 || pending.changed) && (
          <div
            role="status"
            className="sticky top-0 left-0 z-20 m-2 flex items-center justify-center gap-2 rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand-tint-text"
          >
            <span>
              {count > 0
                ? `${String(count)} new ${count === 1 ? 'ticket' : 'tickets'}`
                : 'Some tickets changed'}
            </span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={showArrivals}
              className="font-bold underline hover:no-underline"
            >
              Show
            </button>
          </div>
        )}
        <div className="lg:min-w-[61.5rem]">
          <TicketColumns />
          <TicketRows tickets={tickets} label={trash ? 'Deleted tickets' : 'Tickets'} />
        </div>
        {pages.hasNextPage && (
          <div className="flex justify-center py-3">
            <Button
              variant="outline"
              loading={pages.isFetchingNextPage}
              onClick={() => {
                void pages.fetchNextPage();
              }}
            >
              Load more
            </Button>
          </div>
        )}
      </section>
    );
  }

  const title = current?.name ?? (filterCount(filters) > 0 ? 'Filtered tickets' : 'Tickets');
  // The phone sheet's count leaves out the search, which has its own box.
  const sheetCount = filterCount(filters) - (filters.q ? 1 : 0);
  return (
    // From 768px the page fills the content area and only the table scrolls (Step 5b).
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <PageHeader
        title={
          <ViewsMenu
            title={title}
            groups={groups}
            current={viewId}
            onChoose={choose}
            onEdit={setSaving}
            onDelete={setDeleting}
          />
        }
        {...(total !== undefined && total !== null
          ? { meta: total === 1 ? '1 ticket' : `${String(total)} tickets` }
          : {})}
        // Order sits by New ticket from 768px; phones have it in the filter sheet and use the
        // floating New button.
        actions={
          <span className="flex items-center gap-2 max-md:hidden">
            {!trash && (
              <span className="w-44">
                <SelectField
                  label="Order"
                  hideLabel
                  compact
                  value={sort}
                  options={SORT_OPTIONS}
                  onChange={(event) => {
                    show(filters, event.target.value as Sort);
                  }}
                />
              </span>
            )}
            {newButton}
          </span>
        }
      />
      {!trash && (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 md:w-72 md:flex-none">
            <TextField
              label="Search"
              hideLabel
              compact
              type="search"
              placeholder="Number, subject, requester, tag or any word"
              trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
              value={text}
              onChange={(event) => {
                const value = event.target.value;
                setText(value);
                window.clearTimeout(typing.current);
                typing.current = window.setTimeout(() => {
                  show({ ...filters, q: value.trim() }, sort);
                }, 300);
              }}
            />
          </div>
          <Button
            variant={sheetCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            className="md:hidden"
            icon={<SlidersHorizontal aria-hidden className="size-4" />}
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            {sheetCount > 0 ? `Filters (${String(sheetCount)})` : 'Filters'}
          </Button>
          <div className="hidden md:contents">
            <FilterBar
              filters={filters}
              onChange={(next) => {
                show(next, sort);
              }}
            />
            {filterCount(filters) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  show({}, sort, 'all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          {modified && current?.saved?.canEdit && (
            <Button
              variant="outline"
              size="sm"
              loading={updateView.isPending}
              onClick={() => {
                if (current.saved) {
                  updateView.mutate({ viewId: current.saved.id, data: { filters, sort } });
                }
              }}
            >
              Update view
            </Button>
          )}
          {modified && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSaving('new');
              }}
            >
              Save as view
            </Button>
          )}
        </div>
      )}
      {body}
      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        sort={sort}
        total={total}
        onChange={(next, nextSort) => {
          show(next, nextSort);
        }}
      />
      {saving && (
        <SaveViewDrawer
          view={saving === 'new' ? undefined : saving}
          filters={filters}
          sort={sort}
          canShare={can(me, 'views.manage_shared')}
          onClose={() => {
            setSaving(null);
          }}
          onSaved={(view, message) => {
            void refreshViews();
            setSaving(null);
            toast({ tone: 'success', message });
            if (saving === 'new')
              setSearch({ view: view.id, ...filterParams(view.filters, view.sort) });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          destructive
          pending={removeView.isPending}
          title={`Delete the view ${deleting.name}?`}
          description={
            deleting.shared
              ? 'It goes for everyone in the workspace. Tickets are not changed.'
              : 'Only the saved filters go. Tickets are not changed.'
          }
          confirmLabel="Delete view"
          onConfirm={() => {
            removeView.mutate({ viewId: deleting.id });
          }}
        />
      )}
    </div>
  );
}
