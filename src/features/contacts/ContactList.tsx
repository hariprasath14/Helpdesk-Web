import { Search, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { relativeTime } from '../../lib/relative-time';
import type { useContactPages } from './contact-pages';

interface SearchBarProps {
  search: string;
  onSearch: (search: string) => void;
  placeholder: string;
  label: string;
  children?: ReactNode;
}

/** The search box (and any other filters) above a list. */
export function SearchBar({ search, onSearch, placeholder, label, children }: SearchBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <TextField
          label={label}
          type="search"
          placeholder={placeholder}
          trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
          value={search}
          onChange={(event) => {
            onSearch(event.target.value);
          }}
        />
      </div>
      {children}
    </div>
  );
}

interface ContactListProps {
  pages: ReturnType<typeof useContactPages>;
  /** Hide the company column (on a company's own page). */
  showCompany?: boolean;
  /** What to show when there are no contacts at all (no search). */
  empty: { title: string; description: string; actions?: ReactNode };
  searching: boolean;
}

/** Contact rows: name and job title, email, company, phone, last update; then "Load more". */
export function ContactList({ pages, showCompany = true, empty, searching }: ContactListProps) {
  if (pages.isPending) {
    return (
      <div role="status" aria-label="Loading contacts" className="flex flex-col gap-3 py-4">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (pages.isError) {
    return (
      <div className="py-4">
        <ErrorState
          what="contacts"
          retrying={pages.isFetching}
          onRetry={() => {
            void pages.refetch();
          }}
        />
      </div>
    );
  }
  const contacts = pages.data.pages.flatMap((page) => page.contacts);
  if (contacts.length === 0) {
    return searching ? (
      <p className="py-6 text-center text-ink-muted">No contacts match.</p>
    ) : (
      <div className="py-4">
        <EmptyState icon={UsersRound} {...empty} />
      </div>
    );
  }

  const columns = showCompany
    ? 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]'
    : 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)]';
  return (
    <>
      <div
        aria-hidden
        className={`mt-4 hidden gap-4 border-b border-border pb-2 text-xs font-medium text-ink-subtle md:grid ${columns}`}
      >
        <span>Name</span>
        <span>Email</span>
        {showCompany && <span>Company</span>}
        <span>Phone</span>
        <span>Updated</span>
      </div>
      <ul aria-label="Contacts" className="divide-y divide-border">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className={`flex flex-col gap-0.5 py-3 md:grid md:items-center md:gap-4 ${columns}`}
          >
            <div className="min-w-0">
              <Link
                to={`/contacts/${contact.id}`}
                className="block truncate font-medium text-ink hover:underline"
              >
                {contact.name}
              </Link>
              {contact.jobTitle && (
                <p className="truncate text-xs text-ink-muted">{contact.jobTitle}</p>
              )}
            </div>
            <p className="truncate text-sm text-ink-body">{contact.email ?? '—'}</p>
            {showCompany && (
              <p className="truncate text-sm text-ink-body">
                {contact.company ? (
                  <Link to={`/companies/${contact.company.id}`} className="hover:underline">
                    {contact.company.name}
                  </Link>
                ) : (
                  <span className="text-ink-subtle md:inline">—</span>
                )}
              </p>
            )}
            <p className="truncate text-sm text-ink-body">{contact.phone ?? '—'}</p>
            <p className="text-xs text-ink-muted">
              <span className="md:sr-only">Updated </span>
              {relativeTime(contact.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
      {pages.hasNextPage && (
        <div className="flex justify-center py-3">
          <Button
            variant="outline"
            loading={pages.isFetchingNextPage}
            onClick={() => {
              void pages.fetchNextPage();
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
