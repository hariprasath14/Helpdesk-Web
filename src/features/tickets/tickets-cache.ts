import type { QueryClient } from '@tanstack/react-query';

/**
 * Marks every ticket query stale (lists, pages, history, tag suggestions) after a change: a
 * change to one ticket moves it in every list.
 */
export function refreshTickets(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const [key] = query.queryKey;
      return typeof key === 'string' && key.startsWith('/api/v1/tickets');
    },
  });
}
