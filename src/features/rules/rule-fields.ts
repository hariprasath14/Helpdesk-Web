import type {
  CustomField,
  Member,
  RuleActionType,
  RuleConditionOperator,
  RuleEvent,
  Team,
} from '../../api/generated/model';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from '../tickets/ticket-labels';

/** How a field is compared (the same kinds as the API's rules/conditions.ts). */
export type FieldKind = 'text' | 'choice' | 'list' | 'checkbox' | 'value' | 'hours';

export interface Option {
  value: string;
  label: string;
}

/** A field a condition can look at, with its fixed choices when it has them. */
export interface FieldOption extends Option {
  group: string;
  kind: FieldKind;
  choices?: Option[];
  /** Only rules for these events can use it (F19); every rule otherwise. */
  events?: RuleEvent[];
}

/** What starts a rule, as the editor offers it (schedules come with F20). */
export const EVENT_OPTIONS: { value: RuleEvent; label: string }[] = [
  { value: 'ticket_created', label: 'A ticket is created' },
  { value: 'ticket_updated', label: 'Someone on the team changes a ticket' },
  { value: 'customer_replied', label: 'The customer replies by email' },
  { value: 'time', label: 'On a schedule (checked every 15 minutes)' },
];

/** How a rule's event reads at the start of its summary. */
export const EVENT_SUMMARY: Record<RuleEvent, string> = {
  ticket_created: 'When a ticket is created',
  ticket_updated: 'When a ticket is changed',
  customer_replied: 'When the customer replies',
  time: 'On a schedule',
};

const CHANGED_OPTIONS: Option[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
  { value: 'team', label: 'Team' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'requester', label: 'Requester' },
  { value: 'subject', label: 'Subject' },
  { value: 'tags', label: 'Tags' },
  { value: 'custom_fields', label: 'Any custom field' },
];

/** Whether a rule for `event` can use the field. */
export const fieldFits = (field: FieldOption, event: RuleEvent) =>
  !field.events || field.events.includes(event);

export const OPERATORS: Record<FieldKind, RuleConditionOperator[]> = {
  text: ['contains_any', 'contains_none', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  choice: ['is_any', 'is_none'],
  list: ['contains_any', 'contains_none', 'is_empty', 'is_not_empty'],
  checkbox: ['is_checked', 'is_unchecked'],
  value: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  hours: ['at_least', 'less_than'],
};

export const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  contains_any: 'contains any of',
  contains_none: 'contains none of',
  is: 'is',
  is_not: 'is not',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  is_any: 'is any of',
  is_none: 'is none of',
  is_checked: 'is checked',
  is_unchecked: 'is not checked',
  at_least: 'is at least',
  less_than: 'is less than',
};

/** Operators that take a list of values; is and is_not take one; the rest none. */
export const LIST_OPERATORS: RuleConditionOperator[] = [
  'contains_any',
  'contains_none',
  'is_any',
  'is_none',
];
export const SINGLE_OPERATORS: RuleConditionOperator[] = ['is', 'is_not', 'at_least', 'less_than'];

/** "Not set" in a choice list. */
export const NONE = 'none';

const SOURCE_OPTIONS: Option[] = [
  { value: 'agent', label: 'Logged by an agent' },
  { value: 'email', label: 'Email' },
  { value: 'web_form', label: 'Web form' },
];

const customKind = (type: CustomField['type']): FieldKind =>
  type === 'text' || type === 'paragraph'
    ? 'text'
    : type === 'dropdown'
      ? 'choice'
      : type === 'multi_select'
        ? 'list'
        : type === 'checkbox'
          ? 'checkbox'
          : 'value';

