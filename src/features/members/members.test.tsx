import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { InvitationStatus, Me, MembersList } from '../../api/generated/model';
import { apiError, me, signedOut, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { parseEmails } from './invite-emails';
import { PRODUCT_NAME } from '../../product';

const HOUR = 60 * 60 * 1000;
const supervisorMe: Me = {
  ...me,
  role: 'supervisor',
  isOwner: false,
  permissions: ['tickets.work', 'tickets.assign_any', 'members.view'],
};
const agentMe: Me = { ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] };

const LIST: MembersList = {
  members: [
    {
      userId: 'u1',
      name: 'Ravi Shankar',
      email: 'ravi@acme.test',
      role: 'admin',
      isOwner: true,
      status: 'active',
      twoFactorEnabled: true,
      lastActiveAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      joinedAt: new Date().toISOString(),
      teams: [],
    },
    {
      userId: 'u2',
      name: 'Neha Iyer',
      email: 'neha@acme.test',
      role: 'agent',
      isOwner: false,
      status: 'active',
      twoFactorEnabled: true,
      lastActiveAt: null,
      joinedAt: new Date().toISOString(),
      teams: [
        { id: 't1', name: 'Billing', isLead: true },
        { id: 't2', name: 'Support', isLead: false },
        { id: 't3', name: 'VIP', isLead: false },
      ],
    },
    {
      userId: 'u3',
      name: 'Arjun Mehta',
      email: 'arjun@acme.test',
      role: 'supervisor',
      isOwner: false,
      status: 'deactivated',
      twoFactorEnabled: false,
      lastActiveAt: null,
      joinedAt: new Date().toISOString(),
      teams: [],
    },
  ] as unknown as MembersList['members'],
  invitations: [
    {
      id: 'i1',
      email: 'pending@acme.test',
      role: 'supervisor',
      invitedByName: 'Ravi Shankar',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3 * 24 * HOUR).toISOString(),
      expired: false,
      teams: [{ id: 't1', name: 'Billing' }],
    },
  ] as unknown as MembersList['invitations'],
};

const TEAMS = [
  { id: 't1', name: 'Billing', description: null, members: [], createdAt: '', updatedAt: '' },
  { id: 't2', name: 'Support', description: null, members: [], createdAt: '', updatedAt: '' },
];

