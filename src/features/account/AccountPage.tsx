import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  getGetApiV1MeQueryKey,
  usePatchApiV1Me,
  usePostApiV1MePassword,
  usePostApiV1MeSessionsSignOutOthers,
} from '../../api/generated/accounts/accounts';
import type { Me } from '../../api/generated/model';
import { BRAND_IDS, BRANDS, type BrandId } from '../../brands';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { config } from '../../config';
import { cn } from '../../lib/cn';
import { PASSWORD_MIN_LENGTH } from '../../lib/password-strength';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { NotificationEmailSection } from '../notifications/NotificationEmailSection';
import { TwoFactorSection } from '../two-factor/TwoFactorSection';
import { useSession } from '../workspace/session-context';
import { Section } from './Section';
import { PRODUCT_NAME } from '../../product';

function ProfileSection() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.user.name);
  const [error, setError] = useState<string>();
  const update = usePatchApiV1Me({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1MeQueryKey(), result);
        toast({ tone: 'success', message: 'Name saved.' });
      },
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['name'] as const).name ?? formError(failure));
      },
    },
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    update.mutate({ data: { name: name.trim() } });
  };

  return (
    <Section
      title="Profile"
      description="Your name is shown to your team and on replies to customers, in every workspace you belong to."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Full name"
          name="name"
          autoComplete="name"
          required
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Email</span>
          <span className="text-sm text-ink-muted">{me.user.email}</span>
        </div>
        {name.trim() !== me.user.name && <UnsavedChangesGuard />}
        <Button
          type="submit"
          loading={update.isPending}
          disabled={name.trim() === me.user.name}
          className="self-start"
        >
          Save name
        </Button>
      </form>
    </Section>
  );
}

type PasswordFieldName = 'currentPassword' | 'newPassword';

