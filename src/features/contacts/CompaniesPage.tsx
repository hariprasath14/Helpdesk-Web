import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  getApiV1Companies,
  getGetApiV1CompaniesQueryKey,
} from '../../api/generated/contacts/contacts';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { CompanyDrawer } from './CompanyDrawer';
import { countText } from './contact-pages';
import { SearchBar } from './ContactList';
import { refreshDirectory } from './directory';

const COLUMNS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]';

/** Companies: the organisations your contacts belong to, A to Z. */
export function CompaniesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);
  const params = q ? { q } : {};
  const pages = useInfiniteQuery({
    queryKey: getGetApiV1CompaniesQueryKey(params),
    queryFn: ({ pageParam }) =>
      getApiV1Companies({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const total = pages.data?.pages[0]?.total;
  const addButton = (
    <Button
      icon={<Plus aria-hidden />}
      onClick={() => {
        setAdding(true);
      }}
    >
      Add company
    </Button>
  );

  let body;
  if (pages.isPending) {
    body = (
      <div role="status" aria-label="Loading companies" className="flex flex-col gap-3 py-4">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (pages.isError) {
    body = (
      <div className="py-4">
        <ErrorState
          what="companies"
          retrying={pages.isFetching}
          onRetry={() => {
            void pages.refetch();
          }}
        />
      </div>
    );
  } else {
    const companies = pages.data.pages.flatMap((page) => page.companies);
    body =
      companies.length === 0 ? (
        q ? (
          <p className="py-6 text-center text-ink-muted">No companies match.</p>
        ) : (
          <div className="py-4">
            <EmptyState
              icon={Building}
              title="No companies yet"
              description="Add the organisations your contacts work for. Their email domains link new contacts automatically."
              actions={addButton}
            />
          </div>
        )
      ) : (
        <>
          <div
            aria-hidden
            className={`mt-4 hidden gap-4 border-b border-border pb-2 text-xs font-medium text-ink-subtle md:grid ${COLUMNS}`}
          >
            <span>Name</span>
            <span>Domains</span>
            <span>Contacts</span>
          </div>
          <ul aria-label="Companies" className="divide-y divide-border">
            {companies.map((company) => (
              <li
                key={company.id}
                className={`flex flex-col gap-0.5 py-3 md:grid md:items-center md:gap-4 ${COLUMNS}`}
              >
                <Link
                  to={`/companies/${company.id}`}
                  className="truncate font-medium text-ink hover:underline"
                >
                  {company.name}
                </Link>
                <p className="truncate text-sm text-ink-body">
                  {company.domains.join(', ') || <span className="text-ink-subtle">—</span>}
                </p>
                <p className="text-sm text-ink-muted">
                  {countText(company.contactCount, 'contact', 'contacts')}
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

  return (
    <>
      <PageHeader
        title="Companies"
        {...(total !== undefined && total !== null
          ? { meta: countText(total, 'company', 'companies') }
          : {})}
        actions={addButton}
      />
      <section className="rounded-xl border border-border bg-surface px-5 pt-4 pb-2">
        <SearchBar
          label="Search companies"
          placeholder="Name or domain"
          search={search}
          onSearch={setSearch}
        />
        {body}
      </section>
      {adding && (
        <CompanyDrawer
          onClose={() => {
            setAdding(false);
          }}
          onSaved={(company, message) => {
            setAdding(false);
            void refreshDirectory(queryClient);
            toast({ tone: 'success', message });
            void navigate(`/companies/${company.id}`);
          }}
        />
      )}
    </>
  );
}
