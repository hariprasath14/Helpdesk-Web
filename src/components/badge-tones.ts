export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const TONES: Record<BadgeTone, { pill: string; dot: string }> = {
  brand: { pill: 'bg-brand-tint text-brand-tint-text', dot: 'bg-brand-500' },
  success: { pill: 'bg-success-bg text-success-text', dot: 'bg-success-dot' },
  warning: { pill: 'bg-warning-bg text-warning-text', dot: 'bg-warning-dot' },
  danger: { pill: 'bg-danger-bg text-danger-text', dot: 'bg-danger-dot' },
  info: { pill: 'bg-info-bg text-info-text', dot: 'bg-info-dot' },
  neutral: { pill: 'bg-neutral-bg text-neutral-text', dot: 'bg-neutral-dot' },
};

/** The pill's background and text colours alone, for round icon boxes. */
export function pillClass(tone: BadgeTone): string {
  return TONES[tone].pill;
}

/** The dot colour alone, for places such as toasts. */
export function toneDotClass(tone: BadgeTone): string {
  return TONES[tone].dot;
}
