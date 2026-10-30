/**
 * Which part of the app this address is: the main address (sign-up) or a workspace
 * (acme.helpdesk.example.com, locally acme.localhost:5173). The API makes the same decision from the
 * request's address, so the two always agree.
 */
export type HostKind = { kind: 'main' } | { kind: 'workspace'; subdomain: string };

export function hostKind(appDomain: string, hostname: string): HostKind {
  const host = hostname.toLowerCase();
  const domain = appDomain.toLowerCase();
  if (host.endsWith(`.${domain}`)) {
    const label = host.slice(0, -(domain.length + 1));
    if (label && !label.includes('.')) return { kind: 'workspace', subdomain: label };
  }
  return { kind: 'main' };
}

/** The address of a workspace, keeping the current scheme and port: http://acme.localhost:5173 */
export function workspaceOrigin(appDomain: string, subdomain: string, current: Location): string {
  const port = current.port ? `:${current.port}` : '';
  return `${current.protocol}//${subdomain}.${appDomain}${port}`;
}

/** The main address (sign-up), keeping the current scheme and port. */
export function mainOrigin(appDomain: string, current: Location): string {
  const port = current.port ? `:${current.port}` : '';
  return `${current.protocol}//${appDomain}${port}`;
}
