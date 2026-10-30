import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { CustomField, Me, Ticket, TicketActivity } from '../../api/generated/model';
import type * as TicketsApi from '../../api/generated/tickets/tickets';
import { ApiError } from '../../api/http';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

// jsdom's File can't be sent with fetch (the request aborts), so uploads are stubbed here; the
// end-to-end test sends real files.
vi.mock('../../api/generated/tickets/tickets', async (importOriginal) => {
  const actual = await importOriginal<typeof TicketsApi>();
  return {
    ...actual,
    postApiV1Attachments: vi.fn((options?: RequestInit) => {
      const file = (options?.body as FormData).get('file') as File;
      return file.name.endsWith('.exe')
        ? Promise.reject(
            new ApiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
              fields: [
                {
                  field: 'file',
                  message: ".exe files can run programs, so they can't be attached.",
                },
              ],
            }),
          )
        : Promise.resolve({
            id: `att-${file.name}`,
            fileName: file.name,
            contentType: 'text/plain',
            size: 2048,
          });
    }),
  };
});

const agentMe: Me = { ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] };
const NOW = new Date().toISOString();

const TICKET: Ticket = {
  id: 'tk1',
  number: 42,
  subject: "Employees can't mark attendance",
  description: 'Since this morning.\nAll branches.',
  status: 'open',
  priority: 'medium',
  type: null,
  source: 'agent',
  contact: { id: 'c1', name: 'Neha Iyer', email: 'neha@acme.com' },
  company: { id: 'co1', name: 'Acme' },
  team: null,
  assignee: null,
  tags: ['attendance'],
  customFields: {},
  createdBy: { userId: 'u1', name: 'Ravi Shankar' },
  resolvedAt: null,
  closedAt: null,
  firstResponseAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  due: null,
  sla: null,
  mergedInto: null,
  ccEmails: [],
};

