import { CircleCheck, CircleX } from 'lucide-react';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useGetApiV1SignupAddressAvailability,
  usePostApiV1Signup,
} from '../../api/generated/accounts/accounts';
import { PostApiV1SignupBody } from '../../api/generated/zod/accounts/accounts.zod';
import { ApiError } from '../../api/http';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { PasswordField } from '../../components/PasswordField';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { config } from '../../config';
import { PASSWORD_MIN_LENGTH } from '../../lib/password-strength';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { ADDRESS_PATTERN, cleanAddress, suggestAddress } from '../../lib/workspace-address';
import { apiFieldErrors, formError, type FieldErrors } from './api-errors';
import { AuthLayout } from './AuthLayout';
import { PRODUCT_NAME } from '../../product';

const FIELDS = [
  'name',
  'email',
  'password',
  'companyName',
  'workspaceAddress',
  'acceptTerms',
] as const;
type Field = (typeof FIELDS)[number];

/** Our wording for each field; the generated schema decides what is valid. */
const MESSAGES: Record<Field, string> = {
  name: 'Enter your full name.',
  email: 'Enter a valid email address.',
  password: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
  companyName: 'Enter your company name.',
  workspaceAddress:
    'Use 3 to 30 lowercase letters, numbers or hyphens, not starting or ending with a hyphen.',
  acceptTerms: 'Accept the Terms and Privacy Policy to continue.',
};

const REASONS = {
  format: MESSAGES.workspaceAddress,
  reserved: 'This address is reserved. Try another.',
  taken: 'This address is already taken.',
} as const;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Sign-up (main address only): creates a workspace and emails a confirmation link. */
export function SignUpPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    companyName: '',
    workspaceAddress: '',
    acceptTerms: false,
  });
  const [addressEdited, setAddressEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  /** Shows the errors and moves focus to the first field with a problem, so it is announced. */
  const showErrors = (fieldErrors: FieldErrors<Field>) => {
    setErrors(fieldErrors);
    const first = FIELDS.find((field) => fieldErrors[field]);
    const element = first ? formRef.current?.elements.namedItem(first) : null;
    if (element instanceof HTMLElement) element.focus();
  };

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const address = values.workspaceAddress;
  const debouncedAddress = useDebouncedValue(address, 400);
  const addressLooksValid = ADDRESS_PATTERN.test(debouncedAddress);
  const availability = useGetApiV1SignupAddressAvailability(
    { address: debouncedAddress },
    { query: { enabled: addressLooksValid, staleTime: 10_000, retry: false } },
  );

  const signUp = usePostApiV1Signup({
    mutation: {
      onSuccess: (result) => {
        void navigate('/signup/check-email', { state: { email: result.email } });
      },
      onError: (error) => {
        showErrors(apiFieldErrors(error, FIELDS));
        if (error instanceof ApiError && error.status === 409) {
          const details = error.details as { alternatives?: string[] } | undefined;
          setAlternatives(details?.alternatives ?? []);
        }
      },
    },
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = { ...values, timezone: browserTimeZone() };
    const parsed = PostApiV1SignupBody.safeParse(data);
    const fieldErrors: FieldErrors<Field> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELDS.find((name) => name === issue.path[0]);
        if (field) fieldErrors[field] = MESSAGES[field];
      }
    }
    if (!ADDRESS_PATTERN.test(address)) fieldErrors.workspaceAddress = MESSAGES.workspaceAddress;
    if (Object.keys(fieldErrors).length > 0) {
      showErrors(fieldErrors);
      return;
    }
    signUp.mutate({ data: { ...data, acceptTerms: true } });
  };

  const check = availability.data;
  const checkIsCurrent = check?.address === address;
  let addressStatus = null;
  if (address && addressLooksValid && debouncedAddress === address) {
    if (availability.isFetching && !checkIsCurrent) {
      addressStatus = (
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Spinner className="size-3.5" /> Checking…
        </span>
      );
    } else if (checkIsCurrent && check.available) {
      addressStatus = (
        <span className="flex items-center gap-1.5 text-success-text">
          <CircleCheck aria-hidden className="size-3.5" /> {address}.{config.appDomain} is available
        </span>
      );
    } else if (checkIsCurrent && check.reason) {
      addressStatus = (
        <span className="flex items-center gap-1.5 text-danger-text">
          <CircleX aria-hidden className="size-3.5" /> {REASONS[check.reason]}
        </span>
      );
    }
  }
  const suggestions = checkIsCurrent && !check.available ? check.alternatives : alternatives;
  const generalError =
    signUp.isError && Object.keys(apiFieldErrors(signUp.error, FIELDS)).length === 0
      ? formError(signUp.error)
      : null;

  return (
    <AuthLayout
      wide
      title={`Create your ${PRODUCT_NAME} workspace`}
      subtitle="Free trial. No card needed."
    >
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
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
        <TextField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={values.email}
          error={errors.email}
          onChange={(event) => {
            set('email', event.target.value);
          }}
        />
        <PasswordField
          label="Password"
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
        <TextField
          label="Company name"
          name="companyName"
          autoComplete="organization"
          required
          value={values.companyName}
          error={errors.companyName}
          onChange={(event) => {
            const companyName = event.target.value;
            setValues((current) => ({
              ...current,
              companyName,
              workspaceAddress: addressEdited
                ? current.workspaceAddress
                : suggestAddress(companyName),
            }));
            setErrors((current) => ({ ...current, companyName: undefined }));
          }}
        />
        <div className="flex flex-col gap-2">
          <TextField
            label="Workspace address"
            name="workspaceAddress"
            autoComplete="off"
            spellCheck={false}
            required
            suffix={`.${config.appDomain}`}
            hint={`Your team will open ${PRODUCT_NAME} at this address.`}
            value={address}
            error={errors.workspaceAddress}
            status={errors.workspaceAddress ? undefined : addressStatus}
            onChange={(event) => {
              setAddressEdited(true);
              setAlternatives([]);
              set('workspaceAddress', cleanAddress(event.target.value));
            }}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-muted">Try:</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setAddressEdited(true);
                    setAlternatives([]);
                    set('workspaceAddress', suggestion);
                  }}
                  className="rounded-full border border-border-strong px-2.5 py-1 font-medium text-brand-link hover:bg-brand-tint"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <CheckboxField
          name="acceptTerms"
          checked={values.acceptTerms}
          error={errors.acceptTerms}
          onChange={(event) => {
            set('acceptTerms', event.target.checked);
          }}
        >
          I agree to the{' '}
          <Link to="/terms" target="_blank" className="font-medium text-brand-link hover:underline">
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
        </CheckboxField>

        {generalError && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {generalError}
          </p>
        )}

        <Button type="submit" loading={signUp.isPending} className="mt-2 w-full">
          Create workspace
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-link hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