function membersApi(session: Me = me, list: MembersList = LIST) {
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
    http.get(apiUrl('/api/v1/members'), () => HttpResponse.json(list)),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: TEAMS })),
    http.patch(apiUrl('/api/v1/members/:userId'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/api/v1/members/:userId/:action'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/api/v1/invitations/:id/resend'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(apiUrl('/api/v1/invitations/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const row = (name: string) => {
  const list = screen.getByRole('list', { name: 'Members' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText(name, { exact: false }));
  if (!item) throw new Error(`no row for ${name}`);
  return item;
};

async function openActions(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

describe('members page (admins)', () => {
  it('lists members with role, owner, two-step and activity, and open invitations', async () => {
    membersApi();
    renderRoute('/settings/members', { host: WORKSPACE });

    expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(await screen.findByText('3 members')).toBeInTheDocument();
    const owner = row('Ravi Shankar');
    expect(within(owner).getByText('(you)')).toBeInTheDocument();
    expect(within(owner).getByText('Owner')).toBeInTheDocument();
    expect(within(owner).getByText('2 hours ago')).toBeInTheDocument();
    expect(within(owner).getByText('No team')).toBeInTheDocument();
    const neha = row('Neha Iyer');
    expect(within(neha).getByText('Teams: Billing (lead), Support, VIP')).toBeInTheDocument();
    expect(within(neha).getByText('+1')).toBeInTheDocument();
    expect(within(owner).queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(within(row('Neha Iyer')).getByText('Not signed in yet')).toBeInTheDocument();
    expect(within(row('Arjun Mehta')).getByText('Deactivated')).toBeInTheDocument();

    const invitations = screen.getByRole('list', { name: 'Invitations' });
    expect(within(invitations).getByText('pending@acme.test')).toBeInTheDocument();
    expect(
      within(invitations).getByText(
        /Supervisor · joins Billing · invited by Ravi Shankar · expires in 3 days/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  });

  it('searches and filters by role', async () => {
    membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await user.type(await screen.findByLabelText('Search members'), 'neha');
    expect(
      within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    await user.clear(screen.getByLabelText('Search members'));
    await user.selectOptions(screen.getByLabelText('Role'), 'supervisor');
    expect(row('Arjun Mehta')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search members'), 'nobody');
    expect(screen.getByText('No members match.')).toBeInTheDocument();
  });

  it('filters by team', async () => {
    membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    const members = await screen.findByRole('list', { name: 'Members' });
    await screen.findByRole('option', { name: 'Support' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'Support');
    expect(within(members).getAllByRole('listitem')).toHaveLength(1);
    expect(row('Neha Iyer')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'No team');
    expect(within(members).getAllByRole('listitem')).toHaveLength(2);
  });

  it('changes a role from the actions menu', async () => {
    const calls = membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await openActions(user, 'Neha Iyer');
    expect(screen.queryByRole('menuitem', { name: 'Make Agent' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Make Supervisor' }));

    expect(await screen.findByText('Role changed.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'PATCH',
      url: '/api/v1/members/u2',
      body: { role: 'supervisor' },
    });
  });

  it('asks for the password when the API needs it, then finishes the change', async () => {
    const calls = membersApi();
    let first = true;
    let password: unknown;
    server.use(
      http.patch(apiUrl('/api/v1/members/:userId'), async ({ request }) => {
        calls.push({
          method: 'PATCH',
          url: new URL(request.url).pathname,
          body: await request.json(),
        });
        if (first) {
          first = false;
          return apiError(403, 'REAUTH_REQUIRED', 'Confirm your password to continue.');
        }
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(apiUrl('/api/v1/me/reauthenticate'), async ({ request }) => {
        password = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await openActions(user, 'Neha Iyer');
    await user.click(screen.getByRole('menuitem', { name: 'Make Admin' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm your password' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(within(dialog).getByText('Enter your password.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Your password/), 'my-secret-pass');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Role changed.')).toBeInTheDocument();
    expect(password).toEqual({ password: 'my-secret-pass' });
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
  });

  it('shows a wrong password in the confirmation dialog', async () => {
    membersApi();
    server.use(
      http.patch(apiUrl('/api/v1/members/:userId'), () =>
        apiError(403, 'REAUTH_REQUIRED', 'Confirm your password to continue.'),
      ),
      http.post(apiUrl('/api/v1/me/reauthenticate'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Your password is incorrect.', {
          fields: [{ field: 'password', message: 'Your password is incorrect.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await openActions(user, 'Neha Iyer');
    await user.click(screen.getByRole('menuitem', { name: 'Make Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm your password' });
    await user.type(within(dialog).getByLabelText(/Your password/), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByText('Your password is incorrect.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('deactivates after confirming, and reactivates', async () => {
    const calls = membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await openActions(user, 'Neha Iyer');
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate Neha Iyer?' });
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(
      await screen.findByText('Deactivated. They were signed out of this workspace.'),
    ).toBeInTheDocument();

    await openActions(user, 'Arjun Mehta');
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate' }));
    expect(await screen.findByText('Reactivated. They can sign in again.')).toBeInTheDocument();
    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/members/u2/deactivate',
      '/api/v1/members/u3/reactivate',
    ]);
  });

  it("resets a member's two-step verification, and explains when it can't", async () => {
    const calls = membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await openActions(user, 'Neha Iyer');
    await user.click(screen.getByRole('menuitem', { name: 'Reset two-step verification' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reset two-step verification for Neha Iyer?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Reset two-step verification' }));
    expect(
      await screen.findByText('Two-step verification was reset. They were signed out.'),
    ).toBeInTheDocument();
    expect(calls.at(-1)?.url).toBe('/api/v1/members/u2/reset-two-factor');

    server.use(
      http.post(apiUrl('/api/v1/members/:userId/reset-two-factor'), () =>
        apiError(
          409,
          'MEMBER_IN_OTHER_WORKSPACES',
          `This person also belongs to other ${PRODUCT_NAME} workspaces.`,
        ),
      ),
    );
    await openActions(user, 'Neha Iyer');
    await user.click(screen.getByRole('menuitem', { name: 'Reset two-step verification' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Reset two-step verification',
      }),
    );
    expect(
      await screen.findByText(`This person also belongs to other ${PRODUCT_NAME} workspaces.`),
    ).toBeInTheDocument();
  });

  it('resends and revokes invitations', async () => {
    const calls = membersApi();
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    const invitations = await screen.findByRole('list', { name: 'Invitations' });
    await user.click(within(invitations).getByRole('button', { name: 'Resend' }));
    expect(await screen.findByText('A new invitation link was sent.')).toBeInTheDocument();
    await user.click(within(invitations).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Invitation revoked.')).toBeInTheDocument();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /api/v1/invitations/i1/resend',
      'DELETE /api/v1/invitations/i1',
    ]);
  });

  it('offers a retry when the list does not load, and says when there are no invitations', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
      http.get(apiUrl('/api/v1/members'), () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json({ ...LIST, invitations: [] });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/settings/members', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No open invitations')).toBeInTheDocument();
  });
});

describe('inviting people', () => {
  async function openInvite(user: ReturnType<typeof userEvent.setup>) {
    renderRoute('/settings/members', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Invite people' }));
    return screen.findByRole('dialog', { name: 'Invite people' });
  }

  it('sends invitations with the chosen role', async () => {
    membersApi();
    let sent: unknown;
    server.use(
      http.post(apiUrl('/api/v1/invitations'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ invited: ['a@acme.test', 'b@acme.test'], skipped: [] });
      }),
    );
    const user = userEvent.setup();
    const drawer = await openInvite(user);
    await user.type(
      within(drawer).getByLabelText('Email addresses'),
      'A@acme.test,\nb@acme.test a@acme.test',
    );
    await user.selectOptions(within(drawer).getByLabelText('Role'), 'supervisor');
    expect(within(drawer).getByText(/assigning to anyone/)).toBeInTheDocument();
    await user.click(await within(drawer).findByLabelText('Support'));
    await user.click(within(drawer).getByRole('button', { name: 'Send invitations' }));

    expect(await screen.findByText('Invitations sent to 2 people.')).toBeInTheDocument();
    expect(sent).toEqual({
      emails: ['a@acme.test', 'b@acme.test'],
      role: 'supervisor',
      teamIds: ['t2'],
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Invite people' })).not.toBeInTheDocument();
    });
  });

  it('shows who was not invited and why', async () => {
    membersApi();
    server.use(
      http.post(apiUrl('/api/v1/invitations'), () =>
        HttpResponse.json({
          invited: ['new@acme.test'],
          skipped: [{ email: 'neha@acme.test', reason: 'Already a member.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    const drawer = await openInvite(user);
    await user.type(
      within(drawer).getByLabelText('Email addresses'),
      'new@acme.test neha@acme.test',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Send invitations' }));
    expect(
      await within(drawer).findByText('neha@acme.test: Already a member.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Invitation sent to new@acme.test.')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Done' }));
  });

  it('checks the addresses before sending, and explains failures', async () => {
    membersApi();
    server.use(
      http.post(apiUrl('/api/v1/invitations'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests.'),
      ),
    );
    const user = userEvent.setup();
    const drawer = await openInvite(user);
    const send = within(drawer).getByRole('button', { name: 'Send invitations' });
    const field = within(drawer).getByLabelText('Email addresses');

    await user.click(send);
    expect(within(drawer).getByText('Enter at least one email address.')).toBeInTheDocument();
    await user.type(field, 'good@acme.test, not-an-email');
    await user.click(send);
    expect(within(drawer).getByText('Check these addresses: not-an-email')).toBeInTheDocument();
    await user.clear(field);
    await user.type(
      field,
      Array.from({ length: 21 }, (_, i) => `p${String(i)}@acme.test`).join(' '),
    );
    await user.click(send);
    expect(within(drawer).getByText('Invite up to 20 people at a time.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'good@acme.test');
    await user.click(send);
    expect(await within(drawer).findByText(/Too many attempts/)).toBeInTheDocument();
  });

  it('splits addresses on commas, spaces and new lines, without duplicates', () => {
    expect(parseEmails(' A@x.com,b@x.com;\n\na@x.com ')).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('members for other roles', () => {
  it('shows supervisors the list without invite or member actions', async () => {
    membersApi(supervisorMe);
    renderRoute('/settings/members', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Security' })).not.toBeInTheDocument();
  });

  it('keeps agents out of members (their settings hold only canned responses)', async () => {
    membersApi(agentMe);
    renderRoute('/settings/members', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: "You don't have access to members" }),
    ).toBeInTheDocument();
    const settingsMenu = screen.getByRole('navigation', { name: 'Settings' });
    expect(
      within(settingsMenu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['All settings', 'Canned responses']);
  });
});

describe('accepting an invitation', () => {
  const TOKEN = 'a'.repeat(43);
  const status = (overrides: Partial<InvitationStatus> = {}): InvitationStatus => ({
    email: 'neha@acme.test',
    workspaceName: 'Acme Support',
    role: 'agent',
    invitedByName: 'Ravi Shankar',
    existingAccount: false,
    twoFactorRequired: false,
    ...overrides,
  });

  function inviteApi(
    check: InvitationStatus | (() => Response),
    accept?: (body: unknown) => Response,
  ) {
    let signedIn = false;
    const sent: unknown[] = [];
    server.use(
      http.get(apiUrl('/api/v1/me'), () => (signedIn ? HttpResponse.json(me) : signedOut())),
      http.post(apiUrl('/api/v1/invitations/check'), () =>
        typeof check === 'function' ? check() : HttpResponse.json(check),
      ),
      http.post(apiUrl('/api/v1/invitations/accept'), async ({ request }) => {
        const body = await request.json();
        sent.push(body);
        const response = accept?.(body) ?? HttpResponse.json(me);
        if (response.ok) signedIn = true;
        return response;
      }),
    );
    return sent;
  }

  it('lets someone new choose a name and password, then opens the workspace', async () => {
    const sent = inviteApi(status());
    const user = userEvent.setup();
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });

    expect(await screen.findByRole('heading', { name: 'Join Acme Support' })).toBeInTheDocument();
    expect(screen.getByText('Ravi Shankar invited you as an Agent.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveFocus();

    await user.type(screen.getByLabelText(/Full name/), 'Neha Iyer');
    await user.type(screen.getByLabelText(/Choose a password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      { token: TOKEN, password: 'quiet-harbour-lantern-41', name: 'Neha Iyer' },
    ]);
  });

  it(`lets someone with a ${PRODUCT_NAME} account join with their password and code`, async () => {
    const sent = inviteApi(status({ existingAccount: true, twoFactorRequired: true }));
    const user = userEvent.setup();
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    expect(
      await screen.findByText(`You already use ${PRODUCT_NAME} with this email`, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Full name/)).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText(`Your ${PRODUCT_NAME} password`, { exact: false }),
      'my-secret-pass',
    );
    await user.type(screen.getByLabelText(/Code from your authenticator app/), '123456');
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ });
    expect(sent).toEqual([{ token: TOKEN, password: 'my-secret-pass', code: '123456' }]);
  });

  it('asks for a code when the server says one is needed, and shows field errors', async () => {
    let calls = 0;
    inviteApi(status({ existingAccount: true }), () => {
      calls += 1;
      return calls === 1
        ? apiError(400, 'VALIDATION_ERROR', 'Enter the code.', {
            codeRequired: true,
            fields: [{ field: 'code', message: 'Enter the code from your authenticator app.' }],
          })
        : apiError(400, 'VALIDATION_ERROR', 'Your password is incorrect.', {
            fields: [{ field: 'password', message: 'Your password is incorrect.' }],
          });
    });
    const user = userEvent.setup();
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    await user.type(
      await screen.findByLabelText(`Your ${PRODUCT_NAME} password`, { exact: false }),
      'my-secret-pass',
    );
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    expect(await screen.findByLabelText(/Code from your authenticator app/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Code from your authenticator app/), '123456');
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    expect(await screen.findByText('Your password is incorrect.')).toBeInTheDocument();
  });

  it.each([
    ['expired', 'This invitation has expired'],
    ['used', 'This invitation was already used'],
    ['invalid', 'This invitation is not valid'],
  ])('explains a link that is %s', async (reason, title) => {
    inviteApi(() => apiError(400, 'VALIDATION_ERROR', 'No.', { reason }));
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    expect(await screen.findAllByRole('heading', { name: title })).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
  });

  it('treats a mistyped or cut-off link as not valid, not as a connection problem', async () => {
    inviteApi(() =>
      apiError(400, 'VALIDATION_ERROR', 'The request body is invalid.', {
        fields: [{ field: 'token', message: 'Too small' }],
      }),
    );
    renderRoute('/invite?token=cut-off', { host: WORKSPACE });
    expect(
      await screen.findAllByRole('heading', { name: 'This invitation is not valid' }),
    ).not.toHaveLength(0);
    expect(screen.queryByText(/Check your connection/)).not.toBeInTheDocument();
  });

  it('treats a missing token as invalid, an unknown address as not found, and retries network errors', async () => {
    const first = renderRoute('/invite', { host: WORKSPACE });
    expect(
      await screen.findAllByRole('heading', { name: 'This invitation is not valid' }),
    ).not.toHaveLength(0);
    first.unmount();

    inviteApi(() => apiError(404, 'NOT_FOUND', 'This workspace does not exist.'));
    const second = renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Workspace not found' })).toBeInTheDocument();
    second.unmount();

    let calls = 0;
    inviteApi(() => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : HttpResponse.json(status());
    });
    const user = userEvent.setup();
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Join Acme Support' })).toBeInTheDocument();
  });

  it('explains when the invitation stopped working while the form was open', async () => {
    inviteApi(status(), () => apiError(400, 'VALIDATION_ERROR', 'No.', { reason: 'expired' }));
    const user = userEvent.setup();
    renderRoute(`/invite?token=${TOKEN}`, { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/Full name/), 'Neha Iyer');
    await user.type(screen.getByLabelText(/Choose a password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitations work for 7 days.');
  });
});
