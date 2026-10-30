import { MailCheck } from 'lucide-react';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { usePostApiV1AuthForgotPassword } from '../../api/generated/auth/auth';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/button-styles';
import { StateMessage } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { formError } from './api-errors';
import { AuthLayout } from './AuthLayout';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Forgot password?" on a workspace address. The answer is the same whether or not the email
 * belongs to a member here, so the page never reveals who has an account.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const forgot = usePostApiV1AuthForgotPassword();

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    forgot.mutate({ data: { email: email.trim() } });
  };

  if (forgot.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        <StateMessage
          icon={MailCheck}
          tone="neutral"
          title="If you have an account here, a reset link is on its way"
          description={`We sent it to ${forgot.data.email}. The link works once and expires in 1 hour. Check your spam folder if it doesn't arrive in a few minutes.`}
          actions={
            <Link to="/login" className={buttonClasses('outline')}>
              Back to sign in
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you sign in with. We'll send you a link to choose a new password."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          ref={inputRef}
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          error={error}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(undefined);
          }}
        />
        {forgot.isError && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {formError(forgot.error)}
          </p>
        )}
        <Button type="submit" loading={forgot.isPending} className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-muted">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-brand-link hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
