import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type {
  Company,
  CompanySummary,
  Contact,
  ContactSummary,
  CustomField,
  Me,
} from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { changedValues, defaultValues, formatCustomValue } from '../custom-fields/custom-values';

const NOW = new Date().toISOString();
const agentMe: Me = {
  ...me,
  role: 'agent',
  isOwner: false,
  permissions: ['tickets.work', 'contacts.edit'],
};

const ACME = { id: 'co1', name: 'Acme' };
const neha: Contact = {
  id: 'c1',
  name: 'Neha Iyer',
  email: 'neha@acme.com',
  otherEmails: ['neha.iyer@gmail.com'],
  phone: '+91 98765 43210',
  jobTitle: 'IT manager',
  company: ACME,
  note: 'Prefers phone calls.',
  customFields: { plan: 'ch2', renewal: '2026-12-31', seats: 1200 },
  updatedAt: NOW,
  createdAt: NOW,
};
const summary = (contact: Contact): ContactSummary => ({
  id: contact.id,
  name: contact.name,
  email: contact.email,
  phone: contact.phone,
  jobTitle: contact.jobTitle,
  company: contact.company,
  updatedAt: contact.updatedAt,
});
const arjun = summary({
  ...neha,
  id: 'c2',
  name: 'Arjun Mehta',
  email: 'arjun@example.org',
  company: null,
  jobTitle: null,
});

const field = (overrides: Partial<CustomField>): CustomField => ({
  id: 'f1',
  recordType: 'contact',
  key: 'plan',
  label: 'Plan',
  helpText: null,
  type: 'dropdown',
  required: 'never',
  archived: false,
  position: 0,
  checkboxDefault: null,
  choices: [
    { id: 'ch1', label: 'Basic', removed: false, isDefault: true },
    { id: 'ch2', label: 'Premium', removed: false, isDefault: false },
  ],
  ...overrides,
});
const CONTACT_FIELDS: CustomField[] = [
  field({}),
  field({ id: 'f2', key: 'renewal', label: 'Renewal date', type: 'date', choices: [] }),
  field({ id: 'f3', key: 'seats', label: 'Seats', type: 'integer', choices: [], archived: true }),
  field({
    id: 'f4',
    key: 'region',
    label: 'Region',
    type: 'text',
    choices: [],
    required: 'always',
  }),
];

const acme: Company = {
  ...ACME,
  domains: ['acme.com'],
  contactCount: 1,
  phone: null,
  website: 'acme.com',
  note: null,
  customFields: {},
  updatedAt: NOW,
  createdAt: NOW,
};
const companySummary = (company: Company): CompanySummary => ({
  id: company.id,
  name: company.name,
  domains: company.domains,
  contactCount: company.contactCount,
  updatedAt: company.updatedAt,
});

interface Call {
  method: string;
  url: string;
  query: string;
  body: unknown;
}

const NEHA_TICKET = {
  number: 7,
  subject: 'Payroll stuck',
  status: 'open',
  priority: 'high',
  type: null,
  contact: { id: 'c1', name: 'Neha Iyer', email: 'neha@acme.com' },
  company: null,
  team: null,
  assignee: null,
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  due: null,
  mergedInto: null,
};

