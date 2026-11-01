import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { GetApiV1ContactsSort } from '../../api/generated/model';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { CompanyPicker, type CompanyRef } from './CompanyPicker';
import { countText, SORT_OPTIONS, useContactPages } from './contact-pages';
import { ContactList, ListCard, SearchBar } from './ContactList';
import { NewContactDrawer } from './NewRecordDrawers';

/** Contacts: everyone your team supports. Every member can search, add and edit them. */
export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GetApiV1ContactsSort>('name');
  const [company, setCompany] = useState<CompanyRef | null>(null);
  const [adding, setAdding] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);
  const pages = useContactPages({
    sort,
    ...(q ? { q } : {}),
    ...(company ? { companyId: company.id } : {}),
  });
  const total = pages.data?.pages[0]?.total;

  return (
    <>
      <PageHeader
        title="Contacts"
        {...(total !== undefined && total !== null
          ? { meta: countText(total, 'contact', 'contacts') }
          : {})}
        actions={
          <Button
            icon={<UserPlus aria-hidden />}
            onClick={() => {
              setAdding(true);
            }}
          >
            Add contact
          </Button>
        }
      />
      <ListCard>
        <SearchBar
          label="Search contacts"
          placeholder="Name, email or phone"
          search={search}
          onSearch={setSearch}
        >
          <div className="sm:w-52">
            <CompanyPicker
              label="Company"
              noneLabel="All companies"
              value={company}
              onChange={setCompany}
            />
          </div>
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
          searching={Boolean(q) || company !== null}
          empty={{
            title: 'No contacts yet',
            description: 'Add the people your team supports, with their company and details.',
            actions: (
              <Button
                icon={<UserPlus aria-hidden />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                Add contact
              </Button>
            ),
          }}
          fill
        />
      </ListCard>
      {adding && (
        <NewContactDrawer
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
    </>
  );
}
