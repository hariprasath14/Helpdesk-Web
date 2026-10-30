import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Clock, LinkIcon } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getGetApiV1MeQueryKey } from '../../api/generated/accounts/accounts';
import type { InvitationStatus } from '../../api/generated/model';
import {
  usePostApiV1InvitationsAccept,
  usePostApiV1InvitationsCheck,
} from '../../api/generated/members/members';
import { ApiError } from '../../api/http';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/button-styles';
import { PasswordField } from '../../components/PasswordField';
import { Spinner } from '../../components/Spinner';
import { StateMessage } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { PASSWORD_MIN_LENGTH } from '../../lib/password-strength';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { AuthLayout } from '../auth/AuthLayout';
import { WorkspaceNotFoundPage } from '../workspace/pages';
import { PRODUCT_NAME } from '../../product';

type Failure = 'invalid' | 'used' | 'expired';

const AS_ROLE: Record<InvitationStatus['role'], string> = {
  admin: 'an Admin',
  supervisor: 'a Supervisor',
  agent: 'an Agent',
};
type Field = 'name' | 'password' | 'code';
const FIELDS = ['name', 'password', 'code'] as const;

const FAILURES: Record<Failure, { title: string; text: string; icon: typeof Clock }> = {
  expired: {
    title: 'This invitation has expired',
    text: 'Invitations work for 7 days. Ask your admin to send a new one.',
    icon: Clock,
  },
  used: {
    title: 'This invitation was already used',
    text: 'If you joined, sign in to continue.',
    icon: LinkIcon,
  },
  invalid: {
    title: 'This invitation is not valid',
    text: 'It may have been replaced or withdrawn. Ask your admin for a new invitation.',
    icon: CircleAlert,
  },
};

function linkFailure(error: unknown): Failure | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const details = error.details as { reason?: Failure; fields?: { field: string }[] } | undefined;
  // A mistyped or cut-off link fails the token's format check: the same as an unknown link.
  if (details?.fields?.some((found) => found.field === 'token')) return 'invalid';
  return details?.reason ?? null;
}

function JoinForm({ token, status }: { token: string; status: InvitationStatus }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ name: '', password: '', code: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [askCode, setAskCode] = useState(status.twoFactorRequired);
  const isNew = !status.existingAccount;

  const showErrors = (found: FieldErrors<Field>) => {
    setErrors(found);
    const first = FIELDS.find((field) => found[field]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus();
  };

  const accept = usePostApiV1InvitationsAccept({
    mutation: {
      onSuccess: (me) => {
        queryClient.setQueryData(getGetApiV1MeQueryKey(), me);
        void navigate('/', { replace: true });
      },
      onError: (failure) => {
        if ((failure.details as { codeRequired?: boolean } | undefined)?.codeRequired) {
          setAskCode(true);
        }
        const found = apiFieldErrors(failure, FIELDS);
        if (Object.keys(found).length > 0) showErrors(found);
      },
    },
  });

  const set = (key: Field, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors<Field> = {};
    if (isNew && values.name.trim().length < 2) found.name = 'Enter your full name.';
    if (isNew && values.password.length < PASSWORD_MIN_LENGTH) {
      found.password = `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`;
    }
    if (!isNew && !values.password) found.password = 'Enter your password.';
    if (askCode && values.code.trim().length < 6) {
      found.code = 'Enter the code from your authenticator app.';
    }
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    accept.mutate({
      data: {
        token,
        password: values.password,
        ...(isNew ? { name: values.name.trim() } : {}),
        ...(askCode ? { code: values.code.trim() } : {}),
      },
    });
  };

  let general: string | null = null;
  if (accept.isError && Object.keys(apiFieldErrors(accept.error, FIELDS)).length === 0) {
    const reason = linkFailure(accept.error);
    general = reason ? FAILURES[reason].text : formError(accept.error);
  }

  return (
    <AuthLayout
      title={`Join ${status.workspaceName}`}
      subtitle={`${status.invitedByName ?? 'An admin'} invited you as ${AS_ROLE[status.role]}.`}
    >
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Email</span>
          <span className="text-sm text-ink-muted">{status.email}</span>
        </div>
        {/* Lets password managers save the password under the right account. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={status.email}
          readOnly
          hidden
        />
        {isNew ? (
          <>
            <TextField
              label="Full name"
              name="name"
              autoComplete="name"
              required
              value={values.name}
              error={errors.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
            <PasswordField
              label="Choose a password"
              name="password"
              autoComplete="new-password"
              required
              showStrength
              hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A short phrase is easy to remember.`}
              value={values.password}
              error={errors.password}
              onChange={(event) => {
                set('password', event.target.value);
              }}
            />
          </>
        ) : (
          <>
            <p className="text-ink-muted">
              You already use {PRODUCT_NAME} with this email. Enter your password to add{' '}
              {status.workspaceName} to your account.
            </p>
            <PasswordField
              label={`Your ${PRODUCT_NAME} password`}
              name="password"
              autoComplete="current-password"
              required
              value={values.password}
              error={errors.password}
              onChange={(event) => {
                set('password', event.target.value);
              }}
            />
          </>
        )}
        {askCode && (
          <TextField
            label="Code from your authenticator app, or a recovery code"
            name="code"
            autoComplete="one-time-code"
            required
            value={values.code}
            error={errors.code}
            onChange={(event) => {
              set('code', event.target.value);
            }}
          />
        )}
        {general && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {general}
          </p>
        )}
        <Button type="submit" loading={accept.isPending} className="mt-1 w-full">
          Join workspace
        </Button>
        {isNew && (
          <p className="text-center text-xs text-ink-muted">
            By joining, you agree to the{' '}
            <Link
              to="/terms"
              target="_blank"
              className="font-medium text-brand-link hover:underline"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy"
              target="_blank"
              className="font-medium text-brand-link hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

/**
 * Opened from an invitation email on the workspace's address. Checks the link first, then lets
 * someone new choose a name and password, or someone with an account join with theirs.
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const started = useRef(false);
  const check = usePostApiV1InvitationsCheck();

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    check.mutate({ data: { token } });
  }, [token, check]);

  const failure: Failure | null = token ? linkFailure(check.error) : 'invalid';
  if (failure) {
    const { title, text, icon } = FAILURES[failure];
    return (
      <AuthLayout title={title}>
        <StateMessage
          icon={icon}
          tone={failure === 'invalid' ? 'danger' : 'neutral'}
          title={title}
          description={text}
          actions={
            <Link to="/login" className={buttonClasses('outline')}>
              Go to sign in
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
          title="We couldn't check your invitation"
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
      <AuthLayout title="Your invitation">
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-ink-muted">
          <Spinner className="size-5" /> Checking your invitation…
        </div>
      </AuthLayout>
    );
  }
  return <JoinForm token={token} status={check.data} />;
}
