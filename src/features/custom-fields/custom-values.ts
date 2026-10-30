import type { CustomField, CustomFieldRecordType } from '../../api/generated/model';
import { useGetApiV1CustomFields } from '../../api/generated/custom-fields/custom-fields';

export type CustomValues = Record<string, unknown>;

/** A record type's field definitions (every member can read them). */
export function useCustomFields(recordType: CustomFieldRecordType) {
  const query = useGetApiV1CustomFields({ recordType });
  return { fields: query.data?.fields ?? [], loading: query.isPending };
}

export const hasValue = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  !(Array.isArray(value) && value.length === 0);

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A stored value as text: choice labels, "Yes"/"No", dates like "25 Oct 2026". */
export function formatCustomValue(field: CustomField, value: unknown): string {
  const choice = (id: unknown) => {
    const found = field.choices.find((item) => item.id === id);
    if (!found) return 'Unknown choice';
    return found.removed ? `${found.label} (removed)` : found.label;
  };
  switch (field.type) {
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'dropdown':
      return choice(value);
    case 'multi_select':
      return Array.isArray(value) ? value.map(choice).join(', ') : '';
    case 'date':
      return typeof value === 'string' ? DATE.format(new Date(`${value}T00:00:00Z`)) : '';
    case 'integer':
    case 'decimal':
      return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);
    default:
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

/** Starting values for a new record: each active field's default. */
export function defaultValues(fields: CustomField[]): CustomValues {
  const values: [string, unknown][] = [];
  for (const field of fields) {
    if (field.archived) continue;
    if (field.type === 'checkbox' && field.checkboxDefault !== null) {
      values.push([field.key, field.checkboxDefault]);
    }
    const defaults = field.choices.filter((choice) => choice.isDefault && !choice.removed);
    if (field.type === 'dropdown' && defaults[0]) values.push([field.key, defaults[0].id]);
    if (field.type === 'multi_select' && defaults.length > 0) {
      values.push([field.key, defaults.map((choice) => choice.id)]);
    }
  }
  return Object.fromEntries(values);
}

/** Only the values that differ from `before` (null for cleared ones), for a PATCH. */
export function changedValues(before: CustomValues, after: CustomValues): CustomValues {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: [string, unknown][] = [];
  for (const key of keys) {
    const was = before[key] ?? null;
    const now = after[key] ?? null;
    if (JSON.stringify(was) !== JSON.stringify(now)) changes.push([key, now]);
  }
  return Object.fromEntries(changes);
}
