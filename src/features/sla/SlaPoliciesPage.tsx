import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, EllipsisVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useGetApiV1CustomFields } from '../../api/generated/custom-fields/custom-fields';
import { useGetApiV1Members } from '../../api/generated/members/members';
import type { SlaPolicy } from '../../api/generated/model';
import {
  getGetApiV1SlaPoliciesQueryKey,
  useDeleteApiV1SlaPoliciesPolicyId,
  useGetApiV1SlaPolicies,
  usePutApiV1SlaPoliciesOrder,
} from '../../api/generated/sla/sla';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, NoAccessState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { fieldOptions } from '../rules/rule-fields';
import { PRIORITY_OPTIONS, priorityTone } from '../tickets/ticket-labels';
import { toneDotClass } from '../../components/badge-tones';
import { cn } from '../../lib/cn';
import { can, useSession } from '../workspace/session-context';
import { durationText } from './sla-format';
import { SlaPolicyDrawer } from './SlaPolicyDrawer';

const BREADCRUMBS = [{ label: 'Settings' }, { label: 'SLAs' }];
const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;

/** A policy's targets as a small table (Step 5b): one row per priority. */
function TargetsTable({ policy }: { policy: SlaPolicy }) {
  const cell = 'py-1 pr-4 text-left whitespace-nowrap';
  return (
    <table aria-label={`Targets of ${policy.name}`} className="mt-2 text-xs">
      <thead className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
        <tr>
          <th scope="col" className={cell}>
            Priority
          </th>
          <th scope="col" className={cell}>
            First reply
          </th>
          <th scope="col" className={cell}>
            Resolve
          </th>
          <th scope="col" className={cell}>
            Hours
          </th>
        </tr>
      </thead>
      <tbody className="text-ink-body">
        {PRIORITIES.map((priority) => {
          const target = policy.targets[priority];
          const label =
            PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
          return (
            <tr key={priority}>
              <th scope="row" className={cn(cell, 'font-medium whitespace-nowrap')}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn('size-2 rounded-full', toneDotClass(priorityTone(priority)))}
                  />
                  {label}
                </span>
              </th>
              <td className={cell}>{durationText(target.reply)}</td>
              <td className={cell}>{durationText(target.resolve)}</td>
              <td className={cn(cell, 'text-ink-muted')}>
                {target.hours === 'calendar' ? 'Round the clock' : 'Business hours'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function conditionsSummary(policy: SlaPolicy) {
  const items = policy.conditions.items.length;
  if (policy.isDefault) return 'Every ticket no other policy matches';
  return items === 1 ? '1 condition' : `${policy.conditions.match} of ${String(items)} conditions`;
}

function SlaList() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useGetApiV1SlaPolicies();
  const teams = useGetApiV1Teams();
  const members = useGetApiV1Members();
  const ticketFields = useGetApiV1CustomFields({ recordType: 'ticket' });
  const contactFields = useGetApiV1CustomFields({ recordType: 'contact' });
  const companyFields = useGetApiV1CustomFields({ recordType: 'company' });
  const [editing, setEditing] = useState<SlaPolicy | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SlaPolicy | null>(null);
  const queryKey = getGetApiV1SlaPoliciesQueryKey();
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const reorder = usePutApiV1SlaPoliciesOrder({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(queryKey, result);
      },
      onError: (failure) => {
        void refresh();
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const remove = useDeleteApiV1SlaPoliciesPolicyId({
    mutation: {
      onSuccess: () => {
        void refresh();
        toast({ tone: 'success', message: `${deleting?.name ?? 'Policy'} deleted.` });
        setDeleting(null);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
        setDeleting(null);
      },
    },
  });

  const queries = [list, teams, members, ticketFields, contactFields, companyFields];
  const header = (
    <PageHeader
      title="SLAs"
      breadcrumbs={BREADCRUMBS}
      {...(list.data
        ? {
            meta: `${String(list.data.policies.length)} ${list.data.policies.length === 1 ? 'policy' : 'policies'}`,
            actions: (
              <Button
                icon={<Plus aria-hidden />}
                onClick={() => {
                  setEditing('new');
                }}
              >
                New policy
              </Button>
            ),
          }
        : {})}
    />
  );

  if (
    list.isPending ||
    teams.isPending ||
    members.isPending ||
    ticketFields.isPending ||
    contactFields.isPending ||
    companyFields.isPending
  ) {
    return (
      <>
        {header}
        <div role="status" aria-label="Loading SLA policies" className="flex flex-col gap-3">
          {[1, 2].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (
    list.isError ||
    teams.isError ||
    members.isError ||
    ticketFields.isError ||
    contactFields.isError ||
    companyFields.isError
  ) {
    return (
      <>
        {header}
        <ErrorState
          what="SLA policies"
          retrying={list.isFetching}
          onRetry={() => {
            for (const query of queries) void query.refetch();
          }}
        />
      </>
    );
  }

  const fields = fieldOptions({
    teams: teams.data.teams,
    members: members.data.members,
    customFields: [
      { record: 'ticket', fields: ticketFields.data.fields },
      { record: 'contact', fields: contactFields.data.fields },
      { record: 'company', fields: companyFields.data.fields },
    ],
  });
  const policies = list.data.policies;
  const extra = policies.filter((policy) => !policy.isDefault);
  const move = (index: number, by: -1 | 1) => {
    const ids = extra.map((policy) => policy.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    reorder.mutate({ data: { policyIds: ids } });
  };

  return (
    <>
      {header}
      <section className="rounded-xl border border-border bg-surface px-5 py-2">
        <p className="border-b border-border py-2 text-xs text-ink-muted">
          Each ticket follows the first policy whose conditions match it, otherwise the default.
          Business hours and holidays are set in{' '}
          <Link to="/settings/business-hours" className="text-brand-link underline">
            Business hours
          </Link>
          . Changes apply to due times worked out from now on.
        </p>
        <ol aria-label="SLA policies" className="divide-y divide-border">
          {policies.map((policy) => {
            const index = extra.indexOf(policy);
            return (
              // Name and controls on one line, the targets table under them at full width.
              <li key={policy.id} className="flex flex-wrap items-start gap-x-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(policy);
                      }}
                      className="font-medium text-brand-link hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {policy.name}
                    </button>
                    {policy.isDefault && <Badge>Default</Badge>}
                  </div>
                  <p className="text-xs text-ink-muted">{conditionsSummary(policy)}</p>
                </div>
                {!policy.isDefault && (
                  <div className="flex gap-1">
                    <IconButton
                      label={`Move ${policy.name} up`}
                      size="sm"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => {
                        move(index, -1);
                      }}
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Move ${policy.name} down`}
                      size="sm"
                      disabled={index === extra.length - 1 || reorder.isPending}
                      onClick={() => {
                        move(index, 1);
                      }}
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </IconButton>
                    <Menu
                      trigger={
                        <IconButton label={`Actions for ${policy.name}`} size="sm">
                          <EllipsisVertical aria-hidden className="size-4" />
                        </IconButton>
                      }
                    >
                      <MenuItem
                        onSelect={() => {
                          setEditing(policy);
                        }}
                      >
                        Edit
                      </MenuItem>
                      <MenuItem
                        danger
                        onSelect={() => {
                          setDeleting(policy);
                        }}
                      >
                        Delete
                      </MenuItem>
                    </Menu>
                  </div>
                )}
                <div className="basis-full overflow-x-auto">
                  <TargetsTable policy={policy} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      {editing && (
        <SlaPolicyDrawer
          policy={editing === 'new' ? undefined : editing}
          fields={fields}
          members={members.data.members}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(_policy, message) => {
            void refresh();
            setEditing(null);
            toast({ tone: 'success', message });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          destructive
          pending={remove.isPending}
          title={`Delete the SLA policy ${deleting.name}?`}
          description="Its tickets keep the due times they have; their next change picks a policy again."
          confirmLabel="Delete policy"
          onConfirm={() => {
            remove.mutate({ policyId: deleting.id });
          }}
        />
      )}
    </>
  );
}

/** Settings → SLAs (admins): how soon tickets need a first reply and to be resolved. */
export function SlaPoliciesPage() {
  const me = useSession();
  if (!can(me, 'settings.manage')) {
    return (
      <>
        <PageHeader title="SLAs" breadcrumbs={BREADCRUMBS} />
        <NoAccessState
          area="SLA policies"
          explanation={`Only admins can change the SLA policies of ${me.workspace.name}.`}
        />
      </>
    );
  }
  return <SlaList />;
}
