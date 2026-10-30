import { ApiError } from '../../api/http';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Field messages from the API's standard error ({ details: { fields: [{ field, message }] } }). */
export function apiFieldErrors<K extends string>(
  error: unknown,
  known: readonly K[],
): FieldErrors<K> {
  if (!(error instanceof ApiError)) return {};
  const fields = (error.details as { fields?: { field: string; message: string }[] } | undefined)
    ?.fields;
  const result: FieldErrors<K> = {};
  for (const item of fields ?? []) {
    const key = known.find((name) => name === item.field);
    if (key && !result[key]) result[key] = item.message;
  }
  return result;
}

/** A sentence for errors that are not about one field. */
export function formError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many attempts from your network. Please wait a while and try again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