function directoryApi(session: Me = me) {
  const calls: Call[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const body: unknown = request.headers.get('content-type')?.includes('json')
      ? await request.json()
      : null;
    calls.push({ method: request.method, url: url.pathname, query: url.search, body });
    return body as Record<string, unknown>;
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/tickets'), ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('contactId') === 'c1'
          ? { tickets: [NEHA_TICKET], nextCursor: null, total: 1 }
          : { tickets: [], nextCursor: null, total: 0 },
      ),
    ),
    http.get(apiUrl('/api/v1/custom-fields'), ({ request }) =>
      HttpResponse.json({
        fields:
          new URL(request.url).searchParams.get('recordType') === 'contact' ? CONTACT_FIELDS : [],
      }),
    ),
    http.get(apiUrl('/api/v1/contacts'), async ({ request }) => {
      await record(request);
      const params = new URL(request.url).searchParams;
      if (params.get('cursor') === 'page-2') {
        return HttpResponse.json({ contacts: [arjun], nextCursor: null, total: null });
      }
      if (params.get('q') === 'nobody') {
        return HttpResponse.json({ contacts: [], nextCursor: null, total: 0 });
      }
      return HttpResponse.json({ contacts: [summary(neha)], nextCursor: 'page-2', total: 2 });
    }),
    http.get(apiUrl('/api/v1/contacts/:id'), ({ params }) =>
      params.id === neha.id
        ? HttpResponse.json(neha)
        : apiError(404, 'NOT_FOUND', 'This contact does not exist.'),
    ),
    http.post(apiUrl('/api/v1/contacts'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...neha, id: 'c9', name: body.name as string });
    }),
    http.patch(apiUrl('/api/v1/contacts/:id'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...neha, ...body, updatedAt: NOW });
    }),
    http.delete(apiUrl('/api/v1/contacts/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(apiUrl('/api/v1/companies'), async ({ request }) => {
      await record(request);
      return HttpResponse.json({
        companies: [
          companySummary(acme),
          companySummary({ ...acme, id: 'co2', name: 'Globex', domains: [], contactCount: 0 }),
        ],
        nextCursor: null,
        total: 2,
      });
    }),
    http.get(apiUrl('/api/v1/companies/:id'), () => HttpResponse.json(acme)),
    http.post(apiUrl('/api/v1/companies'), async ({ request }) => {
      await record(request);
      return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
        fields: [{ field: 'domains.1', message: 'gmail.com is a free email service.' }],
      });
    }),
    http.delete(apiUrl('/api/v1/companies/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

/** The element at a position, failing the test when it is missing. */
function nth(elements: HTMLElement[], index = 0): HTMLElement {
  const element = elements.at(index);
  if (!element) throw new Error(`no element at ${String(index)}`);
  return element;
}

const sent = (calls: Call[], method: string, url: string) =>
  calls.filter((call) => call.method === method && call.url === url);

describe('contacts list', () => {
  it('lists contacts with a count, links and "Load more"', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/contacts', { host: WORKSPACE });

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeInTheDocument();
    expect(await screen.findByText('2 contacts')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Contacts' });
    expect(within(list).getByRole('link', { name: 'Neha Iyer' })).toHaveAttribute(
      'href',
      '/contacts/c1',
    );
    expect(within(list).getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/companies/co1',
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await within(list).findByText('Arjun Mehta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(sent(calls, 'GET', '/api/v1/contacts').at(-1)?.query).toContain('cursor=page-2');
    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
  });

  it('searches, sorts and filters by company', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/contacts', { host: WORKSPACE });
    await screen.findByText('2 contacts');

    await user.type(screen.getByLabelText('Search contacts'), 'nobody');
    expect(await screen.findByText('No contacts match.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Sort'), 'updated');
    await user.click(screen.getByRole('button', { name: /Company/ }));
    await user.click(await screen.findByRole('button', { name: /^Acme/ }));
    await waitFor(() => {
      const query = sent(calls, 'GET', '/api/v1/contacts').at(-1)?.query ?? '';
      expect(query).toContain('q=nobody');
      expect(query).toContain('sort=updated');
      expect(query).toContain('companyId=co1');
    });
  });
});

describe('adding a contact', () => {
  it('checks the form, sends the contact, and opens it', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/contacts', { host: WORKSPACE });
    await user.click(nth(await screen.findAllByRole('button', { name: 'Add contact' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a contact' });

    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }));
    expect(within(drawer).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(drawer).getByText('Enter an email or a phone number.')).toBeInTheDocument();
    expect(sent(calls, 'POST', '/api/v1/contacts')).toHaveLength(0);

    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Sara Khan');
    await user.type(within(drawer).getByRole('textbox', { name: 'Email' }), ' sara@acme.com ');
    await user.click(within(drawer).getByRole('button', { name: 'Add another email' }));
    await user.type(within(drawer).getByLabelText('Other email 1'), 'sara@gmail.com');
    expect(
      within(drawer).getByText("Left empty, it's matched by the email's domain."),
    ).toBeVisible();
    // The dropdown starts at its default; the archived field is not offered.
    expect(within(drawer).getByLabelText('Plan')).toHaveDisplayValue('Basic');
    expect(within(drawer).queryByLabelText(/Seats/)).not.toBeInTheDocument();
    await user.type(within(drawer).getByRole('textbox', { name: /Region/ }), 'South');
    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/contacts/c9');
    });
    expect(sent(calls, 'POST', '/api/v1/contacts')[0]?.body).toEqual({
      name: 'Sara Khan',
      email: 'sara@acme.com',
      otherEmails: ['sara@gmail.com'],
      phone: null,
      jobTitle: null,
      note: null,
      customFields: { plan: 'ch1', region: 'South' },
    });
    expect(await screen.findByText('Contact added.')).toBeInTheDocument();
  });

  it('shows the API messages next to the right fields', async () => {
    directoryApi();
    server.use(
      http.post(apiUrl('/api/v1/contacts'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [
            { field: 'email', message: 'This email belongs to Neha Iyer.' },
            { field: 'otherEmails.0', message: 'This email is already listed.' },
            { field: 'customFields.region', message: 'Region is required.' },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/contacts', { host: WORKSPACE });
    await user.click(nth(await screen.findAllByRole('button', { name: 'Add contact' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a contact' });
    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Copy');
    await user.type(within(drawer).getByRole('textbox', { name: 'Email' }), 'neha@acme.com');
    await user.click(within(drawer).getByRole('button', { name: 'Add another email' }));
    await user.type(within(drawer).getByLabelText('Other email 1'), 'neha@acme.com');
    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }));

    expect(await within(drawer).findByText('This email belongs to Neha Iyer.')).toBeVisible();
    expect(within(drawer).getByText('This email is already listed.')).toBeVisible();
    expect(within(drawer).getByText('Region is required.')).toBeVisible();
  });
});

describe('a contact', () => {
  it('shows details, custom fields (archived ones with a value) and their tickets', async () => {
    directoryApi();
    renderRoute('/contacts/c1', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Neha Iyer' })).toBeInTheDocument();
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByRole('link', { name: /neha@acme.com/ })).toHaveAttribute(
      'href',
      'mailto:neha@acme.com',
    );
    expect(within(details).getByRole('link', { name: /98765/ })).toHaveAttribute(
      'href',
      'tel:+919876543210',
    );
    expect(within(details).getByText('neha.iyer@gmail.com')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/companies/co1',
    );
    expect(within(details).getByText('Premium')).toBeInTheDocument();
    expect(within(details).getByText('31 Dec 2026')).toBeInTheDocument();
    expect(within(details).getByText('1,200')).toBeInTheDocument();
    expect(within(details).getByText('(archived)')).toBeInTheDocument();
    expect(within(details).getByText('Prefers phone calls.')).toBeInTheDocument();
    const tickets = screen.getByRole('region', { name: 'Tickets' });
    expect(await within(tickets).findByRole('link', { name: 'Payroll stuck' })).toHaveAttribute(
      'href',
      '/tickets/7',
    );
    expect(within(tickets).getByRole('link', { name: 'New ticket' })).toHaveAttribute(
      'href',
      '/tickets/new?contact=c1',
    );
  });

  it('labels a merged ticket with the ticket it went into, not just "Closed"', async () => {
    directoryApi();
    server.use(
      http.get(apiUrl('/api/v1/tickets'), () =>
        HttpResponse.json({
          tickets: [{ ...NEHA_TICKET, status: 'closed', mergedInto: { number: 9 } }],
          nextCursor: null,
          total: 1,
        }),
      ),
    );
    renderRoute('/contacts/c1', { host: WORKSPACE });
    const tickets = await screen.findByRole('region', { name: 'Tickets' });
    expect(await within(tickets).findByText('Merged into #9')).toBeInTheDocument();
    expect(within(tickets).queryByText('Closed')).not.toBeInTheDocument();
  });

  it('edits only what changed', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/contacts/c1', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Neha Iyer' });
    // The archived field keeps its value but can't be changed.
    expect(within(drawer).getByLabelText(/Seats \(archived\)/)).toBeDisabled();
    await user.clear(within(drawer).getByRole('textbox', { name: 'Job title' }));
    await user.type(within(drawer).getByRole('textbox', { name: 'Job title' }), 'CIO');
    await user.click(within(drawer).getByRole('button', { name: 'Remove other email 1' }));
    await user.selectOptions(within(drawer).getByLabelText('Plan'), 'ch1');
    await user.type(within(drawer).getByRole('textbox', { name: /Region/ }), 'North');
    await user.click(within(drawer).getByRole('button', { name: 'Save contact' }));

    expect(await screen.findByText('Contact saved.')).toBeInTheDocument();
    expect(sent(calls, 'PATCH', '/api/v1/contacts/c1')[0]?.body).toEqual({
      jobTitle: 'CIO',
      otherEmails: [],
      customFields: { plan: 'ch1', region: 'North' },
    });
  });

  it('lets supervisors delete after asking; agents see no delete', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/contacts/c1', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete contact' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Neha Iyer?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete contact' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/contacts');
    });
    expect(sent(calls, 'DELETE', '/api/v1/contacts/c1')).toHaveLength(1);
  });

  it('hides delete from agents', async () => {
    directoryApi(agentMe);
    renderRoute('/contacts/c1', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('explains a contact that no longer exists', async () => {
    directoryApi();
    renderRoute('/contacts/c404', { host: WORKSPACE });
    expect(await screen.findByText("This contact doesn't exist")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to contacts' })).toHaveAttribute(
      'href',
      '/contacts',
    );
  });
});

describe('companies', () => {
  it('lists companies with domains and contact counts', async () => {
    directoryApi();
    renderRoute('/companies', { host: WORKSPACE });
    expect(await screen.findByText('2 companies')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Companies' });
    const rows = within(list).getAllByRole('listitem');
    expect(within(nth(rows, 0)).getByText('acme.com')).toBeInTheDocument();
    expect(within(nth(rows, 0)).getByText('1 contact')).toBeInTheDocument();
    expect(within(nth(rows, 1)).getByText('0 contacts')).toBeInTheDocument();
  });

  it('shows a company with its contacts, and its delete explains what happens to them', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/companies/co1', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acme.com' })).toHaveAttribute(
      'href',
      'https://acme.com',
    );
    const contacts = screen.getByRole('region', { name: 'Contacts' });
    expect(await within(contacts).findByRole('link', { name: 'Neha Iyer' })).toBeInTheDocument();
    expect(sent(calls, 'GET', '/api/v1/contacts')[0]?.query).toContain('companyId=co1');

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete company' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Acme?' });
    expect(within(dialog).getByText(/Its 1 contact stays, without a company/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete company' }));
    expect(await screen.findByText('Company deleted. Its contacts were kept.')).toBeInTheDocument();
  });

  it('maps domain messages to the right box when blank boxes are left out', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/companies', { host: WORKSPACE });
    await user.click(nth(await screen.findAllByRole('button', { name: 'Add company' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a company' });
    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Initech');
    await user.type(within(drawer).getByLabelText('Domain 1'), 'initech.com');
    await user.click(within(drawer).getByRole('button', { name: 'Add another domain' }));
    await user.click(within(drawer).getByRole('button', { name: 'Add another domain' }));
    await user.type(within(drawer).getByLabelText('Domain 3'), 'gmail.com');
    await user.click(within(drawer).getByRole('button', { name: 'Add company' }));

    expect(await within(drawer).findByText('gmail.com is a free email service.')).toBeVisible();
    expect(within(drawer).getByLabelText('Domain 3')).toHaveAttribute('aria-invalid', 'true');
    expect(sent(calls, 'POST', '/api/v1/companies')[0]?.body).toMatchObject({
      name: 'Initech',
      domains: ['initech.com', 'gmail.com'],
    });
  });
});

describe('more contact and company flows', () => {
  it('sends "no company" when it is chosen, and closes an unchanged edit without a request', async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/contacts', { host: WORKSPACE });
    await user.click(nth(await screen.findAllByRole('button', { name: 'Add contact' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a contact' });
    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Walk-in');
    await user.type(within(drawer).getByRole('textbox', { name: 'Phone' }), '044 1234');
    await user.type(within(drawer).getByRole('textbox', { name: /Region/ }), 'West');
    await user.click(within(drawer).getByRole('button', { name: /Company/ }));
    await user.type(await screen.findByRole('searchbox', { name: 'Search companies' }), 'zzz');
    await user.clear(screen.getByRole('searchbox', { name: 'Search companies' }));
    await user.click(await screen.findByRole('button', { name: 'No company' }));
    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }));
    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/contacts')[0]?.body).toMatchObject({
        name: 'Walk-in',
        email: null,
        phone: '044 1234',
        companyId: null,
      });
    });

    await router.navigate('/contacts/c1');
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit Neha Iyer' });
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit Neha Iyer' })).getByRole('button', {
        name: 'Save contact',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(sent(calls, 'PATCH', '/api/v1/contacts/c1')).toHaveLength(0);
  });

  it('retries a list that failed to load, and explains other errors on a contact', async () => {
    directoryApi();
    let failing = true;
    server.use(
      http.get(apiUrl('/api/v1/contacts'), () =>
        failing
          ? apiError(500, 'INTERNAL', 'Something went wrong.')
          : HttpResponse.json({ contacts: [summary(neha)], nextCursor: null, total: 1 }),
      ),
      http.get(apiUrl('/api/v1/contacts/:id'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/contacts', { host: WORKSPACE });
    const retry = await screen.findByRole('button', { name: /Try again/ });
    failing = false;
    await user.click(retry);
    expect(await screen.findByText('1 contact')).toBeInTheDocument();
    await router.navigate('/contacts/c1');
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('edits a company, sending only what changed', async () => {
    const calls = directoryApi();
    server.use(
      http.patch(apiUrl('/api/v1/companies/:id'), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: 'PATCH', url: '/api/v1/companies/co1', query: '', body });
        return HttpResponse.json({ ...acme, ...body });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/companies/co1', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Acme' });
    await user.click(within(drawer).getByRole('button', { name: 'Add another domain' }));
    await user.type(within(drawer).getByLabelText('Domain 2'), 'acme.in');
    await user.click(within(drawer).getByRole('button', { name: 'Remove domain 1' }));
    await user.clear(within(drawer).getByRole('textbox', { name: 'Website' }));
    await user.type(within(drawer).getByRole('textbox', { name: 'Phone' }), '080 1234');
    await user.type(within(drawer).getByRole('textbox', { name: 'Note' }), 'Key account');
    await user.click(within(drawer).getByRole('button', { name: 'Save company' }));
    expect(await screen.findByText('Company saved.')).toBeInTheDocument();
    expect(sent(calls, 'PATCH', '/api/v1/companies/co1')[0]?.body).toEqual({
      domains: ['acme.in'],
      phone: '080 1234',
      website: null,
      note: 'Key account',
    });
  });

  it("adds a contact from a company's page with that company chosen", async () => {
    const calls = directoryApi();
    const user = userEvent.setup();
    renderRoute('/companies/co1', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Contacts' });
    await user.click(nth(within(section).getAllByRole('button', { name: 'Add contact' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a contact' });
    expect(within(drawer).getByRole('button', { name: /Company Acme/ })).toBeInTheDocument();
    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Ravi');
    await user.type(within(drawer).getByRole('textbox', { name: 'Email' }), 'ravi@acme.com');
    await user.type(within(drawer).getByRole('textbox', { name: /Region/ }), 'East');
    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }));
    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/contacts')[0]?.body).toMatchObject({ companyId: 'co1' });
    });
  });

  it('searches companies and adds one', async () => {
    const calls = directoryApi();
    server.use(
      http.post(apiUrl('/api/v1/companies'), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: 'POST', url: '/api/v1/companies', query: '', body });
        return HttpResponse.json({ ...acme, id: 'co9', name: 'Initech' });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/companies', { host: WORKSPACE });
    await user.type(await screen.findByLabelText('Search companies'), 'glob');
    await waitFor(() => {
      expect(sent(calls, 'GET', '/api/v1/companies').at(-1)?.query).toContain('q=glob');
    });
    await user.click(nth(screen.getAllByRole('button', { name: 'Add company' })));
    const drawer = await screen.findByRole('dialog', { name: 'Add a company' });
    await user.click(within(drawer).getByRole('button', { name: 'Add company' }));
    expect(within(drawer).getByText('Enter a name.')).toBeInTheDocument();
    await user.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Initech');
    await user.click(within(drawer).getByRole('button', { name: 'Add company' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/companies/co9');
    });
  });
});

describe('custom field values', () => {
  it('formats values for reading', () => {
    const multi = field({ type: 'multi_select' });
    expect(formatCustomValue(multi, ['ch1', 'ch2'])).toBe('Basic, Premium');
    expect(
      formatCustomValue(
        field({ choices: [{ id: 'x', label: 'Old', removed: true, isDefault: false }] }),
        'x',
      ),
    ).toBe('Old (removed)');
    expect(formatCustomValue(field({}), 'gone')).toBe('Unknown choice');
    expect(formatCustomValue(field({ type: 'checkbox' }), false)).toBe('No');
    expect(formatCustomValue(field({ type: 'decimal' }), 1999.5)).toBe('1,999.5');
    expect(formatCustomValue(field({ type: 'paragraph' }), 'Two\nlines')).toBe('Two\nlines');
  });

  it('starts new records with defaults and sends only changed values', () => {
    expect(
      defaultValues([
        field({}),
        field({ key: 'mods', type: 'multi_select' }),
        field({ key: 'vip', type: 'checkbox', checkboxDefault: false, choices: [] }),
        field({ key: 'gone', archived: true }),
      ]),
    ).toEqual({ plan: 'ch1', mods: ['ch1'], vip: false });
    expect(
      changedValues({ a: 1, b: ['x'], c: 'same' }, { a: 2, b: null, c: 'same', d: 'new' }),
    ).toEqual({
      a: 2,
      b: null,
      d: 'new',
    });
  });
});
