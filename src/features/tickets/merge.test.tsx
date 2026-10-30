import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Me, Ticket, TicketMessage } from '../../api/generated/model';
import { me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { activitySentence } from './ticket-history';

const NOW = new Date().toISOString();
const ticketOf = (number: number, subject: string, more: Partial<Ticket> = {}): Ticket => ({
  id: `t${String(number)}`,
  number,
  subject,
  description: '',
  status: 'open',
  priority: 'medium',
  type: null,
  source: 'email',
  contact: { id: 'c1', name: 'Arjun Mehta', email: 'arjun@acme.test' },
  company: null,
  team: null,
  assignee: null,
  tags: [],
  customFields: {},
  createdBy: null,
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
  ...more,
});
const MESSAGES: TicketMessage[] = [
  {
    id: 'm1',
    kind: 'customer',
    body: 'Also, my leave balance is wrong.',
    bodyHtml: null,
    author: { type: 'contact', contactId: 'c1', name: 'Arjun Mehta' },
    to: [],
    cc: [],
    mentions: [],
    attachments: [],
    emailStatus: null,
    emailSentAt: null,
    emailError: null,
    fromTicketNumber: 41,
    createdAt: NOW,
  },
];

function api({
  session = me,
  ticket = ticketOf(42, 'Payslip missing'),
}: { session?: Me; ticket?: Ticket } = {}) {
  const posted: { url: string; body: unknown }[] = [];
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/custom-fields'), () =>
      HttpResponse.json({ standardFields: [], fields: [] }),
    ),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: [] })),
    http.get(apiUrl('/api/v1/people'), () => HttpResponse.json({ people: [] })),
    http.get(apiUrl('/api/v1/canned-responses'), () =>
      HttpResponse.json({ cannedResponses: [], placeholders: [] }),
    ),
    http.get(apiUrl('/api/v1/tickets'), () =>
      HttpResponse.json({
        tickets: [ticketOf(42, 'Payslip missing'), ticketOf(41, 'Salary slip')],
        nextCursor: null,
        total: 2,
      }),
    ),
    http.get(apiUrl('/api/v1/tickets/:number'), ({ params }) =>
      HttpResponse.json(
        Number(params.number) === ticket.number ? ticket : ticketOf(Number(params.number), 'Other'),
      ),
    ),
    http.get(apiUrl('/api/v1/tickets/:number/messages'), () =>
      HttpResponse.json({ messages: MESSAGES, descriptionFiles: [] }),
    ),
    http.get(apiUrl('/api/v1/tickets/:number/activity'), () => HttpResponse.json({ activity: [] })),
    http.post(apiUrl('/api/v1/tickets/:number/merge'), async ({ request, params }) => {
      posted.push({ url: new URL(request.url).pathname, body: await request.json() });
      return HttpResponse.json(ticketOf(Number(params.number), 'Kept'));
    }),
    http.post(apiUrl('/api/v1/tickets/:number/messages/:id/split'), ({ request }) => {
      posted.push({ url: new URL(request.url).pathname, body: null });
      return HttpResponse.json(ticketOf(57, 'Payslip missing'));
    }),
  );
  return { posted };
}

