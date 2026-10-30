import { useId, useState } from 'react';
import { CheckboxField } from '../../components/CheckboxField';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import type { FieldShape } from './field-types';

interface CustomFieldInputProps {
  field: FieldShape;
  /** The stored value: text, number, date text, true/false, a choice id or a list of choice ids. */
  value: unknown;
  /** Called with the new value; null when cleared. */
  onChange: (value: unknown) => void;
  /** Ticket forms pass true while resolving, so "required when resolving" shows as required. */
  resolving?: boolean;
  error?: string | undefined;
  disabled?: boolean;
}

const textValue = (value: unknown) => (typeof value === 'string' ? value : '');

/** Typed number text: null when empty, a number when it reads as one, else the text (refused later). */
function readNumber(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : text;
}

/** A number box that keeps what is typed (for example "1.") while passing numbers up. */
function NumberInput({
  label,
  value,
  onChange,
  decimal,
  ...rest
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  decimal: boolean;
  required: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  disabled: boolean;
}) {
  const shown = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  const [draft, setDraft] = useState(shown);
  // The value was changed from outside (for example a reset): show it.
  if (readNumber(draft) !== (value ?? null)) setDraft(shown);
  return (
    <TextField
      label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(readNumber(event.target.value));
      }}
      {...rest}
    />
  );
}

/**
 * One custom field in a form, drawn for its type. Used by the field settings preview and by the
 * ticket, contact and company forms. Removed choices appear only when the record already has them.
 */
export function CustomFieldInput({
  field,
  value,
  onChange,
  resolving = false,
  error,
  disabled = false,
}: CustomFieldInputProps) {
  const id = useId();
  const required = field.required === 'always' || (field.required === 'on_resolve' && resolving);
  const hint = field.helpText ?? undefined;
  const offered = (selected: (id: string) => boolean) =>
    field.choices.filter((choice) => !choice.removed || selected(choice.id));

  switch (field.type) {
    case 'text':
    case 'date':
      return (
        <TextField
          label={field.label}
          type={field.type === 'date' ? 'date' : 'text'}
          maxLength={255}
          required={required}
          hint={hint}
          error={error}
          disabled={disabled}
          value={textValue(value)}
          onChange={(event) => {
            onChange(event.target.value === '' ? null : event.target.value);
          }}
        />
      );
    case 'integer':
    case 'decimal':
      return (
        <NumberInput
          label={field.label}
          decimal={field.type === 'decimal'}
          required={required}
          hint={hint}
          error={error}
          disabled={disabled}
          value={value}
          onChange={onChange}
        />
      );
    case 'paragraph':
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-[13px] font-medium text-ink">
            {field.label}
            {required && (
              <span aria-hidden className="ml-0.5 text-danger-text">
                *
              </span>
            )}
          </label>
          <textarea
            id={id}
            rows={4}
            maxLength={5000}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? `${id}-hint` : undefined}
            value={textValue(value)}
            onChange={(event) => {
              onChange(event.target.value === '' ? null : event.target.value);
            }}
            className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-brand-focus aria-invalid:border-danger-text"
          />
          {(error ?? hint) && (
            <p
              id={`${id}-hint`}
              className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
            >
              {error ?? hint}
            </p>
          )}
        </div>
      );
    case 'checkbox':
      return (
        <div className="flex flex-col gap-1">
          <CheckboxField
            checked={value === true}
            disabled={disabled}
            error={error}
            onChange={(event) => {
              onChange(event.target.checked);
            }}
          >
            {field.label}
          </CheckboxField>
          {hint && !error && <p className="pl-6.5 text-xs text-ink-subtle">{hint}</p>}
        </div>
      );
    case 'dropdown': {
      const options = offered((choiceId) => choiceId === value).map((choice) => ({
        value: choice.id,
        label: choice.removed ? `${choice.label} (removed)` : choice.label,
      }));
      return (
        <SelectField
          label={field.label}
          required={required}
          disabled={disabled}
          hint={hint}
          error={error}
          options={[{ value: '', label: 'Choose…' }, ...options]}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            onChange(event.target.value === '' ? null : event.target.value);
          }}
        />
      );
    }
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset
          className="flex flex-col gap-1.5"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-hint` : undefined}
        >
          <legend className="mb-1.5 text-[13px] font-medium text-ink">
            {field.label}
            {required && (
              <span aria-hidden className="ml-0.5 text-danger-text">
                *
              </span>
            )}
          </legend>
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-lg border border-border-strong px-3 py-2.5">
            {offered((choiceId) => selected.includes(choiceId)).map((choice) => (
              <CheckboxField
                key={choice.id}
                disabled={disabled}
                checked={selected.includes(choice.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, choice.id]
                    : selected.filter((chosen) => chosen !== choice.id);
                  onChange(next.length > 0 ? next : null);
                }}
              >
                {choice.removed ? `${choice.label} (removed)` : choice.label}
              </CheckboxField>
            ))}
          </div>
          {(error ?? hint) && (
            <p
              id={`${id}-hint`}
              className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
            >
              {error ?? hint}
            </p>
          )}
        </fieldset>
      );
    }
  }
}
