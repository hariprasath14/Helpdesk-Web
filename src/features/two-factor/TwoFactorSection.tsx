import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { getGetApiV1MeQueryKey } from '../../api/generated/accounts/accounts';
import {
  usePostApiV1MeTwoFactorDisable,
  usePostApiV1MeTwoFactorRecoveryCodes,
} from '../../api/generated/two-factor/two-factor';
import { ApiError } from '../../api/http';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { Section } from '../account/Section';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { TwoFactorSetup } from './TwoFactorSetup';

type Mode = 'idle' | 'setup' | 'new-codes' | 'turn-off';

function NewRecoveryCodes({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const regenerate = usePostApiV1MeTwoFactorRecoveryCodes({
    mutation: {
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['password'] as const).password ?? formError(failure));
      },
    },
  });

  if (regenerate.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">
          Your old codes no longer work. Save these somewhere safe: you won&apos;t see them again.
        </p>
        <RecoveryCodesPanel codes={regenerate.data.recoveryCodes} />
        <Button
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

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    regenerate.mutate({ data: { password } });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <PasswordField
        label="Confirm your password"
        name="password"
        autoComplete="current-password"
        required
        hint="Your old recovery codes will stop working."
        value={password}
        error={error}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(undefined);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" loading={regenerate.isPending}>
          Create new codes
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type TurnOffField = 'password' | 'code';

function TurnOff({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ password: '', code: '' });
  const [errors, setErrors] = useState<FieldErrors<TurnOffField>>({});
  const [general, setGeneral] = useState<string>();

  const disable = usePostApiV1MeTwoFactorDisable({
    mutation: {
      onSuccess: () => {
        toast({ tone: 'success', message: 'Two-step verification is off.' });
        void queryClient.invalidateQueries({ queryKey: getGetApiV1MeQueryKey() }).then(onDone);
      },
      onError: (failure) => {
        const found = apiFieldErrors(failure, ['password', 'code'] as const);
        if (Object.keys(found).length > 0) {
          setErrors(found);
          const first = (['password', 'code'] as const).find((field) => found[field]);
          if (first) {
            formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus();
          }
          return;
        }
        if (failure instanceof ApiError && failure.code === 'TWO_FACTOR_REQUIRED') {
          const names = (failure.details as { workspaces?: string[] } | undefined)?.workspaces;
          setGeneral(
            `It can't be turned off while ${names?.join(', ') ?? 'a workspace you belong to'} requires it.`,
          );
          return;
        }
        setGeneral(formError(failure));
      },
    },
  });

  const set = (key: TurnOffField, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setGeneral(undefined);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors<TurnOffField> = {};
    if (!values.password) found.password = 'Enter your password.';
    if (values.code.trim().length < 6)
      found.code = 'Enter a code from your app or a recovery code.';
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    disable.mutate({ data: { password: values.password, code: values.code.trim() } });
  };

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
      <PasswordField
        label="Your password"
        name="password"
        autoComplete="current-password"
        required
        value={values.password}
        error={errors.password}
        onChange={(event) => {
          set('password', event.target.value);
        }}
      />
      <TextField
        label="Code from your app, or a recovery code"
        name="code"
        autoComplete="one-time-code"
        required
        value={values.code}
        error={errors.code}
        onChange={(event) => {
          set('code', event.target.value);
        }}
      />
      {general && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {general}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={disable.isPending}>
          Turn off
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Your account: turn two-step verification on or off, and manage recovery codes. */
export function TwoFactorSection() {
  const me = useSession();
  const [mode, setMode] = useState<Mode>('idle');
  const { enabled, recoveryCodesLeft, required } = me.twoFactor;
  const idle = () => {
    setMode('idle');
  };

  let body;
  if (mode === 'setup') body = <TwoFactorSetup onDone={idle} onCancel={idle} />;
  else if (mode === 'new-codes') body = <NewRecoveryCodes onDone={idle} />;
  else if (mode === 'turn-off') body = <TurnOff onDone={idle} />;
  else if (enabled) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" dot>
            On
          </Badge>
          <span className={recoveryCodesLeft <= 2 ? 'text-warning-text' : 'text-ink-muted'}>
            {recoveryCodesLeft === 1
              ? '1 recovery code left'
              : `${String(recoveryCodesLeft)} recovery codes left`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setMode('new-codes');
            }}
          >
            New recovery codes
          </Button>
          <Button
            variant="ghost"
            disabled={required}
            onClick={() => {
              setMode('turn-off');
            }}
          >
            Turn off
          </Button>
        </div>
        {required && (
          <p className="text-xs text-ink-muted">
            {me.workspace.name} requires two-step verification, so it can&apos;t be turned off.
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-start gap-3">
        <Badge>Off</Badge>
        <Button
          onClick={() => {
            setMode('setup');
          }}
        >
          Turn on
        </Button>
      </div>
    );
  }

  return (
    <Section
      title="Two-step verification"
      description="Sign-in also asks for a code from an authenticator app on your phone, so a stolen password isn't enough. It covers every workspace you belong to."
    >
      {body}
    </Section>
  );
}