describe('merging tickets', () => {
  it('chooses tickets to merge and which one is kept, then asks once more', async () => {
    const { posted } = api();
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets/42', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge with other tickets' }));
    const drawer = await screen.findByRole('dialog', { name: 'Merge #42 with other tickets' });
    const found = await within(drawer).findByRole('list', { name: 'Tickets found' });
    expect(within(found).queryByText('Payslip missing')).not.toBeInTheDocument();
    await user.click(within(found).getByRole('button', { name: 'Add #41' }));
    await user.click(within(drawer).getByRole('radio', { name: /Salary slip/ }));
    await user.click(within(drawer).getByRole('checkbox', { name: /Email the requesters/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Merge tickets' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Merge 2 tickets into #41?' });
    expect(confirm).toHaveTextContent('#42 will be closed and read-only');
    expect(confirm).toHaveTextContent("This can't be undone.");
    await user.click(within(confirm).getByRole('button', { name: 'Merge tickets' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets/41');
    });
    expect(posted).toEqual([
      { url: '/api/v1/tickets/41/merge', body: { numbers: [42], tellCustomers: true } },
    ]);
  });

  it('lets a ticket be taken back out, and says when the merge fails', async () => {
    api();
    server.use(
      http.post(apiUrl('/api/v1/tickets/:number/merge'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: '#41 cannot be merged: deleted or already merged.',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge with other tickets' }));
    const drawer = await screen.findByRole('dialog', { name: 'Merge #42 with other tickets' });
    await user.click(await within(drawer).findByRole('button', { name: 'Add #41' }));
    await user.click(within(drawer).getByRole('radio', { name: /Salary slip/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Remove' }));
    // Taking the kept ticket out keeps this one instead, and nothing is left to merge.
    expect(within(drawer).getByRole('radio', { name: /Payslip missing/ })).toBeChecked();
    expect(within(drawer).getByRole('button', { name: 'Merge tickets' })).toBeDisabled();

    await user.type(within(drawer).getByRole('searchbox', { name: 'Search tickets' }), 'slip');
    await user.click(await within(drawer).findByRole('button', { name: 'Add #41' }));
    await user.click(within(drawer).getByRole('button', { name: 'Merge tickets' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Merge tickets' }),
    );
    expect(
      await screen.findByText('#41 cannot be merged: deleted or already merged.'),
    ).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: 'Merge #42 with other tickets' }),
    ).not.toBeInTheDocument();
  });

  it('is not offered to agents', async () => {
    api({ session: { ...me, role: 'agent', permissions: ['tickets.work'] } });
    renderRoute('/tickets/42', { host: WORKSPACE });
    await screen.findByRole('heading', { name: /Payslip missing/ });
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('shows a merged ticket as read-only, pointing at the one it went into', async () => {
    api({ ticket: ticketOf(41, 'Salary slip', { status: 'closed', mergedInto: { number: 42 } }) });
    renderRoute('/tickets/41', { host: WORKSPACE });
    const banner = await screen.findByText(/This ticket was merged into/);
    expect(within(banner).getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      '/tickets/42',
    );
    expect(screen.queryByRole('region', { name: 'Write' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Split into a new ticket' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
  });
});

describe('splitting a message', () => {
  it('marks moved messages and splits a customer message into a new ticket', async () => {
    const { posted } = api({
      ticket: ticketOf(42, 'Payslip missing', { ccEmails: ['neha@acme.test'] }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/tickets/42', { host: WORKSPACE });
    expect(await screen.findByRole('link', { name: 'From #41' })).toHaveAttribute(
      'href',
      '/tickets/41',
    );
    expect(screen.getByText('Always copied: neha@acme.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Split into a new ticket' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Split this message into a new ticket?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Split into new ticket' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets/57');
    });
    expect(posted).toEqual([{ url: '/api/v1/tickets/42/messages/m1/split', body: null }]);
    expect(await screen.findByText('Split into ticket #57.')).toBeInTheDocument();
  });

  it('says what merging and splitting did in the history', () => {
    const entry = (field: string, to: unknown) => ({
      id: 'a1',
      at: NOW,
      actor: { userId: 'u1', name: 'Ravi Shankar' },
      action: 'updated' as const,
      changes: [{ field, from: null, to }],
    });
    expect(activitySentence(entry('merged', [41, 40]), [])).toBe(
      'merged #41 and #40 into this ticket',
    );
    expect(activitySentence(entry('merged', [41]), [])).toBe('merged #41 into this ticket');
    expect(activitySentence(entry('merged_into', 42), [])).toBe('merged this ticket into #42');
    expect(activitySentence(entry('split_from', 42), [])).toBe('split this ticket from #42');
    expect(activitySentence(entry('split_into', 57), [])).toBe('split a message into #57');
  });
});
