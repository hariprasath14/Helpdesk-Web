import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { getGetApiV1MembersQueryKey } from '../../api/generated/members/members';
import type { Team } from '../../api/generated/model';
import {
  getGetApiV1TeamsQueryKey,
  useDeleteApiV1TeamsTeamId,
  useGetApiV1Teams,
} from '../../api/generated/teams/teams';
import { Avatar } from '../../components/Avatar';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { can, useSession } from '../workspace/session-context';
import { TeamDrawer } from './TeamDrawer';

const COLUMNS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_2.25rem]';
const BREADCRUMBS = [{ label: 'Settings' }, { label: 'Teams' }];

const peopleCount = (count: number) => (count === 1 ? '1 person' : `${String(count)} people`);

/** Up to five avatars, then "+N", with the names for screen readers. */
function Faces({ team }: { team: Team }) {
  const shown = team.members.slice(0, 5);
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {shown.map((member) => (
          <Avatar
            key={member.userId}
            name={member.name}
            size="sm"
            className="ring-2 ring-surface"
          />
        ))}
      </div>
      <span className="text-xs text-ink-muted">
        {team.members.length === 0 ? 'Nobody yet' : peopleCount(team.members.length)}
      </span>
      <span className="sr-only">{team.members.map((member) => member.name).join(', ')}</span>
    </div>
  );
}

function TeamRow({
  team,
  manage,
  onEdit,
  onDelete,
}: {
  team: Team;
  manage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const leads = team.members.filter((member) => member.isLead);
  return (
    <li className={`flex flex-col gap-2 py-3 md:grid md:items-center md:gap-4 ${COLUMNS}`}>
      <div className="min-w-0">
        {manage ? (
          <button
            type="button"
            onClick={onEdit}
            className="font-medium text-brand-link hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {team.name}
          </button>
        ) : (
          <p className="font-medium text-ink">{team.name}</p>
        )}
        {team.description && (
          <p className="line-clamp-2 text-xs text-ink-muted">{team.description}</p>
        )}
      </div>
      <Faces team={team} />
      <p className="text-xs text-ink-muted">
        <span className="md:sr-only">Leads: </span>
        {leads.length > 0 ? leads.map((member) => member.name).join(', ') : 'No lead'}
      </p>
      <div className="md:justify-self-end">
        {manage && (
          <Menu
            trigger={
              <IconButton label={`Actions for ${team.name}`} size="sm">
                <EllipsisVertical aria-hidden className="size-4" />
              </IconButton>
            }
          >
            <MenuItem onSelect={onEdit}>Edit</MenuItem>
            <MenuItem danger onSelect={onDelete}>
              Delete
            </MenuItem>
          </Menu>
        )}
      </div>
    </li>
  );
}

function TeamsList() {
  const me = useSession();
  const manage = can(me, 'teams.manage');
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useGetApiV1Teams();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetApiV1TeamsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetApiV1MembersQueryKey() }),
    ]);

  const remove = useDeleteApiV1TeamsTeamId({
    mutation: {
      onSuccess: () => {
        void refresh();
        toast({ tone: 'success', message: `Team ${deleting?.name ?? ''} deleted.` });
        setDeleting(null);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
        setDeleting(null);
      },
    },
  });

  const newButton = (
    <Button
      icon={<Plus aria-hidden />}
      onClick={() => {
        setEditing('new');
      }}
    >
      New team
    </Button>
  );
  const teams = list.data?.teams;
  const header = (
    <PageHeader
      title="Teams"
      breadcrumbs={BREADCRUMBS}
      {...(teams ? { meta: teams.length === 1 ? '1 team' : `${String(teams.length)} teams` } : {})}
      {...(manage && teams && teams.length > 0 ? { actions: newButton } : {})}
    />
  );

  let body;
  if (list.isPending) {
    body = (
      <div role="status" aria-label="Loading teams" className="flex flex-col gap-3">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (list.isError) {
    body = (
      <ErrorState
        what="teams"
        retrying={list.isFetching}
        onRetry={() => {
          void list.refetch();
        }}
      />
    );
  } else if (list.data.teams.length === 0) {
    body = (
      <EmptyState
        icon={UsersRound}
        title="No teams yet"
        description={
          manage
            ? 'Teams group the people who handle a kind of ticket, such as Billing or Technical support. Tickets are routed to a team, and its leads get escalations.'
            : 'Admins create teams, such as Billing or Technical support, and tickets are routed to them.'
        }
        {...(manage ? { actions: newButton } : {})}
      />
    );
  } else {
    body = (
      <section className="rounded-xl border border-border bg-surface px-5 pt-2 pb-2">
        <div
          aria-hidden
          className={`hidden gap-4 border-b border-border py-2 text-xs font-medium text-ink-subtle md:grid ${COLUMNS}`}
        >
          <span>Team</span>
          <span>People</span>
          <span>Leads</span>
          <span />
        </div>
        <ul aria-label="Teams" className="divide-y divide-border">
          {list.data.teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              manage={manage}
              onEdit={() => {
                setEditing(team);
              }}
              onDelete={() => {
                setDeleting(team);
              }}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      {header}
      {body}
      {editing && (
        <TeamDrawer
          team={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(_team, message) => {
            void refresh();
            setEditing(null);
            toast({ tone: 'success', message });
          }}
          onStale={() => {
            void refresh();
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
          title={`Delete the team ${deleting.name}?`}
          description={`${peopleCount(deleting.members.length)} in it stay in the workspace, and its tickets stay with no team. This can't be undone.`}
          confirmLabel="Delete team"
          onConfirm={() => {
            remove.mutate({ teamId: deleting.id });
          }}
        />
      )}
    </>
  );
}

/** Settings → Teams: the groups tickets are routed to. Admins manage them; supervisors view. */
export function TeamsPage() {
  const me = useSession();
  if (!can(me, 'members.view')) {
    return (
      <>
        <PageHeader title="Teams" breadcrumbs={BREADCRUMBS} />
        <NoAccessState
          area="teams"
          explanation={`Only admins and supervisors can see the teams of ${me.workspace.name}.`}
        />
      </>
    );
  }
  return <TeamsList />;
}
