import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useGetApiV1ContactsContactId } from '../../api/generated/contacts/contacts';
import type { Ticket } from '../../api/generated/model';
import {
  getGetApiV1TicketsNumberQueryKey,
  usePostApiV1Tickets,
} from '../../api/generated/tickets/tickets';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { defaultValues, useCustomFields } from '../custom-fields/custom-values';
import { problemsFrom, refreshDirectory, type FormProblems } from '../contacts/directory';
import { RequesterPicker, type ContactRef } from './RequesterPicker';
import { ticketRef } from './ticket-labels';
import { TicketFields, type PropertiesDraft } from './TicketFields';
import { refreshTickets } from './tickets-cache';

interface NewContact {
  name: string;
  email: string;
  phone: string;
}

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());

/**
 * New ticket (every member): the requester (an existing contact, or a new one by name and email
 * or phone), subject, description, properties and the ticket custom fields. `?contact=<id>`
 * starts with that contact chosen (from a contact's page).
 */
export function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const preset = params.get('contact');
  const presetContact = useGetApiV1ContactsContactId(preset ?? '', {
    query: { enabled: preset !== null },
  });
  const { fields, loading } = useCustomFields('ticket');

  const [requester, setRequester] = useState<ContactRef | null>(null);
  const [newContact, setNewContact] = useState<NewContact | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<PropertiesDraft>({
    status: 'open',
    priority: 'medium',
    type: '',
    teamId: '',
    assigneeUserId: '',
    tags: [],
    customFields: {},
  });
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });

  if (!defaultsApplied && !loading) {
    setDefaultsApplied(true);
    setDraft((current) => ({ ...current, customFields: defaultValues(fields) }));
  }
  if (preset && !requester && !newContact && presetContact.data) {
    const { id, name, email } = presetContact.data;
    setRequester({ id, name, email });
  }

  const create = usePostApiV1Tickets({
    mutation: {
      onSuccess: (ticket: Ticket) => {
        queryClient.setQueryData(getGetApiV1TicketsNumberQueryKey(ticket.number), ticket);
        void refreshTickets(queryClient);
        if (newContact) void refreshDirectory(queryClient);
        toast({ tone: 'success', message: `Ticket ${ticketRef(ticket.number)} created.` });
        void navigate(`/tickets/${String(ticket.number)}`);
      },
      onError: (failure) => {
        setProblems(problemsFrom(failure));
      },
    },
  });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const found: Record<string, string> = {};
    if (!subject.trim()) found.subject = 'Enter a subject.';
    if (!requester && !newContact) found.contactId = 'Choose who raised this ticket.';
    if (newContact && !newContact.name.trim()) found['contact.name'] = 'Enter a name.';
    if (newContact && !newContact.email.trim() && !newContact.phone.trim()) {
      found['contact.email'] = 'Enter an email or a phone number.';
    }
    if (Object.keys(found).length > 0) {
      setProblems({ fields: found });
      return;
    }
    setProblems({ fields: {} });
    create.mutate({
      data: {
        subject: subject.trim(),
        description,
        ...(requester ? { contactId: requester.id } : {}),
        ...(newContact
          ? {
              contact: {
                name: newContact.name.trim(),
                email: textOrNull(newContact.email),
                phone: textOrNull(newContact.phone),
              },
            }
          : {}),
        status: draft.status,
        priority: draft.priority,
        type: draft.type === '' ? null : (draft.type as Ticket['type']),
        teamId: draft.teamId === '' ? null : draft.teamId,
        assigneeUserId: draft.assigneeUserId === '' ? null : draft.assigneeUserId,
        tags: draft.tags,
        customFields: draft.customFields,
      },
    });
  };

  const error = (path: string) => problems.fields[path];
  // Typed something: leaving asks first (Step 5b). Not while creating, so opening the new ticket
  // is never blocked.
  const typed =
    subject.trim() !== '' || description.trim() !== '' || newContact !== null || requester !== null;

  return (
    <>
      <PageHeader
        title="New ticket"
        breadcrumbs={[{ label: 'Tickets', to: '/tickets' }, { label: 'New ticket' }]}
      />
      {typed && !create.isPending && !create.isSuccess && <UnsavedChangesGuard />}
      {/* Two columns from 1024px (Step 5b): what the ticket is about, then its properties. */}
      <form
        noValidate
        onSubmit={submit}
        className="grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
      >
        {problems.form && (
          <p
            role="alert"
            className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text lg:col-span-2"
          >
            {problems.form}
          </p>
        )}
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
          {newContact ? (
            <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <legend className="px-1 text-[13px] font-medium text-ink">New contact</legend>
              <TextField
                label="Name"
                required
                maxLength={120}
                value={newContact.name}
                error={error('contact.name')}
                onChange={(event) => {
                  setNewContact({ ...newContact, name: event.target.value });
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Email"
                  type="email"
                  maxLength={254}
                  value={newContact.email}
                  error={error('contact.email')}
                  hint="If a contact has this email, the ticket is theirs."
                  onChange={(event) => {
                    setNewContact({ ...newContact, email: event.target.value });
                  }}
                />
                <TextField
                  label="Phone"
                  type="tel"
                  maxLength={40}
                  value={newContact.phone}
                  error={error('contact.phone')}
                  onChange={(event) => {
                    setNewContact({ ...newContact, phone: event.target.value });
                  }}
                />
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewContact(null);
                  }}
                >
                  Choose an existing contact instead
                </Button>
              </div>
            </fieldset>
          ) : (
            <RequesterPicker
              label="Requester"
              value={requester}
              error={error('contactId')}
              hint="Who raised this ticket. Not in your contacts yet? Choose New contact."
              onChange={setRequester}
              onNew={(typed) => {
                setRequester(null);
                setNewContact({
                  name: typed.includes('@') ? '' : typed,
                  email: typed.includes('@') ? typed : '',
                  phone: '',
                });
              }}
            />
          )}
          <TextField
            label="Subject"
            required
            maxLength={200}
            value={subject}
            error={error('subject')}
            onChange={(event) => {
              setSubject(event.target.value);
            }}
          />
          <TextAreaField
            label="Description"
            rows={8}
            maxLength={50_000}
            value={description}
            error={error('description')}
            hint="What the customer needs, in their words if you have them."
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <section
          aria-label="Properties"
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-base font-bold">Properties</h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <TicketFields
              layout="rows"
              draft={draft}
              customFields={fields}
              errors={problems.fields}
              onChange={(next) => {
                setDraft((current) => ({ ...current, ...next }));
              }}
            />
          )}
        </section>
        {/* Stays in view at the bottom of the screen (Step 5b), over the page area's padding. */}
        <div className="sticky -bottom-5 z-10 -mx-4 flex justify-end gap-2 border-t border-border bg-surface-page px-4 pt-3 pb-8 md:-mx-6 md:px-6 lg:col-span-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigate(-1);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create ticket
          </Button>
        </div>
      </form>
    </>
  );
}
