import { Plus, Trash2 } from 'lucide-react';
import type { RuleConditionOperator } from '../../api/generated/model';
import { Button, IconButton } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { NEW_CONDITION, type DraftCondition } from './conditions-draft';
import {
  LIST_OPERATORS,
  OPERATOR_LABELS,
  OPERATORS,
  SINGLE_OPERATORS,
  type FieldOption,
} from './rule-fields';

/** Ticks for a field's fixed choices ("is any of" Billing, Technical...). */
function Choices({
  legend,
  choices,
  chosen,
  error,
  onChange,
}: {
  legend: string;
  choices: { value: string; label: string }[];
  chosen: string[];
  error?: string | undefined;
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {choices.map((choice) => (
          <CheckboxField
            key={choice.value}
            checked={chosen.includes(choice.value)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...chosen, choice.value]
                  : chosen.filter((value) => value !== choice.value),
              );
            }}
          >
            {choice.label}
          </CheckboxField>
        ))}
        {choices.length === 0 && <span className="text-xs text-ink-muted">Nothing to choose.</span>}
      </div>
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </fieldset>
  );
}

interface ConditionsEditorProps {
  /** The heading's id and text ("If"). */
  headingId: string;
  heading: string;
  /** What no conditions means here. */
  emptyText: string;
  match: 'all' | 'any';
  conditions: DraftCondition[];
  /** Every field, for reading saved conditions. */
  fields: FieldOption[];
  /** The fields offered in the Field list. */
  usable: FieldOption[];
  /** Problems by path ("conditions", "conditions.items.0.value"). */
  problems: Record<string, string | undefined>;
  onChange: (next: { match?: 'all' | 'any'; conditions?: DraftCondition[] }) => void;
}

/** The condition builder of rules (F17), also used by SLA policies (F23). */
export function ConditionsEditor({
  headingId,
  heading,
  emptyText,
  match,
  conditions,
  fields,
  usable,
  problems,
  onChange,
}: ConditionsEditorProps) {
  const setCondition = (index: number, next: Partial<DraftCondition>) => {
    onChange({
      conditions: conditions.map((item, at) => (at === index ? { ...item, ...next } : item)),
    });
  };
  const groups = [...new Set(usable.map((field) => field.group))];
  const fieldSelectOptions = groups.flatMap((group) =>
    usable
      .filter((field) => field.group === group)
      .map((field) => ({ value: field.value, label: `${group}: ${field.label}` })),
  );

  return (
    // Written as a sentence (Step 5b): "If [all conditions] …", one row per condition.
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-sm font-bold">
          {heading}
        </h3>
        <div className="w-44">
          <SelectField
            hideLabel
            compact
            label="Match"
            value={match}
            options={[
              { value: 'all', label: 'All conditions' },
              { value: 'any', label: 'Any condition' },
            ]}
            onChange={(event) => {
              onChange({ match: event.target.value as 'all' | 'any' });
            }}
          />
        </div>
      </div>
      {conditions.length === 0 && <p className="text-sm text-ink-muted">{emptyText}</p>}
      {problems.conditions && <p className="text-xs text-danger-text">{problems.conditions}</p>}
      <ol aria-label="Conditions" className="flex flex-col gap-2">
        {conditions.map((condition, index) => {
          const field = fields.find((option) => option.value === condition.field);
          const operators = field ? OPERATORS[field.kind] : [];
          const path = `conditions.items.${String(index)}`;
          const list = LIST_OPERATORS.includes(condition.operator);
          const single = SINGLE_OPERATORS.includes(condition.operator);
          return (
            <li
              key={index}
              aria-label={`Condition ${String(index + 1)}`}
              className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-2.5"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="w-full sm:w-52">
                  <SelectField
                    hideLabel
                    compact
                    label="Field"
                    value={condition.field}
                    options={fieldSelectOptions}
                    error={problems[`${path}.field`]}
                    onChange={(event) => {
                      const next = fields.find((option) => option.value === event.target.value);
                      setCondition(index, {
                        field: event.target.value,
                        operator: next ? (OPERATORS[next.kind][0] ?? 'is_empty') : 'is_empty',
                        values: [],
                        text: '',
                      });
                    }}
                  />
                </div>
                <div className="w-full sm:w-40">
                  <SelectField
                    hideLabel
                    compact
                    label="Comparison"
                    value={condition.operator}
                    options={operators.map((operator) => ({
                      value: operator,
                      label: OPERATOR_LABELS[operator],
                    }))}
                    error={problems[`${path}.operator`]}
                    onChange={(event) => {
                      setCondition(index, {
                        operator: event.target.value as RuleConditionOperator,
                      });
                    }}
                  />
                </div>
                {(single || (list && !field?.choices)) && (
                  <div className="min-w-40 flex-1">
                    <TextField
                      hideLabel
                      compact
                      label={field?.kind === 'hours' ? 'Hours' : list ? 'Values' : 'Value'}
                      inputMode={field?.kind === 'hours' ? 'numeric' : undefined}
                      placeholder={
                        field?.kind === 'hours' ? 'Hours' : list ? 'billing, invoice' : 'Value'
                      }
                      hint={
                        field?.kind === 'hours'
                          ? '24 = a day, 72 = 3 days, 168 = a week'
                          : list
                            ? 'Separate them with commas, for example billing, invoice'
                            : undefined
                      }
                      value={condition.text}
                      maxLength={2000}
                      error={problems[`${path}.value`]}
                      onChange={(event) => {
                        setCondition(index, { text: event.target.value });
                      }}
                    />
                  </div>
                )}
                <IconButton
                  label="Remove condition"
                  size="sm"
                  onClick={() => {
                    onChange({ conditions: conditions.filter((_, at) => at !== index) });
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
              {list && field?.choices && (
                <Choices
                  legend="Values"
                  choices={field.choices}
                  chosen={condition.values}
                  error={problems[`${path}.value`]}
                  onChange={(values) => {
                    setCondition(index, { values });
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
        disabled={conditions.length >= 20}
        onClick={() => {
          onChange({ conditions: [...conditions, NEW_CONDITION] });
        }}
      >
        Add condition
      </Button>
    </section>
  );
}
