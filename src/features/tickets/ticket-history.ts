import type { CustomField, TicketActivity } from '../../api/generated/model';
import { formatCustomValue, hasValue } from '../custom-fields/custom-values';
import { priorityLabel, statusLabel, typeLabel } from './ticket-labels';

const FIELD_NAMES = new Map([
  ['subject', 'the subject'],
  ['status', 'the status'],
  ['priority', 'the priority'],
  ['type', 'the type'],
  ['team', 'the team'],
  ['assignee', 'the assignee'],
  ['contact', 'the requester'],
]);

const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

/** One change as a short phrase, for example "the status from Open to Pending". */
function describeChange(change: TicketActivity['changes'][number], fields: CustomField[]): string {
  if (change.field === 'tags') {
    const parts = [];
    if (list(change.to).length > 0) parts.push(`added tags ${list(change.to).join(', ')}`);
    if (list(change.from).length > 0) parts.push(`removed tags ${list(change.from).join(', ')}`);
    return parts.join(' and ');
  }
  let show = (value: unknown) => (hasValue(value) ? String(value) : 'none');
  let name = FIELD_NAMES.get(change.field) ?? change.field;
  if (change.field === 'status') show = statusLabel;
  if (change.field === 'priority') show = priorityLabel;
  if (change.field === 'type') show = typeLabel;
  if (change.field === 'team') show = (value) => (hasValue(value) ? String(value) : 'no team');
  if (change.field === 'assignee') show = (value) => (hasValue(value) ? String(value) : 'nobody');
  if (change.field.startsWith('customFields.')) {
    const field = fields.find((item) => `customFields.${item.key}` === change.field);
    name = change.label ?? field?.label ?? change.field;
    show = (value) => {
      if (!hasValue(value)) return 'empty';
      return field ? formatCustomValue(field, value) : JSON.stringify(value);
    };
  }
  return `${name} from ${show(change.from)} to ${show(change.to)}`;
}

/** One history entry as the words after the person's name, for example "changed the status from Open to Pending". */
export function activitySentence(entry: TicketActivity, fields: CustomField[]): string {
  switch (entry.action) {
    case 'created':
      return 'created the ticket';
    case 'deleted':
      return 'moved the ticket to the trash';
    case 'restored':
      return 'restored the ticket from the trash';
    case 'updated': {
      const parts = entry.changes.map((change) => {
        // An SLA deadline that passed (F24): "marked the first reply overdue".
        if (change.field === 'sla') {
          return change.to === 'reply_overdue'
            ? 'marked the first reply overdue'
            : 'marked the resolve time overdue';
        }
        // Merge and split (F28).
        const ref = (value: unknown) => `#${String(value)}`;
        if (change.field === 'merged') {
          const merged = Array.isArray(change.to) ? change.to.map(ref) : [];
          return `merged ${merged.length > 1 ? `${merged.slice(0, -1).join(', ')} and ${merged.at(-1) ?? ''}` : (merged[0] ?? 'tickets')} into this ticket`;
        }
        if (change.field === 'merged_into') return `merged this ticket into ${ref(change.to)}`;
        if (change.field === 'split_from') return `split this ticket from ${ref(change.to)}`;
        if (change.field === 'split_into') return `split a message into ${ref(change.to)}`;
        const text = describeChange(change, fields);
        return change.field === 'tags' ? text : `changed ${text}`;
      });
      return parts.join('; ');
    }
  }
}