const ROOT_CAUSE: CustomField = {
  id: 'f1',
  recordType: 'ticket',
  key: 'root_cause',
  label: 'Root cause',
  type: 'text',
  helpText: null,
  required: 'on_resolve',
  checkboxDefault: null,
  choices: [],
  position: 1,
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as CustomField;

const HISTORY: TicketActivity[] = [
  {
    id: 'a1',
    at: NOW,
    actor: { userId: 'u1', name: 'Ravi Shankar' },
    action: 'created',
    changes: [],
  },
  {
    id: 'a2',
    at: NOW,
    actor: { userId: 'u2', name: 'Arjun Mehta' },
    action: 'updated',
    changes: [
      { field: 'status', from: 'open', to: 'pending' },
      { field: 'team', from: null, to: 'Billing' },
      { field: 'customFields.root_cause', label: 'Root cause', from: null, to: 'Config' },
      { field: 'tags', from: ['old'], to: ['attendance'] },
    ],
  },
];

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const MESSAGES = [
  {
    id: 'm1',
    kind: 'reply',
    body: 'We are looking into it.',
    bodyHtml: null,
    author: { type: 'member', userId: 'u1', name: 'Ravi Shankar' },
    to: ['neha@acme.com'],
    cc: ['boss@acme.com'],
    mentions: [],
    emailStatus: 'queued',
    emailSentAt: null,
    emailError: null,
    attachments: [
      { id: 'f1', fileName: 'steps.pdf', contentType: 'application/pdf', size: 1536000 },
    ],
    createdAt: NOW,
  },
  {
    id: 'm2',
    kind: 'note',
    body: '@Arjun Mehta please check the device logs',
    bodyHtml: null,
    author: { type: 'member', userId: 'u1', name: 'Ravi Shankar' },
    to: [],
    cc: [],
    mentions: [{ userId: 'u2', name: 'Arjun Mehta' }],
    emailStatus: null,
    emailSentAt: null,
    emailError: null,
    attachments: [],
    createdAt: NOW,
  },
  {
    id: 'm3',
    kind: 'forward',
    body: 'FYI',
    bodyHtml: null,
    author: { type: 'member', userId: 'u2', name: 'Arjun Mehta' },
    to: ['vendor@devices.com'],
    cc: [],
    mentions: [],
    emailStatus: 'sent',
    emailSentAt: NOW,
    emailError: null,
    attachments: [],
    createdAt: NOW,
  },
];

const VIEWS = [
  {
    id: 'v1',
    name: 'Team queue',
    filters: { assignee: ['none'] },
    sort: 'oldest',
    shared: true,
    mine: false,
    ownerName: 'Ravi Shankar',
    canEdit: false,
  },
  {
    id: 'v2',
    name: 'Urgent refunds',
    filters: { priority: ['urgent'], tag: ['refund'] },
    sort: 'updated',
    shared: false,
    mine: true,
    ownerName: 'Ravi Shankar',
    canEdit: true,
  },
];

/** The query string of every list request, in order. */
let searches: string[] = [];

function ticketsApi({
  session = me,
  ticket = TICKET,
  list = [TICKET],
}: { session?: Me; ticket?: Ticket; list?: Ticket[] } = {}) {
  const calls: Call[] = [];
  searches = [];
  const record = async (request: Request) => {
    const body: unknown = request.headers.get('content-type')?.includes('json')
      ? await request.json()
      : null;
    calls.push({ method: request.method, url: new URL(request.url).pathname, body });
    return body as Record<string, unknown>;
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/custom-fields'), ({ request }) =>
      HttpResponse.json({
        standardFields: [],
        fields:
          new URL(request.url).searchParams.get('recordType') === 'ticket' ? [ROOT_CAUSE] : [],
      }),
    ),
    http.get(apiUrl('/api/v1/teams'), () =>
      HttpResponse.json({
        teams: [
          {
            id: 't1',
            name: 'Billing',
            description: null,
            members: [
              {
                userId: 'u2',
                name: 'Arjun Mehta',
                email: 'arjun@acme.test',
                role: 'agent',
                status: 'active',
                isLead: false,
              },
            ],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    ),
    http.get(apiUrl('/api/v1/contacts'), () =>
      HttpResponse.json({
        contacts: [
          {
            id: 'c1',
            name: 'Neha Iyer',
            email: 'neha@acme.com',
            phone: null,
            jobTitle: null,
            company: { id: 'co1', name: 'Acme' },
            updatedAt: NOW,
          },
          {
            id: 'c2',
            name: 'Arjun Mehta',
            email: 'arjun@acme.com',
            phone: null,
            jobTitle: null,
            company: null,
            updatedAt: NOW,
          },
        ],
        nextCursor: null,
        total: 2,
      }),
    ),
    http.get(apiUrl('/api/v1/tickets/tags'), () => HttpResponse.json({ tags: ['attendance'] })),
    http.get(apiUrl('/api/v1/ticket-views'), () => HttpResponse.json({ views: VIEWS })),
    http.post(apiUrl('/api/v1/ticket-views'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...VIEWS[1], ...body, id: 'v9', mine: true, canEdit: true });
    }),
    http.patch(apiUrl('/api/v1/ticket-views/:id'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...VIEWS[1], ...body });
    }),
    http.delete(apiUrl('/api/v1/ticket-views/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(apiUrl('/api/v1/people'), () =>
      HttpResponse.json({
        people: [
          { userId: 'u1', name: 'Ravi Shankar', role: 'admin', status: 'active' },
          { userId: 'u2', name: 'Arjun Mehta', role: 'agent', status: 'active' },
        ],
      }),
    ),
    http.get(apiUrl('/api/v1/tickets'), ({ request }) => {
      searches.push(new URL(request.url).search);
      const deleted = new URL(request.url).searchParams.get('deleted') === 'true';
      const shown = list.filter((item) => (item.deletedAt !== null) === deleted);
      return HttpResponse.json({ tickets: shown, nextCursor: null, total: shown.length });
    }),
    http.get(apiUrl('/api/v1/tickets/:number'), () => HttpResponse.json(ticket)),
    http.get(apiUrl('/api/v1/tickets/:number/activity'), () =>
      HttpResponse.json({ activity: HISTORY }),
    ),
    http.get(apiUrl('/api/v1/tickets/:number/messages'), () =>
      HttpResponse.json({ messages: MESSAGES, descriptionFiles: [] }),
    ),
    http.post(apiUrl('/api/v1/tickets/:number/messages'), async ({ request }) => {
      await record(request);
      return HttpResponse.json({ messages: MESSAGES, descriptionFiles: [] });
    }),
    http.delete(apiUrl('/api/v1/attachments/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/api/v1/tickets'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...TICKET, number: 43, subject: String(body.subject) });
    }),
    http.patch(apiUrl('/api/v1/tickets/:number'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...ticket, ...body, updatedAt: new Date().toISOString() });
    }),
    http.delete(apiUrl('/api/v1/tickets/:number'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/api/v1/tickets/:number/restore'), async ({ request }) => {
      await record(request);
      return HttpResponse.json({ ...ticket, deletedAt: null });
    }),
  );
  return calls;
}

