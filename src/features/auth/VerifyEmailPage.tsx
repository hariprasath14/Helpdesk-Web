import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Clock, LinkIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import {
  getGetApiV1MeQueryKey,
  usePostApiV1AuthVerifyEmail,
} from '../../api/generated/accounts/accounts';
import { ApiError } from '../../api/http';
import { buttonClasses } from '../../components/button-styles';
import { Spinner } from '../../components/Spinner';
import { StateMessage } from '../../components/StateMessage';
import { config } from '../../config';
import { mainOrigin } from '../../app/host';
import { AuthLayout } from './AuthLayout';

type Failure = 'invalid' | 'used' | 'expired';

function failureOf(error: unknown): { reason: Failure; email?: string } | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const details = error.details as { reason?: Failure; email?: string } | undefined;
  return details?.reason
    ? { reason: details.reason, ...(details.email ? { email: details.email } : {}) }
    : null;
}

/**
 * Opened from the confirmation email, on the workspace's address. Confirms the email once, which
 * signs the owner in, then opens the workspace. Expired, used and broken links each get a way on.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const queryClient = useQueryClient();
  const started = useRef(false);

  const verify = usePostApiV1AuthVerifyEmail({
    mutation: {
      onSuccess: (me) => {
        queryClient.setQueryData(getGetApiV1MeQueryKey(), me);
      },
    },
  });

  useEffect(() => {
    // The link works once: never send it twice (React runs effects twice in development).
    if (!token || started.current) return;
    started.current = true;
    verify.mutate({ data: { token } });
  }, [token, verify]);

  if (verify.isSuccess) return <Navigate to="/" replace />;

  const signupHome = `${mainOrigin(config.appDomain, window.location)}/signup`;
  const failure = token ? failureOf(verify.error) : { reason: 'invalid' as const };

  if (failure?.reason === 'expired') {
    const resendUrl = new URL(
      `${mainOrigin(config.appDomain, window.location)}/signup/check-email`,
    );
    if (failure.email) {
      resendUrl.searchParams.set('email', failure.email);
      resendUrl.searchParams.set('resend', '1');
    }
    return (
      <AuthLayout title="This link has expired">
        <StateMessage
          icon={Clock}
          tone="neutral"
          title="Links expire after 24 hours"
          description="We can send you a new one."
          actions={
            <a href={failure.email ? resendUrl.href : signupHome} className={buttonClasses()}>
              Send a new link
            </a>
          }
        />
      </AuthLayout>
    );
  }
  if (failure?.reason === 'used') {
    return (
      <AuthLayout title="This link was already used">
        <StateMessage
          icon={LinkIcon}
          tone="neutral"
          title="Your email is already confirmed"
          description="Open your workspace to continue."
          actions={
            <a href="/" className={buttonClasses()}>
              Open workspace
            </a>
          }
        />
      </AuthLayout>
    );
  }
  if (failure?.reason === 'invalid') {
    return (
      <AuthLayout title="This link is not valid">
        <StateMessage
          icon={CircleAlert}
          tone="danger"
          title="We couldn't use this link"
          description="It may be incomplete or from an older email. Use the newest email we sent, or sign up again."
          actions={
            <a href={signupHome} className={buttonClasses('outline')}>
              Go to sign-up
            </a>
          }
        />
      </AuthLayout>
    );
  }
  if (verify.isError) {
    return (
      <AuthLayout title="Something went wrong">
        <StateMessage
          role="alert"
          icon={CircleAlert}
          tone="danger"
          title="We couldn't confirm your email"
          description="Check your connection and try again."
          actions={
            <button
              type="button"
              className={buttonClasses()}
              onClick={() => {
                verify.mutate({ data: { token } });
              }}
            >
              Try again
            </button>
          }
        />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Confirming your email">
      <div role="status" className="flex items-center justify-center gap-2 py-6 text-ink-muted">
        <Spinner className="size-5" /> Setting up your workspace…
      </div>
    </AuthLayout>
  );
}
