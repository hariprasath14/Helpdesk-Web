/**
 * Full-page navigation to another address (another workspace, or the main address), which the
 * router cannot do. One function, so tests can replace it.
 */
export function goTo(url: string): void {
  window.location.assign(url);
}
