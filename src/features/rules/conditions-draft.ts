import type {
  RuleConditionOperator,
  RuleConditions,
  RuleConditionsInput,
} from '../../api/generated/model';
import { LIST_OPERATORS, SINGLE_OPERATORS, splitList, type FieldOption } from './rule-fields';

/** Conditions as the condition builder holds them (rules F17, SLA policies F23). */

export interface DraftCondition {
  field: string;
  operator: RuleConditionOperator;
  /** Ticked choices, for fields with a fixed list. */
  values: string[];
  /** Typed text: one value, or a comma separated list. */
  text: string;
}

export const NEW_CONDITION: DraftCondition = {
  field: 'subject_or_description',
  operator: 'contains_any',
  values: [],
  text: '',
};

const asList = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

/** Saved conditions as the editor holds them. */
export function draftConditions(conditions: RuleConditions, fields: FieldOption[]) {
  return conditions.items.map((item): DraftCondition => {
    const hasChoices = Boolean(fields.find((field) => field.value === item.field)?.choices);
    const values = asList(item.value);
    return {
      field: item.field,
      operator: item.operator,
      values: hasChoices ? values : [],
      text: hasChoices ? '' : values.join(', '),
    };
  });
}

/** The conditions as the API takes them. */
export function conditionsPayload(
  match: 'all' | 'any',
  conditions: DraftCondition[],
  fields: FieldOption[],
): RuleConditionsInput {
  return {
    match,
    items: conditions.map((condition) => {
      const field = fields.find((option) => option.value === condition.field);
      if (LIST_OPERATORS.includes(condition.operator)) {
        return {
          field: condition.field,
          operator: condition.operator,
          value: field?.choices ? condition.values : splitList(condition.text),
        };
      }
      if (SINGLE_OPERATORS.includes(condition.operator)) {
        return { field: condition.field, operator: condition.operator, value: condition.text };
      }
      return { field: condition.field, operator: condition.operator };
    }),
  };
}
