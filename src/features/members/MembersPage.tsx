import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Mail, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { InvitationSummary, Member } from '../../api/generated/model';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import {
  getGetApiV1MembersQueryKey,
  useDeleteApiV1InvitationsInvitationId,
  useGetApiV1Members,
  usePatchApiV1MembersUserId,
  usePostApiV1InvitationsInvitationIdResend,
  usePostApiV1MembersUserIdDeactivate,
  usePostApiV1MembersUserIdReactivate,
  usePostApiV1MembersUserIdResetTwoFactor,
} from '../../api/generated/members/members';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';
import { can, useSession } from '../workspace/session-context';
import { InviteDrawer } from './InviteDrawer';
import { isReauthRequired, useReauth } from './use-reauth';
import { ROLE_NAMES, ROLE_OPTIONS } from './roles';

type Confirming = { kind: 'deactivate' | 'reset-two-factor'; member: Member } | null;

const FILTERS = [{ value: 'all', label: 'All roles' }, ...ROLE_OPTIONS];

/** The actions an admin has on one member, and the confirmations they need. */
function useMemberActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetApiV1MembersQueryKey() });

  /** Shared handling: refresh and thank on success; ask for the password, or explain, on failure. */
  const handlers = <V,>(done: string, retry: (variables: V) => void) => ({
    onSuccess: () => {
      void refresh();
      setConfirming(null);
      toast({ tone: 'success', message: done });
    },
    onError: (failure: unknown, variables: V) => {
      if (isReauthRequired(failure)) {
        reauth.ask(() => {
          retry(variables);
        });
        return;
      }
      setConfirming(null);
      toast({ tone: 'danger', message: formError(failure) });
    },
  });

  const changeRole = usePatchApiV1MembersUserId({
    mutation: handlers('Role changed.', (variables) => {
      changeRole.mutate(variables);
    }),
  });
  const deactivate = usePostApiV1MembersUserIdDeactivate({
    mutation: handlers('Deactivated. They were signed out of this workspace.', (variables) => {
      deactivate.mutate(variables);
    }),
  });
  const reactivate = usePostApiV1MembersUserIdReactivate({
    mutation: handlers('Reactivated. They can sign in again.', (variables) => {
      reactivate.mutate(variables);
    }),
  });
  const resetTwoFactor = usePostApiV1MembersUserIdResetTwoFactor({
    mutation: handlers('Two-step verification was reset. They were signed out.', (variables) => {
      resetTwoFactor.mutate(variables);
    }),
  });
  const resend = usePostApiV1InvitationsInvitationIdResend({
    mutation: handlers('A new invitation link was sent.', (variables) => {
      resend.mutate(variables);
    }),
  });
  const revoke = useDeleteApiV1InvitationsInvitationId({
    mutation: handlers('Invitation revoked.', (variables) => {
      revoke.mutate(variables);
    }),
  });

  const confirmDialog = confirming && (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) setConfirming(null);
      }}
      destructive
      pending={deactivate.isPending || resetTwoFactor.isPending}
      {...(confirming.kind === 'deactivate'
        ? {
            title: `Deactivate ${confirming.member.name}?`,
            description:
              "They're signed out of this workspace now and can't sign in until you reactivate them. Their unresolved tickets are unassigned; their name stays on past tickets, and they keep their place in their teams.",
            confirmLabel: 'Deactivate',
            onConfirm: () => {
              deactivate.mutate({ userId: confirming.member.userId });
            },
          }
        : {
            title: `Reset two-step verification for ${confirming.member.name}?`,
            description:
              "Their authenticator app and recovery codes stop working and they're signed out. They sign in with their password, and set it up again if this workspace requires it.",
            confirmLabel: 'Reset two-step verification',
            onConfirm: () => {
              resetTwoFactor.mutate({ userId: confirming.member.userId });
            },
          })}
    />
  );

  return {
    changeRole: (member: Member, role: Member['role']) => {
      changeRole.mutate({ userId: member.userId, data: { role } });
    },
    reactivate: (member: Member) => {
      reactivate.mutate({ userId: member.userId });
    },
    resend: (invitation: InvitationSummary) => {
      resend.mutate({ invitationId: invitation.id });
    },
    revoke: (invitation: InvitationSummary) => {
      revoke.mutate({ invitationId: invitation.id });
    },
    confirm: setConfirming,
    dialogs: (
      <>
        {confirmDialog}
        {reauth.dialog}
      </>
    ),
  };
}