function PasswordSection() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<FieldErrors<PasswordFieldName>>({});
  const [general, setGeneral] = useState<string>();

  const showErrors = (found: FieldErrors<PasswordFieldName>) => {
    setErrors(found);
    const first = (['currentPassword', 'newPassword'] as const).find((field) => found[field]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus();
  };

  const change = usePostApiV1MePassword({
    mutation: {
      onSuccess: (result) => {
        // A fresh session (cookie and CSRF token) replaces the old one.
        queryClient.setQueryData(getGetApiV1MeQueryKey(), result);
        setValues({ currentPassword: '', newPassword: '' });
        toast({
          tone: 'success',
          message: 'Password changed. You were signed out on your other devices.',
        });
      },
      onError: (failure) => {
        const found = apiFieldErrors(failure, ['currentPassword', 'newPassword'] as const);
        if (Object.keys(found).length > 0) showErrors(found);
        else setGeneral(formError(failure));
      },
    },
  });

  const set = (key: PasswordFieldName, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setGeneral(undefined);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors<PasswordFieldName> = {};
    if (!values.currentPassword) found.currentPassword = 'Enter your current password.';
    if (values.newPassword.length < PASSWORD_MIN_LENGTH) {
      found.newPassword = `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`;
    }
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    change.mutate({ data: values });
  };

  return (
    <Section
      title="Password"
      description="Used for every workspace you belong to. Changing it signs you out on your other devices."
    >
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={me.user.email}
          readOnly
          hidden
        />
        <PasswordField
          label="Current password"
          name="currentPassword"
          autoComplete="current-password"
          required
          value={values.currentPassword}
          error={errors.currentPassword}
          onChange={(event) => {
            set('currentPassword', event.target.value);
          }}
        />
        <PasswordField
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          required
          showStrength
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, not one of your last 5.`}
          value={values.newPassword}
          error={errors.newPassword}
          onChange={(event) => {
            set('newPassword', event.target.value);
          }}
        />
        {general && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {general}
          </p>
        )}
        <Button type="submit" loading={change.isPending} className="self-start">
          Change password
        </Button>
      </form>
    </Section>
  );
}

function SessionsSection() {
  const toast = useToast();
  const signOutOthers = usePostApiV1MeSessionsSignOutOthers({
    mutation: {
      onSuccess: ({ signedOut }) => {
        toast({
          tone: 'success',
          message:
            signedOut === 0
              ? 'You were not signed in anywhere else.'
              : `Signed out of ${String(signedOut)} other ${signedOut === 1 ? 'session' : 'sessions'}.`,
        });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  return (
    <Section
      title="Devices"
      description="Lost a phone or used a shared computer? Sign out everywhere except here."
    >
      <Button
        variant="outline"
        loading={signOutOthers.isPending}
        onClick={() => {
          signOutOthers.mutate();
        }}
      >
        Sign out of all other devices
      </Button>
    </Section>
  );
}

/** Your colour theme (Step 5b): for you only, on every device, applied at once. */
function AppearanceSection() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = usePatchApiV1Me({
    mutation: {
      onSuccess: (next) => {
        queryClient.setQueryData(getGetApiV1MeQueryKey(), next);
        toast({ tone: 'success', message: `Theme changed to ${BRANDS[chosenOf(next)].label}.` });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  // While saving, show the choice at once; a failed save goes back to the saved theme.
  const chosen = (save.isPending ? save.variables.data.theme : me.user.theme) ?? config.brand;
  return (
    <Section
      title="Colour theme"
      description={`Changes ${PRODUCT_NAME}'s colours for you only, on every device you sign in on. It applies at once; nothing else changes.`}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Colour theme</legend>
        {BRAND_IDS.map((id) => (
          <label
            key={id}
            className={cn(
              'flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-3 focus-within:ring-2 focus-within:ring-brand-focus',
              chosen === id ? 'border-brand-600' : 'border-border hover:border-border-strong',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={id}
              checked={chosen === id}
              disabled={save.isPending}
              onChange={() => {
                save.mutate({ data: { theme: id } });
              }}
              className="sr-only"
            />
            {/* A small picture of the app in this theme: its sidebar and main button colours. */}
            <span aria-hidden className="flex h-16 overflow-hidden rounded-lg border border-border">
              <span className="w-1/4" style={{ background: BRANDS[id].themeColor }} />
              <span className="flex flex-1 flex-col justify-center gap-1.5 bg-surface-page px-2">
                <span className="h-1.5 w-3/4 rounded-full bg-border-strong" />
                <span className="h-1.5 w-1/2 rounded-full bg-border" />
                <span className="h-3 w-10 rounded" style={{ background: BRANDS[id].swatch }} />
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={cn(
                  'flex size-4 items-center justify-center rounded-full border',
                  chosen === id ? 'border-brand-600' : 'border-border-strong',
                )}
              >
                {chosen === id && <span className="size-2 rounded-full bg-brand-600" />}
              </span>
              <span className="font-medium text-ink">{BRANDS[id].label}</span>
              {id === config.brand && <span className="text-xs text-ink-muted">(default)</span>}
            </span>
          </label>
        ))}
      </fieldset>
    </Section>
  );
}

/** Which theme a "who am I" answer shows. */
const chosenOf = (me: Me): BrandId => me.user.theme ?? config.brand;

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'appearance', label: 'Appearance' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/**
 * The signed-in person's own account (Step 5b: in tabs, kept in the address): Profile, Security
 * (password, two-step verification, other devices), Notifications (which also come by email) and
 * Appearance (the colour theme).
 */
export function AccountPage() {
  const me = useSession();
  const [search, setSearch] = useSearchParams();
  const asked = search.get('tab');
  const tab: Tab = TABS.some((item) => item.id === asked) ? (asked as Tab) : 'profile';
  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={me.user.name} />
            Your account
          </span>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-ink-muted">
        {me.user.name} · {me.user.email}
      </p>
      <div
        role="tablist"
        aria-label="Your account"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setSearch(item.id === 'profile' ? {} : { tab: item.id }, { replace: true });
            }}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium whitespace-nowrap',
              tab === item.id
                ? 'border-b-2 border-brand-600 text-brand-link'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={TABS.find((item) => item.id === tab)?.label}
        className="flex flex-col gap-4"
      >
        {tab === 'profile' && <ProfileSection />}
        {tab === 'security' && (
          <>
            <PasswordSection />
            <TwoFactorSection />
            <SessionsSection />
          </>
        )}
        {tab === 'notifications' && <NotificationEmailSection />}
        {tab === 'appearance' && <AppearanceSection />}
      </div>
    </>
  );
}
