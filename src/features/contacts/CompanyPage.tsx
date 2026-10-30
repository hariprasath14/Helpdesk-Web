import { useQueryClient } from '@tanstack/react-query';
import { Building, EllipsisVertical, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { GetApiV1ContactsSort } from '../../api/generated/model';
import { ApiError } from '../../api/http';
import {
  getGetApiV1CompaniesCompanyIdQueryKey,
  useDeleteApiV1CompaniesCompanyId,
  useGetApiV1CompaniesCompanyId,
} from '../../api/generated/contacts/contacts';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, StateMessage } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { relativeTime } from '../../lib/relative-time';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { formError } from '../auth/api-errors';
import { RelatedTickets } from '../tickets/RelatedTickets';
import { CustomFieldsList } from '../custom-fields/CustomFieldValues';
import { useCustomFields } from '../custom-fields/custom-values';
import { can, useSession } from '../workspace/session-context';
import { CompanyDrawer } from './CompanyDrawer';
import { ContactDrawer } from './ContactDrawer';
import { countText, SORT_OPTIONS, useContactPages } from './contact-pages';
import { ContactList, SearchBar } from './ContactList';
import { Detail } from './ContactPage';
import { refreshDirectory, websiteHref } from './directory';

const crumbs = (name: string) => [{ label: 'Companies', to: '/companies' }, { label: name }];

function CompanyContacts({ company }: { company: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GetApiV1ContactsSort>('name');
  const [adding, setAdding] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);
  const pages = useContactPages({ companyId: company.id, sort, ...(q ? { q } : {}) });
  const addButton = (
    <Button
      variant="outline"
      size="sm"
      icon={<UserPlus aria-hidden />}
      onClick={() => {
        setAdding(true);
      }}
    >
      Add contact
    </Button>
  );
  return (
    <section
      aria-label="Contacts"
      className="rounded-xl border border-border bg-surface px-5 pt-4 pb-2"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Contacts</h2>
        {addButton}
      </div>
      <SearchBar
        label="Search this company's contacts"
        placeholder="Name, email or phone"
        search={search}
        onSearch={setSearch}
      >
        <div className="sm:w-48">
          <SelectField
            label="Sort"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(event) => {
              setSort(event.target.value as GetApiV1ContactsSort);
            }}
          />
        </div>
      </SearchBar>
      <ContactList
        pages={pages}
        showCompany={false}
        searching={Boolean(q)}
        empty={{
          title: 'No contacts yet',
          description: `People at ${company.name} show here, including new contacts whose email matches its domains.`,
          actions: addButton,
        }}
      />
      {adding && (
        <ContactDrawer
          company={company}
          onClose={() => {
            setAdding(false);
          }}
          onSaved={(contact, message) => {
            setAdding(false);
            void refreshDirectory(queryClient);
            toast({ tone: 'success', message });
            void navigate(`/contacts/${contact.id}`);
          }}
        />
      )}
    </section>
  );
}

/** One company: details, custom fields and its contacts; edit and delete. */
export function CompanyPage() {
  const { companyId = '' } = useParams();
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const company = useGetApiV1CompaniesCompanyId(companyId);
  const { fields } = useCustomFields('company');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteApiV1CompaniesCompanyId({
    mutation: {
      onSuccess: () => {
        void refreshDirectory(queryClient);
        toast({ tone: 'success', message: 'Company deleted. Its contacts were kept.' });
        void navigate('/companies', { replace: true });
      },
      onError: (failure) => {
        setDeleting(false);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  if (company.isPending) {
    return (
      <>
        <PageHeader title="Company" breadcrumbs={crumbs('…')} />
        <div role="status" aria-label="Loading the company" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }
  if (company.isError) {
    const missing = company.error instanceof ApiError && company.error.status === 404;
    return (
      <>
        <PageHeader title="Company" breadcrumbs={crumbs('Not found')} />
        {missing ? (
          <StateMessage
            icon={Building}
            title="This company doesn't exist"
            description="It may have been deleted."
            actions={
              <Link to="/companies" className="font-medium text-brand-link hover:underline">
                Back to companies
              </Link>
            }
          />
        ) : (
          <ErrorState
            what="this company"
            retrying={company.isFetching}
            onRetry={() => {
              void company.refetch();
            }}
          />
        )}
      </>
    );
  }

  const data = company.data;
  return (
    <>
      <PageHeader
        title={data.name}
        breadcrumbs={crumbs(data.name)}
        meta={`${countText(data.contactCount, 'contact', 'contacts')} · updated ${relativeTime(data.updatedAt)}`}
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
                  Delete company
                </MenuItem>
              </Menu>
            )}
          </>
        }
      />
      {/* Tickets and people in the wide column, the details beside them from 1024px (Step 5b). */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <RelatedTickets
            filter={{ companyId: data.id }}
            emptyText={`Tickets from ${data.name}'s contacts will show here.`}
          />
          <CompanyContacts company={data} />
        </div>
        <section
          aria-label="Details"
          className="flex flex-col gap-4 self-start rounded-xl border border-border bg-surface px-5 py-4"
        >
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
            <Detail label="Domains">
              {data.domains.length > 0 ? (
                <ul>
                  {data.domains.map((domain) => (
                    <li key={domain}>{domain}</li>
                  ))}
                </ul>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Phone">{data.phone ?? '—'}</Detail>
            <Detail label="Website">
              {data.website ? (
                <a
                  href={websiteHref(data.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-link hover:underline"
                >
                  {data.website}
                </a>
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
        <CompanyDrawer
          company={data}
          onClose={() => {
            setEditing(false);
          }}
          onSaved={(saved, message) => {
            queryClient.setQueryData(getGetApiV1CompaniesCompanyIdQueryKey(saved.id), saved);
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
        description={
          data.contactCount > 0
            ? `The company is deleted for good. Its ${countText(data.contactCount, 'contact stays', 'contacts stay')}, without a company.`
            : "The company is deleted for good. This can't be undone."
        }
        confirmLabel="Delete company"
        onConfirm={() => {
          remove.mutate({ companyId: data.id });
        }}
      />
    </>
  );
}
