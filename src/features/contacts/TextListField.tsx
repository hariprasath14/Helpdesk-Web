import { Plus, X } from 'lucide-react';
import { Button, IconButton } from '../../components/Button';
import { TextField } from '../../components/TextField';

interface TextListFieldProps {
  /** Group label, for example "Other emails". */
  label: string;
  /** Each box's label, numbered: "Other email 1". */
  itemLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  addLabel: string;
  type?: 'text' | 'email';
  placeholder?: string;
  hint?: string;
  /** Messages by box index, and one for the whole list. */
  errors: Record<number, string | undefined>;
  error?: string | undefined;
}

/** A short list of text boxes (other emails, domains) with Add and Remove. */
export function TextListField({
  label,
  itemLabel,
  values,
  onChange,
  max,
  addLabel,
  type = 'text',
  placeholder,
  hint,
  errors,
  error,
}: TextListFieldProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">{label}</legend>
      {values.map((value, index) => (
        // Rows have no ids of their own; the position is the identity while editing.
        <div key={index} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 [&_label]:sr-only">
            <TextField
              label={`${itemLabel} ${String(index + 1)}`}
              type={type}
              value={value}
              placeholder={placeholder}
              error={errors[index]}
              onChange={(event) => {
                onChange(values.map((item, at) => (at === index ? event.target.value : item)));
              }}
            />
          </div>
          <IconButton
            label={`Remove ${itemLabel.toLowerCase()} ${String(index + 1)}`}
            className="mt-1"
            onClick={() => {
              onChange(values.filter((_, at) => at !== index));
            }}
          >
            <X aria-hidden className="size-4" />
          </IconButton>
        </div>
      ))}
      {values.length < max && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus aria-hidden />}
            onClick={() => {
              onChange([...values, '']);
            }}
          >
            {addLabel}
          </Button>
        </div>
      )}
      {(error ?? hint) && (
        <p className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}>
          {error ?? hint}
        </p>
      )}
    </fieldset>
  );
}
