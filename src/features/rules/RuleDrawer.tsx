import { CircleCheck, CircleX, Plus, Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type {
  CreateRuleRequestInput,
  Member,
  Rule,
  RuleActionType,
  RuleEvent,
  Team,
} from '../../api/generated/model';
import {
  usePatchApiV1RulesRuleId,
  usePostApiV1Rules,
  usePostApiV1RulesTest,
} from '../../api/generated/rules/rules';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { SelectField } from '../../components/SelectField';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { ConditionsEditor } from './ConditionsEditor';
import {
  conditionsPayload,
  draftConditions,
  NEW_CONDITION,
  type DraftCondition,
} from './conditions-draft';
import {
  ACTION_LABELS,
  actionChoices,
  EVENT_OPTIONS,
  fieldFits,
  MESSAGE_ACTIONS,
  splitList,
  type FieldOption,
} from './rule-fields';

interface DraftAction {
  type: RuleActionType;
  /** The chosen value, for actions with a fixed list. */
  value: string;
  /** Tags (comma separated) or the note. */
  text: string;
}

interface Draft {
  name: string;
  event: RuleEvent;
  match: 'all' | 'any';
  conditions: DraftCondition[];
  actions: DraftAction[];
  stopAfter: boolean;
}

const ACTION_TYPES = Object.keys(ACTION_LABELS) as RuleActionType[];

const asList = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

function draftOf(rule: Rule | undefined, fields: FieldOption[]): Draft {
  if (!rule) {
    return {
      name: '',
      event: 'ticket_created',
      match: 'all',
      conditions: [NEW_CONDITION],
      actions: [{ type: 'set_priority', value: 'high', text: '' }],
      stopAfter: false,
    };
  }
  return {
    name: rule.name,
    event: rule.event,
    match: rule.conditions.match,
    conditions: draftConditions(rule.conditions, fields),
    actions: rule.actions.map((action) => {
      const values = asList(action.value);
      const list = action.type === 'add_tags' || action.type === 'remove_tags';
      const message = MESSAGE_ACTIONS.includes(action.type);
      return {
        type: action.type,
        value: list || message ? '' : (values[0] ?? ''),
        text: list ? values.join(', ') : message ? (values[0] ?? '') : '',
      };
    }),
    stopAfter: rule.stopAfter,
  };
}

/** The rule as the API takes it. */
function payloadOf(draft: Draft, fields: FieldOption[]): CreateRuleRequestInput {
  return {
    name: draft.name.trim(),
    event: draft.event,
    conditions: conditionsPayload(draft.match, draft.conditions, fields),
    actions: draft.actions.map((action) =>
      action.type === 'add_tags' || action.type === 'remove_tags'
        ? { type: action.type, value: splitList(action.text) }
        : MESSAGE_ACTIONS.includes(action.type)
          ? { type: action.type, value: action.text }
          : { type: action.type, value: action.value },
    ),
    stopAfter: draft.stopAfter,
  };
}

interface RuleDrawerProps {
  /** The rule to change; leave out to add one. */
  rule?: Rule | undefined;
  fields: FieldOption[];
  teams: Team[];
  members: Member[];
  onClose: () => void;
  onSaved: (rule: Rule, message: string) => void;
}

/** Add or edit a rule: When / If / Then, and a test on a ticket. Mount it only while open. */
export function RuleDrawer({ rule, fields, teams, members, onClose, onSaved }: RuleDrawerProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(rule, fields));
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const [testNumber, setTestNumber] = useState('');
  const create = usePostApiV1Rules();
  const update = usePatchApiV1RulesRuleId();
  const test = usePostApiV1RulesTest();

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setProblems({ fields: {} });
    test.reset();
  };
  const setAction = (index: number, next: Partial<DraftAction>) => {
    change({
      actions: draft.actions.map((item, at) => (at === index ? { ...item, ...next } : item)),
    });
  };

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!draft.name.trim()) {
      setProblems({ fields: { name: 'Enter a name.' } });
      return;
    }
    const data = payloadOf(draft, fields);
    const done = (saved: Rule) => {
      onSaved(saved, rule ? `Rule ${saved.name} saved.` : `Rule ${saved.name} added.`);
    };
    const fail = (failure: unknown) => {
      setProblems(problemsFrom(failure));
    };
    if (rule) update.mutate({ ruleId: rule.id, data }, { onSuccess: done, onError: fail });
    else create.mutate({ data }, { onSuccess: done, onError: fail });
  };

  const runTest = () => {
    const number = Number(testNumber);
    if (!Number.isInteger(number) || number < 1) {
      setProblems({ fields: { ticketNumber: 'Enter a ticket number.' } });
      return;
    }
    test.mutate(
      { data: { ticketNumber: number, conditions: payloadOf(draft, fields).conditions } },
      {
        // Problems with a condition show at the condition; others under the test box.
        onError: (failure) => {
          const found = problemsFrom(failure);
          if (Object.keys(found.fields).length > 0) setProblems(found);
        },
      },
    );
  };

  const usable = fields.filter((field) => fieldFits(field, draft.event));

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={rule ? `Edit ${rule.name}` : 'New rule'}
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
            {rule ? 'Save rule' : 'Add rule'}
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
          placeholder="Billing to Accounts"
          value={draft.name}
          error={problems.fields.name}
          onChange={(event) => {
            change({ name: event.target.value });
          }}
        />

        {/* Written as sentences (Step 5b): When … / If … / Then …, one row per item. */}
        <section aria-labelledby="rule-when" className="flex flex-wrap items-start gap-2">
          <h3 id="rule-when" className="pt-1.5 text-sm font-bold">
            When
          </h3>
          <div className="min-w-56 flex-1">
            <SelectField
              hideLabel
              compact
              label="This happens"
              value={draft.event}
              options={EVENT_OPTIONS}
              hint={
                draft.event === 'ticket_created'
                  ? 'By an agent, by email or through the web form.'
                  : draft.event === 'ticket_updated'
                    ? "Changes made by rules don't count, so rules never start each other."
                    : draft.event === 'customer_replied'
                      ? 'A reply to a ticket email lands on the ticket.'
                      : 'Each rule runs once for a ticket while it stays in the same status. Closed tickets are left alone.'
              }
              onChange={(event) => {
                const next = event.target.value as RuleEvent;
                // Conditions on fields the new event doesn't have are dropped.
                change({
                  event: next,
                  conditions: draft.conditions.filter((condition) => {
                    const field = fields.find((option) => option.value === condition.field);
                    return !field || fieldFits(field, next);
                  }),
                });
              }}
            />
          </div>
        </section>

        <ConditionsEditor
          headingId="rule-if"
          heading="If"
          emptyText="No conditions: the rule runs every time."
          match={draft.match}
          conditions={draft.conditions}
          fields={fields}
          usable={usable}
          problems={problems.fields}
          onChange={change}
        />

        <section aria-labelledby="rule-then" className="flex flex-col gap-2.5">
          <h3 id="rule-then" className="text-sm font-bold">
            Then
          </h3>
          {problems.fields.actions && (
            <p className="text-xs text-danger-text">{problems.fields.actions}</p>
          )}
          <ol aria-label="Actions" className="flex flex-col gap-2">
            {draft.actions.map((action, index) => {
              const choices = actionChoices(action.type, { teams, members });
              const error = problems.fields[`actions.${String(index)}.value`];
              return (
                <li
                  key={index}
                  aria-label={`Action ${String(index + 1)}`}
                  className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-2.5"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="w-full sm:w-56">
                      <SelectField
                        hideLabel
                        compact
                        label="Do"
                        value={action.type}
                        options={ACTION_TYPES.map((type) => ({
                          value: type,
                          label: ACTION_LABELS[type],
                        }))}
                        onChange={(event) => {
                          const type = event.target.value as RuleActionType;
                          setAction(index, {
                            type,
                            value: actionChoices(type, { teams, members })?.[0]?.value ?? '',
                            text: '',
                          });
                        }}
                      />
                    </div>
                    {choices && (
                      <div className="min-w-40 flex-1">
                        <SelectField
                          hideLabel
                          compact
                          label="To"
                          value={action.value}
                          options={choices}
                          error={error}
                          hint={
                            action.type === 'assign_in_turn'
                              ? 'Active members take turns, in the order they joined the team.'
                              : undefined
                          }
                          onChange={(event) => {
                            setAction(index, { value: event.target.value });
                          }}
                        />
                      </div>
                    )}
                    {(action.type === 'add_tags' || action.type === 'remove_tags') && (
                      <div className="min-w-40 flex-1">
                        <TextField
                          hideLabel
                          compact
                          label="Tags"
                          placeholder="billing, refund"
                          hint="Separate them with commas"
                          value={action.text}
                          error={error}
                          onChange={(event) => {
                            setAction(index, { text: event.target.value });
                          }}
                        />
                      </div>
                    )}
                    <span className="ml-auto">
                      <IconButton
                        label="Remove action"
                        size="sm"
                        disabled={draft.actions.length === 1}
                        onClick={() => {
                          change({ actions: draft.actions.filter((_, at) => at !== index) });
                        }}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </IconButton>
                    </span>
                  </div>
                  {MESSAGE_ACTIONS.includes(action.type) && (
                    <TextAreaField
                      label={action.type === 'add_note' ? 'Note' : 'Message'}
                      hint={
                        action.type === 'email_requester'
                          ? 'Sent as a reply on the ticket, from the workspace address.'
                          : undefined
                      }
                      rows={3}
                      maxLength={2000}
                      value={action.text}
                      error={error}
                      onChange={(event) => {
                        setAction(index, { text: event.target.value });
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <Button
            variant="outline"
            size="sm"
            icon={<Plus aria-hidden />}
            className="self-start"
            disabled={draft.actions.length >= 10}
            onClick={() => {
              change({
                actions: [...draft.actions, { type: 'add_tags', value: '', text: '' }],
              });
            }}
          >
            Add action
          </Button>
          <CheckboxField
            checked={draft.stopAfter}
            onChange={(event) => {
              change({ stopAfter: event.target.checked });
            }}
          >
            Stop here: when this rule matches, the rules after it don&apos;t run
          </CheckboxField>
        </section>

        <section
          aria-labelledby="rule-test"
          className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-3"
        >
          <h3 id="rule-test" className="text-sm font-bold">
            Test on a ticket
          </h3>
          <p className="text-xs text-ink-muted">
            Checks the conditions against a ticket as it is now. Nothing changes.
          </p>
          <div className="flex items-end gap-2">
            <div className="w-40">
              <TextField
                label="Ticket number"
                inputMode="numeric"
                value={testNumber}
                error={problems.fields.ticketNumber}
                onChange={(event) => {
                  setTestNumber(event.target.value.replace(/\D/g, ''));
                  setProblems((current) => ({
                    ...current,
                    fields: Object.fromEntries(
                      Object.entries(current.fields).filter(([key]) => key !== 'ticketNumber'),
                    ),
                  }));
                  test.reset();
                }}
              />
            </div>
            <Button variant="outline" loading={test.isPending} onClick={runTest}>
              Test
            </Button>
          </div>
          {test.data && (
            <div role="status" className="flex flex-col gap-2">
              <Badge tone={test.data.matched ? 'success' : 'neutral'}>
                {test.data.matched ? 'Matches: the rule would run' : "Doesn't match"}
              </Badge>
              <ul aria-label="Conditions checked" className="flex flex-col gap-1 text-xs">
                {test.data.results.map((matched, index) => (
                  <li key={index} className="flex items-center gap-1.5">
                    {matched ? (
                      <CircleCheck aria-hidden className="size-3.5 text-success-text" />
                    ) : (
                      <CircleX aria-hidden className="size-3.5 text-ink-subtle" />
                    )}
                    Condition {index + 1} {matched ? 'matches' : "doesn't match"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {test.isError && !problems.fields.ticketNumber && (
            <p role="alert" className="text-xs text-danger-text">
              {problemsFrom(test.error).form ?? 'Check the highlighted fields.'}
            </p>
          )}
        </section>
      </form>
    </Drawer>
  );
}
