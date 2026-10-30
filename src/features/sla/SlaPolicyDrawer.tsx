import { useId, useState, type SyntheticEvent } from 'react';
import type {
  Member,
  SlaDurationUnit,
  SlaEscalationInputReassign,
  SlaPolicy,
  SlaPriorityTargetHours,
  SlaTargetsInput,
} from '../../api/generated/model';
import {
  usePatchApiV1SlaPoliciesPolicyId,
  usePostApiV1SlaPolicies,
} from '../../api/generated/sla/sla';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { toneDotClass } from '../../components/badge-tones';
import { cn } from '../../lib/cn';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { ConditionsEditor } from '../rules/ConditionsEditor';
import {
  conditionsPayload,
  draftConditions,
  NEW_CONDITION,
  type DraftCondition,
} from '../rules/conditions-draft';
import type { FieldOption } from '../rules/rule-fields';
import { PRIORITY_OPTIONS, priorityTone } from '../tickets/ticket-labels';
import { STARTING_TARGETS } from './sla-format';

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
type Priority = (typeof PRIORITIES)[number];

const UNIT_OPTIONS: { value: SlaDurationUnit; label: string }[] = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
];
const HOURS_OPTIONS: { value: SlaPriorityTargetHours; label: string }[] = [
  { value: 'business', label: 'Business hours' },
  { value: 'calendar', label: 'Round the clock' },
];

/** Amounts are typed as text, so a half-typed number can be checked before saving. */
interface DraftDuration {
  amount: string;
  unit: SlaDurationUnit;
}
interface DraftTarget {
  reply: DraftDuration;
  resolve: DraftDuration;
  hours: SlaPriorityTargetHours;
}
type DraftTargets = Record<Priority, DraftTarget>;

const draftTargets = (targets: SlaTargetsInput): DraftTargets =>
  Object.fromEntries(
    PRIORITIES.map((priority) => {
      const target = targets[priority];
      return [
        priority,
        {
          reply: { amount: String(target.reply.amount), unit: target.reply.unit },
          resolve: { amount: String(target.resolve.amount), unit: target.resolve.unit },
          hours: target.hours,
        },
      ];
    }),
  ) as DraftTargets;

/** Problems in the typed amounts, by the API's paths ("targets.urgent.reply.amount"). */
function checkTargets(targets: DraftTargets): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const priority of PRIORITIES) {
    for (const part of ['reply', 'resolve'] as const) {
      const { amount, unit } = targets[priority][part];
      const value = Number(amount);
      const max = unit === 'days' ? 365 : 999;
      if (!/^\d+$/.test(amount) || value < 1 || value > max) {
        problems[`targets.${priority}.${part}.amount`] =
          `Enter a whole number from 1 to ${String(max)}.`;
      }
    }
  }
  return problems;
}

const targetsPayload = (targets: DraftTargets): SlaTargetsInput =>
  Object.fromEntries(
    PRIORITIES.map((priority) => {
      const target = targets[priority];
      return [
        priority,
        {
          reply: { amount: Number(target.reply.amount), unit: target.reply.unit },
          resolve: { amount: Number(target.resolve.amount), unit: target.resolve.unit },
          hours: target.hours,
        },
      ];
    }),
  ) as unknown as SlaTargetsInput;

/**
 * An amount and its unit side by side; a caption names them on phones, where there is no table
 * header.
 */
