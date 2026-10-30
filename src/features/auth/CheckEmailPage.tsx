import { MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { usePostApiV1SignupResend } from '../../api/generated/accounts/accounts';
import { Button } from '../../components/Button';
import { formError } from './api-errors';
import { AuthLayout } from './AuthLayout';

/** Seconds before "Resend email" is offered again (the API ignores earlier requests). */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * After sign-up: tells the person to open the link we emailed, with a resend button that waits a
 * minute between sends. Reached with the email in navigation state, or from an expired link as
 * ?email=…&resend=1, which sends a fresh link straight away.
 */
export function CheckEmailPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const email = (location.state as { email?: string } | null)?.email ?? params.get('email') ?? '';
  const resendNow = params.get('resend') === '1';

  const [secondsLeft, setSecondsLeft] = useState(resendNow ? 0 : RESEND_COOLDOWN_SECONDS);
  const [sentAgain, setSentAgain] = useState(false);
  const autoSent = useRef(false);

  const resend = usePostApiV1SignupResend({
    mutation: {
      onSuccess: () => {
        setSentAgain(true);
        setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      },
    },
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [secondsLeft]);

  useEffect(() => {
    if (resendNow && email && !autoSent.current) {
      autoSent.current = true;
      resend.mutate({ data: { email } });
    }
  }, [resendNow, email, resend]);

  if (!email) return <Navigate to="/signup" replace />;

  return (
    <AuthLayout title="Check your email">
      <div className="flex flex-col items-center text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand-tint-text">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <p>
          We&apos;ve sent a link to <strong className="text-ink">{email}</strong>. Click it to
          finish setting up your workspace.
        </p>
        <p className="mt-2 text-xs text-ink-subtle">
          The link works once and expires in 24 hours. Check your spam folder if you don&apos;t see
          it.
        </p>

        <div role="status" aria-live="polite" className="mt-6 min-h-5 text-sm">
          {sentAgain && !resend.isPending && (
            <span className="text-success-text">We&apos;ve sent another email.</span>
          )}
          {resend.isError && <span className="text-danger-text">{formError(resend.error)}</span>}
        </div>

        <Button
          variant="outline"
          className="mt-3 w-full"
          loading={resend.isPending}
          disabled={secondsLeft > 0}
          onClick={() => {
            resend.mutate({ data: { email } });
          }}
        >
          {secondsLeft > 0 ? `Resend email in ${String(secondsLeft)}s` : 'Resend email'}
        </Button>
        <Link to="/signup" className="mt-4 text-sm font-medium text-brand-link hover:underline">
          Wrong email? Start again
        </Link>
      </div>
    </AuthLayout>
  );
}
