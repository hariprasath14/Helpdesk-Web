import { useState, type SyntheticEvent } from 'react';
import type { Company, UpdateCompanyRequestInput } from '../../api/generated/model';
import {
  usePatchApiV1CompaniesCompanyId,
  usePostApiV1Companies,
} from '../../api/generated/contacts/contacts';
import { Button } from '../../components/Button';
import { Drawer } from '../../components/Drawer';
import { Skeleton } from '../../components/Skeleton';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { CustomFieldsEditor } from '../custom-fields/CustomFieldValues';
import {
  changedValues,
  defaultValues,
  useCustomFields,
  type CustomValues,
} from '../custom-fields/custom-values';
import { customFieldProblems, problemsFrom, type FormProblems } from './directory';
import { TextListField } from './TextListField';

const MAX_DOMAINS = 20;

interface Draft {
  name: string;
  domains: string[];
  phone: string;
  website: string;
  note: string;
  customFields: CustomValues;
}

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());
const domainList = (domains: string[]) =>
  domains.map((domain) => domain.trim()).filter((domain) => domain !== '');

function changesFrom(company: Company, draft: Draft): UpdateCompanyRequestInput {
  const changes: UpdateCompanyRequestInput = {};
  if (draft.name.trim() !== company.name) changes.name = draft.name.trim();
  if (JSON.stringify(domainList(draft.domains)) !== JSON.stringify(company.domains)) {
    changes.domains = domainList(draft.domains);
  }
  if (textOrNull(draft.phone) !== company.phone) changes.phone = textOrNull(draft.phone);
  if (textOrNull(draft.website) !== company.website) changes.website = textOrNull(draft.website);
  if (textOrNull(draft.note) !== company.note) changes.note = textOrNull(draft.note);
  const custom = changedValues(company.customFields, draft.customFields);
  if (Object.keys(custom).length > 0) changes.customFields = custom;
  return changes;
}

interface CompanyDrawerProps {
  /** The company to change; leave out to add one. */
  company?: Company | undefined;
  onClose: () => void;
  onSaved: (company: Company, message: string) => void;
}

/** Add or edit a company. Mount it only while open (fresh state each time). */
export function CompanyDrawer({ company, onClose, onSaved }: CompanyDrawerProps) {
  const { fields, loading } = useCustomFields('company');
  const [draft, setDraft] = useState<Draft>(() => ({
    name: company?.name ?? '',
    domains: company?.domains ?? [''],
    phone: company?.phone ?? '',
    website: company?.website ?? '',
    note: company?.note ?? '',
    customFields: company?.customFields ?? {},
  }));
  const [defaultsApplied, setDefaultsApplied] = useState(company !== undefined);
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const editing = company !== undefined;

  if (!defaultsApplied && !loading) {
    setDefaultsApplied(true);
    setDraft((current) => ({
      ...current,
      customFields: { ...defaultValues(fields), ...current.customFields },
    }));
  }

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const handlers = (message: string) => ({
    onSuccess: (saved: Company) => {
      onSaved(saved, message);
    },
    onError: (failure: unknown) => {
      setProblems(problemsFrom(failure));
    },
  });
  const create = usePostApiV1Companies({ mutation: handlers('Company added.') });
  const update = usePatchApiV1CompaniesCompanyId({ mutation: handlers('Company saved.') });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!draft.name.trim()) {
      setProblems({ fields: { name: 'Enter a name.' } });
      return;
    }
    setProblems({ fields: {} });
    if (company) {
      const changes = changesFrom(company, draft);
      if (Object.keys(changes).length === 0) onClose();
      else update.mutate({ companyId: company.id, data: changes });
      return;
    }
    create.mutate({
      data: {
        name: draft.name.trim(),
        domains: domainList(draft.domains),
        phone: textOrNull(draft.phone),
        website: textOrNull(draft.website),
        note: textOrNull(draft.note),
        customFields: draft.customFields,
      },
    });
  };

  const error = (path: string) => problems.fields[path];
  // The API numbers domains as sent (blank boxes left out), so map its index back to the boxes.
  const filled = draft.domains
    .map((domain, index) => ({ domain, index }))
    .filter(({ domain }) => domain.trim() !== '');
  const domainErrors = Object.fromEntries(
    filled.map(({ index }, sent) => [index, error(`domains.${String(sent)}`)]),
  );

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? `Edit ${company.name}` : 'Add a company'}
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
            {editing ? 'Save company' : 'Add company'}
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
          label="Name"
          required
          maxLength={120}
          autoComplete="off"
          value={draft.name}
          error={error('name')}
          onChange={(event) => {
            change({ name: event.target.value });
          }}
        />
        <TextListField
          label="Email domains"
          itemLabel="Domain"
          values={draft.domains}
          max={MAX_DOMAINS}
          placeholder="acme.com"
          addLabel="Add another domain"
          hint="New contacts with an email at these domains join this company. Free email services like gmail.com can't be added."
          errors={domainErrors}
          error={error('domains')}
          onChange={(domains) => {
            change({ domains });
          }}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Phone"
            type="tel"
            maxLength={40}
            value={draft.phone}
            error={error('phone')}
            onChange={(event) => {
              change({ phone: event.target.value });
            }}
          />
          <TextField
            label="Website"
            maxLength={200}
            placeholder="acme.com"
            value={draft.website}
            error={error('website')}
            onChange={(event) => {
              change({ website: event.target.value });
            }}
          />
        </div>
        <TextAreaField
          label="Note"
          maxLength={5000}
          value={draft.note}
          error={error('note')}
          hint="Only your team sees this."
          onChange={(event) => {
            change({ note: event.target.value });
          }}
        />
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <CustomFieldsEditor
            fields={fields}
            values={draft.customFields}
            errors={customFieldProblems(problems.fields)}
            onChange={(key, value) => {
              change({ customFields: { ...draft.customFields, [key]: value } });
            }}
          />
        )}
      </form>
    </Drawer>
  );
}