const COLUMNS =
  'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem]';

/** A member's teams: the first two as chips, then "+N" (all named for screen readers). */
function MemberTeams({ teams }: { teams: Member['teams'] }) {
  if (teams.length === 0) {
    return (
      <p className="text-xs text-ink-subtle">
        <span className="md:sr-only">Teams: </span>No team
      </p>
    );
  }
  const shown = teams.slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="sr-only">
        Teams: {teams.map((team) => (team.isLead ? `${team.name} (lead)` : team.name)).join(', ')}
      </span>
      <span aria-hidden className="flex flex-wrap items-center gap-1.5">
        {shown.map((team) => (
          <Badge key={team.id} tone="neutral" className="max-w-full">
            <span className="truncate">
              {team.name}
              {team.isLead && ' · Lead'}
            </span>
          </Badge>
        ))}
        {teams.length > shown.length && (
          <span className="text-xs text-ink-muted">+{teams.length - shown.length}</span>
        )}
      </span>
    </div>
  );
}

function MemberRow({
  member,
  isYou,
  manage,
  actions,
}: {
  member: Member;
  isYou: boolean;
  manage: boolean;
  actions: ReturnType<typeof useMemberActions>;
}) {
  const deactivated = member.status === 'deactivated';
  const canAct = manage && !member.isOwner && !isYou;
  return (
    <li className={`flex flex-col gap-2 py-3 md:grid md:items-center md:gap-4 ${COLUMNS}`}>
      <div className="min-w-0">
        <p className={deactivated ? 'font-medium text-ink-muted' : 'font-medium text-ink'}>
          {member.name}
          {isYou && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}
        </p>
        <p className="truncate text-xs text-ink-muted">{member.email}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={member.role === 'admin' ? 'brand' : 'neutral'}>
          {ROLE_NAMES[member.role]}
        </Badge>
        {member.isOwner && <Badge tone="info">Owner</Badge>}
      </div>
      <MemberTeams teams={member.teams} />
      <div className="text-xs text-ink-muted">
        <span className="md:sr-only">Two-step verification: </span>
        {member.twoFactorEnabled ? (
          <Badge tone="success" dot>
            On
          </Badge>
        ) : (
          'Off'
        )}
      </div>
      <div className="text-xs text-ink-muted">
        {deactivated ? (
          <Badge tone="warning">Deactivated</Badge>
        ) : member.lastActiveAt ? (
          <>
            <span className="md:sr-only">Last active </span>
            {relativeTime(member.lastActiveAt)}
          </>
        ) : (
          'Not signed in yet'
        )}
      </div>
      <div className="md:justify-self-end">
        {canAct && (
          <Menu
            trigger={
              <IconButton label={`Actions for ${member.name}`} size="sm">
                <EllipsisVertical aria-hidden className="size-4" />
              </IconButton>
            }
          >
            {deactivated ? (
              <MenuItem
                onSelect={() => {
                  actions.reactivate(member);
                }}
              >
                Reactivate
              </MenuItem>
            ) : (
              <>
                {ROLE_OPTIONS.filter((option) => option.value !== member.role).map((option) => (
                  <MenuItem
                    key={option.value}
                    onSelect={() => {
                      actions.changeRole(member, option.value);
                    }}
                  >
                    Make {option.label}
                  </MenuItem>
                ))}
                {member.twoFactorEnabled && (
                  <MenuItem
                    onSelect={() => {
                      actions.confirm({ kind: 'reset-two-factor', member });
                    }}
                  >
                    Reset two-step verification
                  </MenuItem>
                )}
                <MenuItem
                  danger
                  onSelect={() => {
                    actions.confirm({ kind: 'deactivate', member });
                  }}
                >
                  Deactivate
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    </li>
  );
}

function InvitationRow({
  invitation,
  manage,
  actions,
}: {
  invitation: InvitationSummary;
  manage: boolean;
  actions: ReturnType<typeof useMemberActions>;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{invitation.email}</p>
        <p className="text-xs text-ink-muted">
          {ROLE_NAMES[invitation.role]}
          {invitation.teams.length > 0 &&
            ` · joins ${invitation.teams.map((team) => team.name).join(', ')}`}
          {invitation.invitedByName && ` · invited by ${invitation.invitedByName}`} ·{' '}
          {invitation.expired ? (
            <span className="text-warning-text">expired</span>
          ) : (
            `expires ${relativeTime(invitation.expiresAt)}`
          )}
        </p>
      </div>
      {manage && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              actions.resend(invitation);
            }}
          >
            Resend
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              actions.revoke(invitation);
            }}
          >
            Revoke
          </Button>
        </div>
      )}
    </li>
  );
}

