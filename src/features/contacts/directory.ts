import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/http';
import { formError } from '../auth/api-errors';

/**
 * Marks every contact and company query stale (lists, pages, counts), after any change: a contact
 * change can move a company's contact count, and a company rename shows on its contacts.
 */
export function refreshDirectory(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const [key] = query.queryKey;
      return (
        typeof key === 'string' &&
        (key.startsWith('/api/v1/contacts') || key.startsWith('/api/v1/companies'))
      );
    },
  });
}

export interface FormProblems {
  /** By the API's field path: "email", "otherEmails.1", "customFields.plan". */
  fields: Record<string, string>;
  /** A message not about one field. */
  form?: string;
}

/** The messages of a refused save, by field. */
export function problemsFrom(failure: unknown): FormProblems {
  const list =
    failure instanceof ApiError
      ? ((failure.details as { fields?: { field: string; message: string }[] } | undefined)
          ?.fields ?? [])
      : [];
  if (list.length === 0) return { fields: {}, form: formError(failure) };
  return { fields: Object.fromEntries(list.map((item) => [item.field, item.message])) };
}

/** The customFields.<key> messages, keyed by field key. */
export function customFieldProblems(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([path]) => path.startsWith('customFields.'))
      .map(([path, message]) => [path.slice('customFields.'.length), message]),
  );
}

/** A website as a link: "acme.com" opens https://acme.com. */
export const websiteHref = (website: string) =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`;
