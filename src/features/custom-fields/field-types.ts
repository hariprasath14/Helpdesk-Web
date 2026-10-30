import type {
  CustomField,
  CustomFieldRecordType,
  CustomFieldRequired,
  CustomFieldType,
} from '../../api/generated/model';

interface RecordTab {
  value: CustomFieldRecordType;
  label: string;
  singular: string;
}

const TICKETS: RecordTab = { value: 'ticket', label: 'Tickets', singular: 'ticket' };

export const RECORD_TABS: RecordTab[] = [
  TICKETS,
  { value: 'contact', label: 'Contacts', singular: 'contact' },
  { value: 'company', label: 'Companies', singular: 'company' },
];

/** The tab for a record type (tickets when unknown, for example a bad address). */
export const recordTab = (type: string | null): RecordTab =>
  RECORD_TABS.find((tab) => tab.value === type) ?? TICKETS;

export const TYPE_OPTIONS: { value: CustomFieldType; label: string; description: string }[] = [
  { value: 'text', label: 'Text', description: 'One line, up to 255 characters.' },
  { value: 'paragraph', label: 'Paragraph', description: 'Several lines, up to 5,000 characters.' },
  { value: 'integer', label: 'Whole number', description: 'For example 25.' },
  { value: 'decimal', label: 'Decimal number', description: 'For example 1999.50.' },
  { value: 'date', label: 'Date', description: 'A calendar date.' },
  { value: 'dropdown', label: 'Dropdown', description: 'Pick one from a list.' },
  { value: 'multi_select', label: 'Multi-select', description: 'Pick any from a list.' },
  { value: 'checkbox', label: 'Checkbox', description: 'Yes or no.' },
];

export const TYPE_NAMES = Object.fromEntries(
  TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<CustomFieldType, string>;

export const REQUIRED_NAMES: Record<CustomFieldRequired, string> = {
  never: 'Optional',
  always: 'Required',
  on_resolve: 'Required when resolving',
};

export const MAX_ACTIVE_FIELDS = 50;

export const hasChoices = (type: CustomFieldType) => type === 'dropdown' || type === 'multi_select';

/** What a form needs to show one field: the definition without its admin-only details. */
export type FieldShape = Pick<CustomField, 'label' | 'helpText' | 'type' | 'required' | 'choices'>;
