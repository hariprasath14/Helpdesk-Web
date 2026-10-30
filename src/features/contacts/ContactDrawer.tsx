import { useState, type SyntheticEvent } from 'react';
import type { Contact, UpdateContactRequestInput } from '../../api/generated/model';
import {
  usePatchApiV1ContactsContactId,
  usePostApiV1Contacts,
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
import { CompanyPicker, type CompanyRef } from './CompanyPicker';
import { customFieldProblems, problemsFrom, type FormProblems } from './directory';
import { TextListField } from './TextListField';

const MAX_OTHER_EMAILS = 5;

interface Draft {
  name: string;
  email: string;
  otherEmails: string[];
  phone: string;
  jobTitle: string;
  company: CompanyRef | null;
  /** On a new contact, an untouched company is left to the email domain. */
  companyChosen: boolean;
  note: string;
  customFields: CustomValues;
}

function draftFrom(contact: Contact | undefined): Draft {
  return {
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    otherEmails: contact?.otherEmails ?? [],
    phone: contact?.phone ?? '',
    jobTitle: contact?.jobTitle ?? '',
    company: contact?.company ?? null,
    companyChosen: false,
    note: contact?.note ?? '',
    customFields: contact?.customFields ?? {},
  };
}

/** Typed text as the API takes it: trimmed, null when blank. */
const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());
const emailList = (emails: string[]) =>
  emails.map((email) => email.trim()).filter((email) => email !== '');

/** Only what changed, so an edit never rewrites fields someone else just changed. */
function changesFrom(contact: Contact, draft: Draft): UpdateContactRequestInput {
  const changes: UpdateContactRequestInput = {};
  if (draft.name.trim() !== contact.name) changes.name = draft.name.trim();
  if (textOrNull(draft.email) !== contact.email) changes.email = textOrNull(draft.email);
  if (JSON.stringify(emailList(draft.otherEmails)) !== JSON.stringify(contact.otherEmails)) {
    changes.otherEmails = emailList(draft.otherEmails);
  }
  if (textOrNull(draft.phone) !== contact.phone) changes.phone = textOrNull(draft.phone);
  if (textOrNull(draft.jobTitle) !== contact.jobTitle) {
    changes.jobTitle = textOrNull(draft.jobTitle);
  }
  if ((draft.company?.id ?? null) !== (contact.company?.id ?? null)) {
    changes.companyId = draft.company?.id ?? null;
  }
  if (textOrNull(draft.note) !== contact.note) changes.note = textOrNull(draft.note);
  const custom = changedValues(contact.customFields, draft.customFields);
  if (Object.keys(custom).length > 0) changes.customFields = custom;
  return changes;
}

interface ContactDrawerProps {
  /** The contact to change; leave out to add one. */
  contact?: Contact | undefined;
  /** A company to start with, when adding from a company's page. */
  company?: CompanyRef | undefined;
  onClose: () => void;
  onSaved: (contact: Contact, message: string) => void;
}

/** Add or edit a contact. Mount it only while open (fresh state each time). */
export function ContactDrawer({ contact, company, onClose, onSaved }: ContactDrawerProps) {
  const { fields, loading } = useCustomFields('contact');
  const [draft, setDraft] = useState(() => ({
    ...draftFrom(contact),
    ...(company ? { company, companyChosen: true } : {}),
  }));
  const [defaultsApplied, setDefaultsApplied] = useState(contact !== undefined);
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const editing = contact !== undefined;

  // A new contact starts with each custom field's default once the definitions arrive.
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
    onSuccess: (saved: Contact) => {
      onSaved(saved, message);
    },
    onError: (failure: unknown) => {
      setProblems(problemsFrom(failure));
    },
  });
  const create = usePostApiV1Contacts({ mutation: handlers('Contact added.') });
  const update = usePatchApiV1ContactsContactId({ mutation: handlers('Contact saved.') });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = 'Enter a name.';
    if (!draft.email.trim() && !draft.phone.trim()) {
      found.email = 'Enter an email or a phone number.';
    }
    if (Object.keys(found).length > 0) {
      setProblems({ fields: found });
      return;
    }
    setProblems({ fields: {} });
    if (contact) {
      const changes = changesFrom(contact, draft);
      if (Object.keys(changes).length === 0) onClose();
      else update.mutate({ contactId: contact.id, data: changes });
      return;
    }
    create.mutate({
      data: {
        name: draft.name.trim(),
        email: textOrNull(draft.email),
        otherEmails: emailList(draft.otherEmails),
        phone: textOrNull(draft.phone),
        jobTitle: textOrNull(draft.jobTitle),
        note: textOrNull(draft.note),
        customFields: draft.customFields,
        ...(draft.companyChosen ? { companyId: draft.company?.id ?? null } : {}),
      },
    });
  };

  const error = (path: string) => problems.fields[path];
  const otherEmailErrors = Object.fromEntries(
    draft.otherEmails.map((_, index) => [index, error(`otherEmails.${String(index)}`)]),
  );

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? `Edit ${contact.name}` : 'Add a contact'}
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
            {editing ? 'Save contact' : 'Add contact'}
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
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Email"
            type="email"
            maxLength={254}
            autoComplete="off"
            value={draft.email}
            error={error('email')}
            hint="Email or phone is needed."
            onChange={(event) => {
              change({ email: event.target.value });
            }}
          />
          <TextField
            label="Phone"
            type="tel"
            maxLength={40}
            autoComplete="off"
            value={draft.phone}
            error={error('phone')}
            onChange={(event) => {
              change({ phone: event.target.value });
            }}
          />
        </div>
        <TextListField
          label="Other emails"
          itemLabel="Other email"
          type="email"
          values={draft.otherEmails}
          max={MAX_OTHER_EMAILS}
          addLabel="Add another email"
          hint="Emails from these addresses count as this contact too."
          errors={otherEmailErrors}
          error={error('otherEmails')}
          onChange={(otherEmails) => {
            change({ otherEmails });
          }}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Job title"
            maxLength={100}
            value={draft.jobTitle}
            error={error('jobTitle')}
            onChange={(event) => {
              change({ jobTitle: event.target.value });
            }}
          />
          <CompanyPicker
            label="Company"
            value={draft.company}
            error={error('companyId')}
            hint={
              !editing && !draft.companyChosen
                ? "Left empty, it's matched by the email's domain."
                : undefined
            }
            onChange={(chosen) => {
              change({ company: chosen, companyChosen: true });
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
