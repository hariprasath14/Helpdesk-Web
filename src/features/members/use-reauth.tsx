import { useState } from 'react';
import { ApiError } from '../../api/http';
import { ReauthDialog } from './ReauthDialog';

/** The API's answer when a sensitive action needs the password confirmed first. */
export const isReauthRequired = (error: unknown) =>
  error instanceof ApiError && error.code === 'REAUTH_REQUIRED';

/**
 * For actions that may need the password confirmed: call `ask(retry)` when the API answers
 * REAUTH_REQUIRED; after the password is confirmed, `retry` runs. Render `dialog` once.
 */
export function useReauth() {
  const [retry, setRetry] = useState<(() => void) | null>(null);
  return {
    ask: (again: () => void) => {
      setRetry(() => again);
    },
    dialog: (
      <ReauthDialog
        open={retry !== null}
        onOpenChange={(open) => {
          if (!open) setRetry(null);
        }}
        onConfirmed={() => {
          const again = retry;
          setRetry(null);
          again?.();
        }}
      />
    ),
  };
}
