import { useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { usePostApiV1AuthFindWorkspaces } from '../../api/generated/auth/auth';
import { workspaceOrigin } from '../../app/host';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { config } from '../../config';
import { goTo } from '../../lib/go-to';
import { ADDRESS_PATTERN, cleanAddress } from '../../lib/workspace-address';
import { formError } from './api-errors';
import { AuthLayout } from './AuthLayout';
import { PRODUCT_NAME } from '../../product';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in on the main address. Each workspace signs in on its own address, so this page either
 * takes the person there, or emails them links to every workspace they belong to. The answer is
 * the same whether or not the email has an account.
 */
export function FindWorkspacePage() {
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState<string>();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const addressRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const find = usePostApiV1AuthFindWorkspaces();

  const go = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ADDRESS_PATTERN.test(address)) {
      setAddressError('Enter your workspace address, for example acme.');
      addressRef.current?.focus();
      return;
    }
    goTo(`${workspaceOrigin(config.appDomain, address, window.location)}/login`);
  };

  const sendLinks = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    find.mutate({ data: { email: email.trim() } });
  };

  return (
    <AuthLayout title={`Sign in to ${PRODUCT_NAME}`} subtitle="Each workspace has its own address.">
      <form noValidate onSubmit={go} className="flex flex-col gap-3">
        <TextField
          ref={addressRef}
          label="Workspace address"
          name="workspaceAddress"
          autoComplete="off"
          spellCheck={false}
          suffix={`.${config.appDomain}`}
          value={address}
          error={addressError}
          onChange={(event) => {
            setAddress(cleanAddress(event.target.value));
            setAddressError(undefined);
          }}
        />
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-ink-subtle">
        <span className="h-px flex-1 bg-border" />
        Forgot your address?
        <span className="h-px flex-1 bg-border" />
      </div>

      {find.isSuccess ? (
        <p role="status" className="rounded-lg bg-info-bg px-3 py-3 text-sm text-info-text">
          If {find.data.email} has a {PRODUCT_NAME} account, we've emailed links to its workspaces.
          Check your spam folder if it doesn't arrive in a few minutes.
        </p>
      ) : (
        <form noValidate onSubmit={sendLinks} className="flex flex-col gap-3">
          <TextField
            ref={emailRef}
            label="Work email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            hint="We'll email you a link to each workspace you belong to."
            value={email}
            error={emailError}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
          />
          {find.isError && (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
              {formError(find.error)}
            </p>
          )}
          <Button type="submit" variant="outline" loading={find.isPending} className="w-full">
            Email me my workspaces
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-ink-muted">
        New to {PRODUCT_NAME}?{' '}
        <Link to="/signup" className="font-medium text-brand-link hover:underline">
          Create a workspace
        </Link>
      </p>
    </AuthLayout>
  );
}
