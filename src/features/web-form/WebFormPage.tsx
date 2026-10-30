import { MailCheck, MailX } from 'lucide-react';
import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  useGetApiV1WebForm,
  usePostApiV1WebFormRequests,
} from '../../api/generated/web-form/web-form';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, StateMessage } from '../../components/StateMessage';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { PRODUCT_NAME } from '../../product';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Field = 'name' | 'email' | 'subject' | 'description';
const FIELDS: readonly Field[] = ['name', 'email', 'subject', 'description'];

/**
 * A plain frame that also fits inside another site's page (the embed code). Step 5b: a white bar
 * with the workspace's name, then the card.
 */
function Frame({ workspaceName, children }: { workspaceName?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      {workspaceName && (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-lg bg-brand-tint font-bold text-brand-tint-text"
            >
              {workspaceName.charAt(0).toUpperCase()}
            </span>
            <p className="font-semibold text-ink">{workspaceName}</p>
          </div>
        </header>
      )}
      <div className="flex flex-1 flex-col items-center px-4 py-8">
        <main className="w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
          {children}
        </main>
        <p className="mt-4 text-xs text-ink-subtle">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}

/**
 * The workspace's public "Contact support" page (F16), at /support on the workspace address. No
 * sign-in. A request becomes a ticket, and the person gets an email that it arrived (F15).
 */
export function WebFormPage() {
  const form = useGetApiV1WebForm({ query: { retry: false } });
  const send = usePostApiV1WebFormRequests();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    email: '',
    subject: '',
    description: '',
  });
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  if (form.isPending) {
    return (
      <Frame>
        <div role="status" aria-label="Loading the form" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Frame>
    );
  }
  if (form.isError) {
    return (
      <Frame>
        <ErrorState
          what="the form"
          retrying={form.isFetching}
          onRetry={() => {
            void form.refetch();
          }}
        />
      </Frame>
    );
  }
  const { enabled, workspaceName, title, intro } = form.data;
  if (!enabled) {
    return (
      <Frame workspaceName={workspaceName}>
        <StateMessage
          icon={MailX}
          tone="neutral"
          title="This form is not available"
          description={`${workspaceName} is not taking requests through this page right now.`}
        />
      </Frame>
    );
  }
  if (send.isSuccess) {
    return (
      <Frame workspaceName={workspaceName}>
        <StateMessage
          icon={MailCheck}
          tone="neutral"
          title="Request sent"
          description={`We'll reply to ${values.email.trim()}. You'll get an email with your ticket number; reply to it to add anything.`}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                send.reset();
                setValues({ name: values.name, email: values.email, subject: '', description: '' });
              }}
            >
              Send another request
            </Button>
          }
        />
      </Frame>
    );
  }

  const show = (found: FieldErrors<Field>) => {
    setErrors(found);
    const first = FIELDS.find((field) => found[field]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  };
  const set = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: FieldErrors<Field> = {};
    if (!values.name.trim()) found.name = 'Enter your name.';
    if (!EMAIL.test(values.email.trim())) found.email = 'Enter a valid email address.';
    if (!values.subject.trim()) found.subject = 'Enter a subject.';
    if (!values.description.trim()) found.description = 'Tell us how we can help.';
    if (Object.keys(found).length > 0) {
      show(found);
      return;
    }
    send.mutate(
      {
        data: {
          name: values.name.trim(),
          email: values.email.trim(),
          subject: values.subject.trim(),
          description: values.description.trim(),
          ...(website ? { website } : {}),
        },
      },
      {
        onError: (failure) => {
          show(apiFieldErrors(failure, FIELDS));
        },
      },
    );
  };

  return (
    <Frame workspaceName={workspaceName}>
      <h1 className="text-xl font-bold">{title}</h1>
      {intro && <p className="mt-1.5 whitespace-pre-line text-ink-muted">{intro}</p>}
      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {/* Name and email side by side from 640px (Step 5b). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Your name"
            name="name"
            autoComplete="name"
            required
            maxLength={120}
            value={values.name}
            error={errors.name}
            onChange={(event) => {
              set('name', event.target.value);
            }}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={values.email}
            error={errors.email}
            hint="We reply to this address."
            onChange={(event) => {
              set('email', event.target.value);
            }}
          />
        </div>
        <TextField
          label="Subject"
          name="subject"
          required
          maxLength={200}
          placeholder="A short summary"
          value={values.subject}
          error={errors.subject}
          onChange={(event) => {
            set('subject', event.target.value);
          }}
        />
        <TextAreaField
          label="How can we help?"
          name="description"
          required
          rows={6}
          maxLength={20_000}
          placeholder="Steps, error messages, IDs: anything that helps us look into it"
          value={values.description}
          error={errors.description}
          onChange={(event) => {
            set('description', event.target.value);
          }}
        />
        {/* Only bots fill this in; it is hidden from people and screen readers. */}
        <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => {
                setWebsite(event.target.value);
              }}
            />
          </label>
        </div>
        {send.isError && Object.keys(apiFieldErrors(send.error, FIELDS)).length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {formError(send.error)}
          </p>
        )}
        <Button type="submit" loading={send.isPending} className="self-start">
          Send request
        </Button>
      </form>
    </Frame>
  );
}
