import { createContext, use } from 'react';

export interface ToastOptions {
  message: string;
  tone?: 'success' | 'danger' | 'info' | 'warning';
  /** At most one action, for example Undo, Retry, View or Open. */
  action?: { label: string; onClick: () => void };
}

export type ShowToast = (options: ToastOptions) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/** How long a toast stays (Figma: 5 seconds). Hovering or focusing it pauses the timer. */
export const TOAST_DURATION_MS = 5_000;

/** Returns `toast({ message, tone, action })`. Use it below <ToastProvider>. */
export function useToast(): ShowToast {
  const show = use(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
