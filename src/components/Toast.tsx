import { X } from 'lucide-react';
import { Toast as RadixToast } from 'radix-ui';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { toneDotClass } from './badge-tones';
import {
  TOAST_DURATION_MS,
  ToastContext,
  type ShowToast,
  type ToastOptions,
} from './toast-context';

interface ToastItem extends ToastOptions {
  id: number;
}

/** Shows toasts bottom-left. Wrap the app once; call `useToast()` anywhere below it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((options) => {
    setToasts((current) => [...current.slice(-3), { ...options, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      <RadixToast.Provider duration={TOAST_DURATION_MS} swipeDirection="right" label="Notification">
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            type={toast.tone === 'danger' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) remove(toast.id);
            }}
            className="flex items-center gap-3 rounded-xl bg-surface-inverse px-4 py-3 text-ink-inverse shadow-lg"
          >
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-full', toneDotClass(toast.tone ?? 'info'))}
            />
            <RadixToast.Description className="flex-1 text-sm">
              {toast.message}
            </RadixToast.Description>
            {toast.action && (
              <RadixToast.Action
                altText={toast.action.label}
                onClick={toast.action.onClick}
                className="rounded-md px-1 text-sm font-bold text-brand-toast-action hover:underline"
              >
                {toast.action.label}
              </RadixToast.Action>
            )}
            <RadixToast.Close
              aria-label="Dismiss"
              className="rounded-md p-1 text-ink-inverse/70 hover:text-ink-inverse"
            >
              <X aria-hidden className="size-4" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        {/* Bottom right on wider screens; top centre on phones, clear of the New button. */}
        <RadixToast.Viewport className="fixed top-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col gap-2 outline-none md:top-auto md:right-4 md:bottom-4 md:left-auto md:translate-x-0" />
      </RadixToast.Provider>
    </ToastContext>
  );
}
