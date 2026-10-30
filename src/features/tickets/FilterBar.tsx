import { AlarmClock } from 'lucide-react';
import { useState } from 'react';
import { useGetApiV1People } from '../../api/generated/members/members';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import { useGetApiV1TicketsTags } from '../../api/generated/tickets/tickets';
import { Button } from '../../components/Button';
import { FilterMenu } from './FilterMenu';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './ticket-labels';
import type { Filters, ListKey } from './ticket-filters';

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** One full-width row per filter, for the phone filter sheet. */
  stacked?: boolean;
}

/** A tag typed into the tag filter (tags in use are listed above it). */
function TagBox({ onAdd }: { onAdd: (tag: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const tag = text.trim().replace(/\s+/g, ' ').toLowerCase();
        if (tag) onAdd(tag);
        setText('');
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Another tag
        <input
          value={text}
          maxLength={40}
          placeholder="Type a tag, then Enter"
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-focus"
        />
      </label>
    </form>
  );
}

/** The list's filters: status, priority, type, team, assignee, tags, and overdue (F23). */
export function FilterBar({ filters, onChange, stacked = false }: FilterBarProps) {
  const teams = useGetApiV1Teams();
  const people = useGetApiV1People();
  const tags = useGetApiV1TicketsTags();
  const set = (key: ListKey) => (values: string[]) => {
    onChange({ ...filters, [key]: values });
  };
  const chosenTags = filters.tag ?? [];
  const tagOptions = [...new Set([...chosenTags, ...(tags.data?.tags ?? [])])].map((tag) => ({
    value: tag,
    label: tag,
  }));

  return (
    <div
      role="group"
      aria-label="Filters"
      className={stacked ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}
    >
      <FilterMenu
        stacked={stacked}
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.status ?? []}
        onChange={set('status')}
      />
      <FilterMenu
        stacked={stacked}
        label="Priority"
        options={PRIORITY_OPTIONS}
        selected={filters.priority ?? []}
        onChange={set('priority')}
      />
      <FilterMenu
        stacked={stacked}
        label="Type"
        options={[...TYPE_OPTIONS, { value: 'none', label: 'No type' }]}
        selected={filters.type ?? []}
        onChange={set('type')}
      />
      <FilterMenu
        stacked={stacked}
        label="Team"
        options={[
          ...(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name })),
          { value: 'none', label: 'No team' },
        ]}
        selected={filters.teamId ?? []}
        onChange={set('teamId')}
      />
      <FilterMenu
        stacked={stacked}
        label="Assignee"
        options={[
          { value: 'me', label: 'Me' },
          { value: 'none', label: 'Unassigned' },
          ...(people.data?.people ?? []).map((person) => ({
            value: person.userId,
            label: person.status === 'deactivated' ? `${person.name} (deactivated)` : person.name,
          })),
        ]}
        selected={filters.assignee ?? []}
        onChange={set('assignee')}
      />
      <FilterMenu
        stacked={stacked}
        label="Tags"
        options={tagOptions}
        selected={chosenTags}
        onChange={set('tag')}
      >
        <TagBox
          onAdd={(tag) => {
            if (!chosenTags.includes(tag)) set('tag')([...chosenTags, tag]);
          }}
        />
      </FilterMenu>
      <Button
        variant={filters.overdue ? 'secondary' : 'outline'}
        size={stacked ? 'md' : 'sm'}
        className={stacked ? 'h-11 w-full justify-start' : undefined}
        aria-pressed={Boolean(filters.overdue)}
        icon={<AlarmClock aria-hidden className="size-4" />}
        onClick={() => {
          const { overdue, ...rest } = filters;
          onChange(overdue ? rest : { ...rest, overdue: true });
        }}
      >
        Overdue
      </Button>
    </div>
  );
}