function DurationInput({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: DraftDuration;
  error?: string | undefined;
  onChange: (value: DraftDuration) => void;
}) {
  // The error goes under both inputs: the amount column is too narrow to hold it.
  const errorId = useId();
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-end gap-1.5">
      <span aria-hidden className="col-span-2 text-[13px] font-medium text-ink md:hidden">
        {label}
      </span>
      <TextField
        label={label}
        hideLabel
        inputMode="numeric"
        maxLength={3}
        value={value.amount}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          onChange({ ...value, amount: event.target.value.replace(/\D/g, '') });
        }}
      />
      <SelectField
        label={`${label} unit`}
        hideLabel
        value={value.unit}
        options={UNIT_OPTIONS}
        onChange={(event) => {
          onChange({ ...value, unit: event.target.value as SlaDurationUnit });
        }}
      />
      {error && (
        <p id={errorId} className="col-span-2 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

const REASSIGN_OPTIONS: { value: SlaEscalationInputReassign; label: string }[] = [
  { value: 'nobody', label: 'Keep the assignee' },
  { value: 'team_lead', label: "A lead of the ticket's team" },
  { value: 'team', label: 'Back to the team, unassigned' },
  { value: 'person', label: 'A chosen person' },
];

interface SlaPolicyDrawerProps {
  /** The policy to change; leave out to add one. */
  policy?: SlaPolicy | undefined;
  fields: FieldOption[];
  /** For "reassign to a chosen person". */
  members: Member[];
  onClose: () => void;
  onSaved: (policy: SlaPolicy, message: string) => void;
}

/** Add or edit an SLA policy: name, conditions (not the default) and targets per priority. */
export function SlaPolicyDrawer({
  policy,
  fields,
  members,
  onClose,
  onSaved,
}: SlaPolicyDrawerProps) {
  const isDefault = policy?.isDefault ?? false;
  const [name, setName] = useState(policy?.name ?? '');
  const [match, setMatch] = useState<'all' | 'any'>(policy?.conditions.match ?? 'all');
  const [conditions, setConditions] = useState<DraftCondition[]>(() =>
    policy ? draftConditions(policy.conditions, fields) : [NEW_CONDITION],
  );
  const [targets, setTargets] = useState<DraftTargets>(() =>
    draftTargets(policy?.targets ?? STARTING_TARGETS),
  );
  const [warn, setWarn] = useState(policy ? policy.escalation.warnMinutes !== null : true);
  const [warnMinutes, setWarnMinutes] = useState(String(policy?.escalation.warnMinutes ?? 10));
  const [reassign, setReassign] = useState<SlaEscalationInputReassign>(
    policy?.escalation.reassign ?? 'nobody',
  );
  const [reassignUserId, setReassignUserId] = useState(policy?.escalation.reassignUserId ?? '');
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const active = members.filter((member) => member.status === 'active');
  const create = usePostApiV1SlaPolicies();
  const update = usePatchApiV1SlaPoliciesPolicyId();
  // Event-only fields (what changed, the customer's reply, time) belong to rules.
  const usable = fields.filter((field) => !field.events);

  const clear = () => {
    setProblems({ fields: {} });
  };
  const setTarget = (priority: Priority, next: Partial<DraftTarget>) => {
    setTargets((current) => ({ ...current, [priority]: { ...current[priority], ...next } }));
    clear();
  };

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const found: Record<string, string> = checkTargets(targets);
    if (!name.trim()) found.name = 'Enter a name.';
    const minutes = Number(warnMinutes);
    if (warn && (!/^\d+$/.test(warnMinutes) || minutes < 1 || minutes > 1440)) {
      found['escalation.warnMinutes'] = 'Enter whole minutes from 1 to 1,440.';
    }
    if (reassign === 'person' && !reassignUserId) {
      found['escalation.reassignUserId'] = 'Choose an active member.';
    }
    if (!isDefault && conditions.length === 0) {
      found.conditions =
        'Add at least one condition: tickets no policy matches follow the default.';
    }
    if (Object.keys(found).length > 0) {
      setProblems({ fields: found });
      return;
    }
    const done = (saved: SlaPolicy) => {
      onSaved(saved, policy ? `${saved.name} saved.` : `${saved.name} added.`);
    };
    const fail = (failure: unknown) => {
      setProblems(problemsFrom(failure));
    };
    const data = {
      name: name.trim(),
      targets: targetsPayload(targets),
      escalation: {
        warnMinutes: warn ? minutes : null,
        reassign,
        reassignUserId: reassign === 'person' ? reassignUserId : null,
      },
      ...(isDefault ? {} : { conditions: conditionsPayload(match, conditions, fields) }),
    };
    if (policy) update.mutate({ policyId: policy.id, data }, { onSuccess: done, onError: fail });
    else {
      create.mutate(
        { data: { ...data, conditions: conditionsPayload(match, conditions, fields) } },
        { onSuccess: done, onError: fail },
      );
    }
  };

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={policy ? `Edit ${policy.name}` : 'New SLA policy'}
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
            {policy ? 'Save policy' : 'Add policy'}
          </Button>
        </div>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
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
          placeholder="Premium customers"
          value={name}
          error={problems.fields.name}
          onChange={(event) => {
            setName(event.target.value);
            clear();
          }}
        />

        {isDefault ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
            The default policy covers every ticket no other policy matches.
          </p>
        ) : (
          <ConditionsEditor
            headingId="sla-if"
            heading="Applies to tickets where"
            emptyText="No conditions yet."
            match={match}
            conditions={conditions}
            fields={fields}
            usable={usable}
            problems={problems.fields}
            onChange={(next) => {
              if (next.match) setMatch(next.match);
              if (next.conditions) setConditions(next.conditions);
              clear();
            }}
          />
        )}

        <section aria-labelledby="sla-targets" className="flex flex-col gap-3">
          <div>
            <h3 id="sla-targets" className="text-sm font-bold">
              Targets
            </h3>
            <p className="text-xs text-ink-muted">
              The first reply is one the customer sees, not a private note. The clocks pause while a
              ticket waits on the customer and stop when it is resolved. In business hours a day is
              a working day.
            </p>
          </div>
          {/* A table from 768px; narrower, each priority stacks as a card. */}
          <table
            aria-label="Targets by priority"
            className="w-full border-separate border-spacing-0 text-sm max-md:block md:table-fixed md:rounded-lg md:border md:border-border"
          >
            <thead className="max-md:sr-only">
              <tr className="text-left text-xs font-semibold text-ink-muted">
                <th scope="col" className="w-24 rounded-tl-lg bg-surface-sunken px-3 py-2">
                  Priority
                </th>
                <th scope="col" className="bg-surface-sunken px-2 py-2">
                  First reply within
                </th>
                <th scope="col" className="bg-surface-sunken px-2 py-2">
                  Resolve within
                </th>
                <th scope="col" className="rounded-tr-lg bg-surface-sunken px-2 py-2">
                  Hours that count
                </th>
              </tr>
            </thead>
            <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
              {PRIORITIES.map((priority) => {
                const label = PRIORITY_OPTIONS.find((option) => option.value === priority)?.label;
                const path = `targets.${priority}`;
                const cell = 'align-top md:border-t md:border-border md:px-2 md:py-2';
                return (
                  <tr
                    key={priority}
                    aria-label={label}
                    className="max-md:flex max-md:flex-col max-md:gap-3 max-md:rounded-lg max-md:border max-md:border-border max-md:p-3"
                  >
                    <th
                      scope="row"
                      className={cn(
                        cell,
                        'text-left font-semibold whitespace-nowrap md:px-3 md:pt-4',
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            'size-2 rounded-full',
                            toneDotClass(priorityTone(priority)),
                          )}
                        />
                        {label}
                      </span>
                    </th>
                    <td className={cell}>
                      <DurationInput
                        label="Reply within"
                        value={targets[priority].reply}
                        error={problems.fields[`${path}.reply.amount`]}
                        onChange={(reply) => {
                          setTarget(priority, { reply });
                        }}
                      />
                    </td>
                    <td className={cell}>
                      <DurationInput
                        label="Resolve within"
                        value={targets[priority].resolve}
                        error={problems.fields[`${path}.resolve.amount`]}
                        onChange={(resolve) => {
                          setTarget(priority, { resolve });
                        }}
                      />
                    </td>
                    <td className={cell}>
                      <span aria-hidden className="mb-1.5 block text-[13px] font-medium md:hidden">
                        Counting
                      </span>
                      <SelectField
                        label="Counting"
                        hideLabel
                        value={targets[priority].hours}
                        options={HOURS_OPTIONS}
                        onChange={(event) => {
                          setTarget(priority, {
                            hours: event.target.value as SlaPriorityTargetHours,
                          });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="sla-escalation" className="flex flex-col gap-3">
          <div>
            <h3 id="sla-escalation" className="text-sm font-bold">
              Warning and escalation
            </h3>
            <p className="text-xs text-ink-muted">
              The warning goes to the assignee, or the team&apos;s leads when nobody has the ticket.
              At a deadline the ticket is marked overdue and the team&apos;s leads are told (the
              admins when it has no team). Each happens once per ticket.
            </p>
          </div>
          <CheckboxField
            checked={warn}
            onChange={(event) => {
              setWarn(event.target.checked);
              clear();
            }}
          >
            Warn before a deadline
          </CheckboxField>
          {warn && (
            <div className="w-48">
              <TextField
                label="Minutes before"
                inputMode="numeric"
                maxLength={4}
                value={warnMinutes}
                error={problems.fields['escalation.warnMinutes']}
                onChange={(event) => {
                  setWarnMinutes(event.target.value.replace(/\D/g, ''));
                  clear();
                }}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="At a deadline, reassign to"
              value={reassign}
              options={REASSIGN_OPTIONS}
              onChange={(event) => {
                setReassign(event.target.value as SlaEscalationInputReassign);
                clear();
              }}
            />
            {reassign === 'person' && (
              <SelectField
                label="Person"
                value={reassignUserId}
                options={[
                  { value: '', label: 'Choose a person' },
                  ...active.map((member) => ({ value: member.userId, label: member.name })),
                ]}
                error={problems.fields['escalation.reassignUserId']}
                onChange={(event) => {
                  setReassignUserId(event.target.value);
                  clear();
                }}
              />
            )}
          </div>
        </section>
      </form>
    </Drawer>
  );
}
