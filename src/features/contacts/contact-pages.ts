import { useInfiniteQuery } from '@tanstack/react-query';
import type { GetApiV1ContactsParams, GetApiV1ContactsSort } from '../../api/generated/model';
import {
  getApiV1Contacts,
  getGetApiV1ContactsQueryKey,
} from '../../api/generated/contacts/contacts';

export const SORT_OPTIONS: { value: GetApiV1ContactsSort; label: string }[] = [
  { value: 'name', label: 'Name, A to Z' },
  { value: 'updated', label: 'Recently updated' },
];

/** Pages of contacts for the given filters ("Load more" fetches the next page). */
export function useContactPages(params: Omit<GetApiV1ContactsParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: getGetApiV1ContactsQueryKey(params),
    queryFn: ({ pageParam }) =>
      getApiV1Contacts({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export const countText = (total: number, one: string, many: string) =>
  total === 1 ? `1 ${one}` : `${total.toLocaleString('en-IN')} ${many}`;
