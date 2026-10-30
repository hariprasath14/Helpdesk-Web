import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Home } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { live } from '../../test/live';
import { renderRoute } from '../../test/render';
import { apiUrl, emptyHome, server } from '../../test/server';

function api(answers: Home[]) {
  let calls = 0;
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    http.get(apiUrl('/api/v1/home'), () => {
      calls += 1;
      return HttpResponse.json(answers[Math.min(calls, answers.length) - 1]);
    }),
  );
  return { calls: () => calls };
}

const card = (name: RegExp) => screen.getByRole('link', { name });

describe('home', () => {
  it('shows the counts, each card opening the matching ticket list', async () => {
    api([
      {
        counts: { mine: 4, overdue: 2, unassigned: 7, waitingOnCustomer: 1 },
        setup: { teamInvited: true, emailConnected: true, businessHoursSet: true },
      },
    ]);
    const user = userEvent.setup();
    const { router } = renderRoute('/', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Acme Support · /)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Assigned to you\s*4/ })).toHaveAttribute(
      'href',
      '/tickets?view=mine&status=open,pending,waiting_on_customer&assignee=me',
    );
    expect(card(/Overdue\s*2/)).toHaveAttribute('href', '/tickets?overdue=true&sort=due');
    expect(card(/Unassigned\s*7/)).toHaveAttribute(
      'href',
      '/tickets?view=unassigned&status=open,pending,waiting_on_customer&assignee=none',
    );
    expect(card(/Waiting on customer\s*1/)).toHaveAttribute(
      'href',
      '/tickets?status=waiting_on_customer&assignee=me',
    );
    // Everything is set up, so the checklist is gone.
    expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument();

    await user.click(card(/Overdue/));
    // The ticket list loads lazily.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets');
    });
    expect(router.state.location.search).toBe('?overdue=true&sort=due');
  });

  it('lists what is left to set up, with links and ticks', async () => {
    api([
      {
        ...emptyHome,
        setup: { teamInvited: true, emailConnected: false, businessHoursSet: false },
      },
    ]);
    renderRoute('/', { host: WORKSPACE });
    const checklist = (await screen.findByRole('heading', { name: 'Get started' })).closest(
      'section',
    );
    if (!checklist) throw new Error('no checklist');
    expect(within(checklist).getByText('1 of 3 done')).toBeInTheDocument();
    expect(within(checklist).getByRole('link', { name: /Invite your team.*Done/ })).toHaveAttribute(
      'href',
      '/settings/members',
    );
    expect(
      within(checklist).getByRole('link', { name: /Connect your support email/ }),
    ).toHaveAttribute('href', '/settings/email');
    expect(
      within(checklist).getByRole('link', { name: /Set your business hours/ }),
    ).toHaveAttribute('href', '/settings/business-hours');
    expect(within(checklist).getAllByText(': Done')).toHaveLength(1);
  });

  it("lists the person's tickets due soonest and the latest notifications", async () => {
    api([emptyHome]);
    const searches: string[] = [];
    server.use(
      http.get(apiUrl('/api/v1/tickets'), ({ request }) => {
        searches.push(new URL(request.url).search);
        return HttpResponse.json({
          tickets: [
            {
              id: 't7',
              number: 7,
              subject: 'Payroll stuck',
              status: 'open',
              priority: 'high',
              type: null,
              contact: { id: 'c1', name: 'Neha Iyer', email: 'neha@acme.com' },
              company: null,
              team: null,
              assignee: { userId: 'u1', name: 'Ravi Shankar' },
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
              due: { at: new Date(Date.now() + 42 * 60_000).toISOString(), target: 'reply' },
              mergedInto: null,
            },
          ],
          nextCursor: null,
          total: 1,
        });
      }),
      http.get(apiUrl('/api/v1/notifications'), () =>
        HttpResponse.json({
          notifications: [
            {
              id: 'n1',
              kind: 'assigned',
              title: 'Neha Iyer assigned you #7',
              body: 'Payroll stuck',
              ticket: { number: 7, subject: 'Payroll stuck' },
              read: false,
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderRoute('/', { host: WORKSPACE });
    const due = (await screen.findByRole('heading', { name: 'Due soonest' })).closest('section');
    if (!due) throw new Error('no due list');
    expect(await within(due).findByRole('link', { name: 'Payroll stuck' })).toHaveAttribute(
      'href',
      '/tickets/7',
    );
    expect(within(due).getByText(/Reply in 4[12]m/)).toBeInTheDocument();
    expect(new URLSearchParams(searches.at(-1))).toEqual(
      new URLSearchParams('assignee=me&status=open,pending,waiting_on_customer&sort=due&limit=5'),
    );
    const latest = screen.getByRole('heading', { name: 'Latest notifications' }).closest('section');
    if (!latest) throw new Error('no notifications');
    expect(
      await within(latest).findByRole('link', { name: 'Neha Iyer assigned you #7' }),
    ).toHaveAttribute('href', '/tickets/7');
  });

  it('has no checklist for people who cannot change settings', async () => {
    api([{ ...emptyHome, setup: null }]);
    server.use(
      http.get(apiUrl('/api/v1/me'), () =>
        HttpResponse.json({ ...me, role: 'agent', permissions: ['tickets.work'] }),
      ),
    );
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByRole('link', { name: /Assigned to you\s*0/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument();
  });

  it('updates the counts after live changes, once for a burst', async () => {
    const { calls } = api([
      emptyHome,
      { ...emptyHome, counts: { ...emptyHome.counts, unassigned: 3 } },
    ]);
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByRole('link', { name: /Unassigned\s*0/ })).toBeInTheDocument();
    const before = calls();
    act(() => {
      live.socket.receive('tickets', { ticketId: 't1', created: true });
      live.socket.receive('tickets', { ticketId: 't2', created: true });
      live.socket.receive('tickets', { ticketId: 't3', created: true });
    });
    expect(
      await screen.findByRole('link', { name: /Unassigned\s*3/ }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(calls()).toBe(before + 1);
  });

  it('says when the counts cannot be loaded, with a retry', async () => {
    api([emptyHome]);
    server.use(
      http.get(apiUrl('/api/v1/home'), () => apiError(500, 'INTERNAL', 'Something went wrong.'), {
        once: true,
      }),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('The counts could not be loaded.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Assigned to you\s*0/ })).toBeInTheDocument();
    });
  });
});
