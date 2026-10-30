import type {
  CustomField,
  TicketSummaryPriority,
  TicketSummaryStatus,
} from '../../api/generated/model';
import { useGetApiV1People } from '../../api/generated/members/members';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import { SelectField } from '../../components/SelectField';
import { CustomFieldsEditor } from '../custom-fields/CustomFieldValues';
import type { CustomValues } from '../custom-fields/custom-values';
import { customFieldProblems } from '../contacts/directory';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './ticket-labels';
import { can, useSession } from '../workspace/session-context';
import { TagInput } from './TagInput';

/** The ticket properties a form edits; '' means "none" for type and team. */
export interface PropertiesDraft {
  status: TicketSummaryStatus;
  priority: TicketSummaryPriority;
  type: string;
  teamId: string;
  /** '' for nobody. */
  assigneeUserId: string;
  tags: string[];
  customFields: CustomValues;
}

interface TicketFieldsProps {
  draft: PropertiesDraft;
  onChange: (next: Partial<PropertiesDraft>) => void;
  customFields: CustomField[];
  /** API messages by field path (status, teamId, tags, customFields.<key>…). */
  errors: Record<string, string>;
  /** The saved assignee (agents can't change someone else's); null on a new ticket. */
  savedAssignee?: { userId: string; name: string } | null;
  /**
   * Two columns for the selects (the wide new-ticket form), one (a narrow column), or compact
   * rows with the label beside each value (the ticket's properties, Step 5b).
   */
  layout?: 'wide' | 'narrow' | 'rows';
  disabled?: boolean;
}

/** Status, priority, type, team, tags and the ticket custom fields. */
export function TicketFields({
  draft,
  onChange,
  customFields,
  errors,
  layout = 'wide',
  disabled = false,
  savedAssignee = null,
}: TicketFieldsProps) {
  const teams = useGetApiV1Teams();
  const people = useGetApiV1People();
  const me = useSession();
  const assignAny = can(me, 'tickets.assign_any');
  // Agents take unassigned tickets or give back their own; someone else's stays as it is.
  const lockedByOther = !assignAny && savedAssignee !== null && savedAssignee.userId !== me.user.id;
  const teamMembers = new Set(
    teams.data?.teams
      .find((team) => team.id === draft.teamId)
      ?.members.filter((member) => member.status === 'active')
      .map((member) => member.userId) ?? [],
  );
  const active = (people.data?.people ?? []).filter((person) => person.status === 'active');
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...(assignAny
      ? [
          // The ticket's team first, so the usual choice is near the top.
          ...active.filter((person) => teamMembers.has(person.userId)),
          ...active.filter((person) => !teamMembers.has(person.userId)),
        ].map((person) => ({
          value: person.userId,
          label: `${person.userId === me.user.id ? `${person.name} (me)` : person.name}${teamMembers.has(person.userId) ? ' · in team' : ''}`,
        }))
      : [{ value: me.user.id, label: `${me.user.name} (me)` }]),
  ];
  if (savedAssignee && !assigneeOptions.some((option) => option.value === savedAssignee.userId)) {
    assigneeOptions.push({ value: savedAssignee.userId, label: savedAssignee.name });
  }
  const tagError =
    errors.tags ??
    Object.entries(errors).find(([path]) => path.startsWith('tags.'))?.[1] ??
    undefined;
  const resolving = draft.status === 'resolved' || draft.status === 'closed';
  const rows = layout === 'rows';
  const selectLayout = { inline: rows, compact: rows };

  return (
    <fieldset disabled={disabled} className={rows ? 'flex flex-col gap-4' : 'flex flex-col gap-5'}>
      <div
        className={
          layout === 'wide'
            ? 'grid gap-5 sm:grid-cols-2'
            : rows
              ? 'flex flex-col gap-2'
              : 'flex flex-col gap-4'
        }
      >
        <SelectField
          {...selectLayout}
          label="Status"
          value={draft.status}
          options={STATUS_OPTIONS}
          error={errors.status}
          onChange={(event) => {
            onChange({ status: event.target.value as TicketSummaryStatus });
          }}
        />
        <SelectField
          {...selectLayout}
          label="Priority"
          value={draft.priority}
          options={PRIORITY_OPTIONS}
          error={errors.priority}
          onChange={(event) => {
            onChange({ priority: event.target.value as TicketSummaryPriority });
          }}
        />
        <SelectField
          {...selectLayout}
          label="Type"
          value={draft.type}
          options={[{ value: '', label: 'No type' }, ...TYPE_OPTIONS]}
          error={errors.type}
          onChange={(event) => {
            onChange({ type: event.target.value });
          }}
        />
        <SelectField
          {...selectLayout}
          label="Team"
          value={draft.teamId}
          options={[
            { value: '', label: teams.isPending ? 'Loading teams…' : 'No team' },
            ...(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name })),
          ]}
          error={errors.teamId}
          onChange={(event) => {
            onChange({ teamId: event.target.value });
          }}
        />
        <SelectField
          {...selectLayout}
          label="Assignee"
          value={draft.assigneeUserId}
          options={assigneeOptions}
          error={errors.assigneeUserId}
          disabled={lockedByOther}
          hint={
            lockedByOther
              ? `${savedAssignee.name} has it. A supervisor or admin can reassign it.`
              : undefined
          }
          onChange={(event) => {
            onChange({ assigneeUserId: event.target.value });
          }}
        />
      </div>
      <TagInput
        label="Tags"
        tags={draft.tags}
        error={tagError}
        onChange={(tags) => {
          onChange({ tags });
        }}
      />
      <CustomFieldsEditor
        fields={customFields}
        resolving={resolving}
        values={draft.customFields}
        errors={customFieldProblems(errors)}
        onChange={(key, value) => {
          onChange({ customFields: { ...draft.customFields, [key]: value } });
        }}
      />
    </fieldset>
  );
}
