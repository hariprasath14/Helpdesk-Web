import { useEffect } from 'react';
import { NavigationType, useBlocker } from 'react-router';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Asks before leaving a page with changes that are not saved (Step 5b): a dialog for moves inside
 * the app, the browser's own prompt for reloading or closing the tab. Render it only while there
 * are unsaved changes, for example `{dirty && <UnsavedChangesGuard />}`.
 */
export function UnsavedChangesGuard({
  backOnly = false,
}: {
  /**
   * Only the browser's Back and Forward. For drawers: they cover the page, and after saving they
   * open what was saved, which must not be blocked.
   */
  backOnly?: boolean;
}) {
  // Changing only the query (filters, a drawer's ?param) stays on the page, so it is not blocked.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (!backOnly || historyAction === NavigationType.Pop),
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, []);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title="Leave without saving?"
      description="Your changes on this page are not saved yet. If you leave, they are lost."
      confirmLabel="Leave without saving"
      destructive
      onConfirm={() => {
        blocker.proceed?.();
      }}
    />
  );
}
