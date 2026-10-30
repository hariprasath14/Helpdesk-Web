import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import {
  getGetApiV1WorkspaceEmailQueryKey,
  useGetApiV1WorkspaceEmail,
  usePatchApiV1WorkspaceEmail,
  usePostApiV1WorkspaceEmailTest,
} from '../../api/generated/email/email';
import type { CustomerNotifications, EmailSettings } from '../../api/generated/model';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, NoAccessState } from '../../components/StateMessage';
import { SwitchField } from '../../components/Switch';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { Section } from '../account/Section';
import { apiFieldErrors, formError } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';

const MAX_SENDER_NAME = 80;

function SenderNameSection({ settings }: { settings: EmailSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(settings.senderName ?? '');
  const [error, setError] = useState<string>();
  const update = usePatchApiV1WorkspaceEmail({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1WorkspaceEmailQueryKey(), result);
        setName(result.senderName ?? '');
        toast({ tone: 'success', message: 'Sender name saved.' });
      },
      onError: (failure) => {
        setError(apiFieldErrors(failure, ['senderName'] as const).senderName ?? formError(failure));
      },
    },
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length > MAX_SENDER_NAME) {
      setError(`Use at most ${String(MAX_SENDER_NAME)} characters.`);
      return;
    }
    update.mutate({ data: { senderName: name.trim() || null } });
  };

  const unchanged = name.trim() === (settings.senderName ?? '');
  return (
    <Section
      title="Sender name"
      description="The name customers see on replies and forwards. Leave it empty to use the workspace name."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Sender name"
          name="senderName"
          placeholder={settings.workspaceName}
          maxLength={MAX_SENDER_NAME + 20}
          value={name}
          error={error}
          hint={
            <>
              Customers see: <span className="font-medium text-ink-body">{settings.from}</span>
            </>
          }
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        {!unchanged && <UnsavedChangesGuard />}
        <Button
          type="submit"
          loading={update.isPending}
          disabled={unchanged}
          className="self-start"
        >
          Save sender name
        </Button>
      </form>
    </Section>
  );
}

function AddressSection({ settings }: { settings: EmailSettings }) {
  const me = useSession();
  const toast = useToast();
  const test = usePostApiV1WorkspaceEmailTest({
    mutation: {
      onSuccess: (result) => {
        toast({ tone: 'success', message: `Test email sent to ${result.to}.` });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(settings.address).then(
      () => {
        setCopied(true);
        window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      () => {
        toast({ tone: 'danger', message: 'Could not copy. Select the address and copy it.' });
      },
    );
  };
  return (
    <Section
      title="Workspace email address"
      description="Email sent to this address becomes a ticket, and replies and forwards go out from it. To use your own support address, forward its email here."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Address</span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-surface-sunken px-2 py-1 text-sm break-all text-ink-body">
              {settings.address}
            </code>
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </span>
        </div>
        {/* How to use the company's own address (Step 5b): forward it here. */}
        <div className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3 text-sm">
          <span className="font-medium text-ink">
            Use your own address (for example support@yourcompany.com)
          </span>
          <ol className="flex flex-col gap-1.5 text-ink-body">
            {[
              'In your email provider (Google Workspace, Microsoft 365 or other), open the settings of your support address.',
              'Forward all its email to the address above.',
              'Send a test email to your support address; it appears in Tickets within a minute.',
            ].map((step, index) => (
              <li key={step} className="flex gap-2">
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand-tint-text"
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <Button
            variant="secondary"
            loading={test.isPending}
            onClick={() => {
              test.mutate();
            }}
          >
            Send me a test email
          </Button>
          <span className="text-xs text-ink-muted">
            Sent to {me.user.email}, so you can see how customers receive it.
          </span>
        </div>
      </div>
    </Section>
  );
}

const NOTIFICATIONS: { key: keyof CustomerNotifications; label: string; description: string }[] = [
  {
    key: 'received',
    label: 'Request received',
    description:
      'When a customer emails in (or uses the web form), they get their ticket number and know we have it.',
  },
  {
    key: 'resolved',
    label: 'Ticket resolved',
    description: 'When a ticket is resolved. Replying to it opens the ticket again.',
  },
  {
    key: 'agentCreated',
    label: 'Ticket opened for them',
    description:
      'When someone on your team logs a ticket for a customer, for example after a call.',
  },
];

function NotificationsSection({ settings }: { settings: EmailSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const update = usePatchApiV1WorkspaceEmail({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1WorkspaceEmailQueryKey(), result);
        toast({ tone: 'success', message: 'Customer emails saved.' });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  return (
    <Section
      title="Customer emails"
      description="Emails customers get about their tickets, from the workspace address. Replies from your team always go out."
    >
      <div className="flex flex-col gap-4">
        {NOTIFICATIONS.map((item) => (
          <SwitchField
            key={item.key}
            label={item.label}
            description={item.description}
            checked={settings.customerNotifications[item.key]}
            disabled={update.isPending}
            onCheckedChange={(checked) => {
              update.mutate({ data: { customerNotifications: { [item.key]: checked } } });
            }}
          />
        ))}
      </div>
    </Section>
  );
}

function EmailSettingsCards() {
  const settings = useGetApiV1WorkspaceEmail();
  if (settings.isPending) {
    return (
      <div role="status" aria-label="Loading email settings" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <ErrorState
        what="email settings"
        retrying={settings.isFetching}
        onRetry={() => {
          void settings.refetch();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {/* The support address first (Step 5b): it is what people come here for. */}
      <AddressSection settings={settings.data} />
      <SenderNameSection settings={settings.data} />
      <NotificationsSection settings={settings.data} />
    </div>
  );
}

/**
 * Settings → Email (admins): the sender name customers see, the workspace address, a test email
 * and which emails customers get (F15).
 */
export function EmailSettingsPage() {
  const me = useSession();
  return (
    <>
      <PageHeader title="Email" breadcrumbs={[{ label: 'Settings' }, { label: 'Email' }]} />
      {me.permissions.includes('settings.manage') ? (
        <EmailSettingsCards />
      ) : (
        <NoAccessState
          area="email settings"
          explanation={`Only admins can change email settings. Ask an admin of ${me.workspace.name} if something needs changing.`}
        />
      )}
    </>
  );
}
