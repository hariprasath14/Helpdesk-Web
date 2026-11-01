import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Inbox, Mail, Pencil, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/http';
import {
  getGetApiV1ContactsContactIdQueryKey,
  useDeleteApiV1ContactsContactId,
  useGetApiV1ContactsContactId,
} from '../../api/generated/contacts/contacts';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { Avatar } from '../../components/Avatar';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, StateMessage } from '../../components/StateMessage';
import { RelatedTickets } from '../tickets/RelatedTickets';
import { useToast } from '../../components/toast-context';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';
import { CustomFieldsList } from '../custom-fields/CustomFieldValues';
import { useCustomFields } from '../custom-fields/custom-values';
import { can, useSession } from '../workspace/session-context';
import { ContactDrawer } from './ContactDrawer';
import { refreshDirectory } from './directory';

const crumbs = (name: string) => [{ label: 'Contacts', to: '/contacts' }, { label: name }];

/**
 * A label and value row in a details card. Long values (emails, web addresses) wrap anywhere,
 * so they stay inside the card.
 */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-xs text-ink-muted sm:pt-0.5">{label}</dt>
      <dd className="-mt-2 min-w-0 text-sm wrap-anywhere text-ink sm:mt-0">{children}</dd>
    </div>
  );
}

/** One contact: details and custom fields, their tickets, edit and delete. */
export function ContactPage() {
  const { contactId = '' } = useParams();
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const contact = useGetApiV1ContactsContactId(contactId);
  const { fields } = useCustomFields('contact');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteApiV1ContactsContactId({
    mutation: {
      onSuccess: () => {
        void refreshDirectory(queryClient);
        toast({ tone: 'success', message: 'Contact deleted.' });
        void navigate('/contacts', { replace: true });
      },
      onError: (failure) => {
        setDeleting(false);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  if (contact.isPending) {
    return (
      <>
        <PageHeader title="Contact" breadcrumbs={crumbs('…')} />
        <div role="status" aria-label="Loading the contact" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }
  if (contact.isError) {
    const missing = contact.error instanceof ApiError && contact.error.status === 404;
    return (
      <>
        <PageHeader title="Contact" breadcrumbs={crumbs('Not found')} />
        {missing ? (
          <StateMessage
            icon={Inbox}
            title="This contact doesn't exist"
            description="It may have been deleted."
            actions={
              <Link to="/contacts" className="font-medium text-brand-link hover:underline">
                Back to contacts
              </Link>
            }
          />
        ) : (
          <ErrorState
            what="this contact"
            retrying={contact.isFetching}
            onRetry={() => {
              void contact.refetch();
            }}
          />
        )}
      </>
    );
  }

  const data = contact.data;
  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={data.name} />
            {data.name}
          </span>
        }
        breadcrumbs={crumbs(data.name)}
        meta={`Updated ${relativeTime(data.updatedAt)}`}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Pencil aria-hidden />}
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
            {can(me, 'contacts.delete') && (
              <Menu
                trigger={
                  <IconButton label="More actions" variant="outline">
                    <EllipsisVertical aria-hidden className="size-4" />
                  </IconButton>
                }
              >
                <MenuItem
                  danger
                  onSelect={() => {
                    setDeleting(true);
                  }}
                >
                  Delete contact
                </MenuItem>
              </Menu>
            )}
          </>
        }
      />
      {/* Their tickets first and wide, the details beside them from 1024px (Step 5b). */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <RelatedTickets
          filter={{ contactId: data.id }}
          emptyText={`Tickets from ${data.name} will show here.`}
          newTicketTo={`/tickets/new?contact=${data.id}`}
        />
        <section
          aria-label="Details"
          className="flex flex-col gap-4 self-start rounded-xl border border-border bg-surface px-5 py-4"
        >
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
            <Detail label="Email">
              {data.email ? (
                <a
                  href={`mailto:${data.email}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Mail aria-hidden className="size-3.5 text-ink-subtle" />
                  {data.email}
                </a>
              ) : (
                '—'
              )}
            </Detail>
            {data.otherEmails.length > 0 && (
              <Detail label="Other emails">
                <ul>
                  {data.otherEmails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </Detail>
            )}
            <Detail label="Phone">
              {data.phone ? (
                <a
                  href={`tel:${data.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Phone aria-hidden className="size-3.5 text-ink-subtle" />
                  {data.phone}
                </a>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Job title">{data.jobTitle ?? '—'}</Detail>
            <Detail label="Company">
              {data.company ? (
                <Link
                  to={`/companies/${data.company.id}`}
                  className="font-medium text-brand-link hover:underline"
                >
                  {data.company.name}
                </Link>
              ) : (
                '—'
              )}
            </Detail>
          </dl>
          {data.note && (
            <div className="border-t border-border pt-3">
              <h2 className="text-xs text-ink-muted">Note</h2>
              <p className="mt-1 text-sm whitespace-pre-line text-ink">{data.note}</p>
            </div>
          )}
          {fields.length > 0 && (
            <div className="border-t border-border pt-3">
              <CustomFieldsList fields={fields} values={data.customFields} />
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ContactDrawer
          contact={data}
          onClose={() => {
            setEditing(false);
          }}
          onSaved={(saved, message) => {
            queryClient.setQueryData(getGetApiV1ContactsContactIdQueryKey(saved.id), saved);
            void refreshDirectory(queryClient);
            setEditing(false);
            toast({ tone: 'success', message });
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        destructive
        pending={remove.isPending}
        title={`Delete ${data.name}?`}
        description="The contact and their details are deleted for good. This can't be undone."
        confirmLabel="Delete contact"
        onConfirm={() => {
          remove.mutate({ contactId: data.id });
        }}
      />
    </>
  );
}
