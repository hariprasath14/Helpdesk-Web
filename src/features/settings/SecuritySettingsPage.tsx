import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getGetApiV1MeQueryKey } from '../../api/generated/accounts/accounts';
import {
  getGetApiV1WorkspaceSecurityQueryKey,
  useGetApiV1WorkspaceSecurity,
  usePatchApiV1WorkspaceSecurity,
} from '../../api/generated/two-factor/two-factor';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, NoAccessState } from '../../components/StateMessage';
import { SwitchField } from '../../components/Switch';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';
import { PRODUCT_NAME } from '../../product';

function WorkspaceSecurityCard() {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const security = useGetApiV1WorkspaceSecurity();
  const update = usePatchApiV1WorkspaceSecurity({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1WorkspaceSecurityQueryKey(), result);
        void queryClient.invalidateQueries({ queryKey: getGetApiV1MeQueryKey() });
        toast({
          tone: 'success',
          message: result.requireTwoFactor
            ? 'Two-step verification is now required for everyone.'
            : 'Two-step verification is no longer required.',
        });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  if (security.isPending) {
    return (
      <div role="status" aria-label="Loading security settings" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (security.isError) {
    return (
      <ErrorState
        what="security settings"
        retrying={security.isFetching}
        onRetry={() => {
          void security.refetch();
        }}
      />
    );
  }

  const { requireTwoFactor, members, membersWithTwoFactor } = security.data;
  // The admin must have it on first, so they cannot lock themselves out.
  const blocked = !requireTwoFactor && !me.twoFactor.enabled;
  return (
    <div className="flex flex-col gap-3">
      <SwitchField
        label="Require two-step verification for everyone"
        description={`Members without it are asked to set it up the next time they open ${PRODUCT_NAME}. ${String(membersWithTwoFactor)} of ${String(members)} ${members === 1 ? 'member has' : 'members have'} it on.`}
        checked={requireTwoFactor}
        disabled={blocked || update.isPending}
        onCheckedChange={(checked) => {
          update.mutate({ data: { requireTwoFactor: checked } });
        }}
      />
      {blocked && (
        <p className="text-xs text-ink-muted">
          Turn it on for yourself first in{' '}
          <Link to="/account?tab=security" className="font-medium text-brand-link hover:underline">
            Your account
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Settings → Security (admins): the workspace's two-step verification rule. */
export function SecuritySettingsPage() {
  const me = useSession();
  return (
    <>
      <PageHeader title="Security" breadcrumbs={[{ label: 'Settings' }, { label: 'Security' }]} />
      {me.role === 'admin' ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <WorkspaceSecurityCard />
        </section>
      ) : (
        <NoAccessState
          area="security settings"
          explanation={`Only admins can change security settings. Ask an admin of ${me.workspace.name} if something needs changing.`}
        />
      )}
    </>
  );
}
