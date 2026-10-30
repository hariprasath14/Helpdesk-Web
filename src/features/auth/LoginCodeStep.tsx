import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Me } from '../../api/generated/model';
import { usePostApiV1AuthLoginTwoFactor } from '../../api/generated/auth/auth';
import { ApiError } from '../../api/http';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { TextField } from '../../components/TextField';
import { formError } from './api-errors';
import { AuthLayout } from './AuthLayout';

interface LoginCodeStepProps {
  onSignedIn: (me: Me) => void;
  /** Back to the password step, with a reason to show (empty when the person chose to go back). */
  onRestart: (reason: string) => void;
}

/**
 * The second step of login with two-step verification on: a code from the authenticator app (sent
 * as soon as 6 digits are typed), or a recovery code.
 */
export function LoginCodeStep({ onSignedIn, onRestart }: LoginCodeStepProps) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  // The code field is the only thing to do on this step: put the cursor there on arrival and
  // when switching between an app code and a recovery code.
  useEffect(() => {
    inputRef.current?.focus();
  }, [useRecovery]);

  const verify = usePostApiV1AuthLoginTwoFactor({
    mutation: {
      onSuccess: onSignedIn,
      onError: (failure) => {
        if (
          failure instanceof ApiError &&
          (failure.code === 'TWO_FACTOR_EXPIRED' || failure.code === 'LOGIN_LOCKED')
        ) {
          onRestart(failure.message);
          return;
        }
        setError(
          failure instanceof ApiError && failure.code === 'INVALID_CODE'
            ? failure.message
            : formError(failure),
        );
        setCode('');
        inputRef.current?.focus();
      },
    },
  });

  const send = (value: string) => {
    verify.mutate({ data: { code: value, trustDevice } });
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    const valid = useRecovery
      ? value.replace(/[^a-z0-9]/gi, '').length === 8
      : /^\d{6}$/.test(value);
    if (!valid) {
      setError(useRecovery ? 'Enter a recovery code, like abcd-efgh.' : 'Enter the 6-digit code.');
      inputRef.current?.focus();
      return;
    }
    send(value);
  };

  const switchMethod = () => {
    setUseRecovery((current) => !current);
    setCode('');
    setError(undefined);
  };

  return (
    <AuthLayout
      title="Two-step verification"
      subtitle={
        useRecovery
          ? 'Enter one of your recovery codes. Each one works once.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          ref={inputRef}
          // A new field for each method, so the browser offers the right keyboard and autofill.
          key={useRecovery ? 'recovery' : 'app'}
          label={useRecovery ? 'Recovery code' : '6-digit code'}
          name="code"
          required
          autoComplete={useRecovery ? 'off' : 'one-time-code'}
          inputMode={useRecovery ? 'text' : 'numeric'}
          spellCheck={false}
          maxLength={useRecovery ? 20 : 6}
          value={code}
          error={error}
          onChange={(event) => {
            setError(undefined);
            if (useRecovery) {
              setCode(event.target.value);
              return;
            }
            const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6 && !verify.isPending) send(digits);
          }}
        />
        <CheckboxField
          checked={trustDevice}
          onChange={(event) => {
            setTrustDevice(event.target.checked);
          }}
        >
          Don&apos;t ask again on this device for 30 days
        </CheckboxField>
        <Button type="submit" loading={verify.isPending} className="w-full">
          Verify
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={switchMethod}
          className="font-medium text-brand-link hover:underline"
        >
          {useRecovery ? 'Use your authenticator app' : 'Use a recovery code instead'}
        </button>
        <button
          type="button"
          onClick={() => {
            onRestart('');
          }}
          className="font-medium text-ink-muted hover:text-ink hover:underline"
        >
          Back to sign in
        </button>
      </div>
    </AuthLayout>
  );
}
