import { Dialog } from 'radix-ui';
import { useState, type SyntheticEvent } from 'react';
import { usePostApiV1MeReauthenticate } from '../../api/generated/members/members';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/PasswordField';
import { apiFieldErrors, formError } from '../auth/api-errors';

interface ReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}

/** "Confirm your password" before a sensitive admin action; not asked again for 10 minutes. */
export function ReauthDialog({ open, onOpenChange, onConfirmed }: ReauthDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const confirm = usePostApiV1MeReauthenticate({
    mutation: {
      onSuccess: () => {
        setPassword('');
        onConfirmed();
      },
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['password'] as const).password ?? formError(failure));
      },
    },
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    confirm.mutate({ data: { password } });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (confirm.isPending) return;
        if (!next) {
          setPassword('');
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-lg">
          <Dialog.Title className="text-lg font-bold text-ink">Confirm your password</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-muted">
            This change needs your password. You won&apos;t be asked again for 10 minutes.
          </Dialog.Description>
          <form noValidate onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <PasswordField
              label="Your password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              error={error}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(undefined);
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={confirm.isPending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={confirm.isPending}>
                Confirm
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
