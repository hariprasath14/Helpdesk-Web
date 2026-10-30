import {
  MutationCache,
  QueryCache,
  QueryClient,
  type Query,
  type QueryKey,
} from '@tanstack/react-query';
import { getGetApiV1MeQueryKey } from '../api/generated/accounts/accounts';
import type { Me } from '../api/generated/model';
import { ApiError, setCsrfToken } from '../api/http';

/** Client errors (4xx) will not succeed on a retry; network and server errors might. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * A signed-in request answered "sign in again": the session ended (idle timeout, signed out on
 * another device, password changed). A wrong password at login is a different code.
 */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === 'UNAUTHORIZED';
}

const ME_KEY = getGetApiV1MeQueryKey();
const isMeKey = (queryKey: QueryKey) => queryKey[0] === ME_KEY[0];

/** One cache for all server data. Screens read through the generated hooks in src/api. */
export function createQueryClient(): QueryClient {
  // When any request finds the session has ended, check /me again; the signed-in layout then
  // sends the person to the login page and back to where they were afterwards.
  const onError = (error: unknown, queryKey?: QueryKey) => {
    if (isSessionEnded(error) && !(queryKey && isMeKey(queryKey))) {
      void client.invalidateQueries({ queryKey: ME_KEY });
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        onError(error, query.queryKey);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        onError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });

  // The CSRF token follows the cached session: set when /me arrives or is replaced (login, password
  // change), cleared when the cache is cleared at sign-out.
  client.getQueryCache().subscribe((event) => {
    // The cache types its events loosely; this is a query like any other.
    const query = event.query as Query<Me | undefined>;
    if (!isMeKey(query.queryKey)) return;
    setCsrfToken(event.type === 'removed' ? undefined : query.state.data?.csrfToken);
  });
  return client;
}
