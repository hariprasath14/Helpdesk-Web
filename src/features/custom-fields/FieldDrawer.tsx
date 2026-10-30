import { ArrowDown, ArrowUp, Plus, Trash2, Undo2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type {
  CustomField,
  CustomFieldList,
  CustomFieldRecordType,
  CustomFieldRequired,
  CustomFieldType,
  UpdateCustomFieldRequestInput,
} from '../../api/generated/model';
import {
  usePatchApiV1CustomFieldsFieldId,
  usePostApiV1CustomFields,
} from '../../api/generated/custom-fields/custom-fields';
import { ApiError } from '../../api/http';
import { Button, IconButton } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { formError } from '../auth/api-errors';
import { CustomFieldInput } from './CustomFieldInput';
import { hasChoices, recordTab, REQUIRED_NAMES, TYPE_OPTIONS } from './field-types';

interface ChoiceDraft {
  /** React key: the choice id, or a temporary one for new choices. */
  key: string;
  id?: string;
  label: string;
  isDefault: boolean;
}

interface Draft {
  label: string;
  helpText: string;
  type: CustomFieldType;
  required: CustomFieldRequired;
  checkboxDefault: boolean;
  choices: ChoiceDraft[];
  removed: ChoiceDraft[];
}

interface Problems {
  label?: string;
  helpText?: string;
  required?: string;
  choices?: string;
  choice: Record<number, string>;
  form?: string;
}

let nextKey = 0;
const newChoice = (): ChoiceDraft => {
  nextKey += 1;
  return { key: `new-${String(nextKey)}`, label: '', isDefault: false };
};

function draftFrom(field: CustomField | undefined): Draft {
  if (!field) {
    return {
      label: '',
      helpText: '',
      type: 'text',
      required: 'never',
      checkboxDefault: false,
      choices: [newChoice()],
      removed: [],
    };
  }
  const toDraft = (choice: CustomField['choices'][number]) => ({
    key: choice.id,
    id: choice.id,
    label: choice.label,
    isDefault: choice.isDefault,
  });
  return {
    label: field.label,
    helpText: field.helpText ?? '',
    type: field.type,
    required: field.required,
    checkboxDefault: field.checkboxDefault ?? false,
    choices: field.choices.filter((choice) => !choice.removed).map(toDraft),
    removed: field.choices.filter((choice) => choice.removed).map(toDraft),
  };
}

/** Trimmed text, or null when blank. */
const blankToNull = (text: string) => (text.trim() === '' ? null : text.trim());

const choicesBody = (choices: ChoiceDraft[]) =>
  choices.map((choice) => ({
    ...(choice.id ? { id: choice.id } : {}),
    label: choice.label.trim(),
    isDefault: choice.isDefault,
  }));

/** Field and choice messages from a refused save. */
function problemsFrom(failure: unknown): Problems {
  const problems: Problems = { choice: {} };
  const fields =
    failure instanceof ApiError
      ? ((failure.details as { fields?: { field: string; message: string }[] } | undefined)
          ?.fields ?? [])
      : [];
  for (const { field, message } of fields) {
    const choice = /^choices\.(\d+)/.exec(field);
    if (choice) problems.choice[Number(choice[1])] = message;
    else if (field === 'label' || field === 'helpText' || field === 'required') {
      problems[field] = message;
    } else if (field === 'choices') problems.choices = message;
  }
  if (fields.length === 0) problems.form = formError(failure);
  return problems;
}

/** The changes to send when editing: only what differs, so the audit log names real changes. */
function changesFrom(field: CustomField, draft: Draft): UpdateCustomFieldRequestInput {
  const before = draftFrom(field);
  const changes: UpdateCustomFieldRequestInput = {};
  if (draft.label.trim() !== before.label) changes.label = draft.label.trim();
  if (draft.helpText.trim() !== before.helpText) changes.helpText = blankToNull(draft.helpText);
  if (draft.required !== before.required) changes.required = draft.required;
  if (field.type === 'checkbox' && draft.checkboxDefault !== (field.checkboxDefault ?? false)) {
    changes.checkboxDefault = draft.checkboxDefault;
  }
  if (
    hasChoices(field.type) &&
    JSON.stringify(choicesBody(draft.choices)) !== JSON.stringify(choicesBody(before.choices))
  ) {
    changes.choices = choicesBody(draft.choices);
  }
  return changes;
}

function ChoicesEditor({
  draft,
  problems,
  onChange,
}: {
  draft: Draft;
  problems: Problems;
  onChange: (choices: ChoiceDraft[], removed?: ChoiceDraft[]) => void;
}) {
  const [focusKey, setFocusKey] = useState<string>();
  const { choices, removed } = draft;
  const single = draft.type === 'dropdown';

  const set = (index: number, change: Partial<ChoiceDraft>) => {
    onChange(
      choices.map((choice, at) => {
        if (at === index) return { ...choice, ...change };
        // A dropdown has one default at most.
        if (single && change.isDefault) return { ...choice, isDefault: false };
        return choice;
      }),
    );
  };
  const move = (index: number, by: number) => {
    const next = [...choices];
    const [choice] = next.splice(index, 1);
    if (choice) next.splice(index + by, 0, choice);
    onChange(next);
  };
  const add = (after = choices.length - 1) => {
    const choice = newChoice();
    const next = [...choices];
    next.splice(after + 1, 0, choice);
    setFocusKey(choice.key);
    onChange(next);
  };
  const remove = (index: number) => {
    const choice = choices[index];
    const next = choices.filter((_, at) => at !== index);
    onChange(
      next.length > 0 || !choice?.id ? next : [newChoice()],
      choice?.id ? [...removed, { ...choice, isDefault: false }] : removed,
    );
  };
  const bringBack = (choice: ChoiceDraft) => {
    onChange(
      [...choices.filter((item) => item.id !== undefined || item.label.trim() !== ''), choice],
      removed.filter((item) => item.key !== choice.key),
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">
        Choices
        <span aria-hidden className="ml-0.5 text-danger-text">
          *
        </span>
      </legend>
      <ol aria-label="Choices" className="flex flex-col gap-2">
        {choices.map((choice, index) => (
          <li key={choice.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1 [&_label]:sr-only">
                <TextField
                  label={`Choice ${String(index + 1)}`}
                  value={choice.label}
                  maxLength={100}
                  placeholder={index === 0 ? 'For example: Basic' : undefined}
                  error={problems.choice[index]}
                  ref={(node) => {
                    if (node && choice.key === focusKey) {
                      node.focus();
                      setFocusKey(undefined);
                    }
                  }}
                  onChange={(event) => {
                    set(index, { label: event.target.value });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      add(index);
                    }
                  }}
                />
              </div>
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-ink-muted">
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name="default-choice"
                  className="size-4 accent-brand-600"
                  checked={choice.isDefault}
                  onChange={(event) => {
                    set(index, { isDefault: event.target.checked });
                  }}
                  onClick={() => {
                    // A second click on the default radio clears it (a dropdown may have none).
                    if (single && choice.isDefault) set(index, { isDefault: false });
                  }}
                />
                <span>
                  Default<span className="sr-only"> for choice {String(index + 1)}</span>
                </span>
              </label>
              <IconButton
                label={`Move choice ${String(index + 1)} up`}
                size="sm"
                disabled={index === 0}
                onClick={() => {
                  move(index, -1);
                }}
              >
                <ArrowUp aria-hidden className="size-4" />
              </IconButton>
              <IconButton
                label={`Move choice ${String(index + 1)} down`}
                size="sm"
                disabled={index === choices.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
              >
                <ArrowDown aria-hidden className="size-4" />
              </IconButton>
              <IconButton
                label={`Remove choice ${String(index + 1)}`}
                size="sm"
                disabled={choices.length === 1 && !choice.id && !choice.label}
                onClick={() => {
                  remove(index);
                }}
              >
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus aria-hidden />}
          onClick={() => {
            add();
          }}
        >
          Add choice
        </Button>
      </div>
      <p className={problems.choices ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}>
        {problems.choices ??
          'Press Enter to add the next one. Removed choices stay on records that already have them.'}
      </p>
      {removed.length > 0 && (
        <div className="mt-2 rounded-lg bg-surface-sunken px-3 py-2.5">
          <p className="text-xs font-medium text-ink-muted">
            Removed (still shown on records that have them)
          </p>
          <ul aria-label="Removed choices" className="mt-1.5 flex flex-col gap-1">
            {removed.map((choice) => (
              <li key={choice.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-ink-muted line-through">{choice.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Undo2 aria-hidden />}
                  aria-label={`Bring back ${choice.label}`}
                  onClick={() => {
                    bringBack(choice);
                  }}
                >
                  Bring back
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

interface FieldDrawerProps {
  recordType: CustomFieldRecordType;
  /** The field to change; leave out to add one. */
  field?: CustomField | undefined;
  onClose: () => void;
  onSaved: (list: CustomFieldList, message: string) => void;
}

/**
 * Add or change a custom field, with a live preview of how it looks on the form. The type and the
 * internal name never change after the field is created. Mount it only while open (fresh state).
 */
export function FieldDrawer({ recordType, field, onClose, onSaved }: FieldDrawerProps) {
  const [draft, setDraft] = useState(() => draftFrom(field));
  const [problems, setProblems] = useState<Problems>({ choice: {} });
  const [preview, setPreview] = useState<{ value: unknown }>();
  const record = recordTab(recordType);
  const editing = field !== undefined;

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setProblems({ choice: {} });
  };
  const handlers = (message: string) => ({
    onSuccess: (list: CustomFieldList) => {
      onSaved(list, message);
    },
    onError: (failure: unknown) => {
      setProblems(problemsFrom(failure));
    },
  });
  const create = usePostApiV1CustomFields({ mutation: handlers('Field added.') });
  const update = usePatchApiV1CustomFieldsFieldId({ mutation: handlers('Field saved.') });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const found: Problems = { choice: {} };
    if (!draft.label.trim()) found.label = 'Enter a label.';
    if (hasChoices(draft.type)) {
      draft.choices.forEach((choice, index) => {
        if (!choice.label.trim()) found.choice[index] = 'Enter a choice.';
      });
    }
    if (found.label || Object.keys(found.choice).length > 0) {
      setProblems(found);
      return;
    }
    if (field) {
      const changes = changesFrom(field, draft);
      if (Object.keys(changes).length === 0) onClose();
      else update.mutate({ fieldId: field.id, data: changes });
      return;
    }
    create.mutate({
      data: {
        recordType,
        label: draft.label.trim(),
        type: draft.type,
        required: draft.required,
        ...(draft.helpText.trim() ? { helpText: draft.helpText.trim() } : {}),
        ...(draft.type === 'checkbox' ? { checkboxDefault: draft.checkboxDefault } : {}),
        ...(hasChoices(draft.type) ? { choices: choicesBody(draft.choices) } : {}),
      },
    });
  };

  const requiredOptions = (Object.keys(REQUIRED_NAMES) as CustomFieldRequired[]).filter(
    (rule) => rule !== 'on_resolve' || recordType === 'ticket',
  );
  const requiredHelp: Record<CustomFieldRequired, string> = {
    never: 'Can be left empty.',
    always: `Must be filled in to save a ${record.singular}.`,
    on_resolve: 'Can stay empty while the ticket is open; needed to resolve it.',
  };
  const shown = {
    label: draft.label.trim() || 'Field label',
    helpText: blankToNull(draft.helpText),
    type: draft.type,
    required: draft.required,
    choices: draft.choices
      .filter((choice) => choice.label.trim())
      .map((choice) => ({ id: choice.key, label: choice.label, removed: false, isDefault: false })),
  };
  // Until the preview is touched it shows what a new record starts with.
  const defaults = draft.choices.filter((choice) => choice.isDefault && choice.label.trim());
  const startValue =
    draft.type === 'checkbox'
      ? draft.checkboxDefault
      : draft.type === 'dropdown'
        ? (defaults[0]?.key ?? null)
        : draft.type === 'multi_select' && defaults.length > 0
          ? defaults.map((choice) => choice.key)
          : null;

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? `Edit ${field.label}` : `Add a ${record.singular} field`}
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
            {editing ? 'Save field' : 'Add field'}
          </Button>
        </div>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {problems.form && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {problems.form}
          </p>
        )}
        <TextField
          label="Label"
          required
          maxLength={80}
          value={draft.label}
          error={problems.label}
          hint={
            field ? (
              <>
                Internal name <code className="font-mono">{field.key}</code>, used by rules, the API
                and exports. It never changes.
              </>
            ) : (
              'The internal name is made from the label when you add the field and never changes.'
            )
          }
          onChange={(event) => {
            change({ label: event.target.value });
          }}
        />
        <SelectField
          label="Type"
          value={draft.type}
          disabled={editing}
          options={TYPE_OPTIONS}
          hint={
            editing
              ? "The type can't change once the field is added. Archive it and add a new one instead."
              : TYPE_OPTIONS.find((option) => option.value === draft.type)?.description
          }
          onChange={(event) => {
            setPreview(undefined);
            change({ type: event.target.value as CustomFieldType });
          }}
        />
        <TextField
          label="Help text"
          maxLength={200}
          value={draft.helpText}
          error={problems.helpText}
          hint="Optional. Shown under the field to explain what to enter."
          onChange={(event) => {
            change({ helpText: event.target.value });
          }}
        />
        {hasChoices(draft.type) && (
          <ChoicesEditor
            draft={draft}
            problems={problems}
            onChange={(choices, removed) => {
              change({ choices, ...(removed ? { removed } : {}) });
            }}
          />
        )}
        {draft.type === 'checkbox' && (
          <CheckboxField
            checked={draft.checkboxDefault}
            onChange={(event) => {
              change({ checkboxDefault: event.target.checked });
            }}
          >
            Ticked by default on new {record.label.toLowerCase()}
          </CheckboxField>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Required</legend>
          {requiredOptions.map((rule) => (
            <label key={rule} className="flex items-start gap-2.5">
              <input
                type="radio"
                name="required"
                value={rule}
                checked={draft.required === rule}
                className="mt-0.5 size-4 shrink-0 accent-brand-600"
                onChange={() => {
                  change({ required: rule });
                }}
              />
              <span className="text-sm font-medium text-ink">
                {REQUIRED_NAMES[rule]}{' '}
                <span className="block text-xs font-normal text-ink-muted">
                  {requiredHelp[rule]}
                </span>
              </span>
            </label>
          ))}
          {problems.required && <p className="text-xs text-danger-text">{problems.required}</p>}
          {editing && draft.required !== 'never' && field.required === 'never' && (
            <p className="text-xs text-ink-muted">
              Existing {record.label.toLowerCase()} stay as they are until someone edits them.
            </p>
          )}
        </fieldset>
        <section
          aria-label="Preview"
          className="rounded-xl border border-dashed border-border-strong bg-surface-sunken px-4 py-3.5"
        >
          <p className="mb-3 text-xs font-medium tracking-wide text-ink-subtle uppercase">
            Preview
          </p>
          <CustomFieldInput
            key={draft.type}
            field={shown}
            value={preview ? preview.value : startValue}
            resolving={draft.required === 'on_resolve'}
            onChange={(value) => {
              setPreview({ value });
            }}
          />
        </section>
      </form>
    </Drawer>
  );
}
