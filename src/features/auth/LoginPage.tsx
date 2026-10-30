import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { getGetApiV1MeQueryKey, useGetApiV1Me } from '../../api/generated/accounts/accounts';
import { usePostApiV1AuthLogin } from '../../api/generated/auth/auth';
import type { Me } from '../../api/generated/model';
import { ApiError } from '../../api/http';
import { mainOrigin } from '../../app/host';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/PasswordField';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { config } from '../../config';
import { WorkspaceNotFoundPage } from '../workspace/pages';
import { formError, type FieldErrors } from './api-errors';
import { AuthLayout } from './AuthLayout';
import { LoginCodeStep } from './LoginCodeStep';
import { safeNextPath } from './next-path';

type Field = 'email' | 'password';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NOTICES = {
  'signed-out': "You've signed out.",
  'password-reset': 'Your password was changed. Sign in with your new password.',
  expired: 'Your session ended. Sign in again to continue.',
} as const;
type Notice = keyof typeof NOTICES;

/** ?reason= says why the person is here: signed out, password reset, or session ended. */
function noticeFrom(reason: string | null): Notice | null {
  return reason === 'signed-out' || reason === 'password-reset' || reason === 'expired'
    ? reason
    : null;
}

/**
 * Sign-in on a workspace address: the password, then a code when two-step verification is on.
 * Goes back to the page the person wanted (?next=) afterwards.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const next = safeNextPath(params.get('next'));
  const notice = noticeFrom(params.get('reason'));

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [step, setStep] = useState<'password' | 'code'>('password');
  /** Why the code step sent the person back here (timed out, locked), if it did. */
  const [restartReason, setRestartReason] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const signedIn = (result: Me) => {
    queryClient.setQueryData(getGetApiV1MeQueryKey(), result);
    void navigate(next, { replace: true });
  };

  // Already signed in → straight in. An unknown address → "workspace not found".
  const me = useGetApiV1Me({ query: { retry: false, staleTime: 60_000 } });
  const login = usePostApiV1AuthLogin({
    mutation: {
      onSuccess: (result) => {
        if ('twoFactorRequired' in result) {
          setStep('code');
          return;
        }
        signedIn(result);
      },
      onError: () => {
        setValues((current) => ({ ...current, password: '' }));
        formRef.current?.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
      },
    },
  });

  if (me.isSuccess) return <Navigate to={next} replace />;
  if (me.error instanceof ApiError && me.error.status === 404) return <WorkspaceNotFoundPage />;
  if (me.isPending) {
    return (
      <AuthLayout title="Sign in">
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Spinner className="size-5" /> Loading…
        </div>
      </AuthLayout>
    );
  }

  if (step === 'code') {
    return (
      <LoginCodeStep
        onSignedIn={signedIn}
        onRestart={(reason) => {
          login.reset();
          setValues((current) => ({ ...current, password: '' }));
          setRestartReason(reason || null);
          setStep('password');
        }}
      />
    );
  }

  const set = (key: Field, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors<Field> = {};
    if (!EMAIL.test(values.email.trim())) found.email = 'Enter a valid email address.';
    if (!values.password) found.password = 'Enter your password.';
    setErrors(found);
    const first = (['email', 'password'] as const).find((field) => found[field]);
    if (first) {
      formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus();
      return;
    }
    setRestartReason(null);
    login.mutate({ data: { email: values.email.trim(), password: values.password } });
  };

  let failure: string | null = null;
  if (login.error instanceof ApiError && login.error.code === 'INVALID_CREDENTIALS') {
    failure = 'Email or password is incorrect.';
  } else if (login.error instanceof ApiError && login.error.code === 'LOGIN_LOCKED') {
    failure = login.error.message;
  } else if (login.isError) {
    failure = formError(login.error);
  } else if (restartReason) {
    failure = restartReason;
  }

  return (
    <AuthLayout title="Sign in" subtitle={window.location.host}>
      {notice && !failure && (
        <p role="status" className="mb-4 rounded-lg bg-info-bg px-3 py-2 text-sm text-info-text">
          {NOTICES[notice]}
        </p>
      )}
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={values.email}
          error={errors.email}
          onChange={(event) => {
            set('email', event.target.value);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            value={values.password}
            error={errors.password}
            onChange={(event) => {
              set('password', event.target.value);
            }}
          />
          <Link
            to="/forgot-password"
            className="self-end text-xs font-medium text-brand-link hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {failure && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {failure}
          </p>
        )}

        <Button type="submit" loading={login.isPending} className="mt-1 w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-muted">
        Not your workspace?{' '}
        <a
          href={`${mainOrigin(config.appDomain, window.location)}/login`}
          className="font-medium text-brand-link hover:underline"
        >
          Find your workspace
        </a>
      </p>
    </AuthLayout>
  );
}
