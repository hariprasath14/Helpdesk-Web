import { Check, Search, UserPlus, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState, type SyntheticEvent } from 'react';
import { useGetApiV1Members } from '../../api/generated/members/members';
import type { Team, TeamMembersItem } from '../../api/generated/model';
import { usePatchApiV1TeamsTeamId, usePostApiV1Teams } from '../../api/generated/teams/teams';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { Spinner } from '../../components/Spinner';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { ROLE_NAMES } from '../members/roles';

type Person = Omit<TeamMembersItem, 'isLead'>;
type DraftMember = TeamMembersItem;

interface Draft {
  name: string;
  description: string;
  members: DraftMember[];
}

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());
const memberList = (members: DraftMember[]) =>
  members.map((member) => ({ userId: member.userId, isLead: member.isLead }));

/** Choose active workspace members to add; the list stays open so several can be added. */
function AddPeople({ chosen, onAdd }: { chosen: Set<string>; onAdd: (person: Person) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const people = useGetApiV1Members({ query: { enabled: open } });
  const query = search.trim().toLowerCase();
  const options = (people.data?.members ?? []).filter(
    (member) =>
      member.status === 'active' &&
      (!query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)),
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" icon={<UserPlus aria-hidden />}>
          Add people
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          aria-label="Add people to the team"
          className="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          <div className="border-b border-border p-2">
            <TextField
              label="Search people"
              type="search"
              placeholder="Name or email"
              trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <ul aria-label="People" className="max-h-64 overflow-y-auto py-1">
            {people.isPending ? (
              <li className="flex justify-center py-3 text-ink-muted">
                <Spinner />
                <span className="sr-only">Loading people</span>
              </li>
            ) : (
              options.map((member) => {
                const inTeam = chosen.has(member.userId);
                return (
                  <li key={member.userId}>
                    <button
                      type="button"
                      disabled={inTeam}
                      onClick={() => {
                        onAdd({
                          userId: member.userId,
                          name: member.name,
                          email: member.email,
                          role: member.role,
                          status: member.status,
                        });
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Avatar name={member.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{member.name}</span>
                        <span className="block truncate text-xs text-ink-subtle">
                          {member.email}
                        </span>
                      </span>
                      {inTeam && (
                        <>
                          <Check aria-hidden className="size-4 text-brand-600" />
                          <span className="sr-only">(in the team)</span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })
            )}
            {people.data && options.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-ink-muted">No people match.</li>
            )}
            {people.isError && (
              <li className="px-3 py-2.5 text-sm text-danger-text">
                Couldn&apos;t load people. Close and try again.
              </li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface TeamDrawerProps {
  /** The team to change; leave out to add one. */
  team?: Team | undefined;
  onClose: () => void;
  onSaved: (team: Team, message: string) => void;
  /** After a refused save because someone else changed the team. */
  onStale: () => void;
}

/** Add or edit a team: name, description, people and leads. Mount it only while open. */
export function TeamDrawer({ team, onClose, onSaved, onStale }: TeamDrawerProps) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: team?.name ?? '',
    description: team?.description ?? '',
    members: team?.members ?? [],
  }));
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const editing = team !== undefined;

  const handlers = (message: string) => ({
    onSuccess: (saved: Team) => {
      onSaved(saved, message);
    },
    onError: (failure: unknown) => {
      const found = problemsFrom(failure);
      setProblems(found);
      if (found.form?.startsWith('Someone else changed this team')) onStale();
    },
  });
  const create = usePostApiV1Teams({ mutation: handlers('Team added.') });
  const update = usePatchApiV1TeamsTeamId({ mutation: handlers('Team saved.') });

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const setMember = (userId: string, next: Partial<DraftMember> | null) => {
    change({
      members: draft.members.flatMap((member) =>
        member.userId !== userId ? [member] : next ? [{ ...member, ...next }] : [],
      ),
    });
  };

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!draft.name.trim()) {
      setProblems({ fields: { name: 'Enter a name.' } });
      return;
    }
    setProblems({ fields: {} });
    const data = {
      name: draft.name.trim(),
      description: textOrNull(draft.description),
      members: memberList(draft.members),
    };
    if (team) update.mutate({ teamId: team.id, data: { ...data, updatedAt: team.updatedAt } });
    else create.mutate({ data });
  };

  const memberError = (index: number) => problems.fields[`members.${String(index)}`];
  const leads = draft.members.filter((member) => member.isLead).length;

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? `Edit ${team.name}` : 'New team'}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending || update.isPending}
            onClick={() => {
              submit();
            }}
          >
            {editing ? 'Save team' : 'Add team'}
          </Button>
        </div>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {problems.form && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {problems.form}
          </p>
        )}
        <TextField
          label="Name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Billing"
          value={draft.name}
          error={problems.fields.name}
          onChange={(event) => {
            change({ name: event.target.value });
          }}
        />
        <TextAreaField
          label="Description"
          maxLength={500}
          rows={2}
          value={draft.description}
          error={problems.fields.description}
          hint="What this team handles, for agents choosing where a ticket goes."
          onChange={(event) => {
            change({ description: event.target.value });
          }}
        />
        <section aria-labelledby="team-people" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="team-people" className="text-[13px] font-medium text-ink">
                People
              </h3>
              <p className="text-xs text-ink-subtle">
                {draft.members.length === 1 ? '1 person' : `${String(draft.members.length)} people`}
                {leads > 0 && ` · ${String(leads)} ${leads === 1 ? 'lead' : 'leads'}`}. Team leads
                get escalations for the team&apos;s tickets.
              </p>
            </div>
            <AddPeople
              chosen={new Set(draft.members.map((member) => member.userId))}
              onAdd={(person) => {
                change({ members: [...draft.members, { ...person, isLead: false }] });
              }}
            />
          </div>
          {problems.fields.members && (
            <p className="text-xs text-danger-text">{problems.fields.members}</p>
          )}
          {draft.members.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-ink-muted">
              No people yet. Add the agents who handle this team&apos;s tickets.
            </p>
          ) : (
            <ul
              aria-label="Team members"
              className="divide-y divide-border rounded-lg border border-border"
            >
              {draft.members.map((member, index) => (
                <li key={member.userId} className="flex flex-col gap-1 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{member.name}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {ROLE_NAMES[member.role]} · {member.email}
                      </p>
                    </div>
                    {member.status === 'deactivated' && <Badge tone="warning">Deactivated</Badge>}
                    <label className="flex items-center gap-1.5 text-sm text-ink-body">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-600"
                        checked={member.isLead}
                        onChange={(event) => {
                          setMember(member.userId, { isLead: event.target.checked });
                        }}
                      />
                      Lead
                      <span className="sr-only"> ({member.name})</span>
                    </label>
                    <IconButton
                      label={`Remove ${member.name}`}
                      size="sm"
                      onClick={() => {
                        setMember(member.userId, null);
                      }}
                    >
                      <X aria-hidden className="size-4" />
                    </IconButton>
                  </div>
                  {memberError(index) && (
                    <p className="pl-11 text-xs text-danger-text">{memberError(index)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </form>
    </Drawer>
  );
}