function MembersList() {
  const me = useSession();
  const manage = can(me, 'members.manage');
  const list = useGetApiV1Members();
  const actions = useMemberActions();
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const teams = useGetApiV1Teams();
  const teamOptions = [
    { value: 'all', label: 'All teams' },
    { value: 'none', label: 'No team' },
    ...(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name })),
  ];

  const header = (
    <PageHeader
      title="Members"
      breadcrumbs={[{ label: 'Settings' }, { label: 'Members' }]}
      {...(list.data
        ? {
            meta:
              list.data.members.length === 1
                ? '1 member'
                : `${String(list.data.members.length)} members`,
          }
        : {})}
      {...(manage
        ? {
            actions: (
              <Button
                icon={<UserPlus aria-hidden />}
                onClick={() => {
                  setInviting(true);
                }}
              >
                Invite people
              </Button>
            ),
          }
        : {})}
    />
  );

  if (list.isPending) {
    return (
      <>
        {header}
        <div role="status" aria-label="Loading members" className="flex flex-col gap-3">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (list.isError) {
    return (
      <>
        {header}
        <ErrorState
          what="members"
          retrying={list.isFetching}
          onRetry={() => {
            void list.refetch();
          }}
        />
      </>
    );
  }

  const query = search.trim().toLowerCase();
  const shown = list.data.members.filter(
    (member) =>
      (role === 'all' || member.role === role) &&
      (teamFilter === 'all' ||
        (teamFilter === 'none'
          ? member.teams.length === 0
          : member.teams.some((team) => team.id === teamFilter))) &&
      (!query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)),
  );

  return (
    <>
      {header}
      <section className="rounded-xl border border-border bg-surface px-5 pt-4 pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField
              label="Search members"
              type="search"
              placeholder="Name or email"
              trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <div className="sm:w-44">
            <SelectField
              label="Role"
              value={role}
              options={FILTERS}
              onChange={(event) => {
                setRole(event.target.value);
              }}
            />
          </div>
          <div className="sm:w-44">
            <SelectField
              label="Team"
              value={teamFilter}
              options={teamOptions}
              onChange={(event) => {
                setTeamFilter(event.target.value);
              }}
            />
          </div>
        </div>
        <div
          aria-hidden
          className={`mt-4 hidden gap-4 border-b border-border pb-2 text-xs font-medium text-ink-subtle md:grid ${COLUMNS}`}
        >
          <span>Name</span>
          <span>Role</span>
          <span>Teams</span>
          <span>Two-step</span>
          <span>Last active</span>
          <span />
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-ink-muted">No members match.</p>
        ) : (
          <ul aria-label="Members" className="divide-y divide-border">
            {shown.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isYou={member.userId === me.user.id}
                manage={manage}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface px-5 pt-4 pb-2">
        <h2 className="text-base font-bold">Invitations</h2>
        {list.data.invitations.length === 0 ? (
          <div className="py-2">
            <EmptyState
              icon={Mail}
              title="No open invitations"
              description={
                manage
                  ? 'Invite your team with "Invite people". Each person gets a link to join.'
                  : 'Admins invite people to the workspace.'
              }
            />
          </div>
        ) : (
          <ul aria-label="Invitations" className="divide-y divide-border">
            {list.data.invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                manage={manage}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </section>

      {manage && <InviteDrawer open={inviting} onOpenChange={setInviting} />}
      {actions.dialogs}
    </>
  );
}

/** Settings → Members: everyone in the workspace and open invitations. Admins manage them. */
export function MembersPage() {
  const me = useSession();
  if (!can(me, 'members.view')) {
    return (
      <>
        <PageHeader title="Members" breadcrumbs={[{ label: 'Settings' }, { label: 'Members' }]} />
        <NoAccessState
          area="members"
          explanation={`Only admins and supervisors can see the members of ${me.workspace.name}.`}
        />
      </>
    );
  }
  return <MembersList />;
}
