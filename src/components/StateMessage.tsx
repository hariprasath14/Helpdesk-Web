import { CircleAlert, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

interface StateMessageProps {
  icon: LucideIcon;
  tone?: 'brand' | 'danger' | 'neutral';
  title: string;
  description?: ReactNode;
  /** Buttons or links; the first one is the main action. */
  actions?: ReactNode;
  /** Small grey note under the actions, for example a hint about filters. */
  footnote?: ReactNode;
  role?: 'alert' | 'status';
}

const ICON_TONES = {
  brand: 'bg-brand-tint text-brand-tint-text',
  danger: 'bg-danger-bg text-danger-text',
  neutral: 'bg-surface-sunken text-ink-muted',
};

/**
 * The shared layout behind the empty, error and no-access states (Figma "Shared states"): an icon
 * in a soft circle, a title, one or two sentences, and actions, centred in a white card.
 */
export function StateMessage({
  icon: Icon,
  tone = 'brand',
  title,
  description,
  actions,
  footnote,
  role,
}: StateMessageProps) {
  return (
    <section
      role={role}
      className="flex flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center"
    >
      <span
        className={cn(
          'mb-4 flex size-14 items-center justify-center rounded-full',
          ICON_TONES[tone],
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="text-base font-bold">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-ink-muted">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
      {footnote && <p className="mt-6 max-w-md text-xs text-ink-subtle">{footnote}</p>}
    </section>
  );
}

/** For lists and pages with nothing to show yet. Pass the feature's own icon, text and actions. */
export function EmptyState(props: Omit<StateMessageProps, 'tone' | 'role'>) {
  return <StateMessage tone="brand" {...props} />;
}

interface ErrorStateProps {
  /** What failed, for example "your tickets". */
  what: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Short code support can look up, for example "LD-503". */
  code?: string;
}

/** When loading failed. Never shows technical details; offers a retry and a code for support. */
export function ErrorState({ what, onRetry, retrying = false, code }: ErrorStateProps) {
  return (
    <StateMessage
      role="alert"
      tone="danger"
      icon={CircleAlert}
      title={`We couldn't load ${what}`}
      description={
        <>
          Check your internet connection and try again.
          {code && ` If it keeps happening, contact support with error code ${code}.`}
        </>
      }
      actions={
        onRetry && (
          <Button onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        )
      }
    />
  );
}

interface NoAccessStateProps {
  /** The page, for example "Settings". */
  area: string;
  /** Who can help, for example "Only Admins can change workspace settings. Ask an Admin …". */
  explanation: ReactNode;
  action?: ReactNode;
}

/** When the user's role cannot open a page. The API enforces this too; this is only the message. */
export function NoAccessState({ area, explanation, action }: NoAccessStateProps) {
  return (
    <StateMessage
      tone="neutral"
      icon={Lock}
      title={`You don't have access to ${area}`}
      description={explanation}
      actions={action}
    />
  );
}
