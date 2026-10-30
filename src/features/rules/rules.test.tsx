import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { CustomField, Me, MembersList, Rule, Team } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const ACCOUNTS: Team = {
  id: 't1',
  name: 'Accounts',
  description: null,
  members: [],
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

const MEMBERS = {
  members: [
    { userId: 'u1', name: 'Ravi Shankar', status: 'active' },
    { userId: 'u2', name: 'Neha Iyer', status: 'active' },
    { userId: 'u3', name: 'Gone Person', status: 'deactivated' },
  ].map((member) => ({
    ...member,
    email: 'x@acme.test',
    role: 'agent',
    isOwner: false,
    twoFactorEnabled: false,
    lastActiveAt: null,
    joinedAt: '2026-10-26T10:00:00.000Z',
    teams: [],
  })),
  invitations: [],
} as unknown as MembersList;

const PLAN: CustomField = {
  id: 'f1',
  recordType: 'company',
  key: 'plan',
  label: 'Plan',
  type: 'dropdown',
  helpText: null,
  required: 'never',
  checkboxDefault: null,
  choices: [
    { id: 'c1', label: 'Basic', removed: false, isDefault: false },
    { id: 'c2', label: 'Premium', removed: false, isDefault: false },
  ],
  position: 1,
  archived: false,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
} as unknown as CustomField;

const BILLING_RULE: Rule = {
  id: 'r1',
  name: 'Billing to Accounts',
  event: 'ticket_created',
  enabled: true,
  position: 1,
  conditions: {
    match: 'any',
    items: [
      { field: 'subject_or_description', operator: 'contains_any', value: ['billing', 'invoice'] },
    ],
  },
  actions: [
    { type: 'set_team', value: 't1' },
    { type: 'add_tags', value: ['billing'] },
  ],
  stopAfter: true,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};
const VIP_RULE: Rule = {
  ...BILLING_RULE,
  id: 'r2',
  name: 'Premium first',
  position: 2,
  enabled: false,
  stopAfter: false,
  conditions: {
    match: 'all',
    items: [{ field: 'company.plan', operator: 'is_any', value: ['c2'] }],
  },
  actions: [{ type: 'set_priority', value: 'high' }],
};

function rulesApi({
  session = me,
  rules = [BILLING_RULE, VIP_RULE],
}: { session?: Me; rules?: Rule[] } = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let current = rules;
  const record = async (request: Request) => {
    const body: unknown = request.headers.get('content-type')?.includes('json')
      ? await request.json()
      : null;
    calls.push({ method: request.method, url: new URL(request.url).pathname, body });
    return body as Record<string, unknown>;
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/rules'), () => HttpResponse.json({ rules: current })),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: [ACCOUNTS] })),
    http.get(apiUrl('/api/v1/members'), () => HttpResponse.json(MEMBERS)),
    http.get(apiUrl('/api/v1/custom-fields'), ({ request }) =>
      HttpResponse.json({
        fields: new URL(request.url).searchParams.get('recordType') === 'company' ? [PLAN] : [],
      }),
    ),
    http.post(apiUrl('/api/v1/rules'), async ({ request }) => {
      const body = await record(request);
      if (body.name === 'Broken') {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'conditions.items.0.value', message: 'Add at least one value.' }],
        });
      }
      const saved = { ...BILLING_RULE, ...body, id: 'r3', position: 3 };
      current = [...current, saved];
      return HttpResponse.json(saved);
    }),
    http.patch(apiUrl('/api/v1/rules/:ruleId'), async ({ request, params }) => {
      const body = await record(request);
      const saved = { ...current.find((rule) => rule.id === params.ruleId), ...body } as Rule;
      current = current.map((rule) => (rule.id === saved.id ? saved : rule));
      return HttpResponse.json(saved);
    }),
    http.put(apiUrl('/api/v1/rules/order'), async ({ request }) => {
      const body = (await record(request)) as { ruleIds: string[] };
      current = body.ruleIds.flatMap((id) => current.filter((rule) => rule.id === id));
      return HttpResponse.json({ rules: current });
    }),
    http.delete(apiUrl('/api/v1/rules/:ruleId'), async ({ request, params }) => {
      await record(request);
      current = current.filter((rule) => rule.id !== params.ruleId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/api/v1/rules/test'), async ({ request }) => {
      const body = (await record(request)) as { ticketNumber: number };
      return body.ticketNumber === 404
        ? apiError(404, 'NOT_FOUND', 'This ticket does not exist.')
        : HttpResponse.json({ matched: false, results: [true, false] });
    }),
  );
  return calls;
}

