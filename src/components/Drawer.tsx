import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { ConfirmDialog } from './ConfirmDialog';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional sentence under the title; announced to screen readers. */
  description?: string;
  children: ReactNode;
  /** Sticky bottom bar: a text link on the left, Cancel and the main button on the right. */
  footer?: ReactNode;
  width?: 'md' | 'lg';
}

/**
 * The right-side panel used for create and edit forms (Figma "Pattern · Side drawer"). The page
 * behind is dimmed; the header and footer stay fixed while the body scrolls. Full width on phones.
 * Once something is typed or chosen in it, closing with X, Escape or a click outside asks first,
 * and so does leaving the page (Step 5b); its own Cancel button discards without asking.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
}: DrawerProps) {
  const [edited, setEdited] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // A drawer kept mounted between uses (open toggled by its page) starts clean each time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setEdited(false);
      setConfirming(false);
    }
  }
  const close = () => {
    setEdited(false);
    setConfirming(false);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (edited) setConfirming(true);
        else close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-surface shadow-lg',
            width === 'md' ? 'sm:max-w-md' : 'sm:max-w-2xl',
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="text-base font-bold text-ink">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </header>
          {description && (
            <Dialog.Description className="px-6 pt-4 text-ink-muted">
              {description}
            </Dialog.Description>
          )}
          {/* Any typing or choosing inside counts as a change. */}
          <div
            className="flex-1 overflow-y-auto px-6 py-5"
            onInput={() => {
              setEdited(true);
            }}
            onChange={() => {
              setEdited(true);
            }}
          >
            {children}
          </div>
          {footer && (
            <footer className="flex items-center gap-2 border-t border-border px-6 py-4">
              {footer}
            </footer>
          )}
          {open && edited && <UnsavedChangesGuard backOnly />}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Discard your changes?"
            description="What you entered in this panel is not saved yet. If you close it, it is lost."
            confirmLabel="Discard changes"
            destructive
            onConfirm={close}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
