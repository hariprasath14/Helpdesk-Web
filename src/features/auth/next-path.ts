/**
 * Where to go after login: a path inside this app taken from ?next=, never another site
 * (`//evil.com`, `/\evil.com` and full URLs are refused), never the login page itself.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (raw === '/login' || raw.startsWith('/login?')) return '/';
  return raw;
}

/** The login address that brings the person back to `path` afterwards. */
export function loginPath(path: string, reason?: 'expired'): string {
  const params = new URLSearchParams();
  if (path !== '/') params.set('next', path);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
