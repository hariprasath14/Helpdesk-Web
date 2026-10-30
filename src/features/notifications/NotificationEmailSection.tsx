import { useQueryClient } from '@tanstack/react-query';
import type { NotificationEmailChoices } from '../../api/generated/model';
import {
  getGetApiV1NotificationsEmailQueryKey,
  useGetApiV1NotificationsEmail,
  usePatchApiV1NotificationsEmail,
} from '../../api/generated/notifications/notifications';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/StateMessage';
import { SwitchField } from '../../components/Switch';
import { useToast } from '../../components/toast-context';
import { Section } from '../account/Section';
import { formError } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';

const KINDS: { key: keyof NotificationEmailChoices; label: string; description: string }[] = [
  { key: 'assigned', label: 'Assigned to me', description: 'Someone gives you a ticket.' },
  { key: 'mention', label: '@mentions', description: 'Someone mentions you in a private note.' },
  {
    key: 'sla_warning',
    label: 'SLA warnings',
    description: 'A deadline is near on your ticket, or your team’s when you lead it.',
  },
  {
    key: 'sla_breach',
    label: 'SLA overdue',
    description: 'A deadline passed on a ticket of a team you lead.',
  },
  {
    key: 'customer_reply',
    label: 'Customer replies',
    description: 'The customer answers on a ticket assigned to you.',
  },
];

/** Your account → Notifications (F25): which kinds also come by email, in this workspace. */
export function NotificationEmailSection() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const choices = useGetApiV1NotificationsEmail();
  const save = usePatchApiV1NotificationsEmail({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1NotificationsEmailQueryKey(), result);
        toast({ tone: 'success', message: 'Notification emails saved.' });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  return (
    <Section
      title="Notifications"
      description={`Everything shows under the bell. Choose what also comes by email to ${me.user.email}, in ${me.workspace.name}.`}
    >
      {choices.isPending ? (
        <div role="status" aria-label="Loading notification emails" className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : choices.isError ? (
        <ErrorState
          what="notification emails"
          retrying={choices.isFetching}
          onRetry={() => {
            void choices.refetch();
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {KINDS.map((kind) => (
            <SwitchField
              key={kind.key}
              label={kind.label}
              description={kind.description}
              checked={choices.data[kind.key]}
              disabled={save.isPending}
              onCheckedChange={(checked) => {
                save.mutate({ data: { [kind.key]: checked } });
              }}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
