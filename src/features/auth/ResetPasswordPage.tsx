import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Clock, LinkIcon } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getGetApiV1MeQueryKey } from '../../api/generated/accounts/accounts';
import {
  usePostApiV1AuthResetPassword,
  usePostApiV1AuthResetPasswordCheck,
} from '../../api/generated/auth/auth';
import { ApiError } from '../../api/http';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/button-styles';
import { PasswordField } from '../../components/PasswordField';
import { Spinner } from '../../components/Spinner';
import { StateMessage } from '../../components/StateMessage';
import { PASSWORD_MIN_LENGTH } from '../../lib/password-strength';
import { WorkspaceNotFoundPage } from '../workspace/pages';
import { apiFieldErrors, formError } from './api-errors';
import { AuthLayout } from './AuthLayout';

type Failure = 'invalid' | 'used' | 'expired';

function linkFailure(error: unknown): Failure | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const details = error.details as { reason?: Failure; fields?: { field: string }[] } | undefined;
  // A mistyped or cut-off link fails the token's format check: the same as an unknown link.
  if (details?.fields?.some((found) => found.field === 'token')) return 'invalid';
  return details?.reason ?? null;
}

const FAILURES: Record<
  Failure,
  { title: string; heading: string; text: string; icon: typeof Clock }
> = {
  expired: {
    title: 'This link has expired',
    heading: 'Reset links expire after 1 hour',
    text: 'Ask for a new one and use it within the hour.',
    icon: Clock,
  },
  used: {
    title: 'This link was already used',
    heading: 'Each reset link works once',
    text: 'If you still need to change your password, ask for a new link.',
    icon: LinkIcon,
  },
  invalid: {
    title: 'This link is not valid',
    heading: "We couldn't use this link",
    text: 'It may be incomplete or from an older email. Use the newest email we sent, or ask for a new link.',
    icon: CircleAlert,
  },
};

/**
 * Opened from the reset email on the workspace's address. Checks the link first, so an expired
 * one says so before anyone types a new password. After saving, the person signs in again.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  const check = usePostApiV1AuthResetPasswordCheck();
  const reset = usePostApiV1AuthResetPassword({
    mutation: {
      onSuccess: () => {
        // Every session has ended; forget any signed-in answer this tab still holds.
        queryClient.removeQueries({ queryKey: getGetApiV1MeQueryKey() });
        void navigate('/login?reason=password-reset', { replace: true });
      },
      onError: (failure) => {
        const message = apiFieldErrors(failure, ['password'] as const).password;
        if (message) {
          setError(message);
          inputRef.current?.focus();
        }
      },
    },
  });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    check.mutate({ data: { token } });
  }, [token, check]);

  const failure: Failure | null = token
    ? (linkFailure(reset.error) ?? linkFailure(check.error))
    : 'invalid';

  if (failure) {
    const { title, heading, text, icon } = FAILURES[failure];
    return (
      <AuthLayout title={title}>
        <StateMessage
          icon={icon}
          tone={failure === 'invalid' ? 'danger' : 'neutral'}
          title={heading}
          description={text}
          actions={
            <Link to="/forgot-password" className={buttonClasses()}>
              Get a new link
            </Link>
          }
        />
      </AuthLayout>
    );
  }
  if (check.error instanceof ApiError && check.error.status === 404) {
    return <WorkspaceNotFoundPage />;
  }
  if (check.isError) {
    return (
      <AuthLayout title="Something went wrong">
        <StateMessage
          role="alert"
          icon={CircleAlert}
          tone="danger"
          title="We couldn't check your link"
          description="Check your connection and try again."
          actions={
            <button
              type="button"
              className={buttonClasses()}
              onClick={() => {
                check.mutate({ data: { token } });
              }}
            >
              Try again
            </button>
          }
        />
      </AuthLayout>
    );
  }
  if (!check.isSuccess) {
    return (
      <AuthLayout title="Reset your password">
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Spinner className="size-5" /> Checking your link…
        </div>
      </AuthLayout>
    );
  }

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`);
      inputRef.current?.focus();
      return;
    }
    reset.mutate({ data: { token, password } });
  };
  const generalError =
    reset.isError && !apiFieldErrors(reset.error, ['password'] as const).password
      ? formError(reset.error)
      : null;

  return (
    <AuthLayout title="Choose a new password" subtitle={`For ${check.data.email}`}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {/* Lets password managers save the new password under the right account. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={check.data.email}
          readOnly
          hidden
        />
        <PasswordField
          ref={inputRef}
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          showStrength
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, not one of your last 5. You'll be signed out on all devices.`}
          value={password}
          error={error}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(undefined);
          }}
        />
        {generalError && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {generalError}
          </p>
        )}
        <Button type="submit" loading={reset.isPending} className="w-full">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