describe('Settings → Rules', () => {
  it('lists the rules in order with what they do, turns one on, moves and deletes', async () => {
    const calls = rulesApi();
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    const list = await screen.findByRole('list', { name: 'Rules' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Billing to Accounts');
    expect(rows[0]).toHaveTextContent('When a ticket is created · 1 condition');
    expect(rows[0]).toHaveTextContent('Set team, Add tags · then stops');
    expect(rows[1]).toHaveTextContent('Premium first');

    await user.click(screen.getByRole('switch', { name: /Premium first on/ }));
    expect(await screen.findByText('Rule Premium first is on.')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: 'PATCH',
      url: '/api/v1/rules/r2',
      body: { enabled: true },
    });

    await user.click(screen.getByRole('button', { name: 'Move Premium first up' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Rules' })).getAllByRole('listitem')[0],
      ).toHaveTextContent('Premium first');
    });
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      url: '/api/v1/rules/order',
      body: { ruleIds: ['r2', 'r1'] },
    });
    expect(screen.getByRole('button', { name: 'Move Premium first up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Actions for Billing to Accounts' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete rule' }));
    expect(await screen.findByText('Rule Billing to Accounts deleted.')).toBeInTheDocument();
  });

  it('builds a new rule: conditions with typed words or ticked choices, and actions', async () => {
    const calls = rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });

    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    expect(within(drawer).getByText('Enter a name.')).toBeInTheDocument();

    await user.type(within(drawer).getByLabelText(/^Name/), 'Premium billing');
    await user.selectOptions(within(drawer).getByLabelText('Match'), 'any');
    const first = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    await user.type(within(first).getByLabelText('Values'), 'billing, invoice ,');

    await user.click(within(drawer).getByRole('button', { name: 'Add condition' }));
    const second = within(drawer).getByRole('listitem', { name: 'Condition 2' });
    await user.selectOptions(within(second).getByLabelText('Field'), "Requester's company: Plan");
    await user.click(within(second).getByRole('checkbox', { name: 'Premium' }));

    const action = within(drawer).getByRole('listitem', { name: 'Action 1' });
    await user.selectOptions(within(action).getByLabelText('Do'), 'Set team');
    await user.selectOptions(within(action).getByLabelText('To'), 'Accounts');
    await user.click(within(drawer).getByRole('button', { name: 'Add action' }));
    const secondAction = within(drawer).getByRole('listitem', { name: 'Action 2' });
    await user.type(within(secondAction).getByLabelText('Tags'), 'billing, vip');
    await user.click(within(drawer).getByRole('button', { name: 'Add action' }));
    const note = within(drawer).getByRole('listitem', { name: 'Action 3' });
    await user.selectOptions(within(note).getByLabelText('Do'), 'Add a private note');
    await user.type(within(note).getByLabelText('Note'), 'Check the plan.');
    await user.click(within(drawer).getByLabelText(/Stop here/));

    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    expect(await screen.findByText('Rule Premium billing added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({
      name: 'Premium billing',
      event: 'ticket_created',
      conditions: {
        match: 'any',
        items: [
          {
            field: 'subject_or_description',
            operator: 'contains_any',
            value: ['billing', 'invoice'],
          },
          { field: 'company.plan', operator: 'is_any', value: ['c2'] },
        ],
      },
      actions: [
        { type: 'set_team', value: 't1' },
        { type: 'add_tags', value: ['billing', 'vip'] },
        { type: 'add_note', value: 'Check the plan.' },
      ],
      stopAfter: true,
    });
  });

  it('edits a rule, shows the reasons a save is refused, and tests it on a ticket', async () => {
    const calls = rulesApi();
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Billing to Accounts' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Billing to Accounts' });
    const condition = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    expect(within(condition).getByLabelText('Values')).toHaveValue('billing, invoice');
    expect(within(drawer).getByLabelText(/Stop here/)).toBeChecked();

    // Changing the field resets the comparison to one that fits.
    await user.selectOptions(within(condition).getByLabelText('Field'), 'Ticket: Priority');
    expect(within(condition).getByLabelText('Comparison')).toHaveValue('is_any');
    await user.click(within(condition).getByRole('checkbox', { name: 'Urgent' }));
    await user.selectOptions(within(condition).getByLabelText('Comparison'), 'is_none');

    await user.type(within(drawer).getByLabelText('Ticket number'), '12');
    await user.click(within(drawer).getByRole('button', { name: 'Test' }));
    expect(await within(drawer).findByText("Doesn't match")).toBeInTheDocument();
    expect(within(drawer).getByText('Condition 1 matches')).toBeInTheDocument();
    expect(within(drawer).getByText("Condition 2 doesn't match")).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({
      ticketNumber: 12,
      conditions: {
        match: 'any',
        items: [{ field: 'priority', operator: 'is_none', value: ['urgent'] }],
      },
    });
    await user.clear(within(drawer).getByLabelText('Ticket number'));
    await user.click(within(drawer).getByRole('button', { name: 'Test' }));
    expect(within(drawer).getByText('Enter a ticket number.')).toBeInTheDocument();
    await user.type(within(drawer).getByLabelText('Ticket number'), '404');
    await user.click(within(drawer).getByRole('button', { name: 'Test' }));
    expect(await within(drawer).findByText('This ticket does not exist.')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Remove condition' }));
    expect(within(drawer).getByText(/No conditions/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Save rule' }));
    expect(await screen.findByText('Rule Billing to Accounts saved.')).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', url: '/api/v1/rules/r1' });
  });

  it('assigns in turn within a team', async () => {
    const calls = rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });
    await user.type(within(drawer).getByLabelText(/^Name/), 'Everything to Accounts');
    await user.click(within(drawer).getByRole('button', { name: 'Remove condition' }));
    const action = within(drawer).getByRole('listitem', { name: 'Action 1' });
    await user.selectOptions(within(action).getByLabelText('Do'), 'Assign in turn within team');
    expect(within(action).getByLabelText('To')).toHaveValue('t1');
    expect(within(action).getByText(/Active members take turns/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    expect(await screen.findByText('Rule Everything to Accounts added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toMatchObject({
      conditions: { match: 'all', items: [] },
      actions: [{ type: 'assign_in_turn', value: 't1' }],
    });
  });

  it('builds a rule for a change, with fields only that event has, and emails', async () => {
    const calls = rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });
    await user.type(within(drawer).getByLabelText(/^Name/), 'Urgent alert');
    const first = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    expect(
      within(within(first).getByLabelText('Field')).queryByRole('option', {
        name: 'The change: What changed',
      }),
    ).toBeNull();

    await user.selectOptions(
      within(drawer).getByLabelText('This happens'),
      'Someone on the team changes a ticket',
    );
    expect(within(drawer).getByText(/rules never start each other/)).toBeInTheDocument();
    await user.selectOptions(within(first).getByLabelText('Field'), 'The change: What changed');
    await user.click(within(first).getByRole('checkbox', { name: 'Priority' }));
    const action = within(drawer).getByRole('listitem', { name: 'Action 1' });
    await user.selectOptions(within(action).getByLabelText('Do'), "Email the team's leads");
    await user.type(within(action).getByLabelText('Message'), 'Urgent ticket.');
    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    expect(await screen.findByText('Rule Urgent alert added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toMatchObject({
      event: 'ticket_updated',
      conditions: { items: [{ field: 'changed', operator: 'contains_any', value: ['priority'] }] },
      actions: [{ type: 'email_team', value: 'Urgent ticket.' }],
    });
  });

  it('builds a rule on a schedule with an hours condition', async () => {
    const calls = rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });
    await user.type(within(drawer).getByLabelText(/^Name/), 'Remind after 3 days');
    await user.selectOptions(
      within(drawer).getByLabelText('This happens'),
      'On a schedule (checked every 15 minutes)',
    );
    expect(within(drawer).getByText(/runs once for a ticket/)).toBeInTheDocument();
    const first = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    await user.selectOptions(within(first).getByLabelText('Field'), 'Time: Hours in this status');
    expect(within(first).getByLabelText('Comparison')).toHaveValue('at_least');
    await user.type(within(first).getByLabelText(/^Hours/), '72');
    const action = within(drawer).getByRole('listitem', { name: 'Action 1' });
    await user.selectOptions(within(action).getByLabelText('Do'), 'Email the requester');
    await user.type(within(action).getByLabelText('Message'), 'Do you still need help?');
    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    expect(await screen.findByText('Rule Remind after 3 days added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toMatchObject({
      event: 'time',
      conditions: {
        match: 'all',
        items: [{ field: 'hours_in_status', operator: 'at_least', value: '72' }],
      },
      actions: [{ type: 'email_requester', value: 'Do you still need help?' }],
    });
  });

  it('drops conditions the new event does not have', async () => {
    rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });
    await user.selectOptions(
      within(drawer).getByLabelText('This happens'),
      'The customer replies by email',
    );
    const first = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    await user.selectOptions(
      within(first).getByLabelText('Field'),
      "The reply: The customer's reply",
    );
    const action = within(drawer).getByRole('listitem', { name: 'Action 1' });
    await user.selectOptions(within(action).getByLabelText('Do'), 'Email the requester');
    expect(within(action).getByText(/Sent as a reply on the ticket/)).toBeInTheDocument();
    await user.selectOptions(within(drawer).getByLabelText('This happens'), 'A ticket is created');
    expect(within(drawer).queryByRole('listitem', { name: 'Condition 1' })).toBeNull();
    expect(within(drawer).getByText(/No conditions/)).toBeInTheDocument();
  });

  it('shows the API problems next to the right condition', async () => {
    rulesApi({ rules: [] });
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const drawer = await screen.findByRole('dialog', { name: 'New rule' });
    await user.type(within(drawer).getByLabelText(/^Name/), 'Broken');
    await user.click(within(drawer).getByRole('button', { name: 'Add rule' }));
    const condition = within(drawer).getByRole('listitem', { name: 'Condition 1' });
    expect(await within(condition).findByText('Add at least one value.')).toBeInTheDocument();
  });

  it('is for admins only, and offers to try again when it does not load', async () => {
    rulesApi({
      session: {
        ...me,
        role: 'supervisor',
        isOwner: false,
        permissions: ['tickets.work', 'members.view'],
      },
    });
    renderRoute('/settings/rules', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change the rules/)).toBeInTheDocument();
  });

  it('offers to try again when the rules do not load', async () => {
    rulesApi();
    server.use(
      http.get(apiUrl('/api/v1/rules'), () => apiError(500, 'INTERNAL', 'Something went wrong.')),
    );
    const user = userEvent.setup();
    renderRoute('/settings/rules', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
