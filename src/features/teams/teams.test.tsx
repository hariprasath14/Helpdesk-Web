import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Me, MembersList, Team } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const supervisorMe: Me = {
  ...me,
  role: 'supervisor',
  isOwner: false,
  permissions: ['tickets.work', 'tickets.assign_any', 'members.view'],
};
const agentMe: Me = { ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] };

const person = (userId: string, name: string, role: 'admin' | 'agent' = 'agent') => ({
  userId,
  name,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@acme.test`,
  role,
  status: 'active' as const,
});

const BILLING: Team = {
  id: 't1',
  name: 'Billing',
  description: 'Invoices and refunds',
  members: [
    { ...person('u2', 'Neha Iyer'), isLead: true },
    { ...person('u3', 'Arjun Mehta'), isLead: false },
  ],
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

const MEMBERS = {
  members: [
    { ...person('u1', 'Ravi Shankar', 'admin'), isOwner: true },
    { ...person('u2', 'Neha Iyer'), isOwner: false },
    { ...person('u3', 'Arjun Mehta'), isOwner: false },
    { ...person('u4', 'Gone Person'), isOwner: false, status: 'deactivated' },
  ].map((member) => ({
    ...member,
    twoFactorEnabled: false,
    lastActiveAt: null,
    joinedAt: '2026-10-26T10:00:00.000Z',
    teams: [],
  })),
  invitations: [],
} as unknown as MembersList;

function teamsApi(session: Me = me, teams: Team[] = [BILLING]) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const record = async (request: Request) => {
    calls.push({
      method: request.method,
      url: new URL(request.url).pathname,
      body: request.headers.get('content-type')?.includes('json') ? await request.json() : null,
    });
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams })),
    http.get(apiUrl('/api/v1/members'), () => HttpResponse.json(MEMBERS)),
    http.post(apiUrl('/api/v1/teams'), async ({ request }) => {
      await record(request);
      return HttpResponse.json({ ...BILLING, id: 't9', name: 'Support' });
    }),
    http.patch(apiUrl('/api/v1/teams/:teamId'), async ({ request }) => {
      await record(request);
      return HttpResponse.json(BILLING);
    }),
    http.delete(apiUrl('/api/v1/teams/:teamId'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe('teams page', () => {
  it('lists teams with their people and leads', async () => {
    teamsApi();
    renderRoute('/settings/teams', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(await screen.findByText('1 team')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Teams' });
    expect(within(list).getByText('Invoices and refunds')).toBeInTheDocument();
    expect(within(list).getByText('2 people')).toBeInTheDocument();
    expect(within(list).getByText('Neha Iyer, Arjun Mehta')).toBeInTheDocument();
    expect(within(list).getByText('Neha Iyer', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page');
  });

  it('adds a team with people and a lead', async () => {
    const calls = teamsApi(me, []);
    const user = userEvent.setup();
    renderRoute('/settings/teams', { host: WORKSPACE });
    expect(await screen.findByText('No teams yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New team' }));
    const drawer = await screen.findByRole('dialog', { name: 'New team' });

    await user.click(within(drawer).getByRole('button', { name: 'Add team' }));
    expect(within(drawer).getByText('Enter a name.')).toBeInTheDocument();

    await user.type(within(drawer).getByLabelText(/^Name/), 'Support');
    await user.click(within(drawer).getByRole('button', { name: 'Add people' }));
    const people = await screen.findByRole('list', { name: 'People' });
    // Deactivated people can't be added.
    expect(within(people).queryByText('Gone Person')).not.toBeInTheDocument();
    await user.click(await within(people).findByText('Neha Iyer'));
    await user.click(within(people).getByText('Arjun Mehta'));
    await user.keyboard('{Escape}');
    await user.click(within(drawer).getByLabelText('Lead (Neha Iyer)'));
    await user.click(within(drawer).getByRole('button', { name: 'Remove Arjun Mehta' }));
    await user.click(within(drawer).getByRole('button', { name: 'Add team' }));

    expect(await screen.findByText('Team added.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        url: '/api/v1/teams',
        body: { name: 'Support', description: null, members: [{ userId: 'u2', isLead: true }] },
      },
    ]);
  });

  it('edits a team, sending the version it loaded, and explains a conflicting change', async () => {
    const calls = teamsApi();
    const user = userEvent.setup();
    renderRoute('/settings/teams', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Billing' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Billing' });
    await user.clear(within(drawer).getByLabelText(/^Name/));
    await user.type(within(drawer).getByLabelText(/^Name/), 'Accounts');
    await user.click(within(drawer).getByRole('button', { name: 'Remove Arjun Mehta' }));
    await user.click(within(drawer).getByRole('button', { name: 'Save team' }));
    expect(await screen.findByText('Team saved.')).toBeInTheDocument();
    expect(calls[0]).toEqual({
      method: 'PATCH',
      url: '/api/v1/teams/t1',
      body: {
        name: 'Accounts',
        description: 'Invoices and refunds',
        members: [{ userId: 'u2', isLead: true }],
        updatedAt: BILLING.updatedAt,
      },
    });

    server.use(
      http.patch(apiUrl('/api/v1/teams/:teamId'), () =>
        apiError(
          409,
          'TEAM_CHANGED',
          'Someone else changed this team after you opened it. Reload it to see their changes.',
        ),
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Billing' }));
    const again = await screen.findByRole('dialog', { name: 'Edit Billing' });
    await user.click(within(again).getByRole('button', { name: 'Save team' }));
    expect(await within(again).findByRole('alert')).toHaveTextContent(
      'Someone else changed this team',
    );
  });

  it('deletes a team after confirming', async () => {
    const calls = teamsApi();
    const user = userEvent.setup();
    renderRoute('/settings/teams', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Actions for Billing' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the team Billing?' });
    expect(within(dialog).getByText(/2 people in it stay in the workspace/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete team' }));
    expect(await screen.findByText('Team Billing deleted.')).toBeInTheDocument();
    expect(calls).toEqual([{ method: 'DELETE', url: '/api/v1/teams/t1', body: null }]);
  });

  it('shows supervisors the teams without changes, and agents no access', async () => {
    teamsApi(supervisorMe);
    const { unmount } = renderRoute('/settings/teams', { host: WORKSPACE });
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Billing' })).not.toBeInTheDocument();
    unmount();

    teamsApi(agentMe);
    renderRoute('/settings/teams', { host: WORKSPACE });
    expect(
      await screen.findByText(/Only admins and supervisors can see the teams/),
    ).toBeInTheDocument();
  });

  it('offers a retry when teams do not load', async () => {
    teamsApi();
    server.use(
      http.get(apiUrl('/api/v1/teams'), () => apiError(500, 'INTERNAL', 'Something went wrong.')),
    );
    renderRoute('/settings/teams', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading teams' })).not.toBeInTheDocument();
    });
  });
});