describe('ticket list', () => {
  const lastSearch = () => new URLSearchParams(searches.at(-1));
  /** The views open from the page title, which names the current view (Step 5b). */
  const openViews = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    await user.click(await screen.findByRole('button', { name: title }));
    return screen.findByRole('navigation', { name: 'Views' });
  };

  it('starts at All unresolved and lists tickets, each opening its ticket', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'All unresolved' })).toBeInTheDocument();
    expect(await screen.findByText('1 ticket')).toBeInTheDocument();
    expect(lastSearch().get('status')).toBe('open,pending,waiting_on_customer');
    const list = screen.getByRole('list', { name: 'Tickets' });
    expect(
      within(list).getByRole('link', { name: "Employees can't mark attendance" }),
    ).toHaveAttribute('href', '/tickets/42');
    expect(within(list).getByText('Medium')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status: 3' })).toBeInTheDocument();
    const views = await openViews(user, 'All unresolved');
    expect(within(views).getByRole('button', { name: 'All unresolved' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('switches views, and keeps shared and own views apart', async () => {
    ticketsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets', { host: WORKSPACE });
    let views = await openViews(user, 'All unresolved');
    await user.click(within(views).getByRole('button', { name: 'My unresolved' }));
    await waitFor(() => {
      expect(lastSearch().get('assignee')).toBe('me');
    });
    // Choosing a view closes the list; the title now names it.
    expect(screen.queryByRole('navigation', { name: 'Views' })).not.toBeInTheDocument();
    views = await openViews(user, 'My unresolved');
    await user.click(await within(views).findByRole('button', { name: 'Team queue' }));
    await waitFor(() => {
      expect(lastSearch().get('sort')).toBe('oldest');
    });
    expect(router.state.location.search).toBe('?view=v1&assignee=none&sort=oldest');
    views = await openViews(user, 'Team queue');
    // Shared views of others can't be changed here; your own can.
    expect(
      within(views).queryByRole('button', { name: 'Actions for view Team queue' }),
    ).not.toBeInTheDocument();
    expect(
      within(views).getByRole('button', { name: 'Actions for view Urgent refunds' }),
    ).toBeInTheDocument();
  });

  it('filters, searches and orders, and saves the result as a view', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets', { host: WORKSPACE });
    await screen.findByText('1 ticket');

    await user.click(screen.getByRole('button', { name: 'Priority' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Urgent' }));
    await user.click(screen.getByRole('checkbox', { name: 'High' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Assignee' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Arjun Mehta' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await user.type(await screen.findByLabelText('Another tag'), 'Refund{Enter}');
    await user.keyboard('{Escape}');
    await user.selectOptions(screen.getByLabelText('Order'), 'Highest priority');
    await user.type(screen.getByLabelText('Search', { exact: true }), 'payroll');
    await waitFor(() => {
      expect(lastSearch().get('q')).toBe('payroll');
    });
    expect(Object.fromEntries(lastSearch())).toEqual({
      status: 'open,pending,waiting_on_customer',
      priority: 'urgent,high',
      assignee: 'u2',
      tag: 'refund',
      q: 'payroll',
      sort: 'priority',
    });
    expect(screen.getByRole('button', { name: 'Priority: High, Urgent' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    const drawer = await screen.findByRole('dialog', { name: 'Save view' });
    await user.type(within(drawer).getByLabelText(/^Name/), 'Payroll fires');
    await user.click(within(drawer).getByLabelText('Share with everyone in the workspace'));
    await user.click(within(drawer).getByRole('button', { name: 'Save view' }));
    expect(await screen.findByText('View saved.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      url: '/api/v1/ticket-views',
      body: {
        name: 'Payroll fires',
        filters: {
          status: ['open', 'pending', 'waiting_on_customer'],
          priority: ['urgent', 'high'],
          assignee: ['u2'],
          tag: ['refund'],
          q: 'payroll',
        },
        sort: 'priority',
        shared: true,
      },
    });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('view')).toBe('v9');
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.state.location.search).toBe('?view=all&sort=priority');
  });

  it('updates, renames and deletes your own view', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets?view=v2&priority=urgent&tag=refund', { host: WORKSPACE });
    await screen.findByRole('heading', { name: 'Urgent refunds' });
    expect(screen.queryByRole('button', { name: 'Update view' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Priority/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'High' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Update view' }));
    expect(await screen.findByText('View Urgent refunds updated.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({
      filters: { priority: ['urgent', 'high'], tag: ['refund'] },
      sort: 'updated',
    });

    await openViews(user, 'Urgent refunds');
    await user.click(screen.getByRole('button', { name: 'Actions for view Urgent refunds' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename or share' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Urgent refunds' });
    await user.clear(within(drawer).getByLabelText(/^Name/));
    await user.type(within(drawer).getByLabelText(/^Name/), 'Refunds');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('View updated.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: 'PATCH',
      url: '/api/v1/ticket-views/v2',
      body: { name: 'Refunds' },
    });

    await openViews(user, 'Urgent refunds');
    await user.click(screen.getByRole('button', { name: 'Actions for view Urgent refunds' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete view' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete view' }),
    );
    expect(await screen.findByText('View Urgent refunds deleted.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({ method: 'DELETE', url: '/api/v1/ticket-views/v2', body: null });
  });

  it('says when nothing matches, and lets admins open the trash', async () => {
    ticketsApi({ list: [] });
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
    await openViews(user, 'All unresolved');
    await user.click(screen.getByRole('button', { name: 'All tickets' }));
    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Priority' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Low' }));
    await user.keyboard('{Escape}');
    expect(await screen.findByText('No tickets match')).toBeInTheDocument();
    await openViews(user, 'All tickets');
    await user.click(screen.getByRole('button', { name: 'Trash' }));
    expect(await screen.findByText('The trash is empty')).toBeInTheDocument();
    expect(lastSearch().get('deleted')).toBe('true');
  });

  it('hides the trash and sharing from agents', async () => {
    ticketsApi({ session: agentMe });
    const user = userEvent.setup();
    renderRoute('/tickets?view=trash', { host: WORKSPACE });
    await screen.findByText('1 ticket');
    const views = await openViews(user, 'Tickets');
    expect(within(views).queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(lastSearch().get('deleted')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Priority' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Low' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    const drawer = await screen.findByRole('dialog', { name: 'Save view' });
    expect(
      within(drawer).queryByLabelText('Share with everyone in the workspace'),
    ).not.toBeInTheDocument();
  });

  it('puts every filter and the order in a sheet on phones', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    await screen.findByText('1 ticket');
    // The status filter of All unresolved counts as one.
    await user.click(screen.getByRole('button', { name: 'Filters (1)' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    await user.click(within(sheet).getByRole('button', { name: 'Priority' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Urgent' }));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(lastSearch().get('priority')).toBe('urgent');
    });
    await user.selectOptions(within(sheet).getByLabelText('Order'), 'Highest priority');
    await waitFor(() => {
      expect(lastSearch().get('sort')).toBe('priority');
    });
    await user.click(within(sheet).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => {
      expect(lastSearch().get('priority')).toBeNull();
    });
    await user.click(within(sheet).getByRole('button', { name: 'Show 1 ticket' }));
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('opens a search from the top bar', async () => {
    ticketsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/contacts', { host: WORKSPACE });
    server.use(
      http.get(apiUrl('/api/v1/contacts'), () =>
        HttpResponse.json({ contacts: [], nextCursor: null, total: 0 }),
      ),
      http.get(apiUrl('/api/v1/companies'), () =>
        HttpResponse.json({ companies: [], nextCursor: null, total: 0 }),
      ),
    );
    const box = within(await screen.findByRole('search')).getByRole('searchbox');
    await user.type(box, 'payslip{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets');
    });
    expect(router.state.location.search).toBe('?view=all&q=payslip');
  });
});

describe('new ticket', () => {
  it('creates a ticket for an existing contact and opens it', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets/new', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'New ticket' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(screen.getByText('Enter a subject.')).toBeInTheDocument();
    expect(screen.getByText('Choose who raised this ticket.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Requester/ }));
    const contacts = await screen.findByRole('list', { name: 'Contacts' });
    await user.click(await within(contacts).findByText('Arjun Mehta'));
    await user.type(screen.getByLabelText(/^Subject/), 'Payslip missing');
    await user.type(screen.getByLabelText('Description'), 'October payslip');
    await user.selectOptions(screen.getByLabelText('Priority'), 'High');
    await user.selectOptions(await screen.findByLabelText('Team'), 'Billing');
    await user.type(screen.getByLabelText('Tags'), 'Payroll{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets/43');
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      url: '/api/v1/tickets',
      body: {
        subject: 'Payslip missing',
        description: 'October payslip',
        contactId: 'c2',
        status: 'open',
        priority: 'high',
        type: null,
        teamId: 't1',
        assigneeUserId: null,
        tags: ['payroll'],
        customFields: {},
      },
    });
    expect(await screen.findByText('Ticket #43 created.')).toBeInTheDocument();
  });

  it('adds a new requester by name and email', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/new', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: /Requester/ }));
    await user.type(await screen.findByLabelText('Search contacts'), 'kavya@globex.com');
    await user.click(screen.getByRole('button', { name: /New contact/ }));
    const fieldset = screen.getByRole('group', { name: 'New contact' });
    expect(within(fieldset).getByLabelText('Email')).toHaveValue('kavya@globex.com');
    await user.type(within(fieldset).getByLabelText(/^Name/), 'Kavya Rao');
    await user.type(screen.getByLabelText(/^Subject/), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => {
      expect(calls[0]?.body).toMatchObject({
        contact: { name: 'Kavya Rao', email: 'kavya@globex.com', phone: null },
      });
    });
  });

  it('shows the API’s messages next to their fields', async () => {
    ticketsApi();
    server.use(
      http.post(apiUrl('/api/v1/tickets'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'tags.0', message: 'Keep tags to 40 characters.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/tickets/new?contact=c1', { host: WORKSPACE });
    server.use(
      http.get(apiUrl('/api/v1/contacts/:id'), () =>
        HttpResponse.json({ id: 'c1', name: 'Neha Iyer', email: 'neha@acme.com' }),
      ),
    );
    expect(await screen.findByText('Neha Iyer (neha@acme.com)')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Subject/), 'X');
    await user.type(screen.getByLabelText('Tags'), 'abc{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(await screen.findByText('Keep tags to 40 characters.')).toBeInTheDocument();
  });
});

/** The reply bar opens the composer on its usual tab: a reply, or a note without an email. */
async function openComposer(user: ReturnType<typeof userEvent.setup>) {
  const bar = await screen.findByRole('group', { name: 'Write on this ticket' });
  const [start] = within(bar).getAllByRole('button');
  if (start) await user.click(start);
  return screen.findByRole('region', { name: 'Write' });
}

describe('a ticket', () => {
  it('shows the conversation: description, replies, notes, forwards, files and changes', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: /Employees can't mark attendance/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/raised by Neha Iyer/)).toBeInTheDocument();
    const conversation = await screen.findByRole('region', { name: 'Conversation' });
    const description = within(conversation).getByRole('article', {
      name: 'Neha Iyer raised the ticket',
    });
    expect(description).toHaveTextContent('Since this morning. All branches.');
    expect(description).toHaveTextContent('logged by Ravi Shankar');

    const reply = within(conversation).getByRole('article', { name: 'Ravi Shankar replied' });
    expect(reply).toHaveTextContent('To neha@acme.com · Cc boss@acme.com');
    expect(reply).toHaveTextContent('Sending');
    expect(within(reply).getByRole('link', { name: /steps.pdf/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/attachments/f1') as string,
    );
    expect(within(reply).getByText('1.5 MB')).toBeInTheDocument();
    const note = within(conversation).getByRole('article', {
      name: 'Ravi Shankar added a private note',
    });
    expect(within(note).getByText('@Arjun Mehta')).toHaveProperty('tagName', 'STRONG');
    expect(
      within(conversation).getByRole('article', {
        name: 'Arjun Mehta forwarded the ticket to vendor@devices.com',
      }),
    ).toHaveTextContent('Sent');

    expect(conversation).toHaveTextContent(
      'Arjun Mehta changed the status from Open to Pending; changed the team from no team to Billing; changed Root cause from empty to Config; added tags attendance and removed tags old.',
    );
    await user.click(within(conversation).getByLabelText('Show changes'));
    expect(conversation).not.toHaveTextContent('changed the status');

    const requester = screen.getByRole('region', { name: 'Requester' });
    expect(within(requester).getByRole('link', { name: 'Neha Iyer' })).toHaveAttribute(
      'href',
      '/contacts/c1',
    );
  });

  it("shows a ticket raised by email with its files and the customer's replies", async () => {
    ticketsApi({ ticket: { ...TICKET, source: 'email', createdBy: null } });
    server.use(
      http.get(apiUrl('/api/v1/tickets/:number/messages'), () =>
        HttpResponse.json({
          messages: [
            {
              ...MESSAGES[0],
              id: 'm9',
              kind: 'customer',
              body: 'Here is the screenshot.',
              author: { type: 'contact', contactId: 'c1', name: 'Neha Iyer' },
              emailStatus: null,
              attachments: [
                { id: 'f9', fileName: 'error.png', contentType: 'image/png', size: 2048 },
              ],
            },
          ],
          descriptionFiles: [
            { id: 'f8', fileName: 'payslip.pdf', contentType: 'application/pdf', size: 4096 },
          ],
        }),
      ),
    );
    renderRoute('/tickets/42', { host: WORKSPACE });
    expect(await screen.findByText(/raised by Neha Iyer by email/)).toBeInTheDocument();
    const conversation = await screen.findByRole('region', { name: 'Conversation' });
    const description = within(conversation).getByRole('article', {
      name: 'Neha Iyer raised the ticket',
    });
    expect(description).toHaveTextContent('raised the ticket by email');
    expect(within(description).getByRole('link', { name: /payslip.pdf/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/attachments/f8') as string,
    );
    const answer = within(conversation).getByRole('article', {
      name: 'Neha Iyer replied by email',
    });
    expect(answer).toHaveTextContent('Here is the screenshot.');
    expect(within(answer).getByRole('link', { name: /error.png/ })).toBeInTheDocument();
  });

  it('shows why a reply could not be sent, and sends it again', async () => {
    const calls = ticketsApi();
    const failed = {
      ...MESSAGES[0],
      emailStatus: 'failed',
      emailError: 'Mailbox unavailable',
      attachments: [],
    };
    server.use(
      http.get(apiUrl('/api/v1/tickets/:number/messages'), () =>
        HttpResponse.json({ messages: [failed], descriptionFiles: [] }),
      ),
      http.post(apiUrl('/api/v1/tickets/:number/messages/:messageId/resend'), ({ request }) => {
        calls.push({ method: 'POST', url: new URL(request.url).pathname, body: null });
        return HttpResponse.json({
          messages: [{ ...failed, emailStatus: 'queued', emailError: null }],
          descriptionFiles: [],
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const reply = await screen.findByRole('article', { name: 'Ravi Shankar replied' });
    expect(reply).toHaveTextContent("Couldn't send");
    expect(within(reply).getByRole('alert')).toHaveTextContent(
      "This email couldn't be sent: Mailbox unavailable",
    );
    await user.click(within(reply).getByRole('button', { name: 'Send again' }));
    expect(await screen.findByText('Sending it again.')).toBeInTheDocument();
    expect(calls.at(-1)?.url).toBe('/api/v1/tickets/42/messages/m1/resend');
    await waitFor(() => {
      expect(screen.getByRole('article', { name: 'Ravi Shankar replied' })).toHaveTextContent(
        'Sending',
      );
    });
    expect(within(reply).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('folds the editor into the reply bar and keeps what was typed', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const bar = await screen.findByRole('group', { name: 'Write on this ticket' });
    expect(within(bar).getByRole('button', { name: 'Reply to Neha Iyer…' })).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Note' }));
    const composer = await screen.findByRole('region', { name: 'Write' });
    expect(within(composer).getByRole('tab', { name: 'Private note' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.type(within(composer).getByRole('textbox', { name: 'Note' }), 'Checking logs');
    await user.click(within(composer).getByRole('button', { name: 'Close the editor' }));
    expect(screen.queryByRole('region', { name: 'Write' })).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Write on this ticket' })).getByRole('button', {
        name: 'Note',
      }),
    );
    expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue('Checking logs');
  });

  it('shows the conversation and the details as tabs on narrow screens', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const tabs = await screen.findByRole('tablist', { name: 'Ticket sections' });
    expect(within(tabs).getByRole('tab', { name: 'Conversation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(tabs).getByRole('tab', { name: 'Details' }));
    expect(within(tabs).getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('sends a reply with copies and a new status', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const composer = await openComposer(user);
    expect(within(composer).getByRole('tab', { name: 'Reply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(composer).toHaveTextContent('To Neha Iyer <neha@acme.com>');
    await user.click(within(composer).getByRole('button', { name: 'Send reply' }));
    expect(within(composer).getByText('Write a message or attach a file.')).toBeInTheDocument();

    await user.type(within(composer).getByLabelText('Cc'), 'boss@acme.com, hr@acme.com');
    await user.type(within(composer).getByLabelText('Message'), 'Fixed now.');
    await user.selectOptions(within(composer).getByLabelText('Then set status'), 'Pending');
    await user.click(within(composer).getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Reply added. It is being emailed.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      url: '/api/v1/tickets/42/messages',
      body: {
        kind: 'reply',
        body: 'Fixed now.',
        attachmentIds: [],
        cc: ['boss@acme.com', 'hr@acme.com'],
        status: 'pending',
      },
    });
    expect(within(composer).getByLabelText('Message')).toHaveValue('');
  });

  it('drops a canned response into the reply, filled in for the ticket', async () => {
    ticketsApi();
    const filled: string[] = [];
    server.use(
      http.get(apiUrl('/api/v1/canned-responses'), () =>
        HttpResponse.json({
          cannedResponses: [
            {
              id: 'cr1',
              title: 'Password reset steps',
              body: 'Hi {{contact.first_name}}, open Settings.',
              shared: true,
              mine: false,
              authorName: 'Ravi Shankar',
              canEdit: true,
              createdAt: '2026-10-26T10:00:00.000Z',
              updatedAt: '2026-10-26T10:00:00.000Z',
            },
            {
              id: 'cr2',
              title: 'Refund policy',
              body: 'Refunds take 5 days.',
              shared: false,
              mine: true,
              authorName: 'Ravi Shankar',
              canEdit: true,
              createdAt: '2026-10-26T10:00:00.000Z',
              updatedAt: '2026-10-26T10:00:00.000Z',
            },
          ],
          placeholders: [],
        }),
      ),
      http.get(apiUrl('/api/v1/canned-responses/:id/filled'), ({ request }) => {
        filled.push(new URL(request.url).search);
        return HttpResponse.json({ body: 'Hi Neha, open Settings.' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const composer = await openComposer(user);
    await user.type(within(composer).getByLabelText('Message'), 'Thanks for waiting.');
    await user.click(within(composer).getByRole('button', { name: 'Canned response' }));
    const picker = await screen.findByRole('dialog', { name: 'Canned responses' });
    await user.type(within(picker).getByLabelText('Search canned responses'), 'password');
    expect(within(picker).queryByText('Refund policy')).toBeNull();
    await user.click(within(picker).getByRole('button', { name: /Password reset steps/ }));
    await waitFor(() => {
      expect(within(composer).getByLabelText('Message')).toHaveValue(
        'Thanks for waiting.\n\nHi Neha, open Settings.',
      );
    });
    expect(filled).toEqual(['?ticketNumber=42']);
    expect(screen.queryByRole('dialog', { name: 'Canned responses' })).toBeNull();
  });

  it('adds a private note with an @mention', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const composer = await openComposer(user);
    await user.click(within(composer).getByRole('tab', { name: 'Private note' }));
    const box = within(composer).getByLabelText('Note');
    await user.type(box, 'Can you check, @arj');
    const options = await within(composer).findByRole('listbox', { name: 'People to mention' });
    expect(within(options).getByRole('option', { name: 'Arjun Mehta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Enter}');
    expect(box).toHaveValue('Can you check, @Arjun Mehta ');
    await user.type(box, 'thanks');
    await user.click(within(composer).getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Note added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({
      kind: 'note',
      body: 'Can you check, @Arjun Mehta thanks',
      attachmentIds: [],
      mentions: ['u2'],
    });
  });

  it('forwards with files, refusing programs and removing unwanted files', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const composer = await openComposer(user);
    await user.click(within(composer).getByRole('tab', { name: 'Forward' }));
    expect(within(composer).queryByLabelText('Then set status')).not.toBeInTheDocument();
    await user.type(within(composer).getByLabelText('Message'), 'Please look');
    await user.click(within(composer).getByRole('button', { name: 'Forward' }));
    expect(within(composer).getByText('Add who to forward this ticket to.')).toBeInTheDocument();

    await user.upload(within(composer).getByLabelText('Attach files'), [
      new File(['hi'], 'log.txt', { type: 'text/plain' }),
      new File(['MZ'], 'tool.exe'),
      new File(['x'], 'extra.txt'),
    ]);
    const files = await within(composer).findByRole('list', { name: 'Files to send' });
    expect(await within(files).findByText(/can't be attached/)).toBeInTheDocument();
    expect(await within(files).findAllByText('2 KB')).toHaveLength(2);
    await user.click(within(files).getByRole('button', { name: 'Remove extra.txt' }));
    await user.click(within(files).getByRole('button', { name: 'Remove tool.exe' }));
    await user.type(within(composer).getByLabelText('To'), 'vendor@devices.com');
    await user.click(within(composer).getByRole('button', { name: 'Forward' }));
    expect(await screen.findByText('Forward added. It is being emailed.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'DELETE')).toEqual({
      method: 'DELETE',
      url: '/api/v1/attachments/att-extra.txt',
      body: null,
    });
    expect(calls.at(-1)?.body).toEqual({
      kind: 'forward',
      body: 'Please look',
      attachmentIds: ['att-log.txt'],
      to: ['vendor@devices.com'],
    });
  });

  it('starts on a note when the requester has no email', async () => {
    ticketsApi({ ticket: { ...TICKET, contact: { ...TICKET.contact, email: null } } });
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const composer = await openComposer(user);
    expect(within(composer).getByRole('tab', { name: 'Private note' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(composer).getByRole('tab', { name: 'Reply' }));
    expect(composer).toHaveTextContent("Neha Iyer has no email address, so a reply can't be sent.");
    expect(within(composer).getByRole('button', { name: 'Send reply' })).toBeDisabled();
  });

  it('updates only the changed properties, and shows refused fields', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const panel = await screen.findByRole('form', { name: 'Properties' });
    expect(within(panel).getByRole('button', { name: 'Update' })).toBeDisabled();
    // "Required when resolving" fields turn required once the status is resolved.
    expect(within(panel).getByLabelText('Root cause')).not.toBeRequired();
    await user.selectOptions(within(panel).getByLabelText('Status'), 'Resolved');
    expect(within(panel).getByLabelText(/Root cause/)).toBeRequired();

    server.use(
      http.patch(apiUrl('/api/v1/tickets/:number'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'customFields.root_cause', message: 'Root cause is required.' }],
        }),
      ),
    );
    await user.click(within(panel).getByRole('button', { name: 'Update' }));
    expect(await within(panel).findByText('Root cause is required.')).toBeInTheDocument();

    server.resetHandlers();
    const later = ticketsApi();
    await user.type(within(panel).getByLabelText(/Root cause/), 'Config');
    await user.click(within(panel).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Ticket updated.')).toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(later.at(-1)).toEqual({
      method: 'PATCH',
      url: '/api/v1/tickets/42',
      body: { status: 'resolved', customFields: { root_cause: 'Config' } },
    });
  });

  it('renames the subject and changes the requester', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Edit subject' }));
    const field = screen.getByLabelText('Subject');
    await user.clear(field);
    await user.type(field, 'Attendance down');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(calls[0]?.body).toEqual({ subject: 'Attendance down' });
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('button', { name: /Change requester/ }));
    const contacts = await screen.findByRole('list', { name: 'Contacts' });
    await user.click(await within(contacts).findByText('Arjun Mehta'));
    expect(await screen.findByText('Requester changed.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ contactId: 'c2' });
  });

  it('lets admins move a ticket to the trash', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets/42', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete ticket' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete ticket' }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets');
    });
    expect(calls).toEqual([{ method: 'DELETE', url: '/api/v1/tickets/42', body: null }]);
  });

  it('shows a deleted ticket read-only, and lets admins restore it', async () => {
    ticketsApi({ ticket: { ...TICKET, deletedAt: NOW } });
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    expect(await screen.findByText(/This ticket is in the trash/)).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Restore ticket' }));
    expect(await screen.findByText('Ticket #42 restored.')).toBeInTheDocument();
  });

  it('gives agents no delete, and says when a ticket does not exist', async () => {
    ticketsApi({ session: agentMe });
    server.use(
      http.get(apiUrl('/api/v1/tickets/:number'), ({ params }) =>
        params.number === '9'
          ? apiError(404, 'NOT_FOUND', 'This ticket does not exist.')
          : HttpResponse.json(TICKET),
      ),
    );
    const { router } = renderRoute('/tickets/42', { host: WORKSPACE });
    expect(await screen.findByRole('form', { name: 'Properties' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    await router.navigate('/tickets/9');
    expect(await screen.findByText("This ticket doesn't exist")).toBeInTheDocument();
  });
});

describe('ticket form details', () => {
  it('adds and removes tags by keyboard, button and leaving the box', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/new?contact=c1', { host: WORKSPACE });
    server.use(
      http.get(apiUrl('/api/v1/contacts/:id'), () =>
        HttpResponse.json({ id: 'c1', name: 'Neha Iyer', email: 'neha@acme.com' }),
      ),
    );
    await screen.findByText('Neha Iyer (neha@acme.com)');
    const tags = screen.getByRole('combobox', { name: 'Tags' });
    await user.type(
      tags,
      'One,Two  words{Enter}three{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}',
    );
    await user.type(tags, '{Backspace}');
    await user.type(tags, 'Leaving');
    await user.click(screen.getByLabelText(/^Subject/));
    await user.click(screen.getByRole('button', { name: 'Remove tag one' }));
    expect(
      within(screen.getByRole('list', { name: 'Tags added' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    await user.type(screen.getByLabelText(/^Subject/), 'Tagged');
    await user.selectOptions(screen.getByLabelText('Type'), 'Incident');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => {
      expect(calls[0]?.body).toMatchObject({ tags: ['leaving'], type: 'incident' });
    });
  });

  it('goes back from a new contact to choosing one, and checks the new contact', async () => {
    ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/new', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: /Requester/ }));
    await user.click(await screen.findByRole('button', { name: /New contact/ }));
    const fieldset = screen.getByRole('group', { name: 'New contact' });
    await user.type(within(fieldset).getByLabelText('Phone'), '+91 98765 43210');
    await user.clear(within(fieldset).getByLabelText('Phone'));
    await user.type(screen.getByLabelText(/^Subject/), 'X');
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    expect(within(fieldset).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(fieldset).getByText('Enter an email or a phone number.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose an existing contact instead' }));
    expect(screen.getByRole('button', { name: /Requester/ })).toBeInTheDocument();
  });

  it('discards unsaved properties and cancels a subject edit', async () => {
    const calls = ticketsApi();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const panel = await screen.findByRole('form', { name: 'Properties' });
    await user.selectOptions(within(panel).getByLabelText('Priority'), 'Urgent');
    await user.click(within(panel).getByRole('button', { name: 'Discard' }));
    expect(within(panel).getByLabelText('Priority')).toHaveValue('medium');

    await user.click(screen.getByRole('button', { name: 'Edit subject' }));
    await user.clear(screen.getByLabelText('Subject'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a subject.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit subject' })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('offers a retry when tickets do not load, and loads more pages', async () => {
    ticketsApi();
    server.use(
      http.get(apiUrl('/api/v1/tickets'), () => apiError(500, 'INTERNAL', 'Something went wrong.')),
    );
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    const retry = await screen.findByRole('button', { name: /Try again/ });
    server.use(
      http.get(apiUrl('/api/v1/tickets'), ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get('cursor')
            ? {
                tickets: [{ ...TICKET, number: 41, subject: 'Older one' }],
                nextCursor: null,
                total: null,
              }
            : { tickets: [TICKET], nextCursor: 'next', total: 2 },
        ),
      ),
    );
    await user.click(retry);
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: 'Older one' })).toBeInTheDocument();
  });
});

describe('assignment', () => {
  it('lets admins assign anyone, with the team first, and shows it in the history', async () => {
    const calls = ticketsApi({ ticket: { ...TICKET, team: { id: 't1', name: 'Billing' } } });
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const panel = await screen.findByRole('form', { name: 'Properties' });
    const select = within(panel).getByLabelText('Assignee');
    await waitFor(() => {
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Unassigned', 'Arjun Mehta · in team', 'Ravi Shankar (me)']);
    });
    await user.selectOptions(select, 'Arjun Mehta · in team');
    await user.click(within(panel).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Ticket updated.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ assigneeUserId: 'u2' });
  });

  it('lets agents take an unassigned ticket, and not change someone else’s', async () => {
    const calls = ticketsApi({ session: agentMe });
    const user = userEvent.setup();
    const { unmount } = renderRoute('/tickets/42', { host: WORKSPACE });
    const panel = await screen.findByRole('form', { name: 'Properties' });
    expect(
      within(within(panel).getByLabelText('Assignee'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Unassigned', 'Ravi Shankar (me)']);
    await user.click(screen.getByRole('button', { name: 'Take it' }));
    expect(await screen.findByText('You have ticket #42.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: 'PATCH',
      url: '/api/v1/tickets/42',
      body: { assigneeUserId: 'u1' },
    });
    unmount();

    ticketsApi({
      session: agentMe,
      ticket: { ...TICKET, assignee: { userId: 'u2', name: 'Arjun Mehta' } },
    });
    renderRoute('/tickets/42', { host: WORKSPACE });
    const locked = within(await screen.findByRole('form', { name: 'Properties' })).getByLabelText(
      'Assignee',
    );
    expect(locked).toBeDisabled();
    expect(locked).toHaveValue('u2');
    expect(
      screen.getByText('Arjun Mehta has it. A supervisor or admin can reassign it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take it' })).not.toBeInTheDocument();
  });

  it('shows the assignee in the list and in the history', async () => {
    ticketsApi({
      list: [
        {
          ...TICKET,
          assignee: { userId: 'u2', name: 'Arjun Mehta' },
          team: { id: 't1', name: 'Billing' },
        },
      ],
    });
    server.use(
      http.get(apiUrl('/api/v1/tickets/:number/activity'), () =>
        HttpResponse.json({
          activity: [
            {
              id: 'a9',
              at: NOW,
              actor: { userId: 'u1', name: 'Ravi Shankar' },
              action: 'updated',
              changes: [{ field: 'assignee', from: null, to: 'Arjun Mehta' }],
            },
          ],
        }),
      ),
    );
    const { router } = renderRoute('/tickets', { host: WORKSPACE });
    const list = await screen.findByRole('list', { name: 'Tickets' });
    expect(within(list).getByText('Arjun Mehta')).toBeInTheDocument();
    expect(within(list).getByText('Billing')).toBeInTheDocument();
    await router.navigate('/tickets/42');
    expect(await screen.findByRole('region', { name: 'Conversation' })).toHaveTextContent(
      'Ravi Shankar changed the assignee from nobody to Arjun Mehta.',
    );
  });
});

describe('SLA countdowns (F23)', () => {
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

  it('shows how the ticket stands against its targets', async () => {
    ticketsApi({
      ticket: {
        ...TICKET,
        due: { at: inMinutes(42), target: 'reply' },
        sla: {
          policy: { id: 'p1', name: 'Default policy' },
          reply: { dueAt: inMinutes(42), state: 'running', doneAt: null },
          resolve: { dueAt: inMinutes(-10), state: 'overdue', doneAt: null },
        },
      },
    });
    renderRoute('/tickets/42', { host: WORKSPACE });
    const sla = await screen.findByRole('list', { name: 'SLA' });
    expect(within(sla).getByText('Reply due in 42m')).toBeInTheDocument();
    expect(within(sla).getByText('Resolve overdue by 10m')).toBeInTheDocument();
    expect(within(sla).getAllByRole('listitem')[0]).toHaveAttribute(
      'title',
      expect.stringContaining('Default policy'),
    );
  });

  it('shows the next deadline in the list, filters overdue tickets and sorts by due', async () => {
    ticketsApi({
      list: [
        { ...TICKET, due: { at: inMinutes(-5), target: 'reply' } },
        {
          ...TICKET,
          number: 43,
          subject: 'Payslip',
          due: { at: inMinutes(200), target: 'resolve' },
        },
      ],
    });
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    expect(await screen.findByText('Overdue 5m')).toBeInTheDocument();
    expect(screen.getByText('Resolve in 3h 20m')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    await waitFor(() => {
      expect(searches.at(-1)).toContain('overdue=true');
    });
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Order' }), 'due');
    await waitFor(() => {
      expect(searches.at(-1)).toContain('sort=due');
    });
  });
});
