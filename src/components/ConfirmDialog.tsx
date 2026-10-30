import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { buttonClasses } from './button-styles';
import { Spinner } from './Spinner';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question naming the action and its target, for example "Delete 3 tickets?". */
  title: string;
  /** What will happen, including whether it can be undone. */
  description: ReactNode;
  /** Repeats the action, for example "Delete 3 tickets" (never just "OK"). */
  confirmLabel: string;
  onConfirm: () => void;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
  /** While the action runs: the confirm button shows a spinner and the dialog cannot close. */
  pending?: boolean;
}

/**
 * Asks before an irreversible or important action. Focus starts on Cancel, Escape cancels, and
 * keyboard focus stays inside the dialog while it is open.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-bold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-ink-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-8 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClasses('outline')} disabled={pending}>
              Cancel
            </AlertDialog.Cancel>
            <button
              type="button"
              className={buttonClasses(destructive ? 'danger' : 'primary')}
              onClick={onConfirm}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending && <Spinner />}
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
