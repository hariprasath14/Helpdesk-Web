import type { CustomField } from '../../api/generated/model';
import { CustomFieldInput } from './CustomFieldInput';
import { formatCustomValue, hasValue, type CustomValues } from './custom-values';

/** Fields shown on a record: active ones, and archived ones that still hold a value. */
const shownFields = (fields: CustomField[], values: CustomValues) =>
  fields.filter((field) => !field.archived || hasValue(values[field.key]));

/** The record's custom fields as label and value pairs (empty ones show "—"). */
export function CustomFieldsList({
  fields,
  values,
}: {
  fields: CustomField[];
  values: CustomValues;
}) {
  const shown = shownFields(fields, values);
  if (shown.length === 0) return null;
  return (
    // The same columns as the details above it (Detail in ContactPage), so the values line up.
    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
      {shown.map((field) => (
        <div key={field.id} className="contents">
          <dt className="text-xs text-ink-muted sm:pt-0.5">
            {field.label}
            {field.archived && <span className="ml-1 text-ink-subtle">(archived)</span>}
          </dt>
          <dd className="-mt-2 min-w-0 text-sm wrap-anywhere whitespace-pre-line text-ink sm:mt-0">
            {hasValue(values[field.key]) ? formatCustomValue(field, values[field.key]) : '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Inputs for a record's custom fields, in order. Archived fields that hold a value are shown but
 * can't be changed. `errors` are keyed by field key.
 */
export function CustomFieldsEditor({
  fields,
  values,
  errors,
  onChange,
  resolving = false,
}: {
  fields: CustomField[];
  values: CustomValues;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  /** Ticket forms: the status is resolved or closed, so "required when resolving" applies. */
  resolving?: boolean;
}) {
  return (
    <>
      {shownFields(fields, values).map((field) => (
        <CustomFieldInput
          key={field.id}
          field={
            field.archived
              ? { ...field, label: `${field.label} (archived)`, required: 'never' }
              : field
          }
          value={values[field.key] ?? null}
          error={errors[field.key]}
          resolving={resolving}
          disabled={field.archived}
          onChange={(value) => {
            onChange(field.key, value);
          }}
        />
      ))}
    </>
  );
}
