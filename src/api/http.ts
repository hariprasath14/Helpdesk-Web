import { config } from '../config';
import { PRODUCT_NAME } from '../product';

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again.';
const NETWORK_MESSAGE = `Cannot reach ${PRODUCT_NAME}. Check your connection and try again.`;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfToken: string | undefined;

/**
 * Remembers the signed-in session's CSRF token (from /me, login and password change); apiFetch
 * sends it on every change. The query client keeps it in step with the cached session.
 */
export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

/**
 * Every failed API call becomes an ApiError, so screens handle one shape. `code` and `message`
 * come from the API's standard `{ error: { code, message, details } }` body when it has one;
 * `message` is always safe to show to the user.
 */
export class ApiError<Body = unknown> extends Error {
  constructor(
    /** HTTP status, or 0 when the API could not be reached at all. */
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** The raw response body, for endpoints whose error responses carry data (for example /health). */
    public readonly body?: Body,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

/** Orval uses this as the error type of every generated hook. */
export type ErrorType<Body> = ApiError<Body>;

function isErrorBody(
  body: unknown,
): body is { error: { code: string; message: string; details?: unknown } } {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * The fetch wrapper behind every generated API function (orval mutator): adds the API base URL,
 * sends the session cookie (also when VITE_API_URL points elsewhere) and, on changes, the CSRF
 * token, and turns failures into ApiError.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const method = (init.method ?? 'GET').toUpperCase();
  if (csrfToken && !SAFE_METHODS.has(method)) headers.set('X-CSRF-Token', csrfToken);

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE, undefined, undefined, { cause });
  }

  const body = await readBody(response);
  if (!response.ok) {
    if (isErrorBody(body)) {
      const { code, message, details } = body.error;
      throw new ApiError(response.status, code, message, details, body);
    }
    throw new ApiError(response.status, 'HTTP_ERROR', GENERIC_MESSAGE, undefined, body);
  }
  return body as T;
}