/** Every field a condition can use, built from the workspace's teams, people and fields. */
export function fieldOptions(input: {
  teams: Team[];
  members: Member[];
  customFields: { record: 'ticket' | 'contact' | 'company'; fields: CustomField[] }[];
}): FieldOption[] {
  const ticket = 'Ticket';
  const people = input.members.map((member) => ({ value: member.userId, label: member.name }));
  const builtIn: FieldOption[] = [
    { value: 'subject', label: 'Subject', group: ticket, kind: 'text' },
    { value: 'description', label: 'Description', group: ticket, kind: 'text' },
    {
      value: 'subject_or_description',
      label: 'Subject or description',
      group: ticket,
      kind: 'text',
    },
    { value: 'status', label: 'Status', group: ticket, kind: 'choice', choices: STATUS_OPTIONS },
    {
      value: 'priority',
      label: 'Priority',
      group: ticket,
      kind: 'choice',
      choices: PRIORITY_OPTIONS,
    },
    {
      value: 'type',
      label: 'Type',
      group: ticket,
      kind: 'choice',
      choices: [...TYPE_OPTIONS, { value: NONE, label: 'No type' }],
    },
    {
      value: 'source',
      label: 'Came in by',
      group: ticket,
      kind: 'choice',
      choices: SOURCE_OPTIONS,
    },
    {
      value: 'team',
      label: 'Team',
      group: ticket,
      kind: 'choice',
      choices: [
        ...input.teams.map((team) => ({ value: team.id, label: team.name })),
        { value: NONE, label: 'No team' },
      ],
    },
    {
      value: 'assignee',
      label: 'Assignee',
      group: ticket,
      kind: 'choice',
      choices: [...people, { value: NONE, label: 'Nobody' }],
    },
    { value: 'tags', label: 'Tags', group: ticket, kind: 'list' },
    { value: 'requester_email', label: "Requester's email", group: 'Requester', kind: 'text' },
    {
      value: 'changed',
      label: 'What changed',
      group: 'The change',
      kind: 'list',
      choices: CHANGED_OPTIONS,
      events: ['ticket_updated'],
    },
    {
      value: 'previous_status',
      label: 'Status before',
      group: 'The change',
      kind: 'choice',
      choices: STATUS_OPTIONS,
      events: ['ticket_updated', 'customer_replied'],
    },
    {
      value: 'message',
      label: "The customer's reply",
      group: 'The reply',
      kind: 'text',
      events: ['customer_replied'],
    },
    {
      value: 'hours_in_status',
      label: 'Hours in this status',
      group: 'Time',
      kind: 'hours',
      events: ['time'],
    },
    {
      value: 'hours_since_created',
      label: 'Hours since it was created',
      group: 'Time',
      kind: 'hours',
      events: ['time'],
    },
    {
      value: 'hours_since_updated',
      label: 'Hours since the last change',
      group: 'Time',
      kind: 'hours',
      events: ['time'],
    },
  ];
  const groups = { ticket: 'Ticket', contact: 'Requester', company: "Requester's company" };
  const custom = input.customFields.flatMap(({ record, fields }) =>
    fields
      .filter((field) => !field.archived)
      .map((field) => {
        const kind = customKind(field.type);
        return {
          value: `${record}.${field.key}`,
          label: field.label,
          group: groups[record],
          kind,
          ...(kind === 'choice' || kind === 'list'
            ? {
                choices: field.choices
                  .filter((choice) => !choice.removed)
                  .map((choice) => ({ value: choice.id, label: choice.label })),
              }
            : {}),
        };
      }),
  );
  return [...builtIn, ...custom];
}

export const ACTION_LABELS: Record<RuleActionType, string> = {
  set_priority: 'Set priority',
  set_status: 'Set status',
  set_type: 'Set type',
  set_team: 'Set team',
  set_assignee: 'Assign to',
  assign_in_turn: 'Assign in turn within team',
  add_tags: 'Add tags',
  remove_tags: 'Remove tags',
  add_note: 'Add a private note',
  email_requester: 'Email the requester',
  email_assignee: 'Email the assignee',
  email_team: "Email the team's leads",
};

/** Actions whose value is a message the person writes. */
export const MESSAGE_ACTIONS: RuleActionType[] = [
  'add_note',
  'email_requester',
  'email_assignee',
  'email_team',
];

/** The fixed values an action chooses from (none for tags and notes). */
export function actionChoices(
  type: RuleActionType,
  input: { teams: Team[]; members: Member[] },
): Option[] | null {
  switch (type) {
    case 'set_priority':
      return PRIORITY_OPTIONS;
    case 'set_status':
      return STATUS_OPTIONS;
    case 'set_type':
      return [...TYPE_OPTIONS, { value: NONE, label: 'No type' }];
    case 'set_team':
      return [
        ...input.teams.map((team) => ({ value: team.id, label: team.name })),
        { value: NONE, label: 'No team' },
      ];
    case 'assign_in_turn':
      return input.teams.map((team) => ({ value: team.id, label: team.name }));
    case 'set_assignee':
      return [
        ...input.members
          .filter((member) => member.status === 'active')
          .map((member) => ({ value: member.userId, label: member.name })),
        { value: NONE, label: 'Nobody' },
      ];
    default:
      return null;
  }
}

/** A list typed as "a, b, c". */
export const splitList = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
