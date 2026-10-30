import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { getGetApiV1MeQueryKey } from '../../api/generated/accounts/accounts';
import type { TwoFactorSetup as SetupDetails } from '../../api/generated/model';
import {
  usePostApiV1MeTwoFactorConfirm,
  usePostApiV1MeTwoFactorSetup,
} from '../../api/generated/two-factor/two-factor';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { apiFieldErrors, formError } from '../auth/api-errors';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

/** "JBSWY3DPEHPK3PXP…" → "JBSW Y3DP EHPK 3PXP …", easier to type. */
const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

interface TwoFactorSetupProps {
  /** After the recovery codes are saved. The session's status is refreshed first. */
  onDone: () => void;
  onCancel?: () => void;
}

/**
 * Turning on two-step verification: confirm the password, scan the QR code (or type the key),
 * enter the first code, then save the recovery codes. Used on Your account and on the screen a
 * workspace that requires it shows.
 */
export function TwoFactorSetup({ onDone, onCancel }: TwoFactorSetupProps) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const setup = usePostApiV1MeTwoFactorSetup({
    mutation: {
      onSuccess: () => {
        setError(undefined);
      },
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['password'] as const).password ?? formError(failure));
        passwordRef.current?.focus();
      },
    },
  });
  const confirm = usePostApiV1MeTwoFactorConfirm({
    mutation: {
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['code'] as const).code ?? formError(failure));
        setCode('');
        codeRef.current?.focus();
      },
    },
  });

  if (confirm.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-ink">Save your recovery codes</h3>
          <p className="mt-1 text-ink-muted">
            If you lose your phone, each of these codes lets you sign in once. Keep them somewhere
            safe, like a password manager. You won&apos;t see them again.
          </p>
        </div>
        <RecoveryCodesPanel codes={confirm.data.recoveryCodes} />
        <CheckboxField
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked);
          }}
        >
          I&apos;ve saved these codes somewhere safe
        </CheckboxField>
        <Button
          disabled={!saved}
          className="self-start"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: getGetApiV1MeQueryKey() }).then(onDone);
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  if (setup.isSuccess) {
    const details: SetupDetails = setup.data;
    const submit = (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!/^\d{6}$/.test(code)) {
        setError('Enter the 6-digit code from the app.');
        codeRef.current?.focus();
        return;
      }
      confirm.mutate({ data: { code } });
    };
    return (
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-ink-body">
          <li>
            Open an authenticator app on your phone, such as Google Authenticator, Microsoft
            Authenticator or 1Password.
          </li>
          <li>Scan this QR code with it.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(details.qrSvg)}`}
          alt="QR code for setting up two-step verification"
          width={176}
          height={176}
          className="rounded-lg border border-border bg-white p-2"
        />
        <p className="text-xs text-ink-muted">
          Can&apos;t scan it? Type this key into the app instead:{' '}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink">
            {groupKey(details.secret)}
          </code>
        </p>
        <TextField
          ref={codeRef}
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          error={error}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
            setError(undefined);
          }}
        />
        <div className="flex gap-2">
          <Button type="submit" loading={confirm.isPending}>
            Turn on
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    );
  }

  const start = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      passwordRef.current?.focus();
      return;
    }
    setup.mutate({ data: { password } });
  };
  return (
    <form noValidate onSubmit={start} className="flex flex-col gap-4">
      <PasswordField
        ref={passwordRef}
        label="Confirm your password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        error={error}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(undefined);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" loading={setup.isPending}>
          Continue
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
