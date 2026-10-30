import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, EllipsisVertical, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useGetApiV1CustomFields } from '../../api/generated/custom-fields/custom-fields';
import { useGetApiV1Members } from '../../api/generated/members/members';
import type { Rule } from '../../api/generated/model';
import {
  getGetApiV1RulesQueryKey,
  useDeleteApiV1RulesRuleId,
  useGetApiV1Rules,
  usePatchApiV1RulesRuleId,
  usePutApiV1RulesOrder,
} from '../../api/generated/rules/rules';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { SwitchField } from '../../components/Switch';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { can, useSession } from '../workspace/session-context';
import { RuleDrawer } from './RuleDrawer';
import { ACTION_LABELS, EVENT_SUMMARY, fieldOptions } from './rule-fields';

const BREADCRUMBS = [{ label: 'Settings' }, { label: 'Rules' }];

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "When a ticket is created · if any of 2 conditions · Set team, Add tags". */
function summary(rule: Rule) {
  const items = rule.conditions.items.length;
  const when = EVENT_SUMMARY[rule.event];
  const conditions =
    items === 0
      ? 'every ticket'
      : items === 1
        ? '1 condition'
        : `${rule.conditions.match} of ${String(items)} conditions`;
  const actions = rule.actions.map((action) => ACTION_LABELS[action.type]).join(', ');
  return `${when} · ${conditions} · ${actions}${rule.stopAfter ? ' · then stops' : ''}`;
}

function RulesList() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useGetApiV1Rules();
  const teams = useGetApiV1Teams();
  const members = useGetApiV1Members();
  const ticketFields = useGetApiV1CustomFields({ recordType: 'ticket' });
  const contactFields = useGetApiV1CustomFields({ recordType: 'contact' });
  const companyFields = useGetApiV1CustomFields({ recordType: 'company' });
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const queryKey = getGetApiV1RulesQueryKey();
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const toggle = usePatchApiV1RulesRuleId({
    mutation: {
      onSuccess: (saved) => {
        void refresh();
        toast({
          tone: 'success',
          message: saved.enabled ? `Rule ${saved.name} is on.` : `Rule ${saved.name} is off.`,
        });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const reorder = usePutApiV1RulesOrder({
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
  const remove = useDeleteApiV1RulesRuleId({
    mutation: {
      onSuccess: () => {
        void refresh();
        toast({ tone: 'success', message: `Rule ${deleting?.name ?? ''} deleted.` });
        setDeleting(null);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
        setDeleting(null);
      },
    },
  });

  const loading =
    list.isPending ||
    teams.isPending ||
    members.isPending ||
    ticketFields.isPending ||
    contactFields.isPending ||
    companyFields.isPending;
  const failed =
    list.isError ||
    teams.isError ||
    members.isError ||
    ticketFields.isError ||
    contactFields.isError ||
    companyFields.isError;

  const newButton = (
    <Button
      icon={<Plus aria-hidden />}
      onClick={() => {
        setEditing('new');
      }}
    >
      New rule
    </Button>
  );
  const rules = list.data?.rules;
  const header = (
    <PageHeader
      title="Rules"
      breadcrumbs={BREADCRUMBS}
      {...(rules ? { meta: count(rules.length, 'rule', 'rules') } : {})}
      {...(rules && rules.length > 0 ? { actions: newButton } : {})}
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <div role="status" aria-label="Loading rules" className="flex flex-col gap-3">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (failed) {
    return (
      <>
        {header}
        <ErrorState
          what="rules"
          retrying={list.isFetching}
          onRetry={() => {
            void list.refetch();
            void teams.refetch();
            void members.refetch();
            void ticketFields.refetch();
            void contactFields.refetch();
            void companyFields.refetch();
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
  const ordered = list.data.rules;
  const move = (index: number, by: -1 | 1) => {
    const ids = ordered.map((rule) => rule.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    reorder.mutate({ data: { ruleIds: ids } });
  };

  return (
    <>
      {header}
      {ordered.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No rules yet"
          description='Rules do routine work on new tickets: "if the subject mentions billing, send it to Accounts", "if the customer is on the Premium plan, make it high priority".'
          actions={newButton}
        />
      ) : (
        <section className="rounded-xl border border-border bg-surface px-5 py-2">
          <p className="border-b border-border py-2 text-xs text-ink-muted">
            Rules run from top to bottom when their event happens; each sees what the ones above
            changed.
          </p>
          <ol aria-label="Rules" className="divide-y divide-border">
            {ordered.map((rule, index) => (
              // Phones: a small grid, so the summary runs under the name at full width (Step 5b).
              <li
                key={rule.id}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 py-3 sm:flex sm:flex-wrap"
              >
                <span className="w-6 text-sm text-ink-subtle">{index + 1}.</span>
                <div className="contents sm:block sm:min-w-0 sm:flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(rule);
                    }}
                    className="col-start-2 row-start-1 text-left font-medium text-brand-link hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {rule.name}
                  </button>
                  <p className="col-span-3 col-start-2 row-start-2 text-xs text-ink-muted">
                    {summary(rule)}
                  </p>
                </div>
                <div className="col-start-3 row-start-1">
                  <SwitchField
                    hideLabel
                    label={`${rule.name} on`}
                    checked={rule.enabled}
                    disabled={toggle.isPending}
                    onCheckedChange={(enabled) => {
                      toggle.mutate({ ruleId: rule.id, data: { enabled } });
                    }}
                  />
                </div>
                <div className="col-start-4 row-start-1 flex gap-1">
                  <IconButton
                    label={`Move ${rule.name} up`}
                    size="sm"
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => {
                      move(index, -1);
                    }}
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Move ${rule.name} down`}
                    size="sm"
                    disabled={index === ordered.length - 1 || reorder.isPending}
                    onClick={() => {
                      move(index, 1);
                    }}
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </IconButton>
                  <Menu
                    trigger={
                      <IconButton label={`Actions for ${rule.name}`} size="sm">
                        <EllipsisVertical aria-hidden className="size-4" />
                      </IconButton>
                    }
                  >
                    <MenuItem
                      onSelect={() => {
                        setEditing(rule);
                      }}
                    >
                      Edit
                    </MenuItem>
                    <MenuItem
                      danger
                      onSelect={() => {
                        setDeleting(rule);
                      }}
                    >
                      Delete
                    </MenuItem>
                  </Menu>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {editing && (
        <RuleDrawer
          rule={editing === 'new' ? undefined : editing}
          fields={fields}
          teams={teams.data.teams}
          members={members.data.members}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(_rule, message) => {
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
          title={`Delete the rule ${deleting.name}?`}
          description="Tickets it already changed stay as they are. This can't be undone."
          confirmLabel="Delete rule"
          onConfirm={() => {
            remove.mutate({ ruleId: deleting.id });
          }}
        />
      )}
    </>
  );
}

/** Settings → Rules (admins): when something happens to a ticket and conditions match, do the actions. */
export function RulesPage() {
  const me = useSession();
  if (!can(me, 'settings.manage')) {
    return (
      <>
        <PageHeader title="Rules" breadcrumbs={BREADCRUMBS} />
        <NoAccessState
          area="rules"
          explanation={`Only admins can change the rules of ${me.workspace.name}.`}
        />
      </>
    );
  }
  return <RulesList />;
}
