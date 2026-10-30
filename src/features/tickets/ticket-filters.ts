import type {
  GetApiV1TicketsParams,
  GetApiV1TicketsSort,
  TicketFilters,
} from '../../api/generated/model';

export type Filters = TicketFilters;
export type Sort = GetApiV1TicketsSort;

/** The filter keys that hold lists, in the order the filter bar shows them. */
export const LIST_KEYS = ['status', 'priority', 'type', 'teamId', 'assignee', 'tag'] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority', label: 'Highest priority' },
  { value: 'due', label: 'Due soonest' },
];

const UNRESOLVED = ['open', 'pending', 'waiting_on_customer'] as Filters['status'];

export interface BuiltInView {
  id: string;
  name: string;
  filters: Filters;
  /** Only for people who can see the trash. */
  trash?: boolean;
}

/** Views every workspace has; the first one is where the list starts. */
export const BUILT_IN_VIEWS: BuiltInView[] = [
  { id: 'unresolved', name: 'All unresolved', filters: { status: UNRESOLVED } },
  { id: 'mine', name: 'My unresolved', filters: { status: UNRESOLVED, assignee: ['me'] } },
  { id: 'unassigned', name: 'Unassigned', filters: { status: UNRESOLVED, assignee: ['none'] } },
  { id: 'all', name: 'All tickets', filters: {} },
  { id: 'resolved', name: 'Resolved and closed', filters: { status: ['resolved', 'closed'] } },
  { id: 'trash', name: 'Trash', filters: {}, trash: true },
];

/** The filters and sort in an address's query (`status=open,pending&sort=priority`). */
export function readFilters(search: URLSearchParams): { filters: Filters; sort: Sort } {
  const filters: Record<string, unknown> = {};
  for (const key of LIST_KEYS) {
    const value = search.get(key);
    if (value) filters[key] = value.split(',').filter(Boolean);
  }
  const q = search.get('q')?.trim();
  if (q) filters.q = q;
  if (search.get('overdue') === 'true') filters.overdue = true;
  const sort = SORT_OPTIONS.find((option) => option.value === search.get('sort'))?.value;
  return { filters: filters, sort: sort ?? 'updated' };
}

/** Filters and sort as address query values (empty ones left out). */
export function filterParams(filters: Filters, sort: Sort): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of LIST_KEYS) {
    const list = filters[key];
    if (list && list.length > 0) params[key] = list.join(',');
  }
  if (filters.q?.trim()) params.q = filters.q.trim();
  if (filters.overdue) params.overdue = 'true';
  if (sort !== 'updated') params.sort = sort;
  return params;
}

/** The API's list parameters for these filters. */
export const listParams = (filters: Filters, sort: Sort): GetApiV1TicketsParams =>
  filterParams(filters, sort);

/** Same filters, ignoring order inside lists and empty values. */
export function sameFilters(a: Filters, b: Filters): boolean {
  const key = (filters: Filters) => {
    const params = filterParams(filters, 'updated');
    return JSON.stringify(
      Object.keys(params)
        .sort()
        .map((name) => [name, (params[name] ?? '').split(',').sort().join(',')]),
    );
  };
  return key(a) === key(b);
}

/** How many filters are set (each list counts once), for "Clear filters (3)". */
export const filterCount = (filters: Filters) =>
  LIST_KEYS.filter((key) => (filters[key]?.length ?? 0) > 0).length +
  (filters.q ? 1 : 0) +
  (filters.overdue ? 1 : 0);
