import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Me, SlaPolicy } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { activitySentence } from '../tickets/ticket-history';
import { dueText, durationText, spanText, STARTING_TARGETS, targetText } from './sla-format';

const NOW = '2026-10-28T10:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

describe('SLA wording', () => {
  it('says durations and spans as people do', () => {
    expect(durationText({ amount: 45, unit: 'minutes' })).toBe('45 min');
    expect(durationText({ amount: 1, unit: 'days' })).toBe('1 day');
    expect(durationText({ amount: 3, unit: 'days' })).toBe('3 days');
    expect(spanText(42 * 60_000)).toBe('42m');
    expect(spanText(190 * 60_000)).toBe('3h 10m');
    expect(spanText(2 * 1440 * 60_000 + 4 * 3_600_000)).toBe('2d 4h');
    expect(spanText(120 * 60_000)).toBe('2h');
  });

  it('describes each target state with a colour', () => {
    const now = Date.parse(NOW);
    const target = (
      state: 'running' | 'overdue' | 'paused' | 'met' | 'missed',
      due: number,
      done?: number,
    ) => ({
      dueAt: at(due),
      state,
      doneAt: done === undefined ? null : at(done),
    });
    expect(targetText('reply', target('running', 42), now)).toEqual({
      text: 'Reply due in 42m',
      tone: 'warning',
    });
    expect(targetText('resolve', target('running', 300), now)).toEqual({
      text: 'Resolve due in 5h',
      tone: 'info',
    });
    expect(targetText('reply', target('running', -10), now)).toEqual({
      text: 'Reply overdue by 10m',
      tone: 'danger',
    });
    expect(targetText('reply', target('met', 0, -5), now).text).toBe('Replied on time');
    expect(targetText('resolve', target('missed', 0, 125), now)).toEqual({
      text: 'Resolved 2h 5m late',
      tone: 'danger',
    });
    expect(targetText('resolve', target('paused', 30), now).text).toBe(
      'Resolve paused: waiting on the customer',
    );
    expect(dueText({ at: at(-3), target: 'reply' }, now)).toEqual({
      text: 'Overdue 3m',
      tone: 'danger',
    });
    expect(dueText({ at: at(600), target: 'resolve' }, now)).toEqual({
      text: 'Resolve in 10h',
      tone: 'neutral',
    });
  });
});

describe('SLA history entries', () => {
  it('say which deadline was missed', () => {
    const entry = (to: string) => ({
      id: 'a1',
      at: NOW,
      actor: { userId: null, name: 'SLA: Default policy' },
      action: 'updated' as const,
      changes: [{ field: 'sla', from: null, to }],
    });
    expect(activitySentence(entry('reply_overdue'), [])).toBe('marked the first reply overdue');
    expect(activitySentence(entry('resolve_overdue'), [])).toBe('marked the resolve time overdue');
  });
});

const DEFAULT: SlaPolicy = {
  id: 'p0',
  name: 'Default policy',
  isDefault: true,
  position: 0,
  conditions: { match: 'all', items: [] },
  targets: STARTING_TARGETS,
  escalation: { warnMinutes: 10, reassign: 'nobody', reassignUserId: null },
  createdAt: NOW,
  updatedAt: NOW,
};
const VIP: SlaPolicy = {
  ...DEFAULT,
  id: 'p1',
  name: 'VIP customers',
  isDefault: false,
  position: 1,
  conditions: {
    match: 'all',
    items: [{ field: 'tags', operator: 'contains_any', value: ['vip'] }],
  },
  targets: {
    ...STARTING_TARGETS,
    urgent: {
      reply: { amount: 15, unit: 'minutes' },
      resolve: { amount: 1, unit: 'hours' },
      hours: 'calendar',
    },
  },
};
const OUTAGES: SlaPolicy = { ...VIP, id: 'p2', name: 'Outages', position: 2 };

function slaApi({
  session = me,
  policies = [VIP, OUTAGES, DEFAULT],
}: { session?: Me; policies?: SlaPolicy[] } = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const record = async (request: Request) => {
    const body: unknown = request.method === 'DELETE' ? null : await request.json();
    calls.push({ method: request.method, url: new URL(request.url).pathname, body });
    return body as Record<string, unknown>;
  };
  let current = policies;
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/custom-fields'), () =>
      HttpResponse.json({ standardFields: [], fields: [] }),
    ),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: [] })),
    http.get(apiUrl('/api/v1/members'), () =>
      HttpResponse.json({
        members: [
          {
            userId: 'u7',
            name: 'Neha Iyer',
            email: 'neha@acme.test',
            role: 'supervisor',
            isOwner: false,
            status: 'active',
            twoFactorEnabled: false,
            lastActiveAt: null,
            joinedAt: NOW,
            teams: [],
          },
        ],
        invitations: [],
      }),
    ),
    http.get(apiUrl('/api/v1/sla-policies'), () => HttpResponse.json({ policies: current })),
    http.post(apiUrl('/api/v1/sla-policies'), async ({ request }) => {
      const body = await record(request);
      if (body.name === 'Taken') {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'conditions.items.0.value', message: 'Add at least one value.' }],
        });
      }
      return HttpResponse.json({ ...VIP, ...body, id: 'p9' });
    }),
    http.patch(apiUrl('/api/v1/sla-policies/:id'), async ({ request }) => {
      const body = await record(request);
      return HttpResponse.json({ ...DEFAULT, ...body });
    }),
    http.put(apiUrl('/api/v1/sla-policies/order'), async ({ request }) => {
      const body = (await record(request)) as { policyIds: string[] };
      current = [
        ...body.policyIds.map((id) => policies.find((p) => p.id === id) ?? DEFAULT),
        DEFAULT,
      ];
      return HttpResponse.json({ policies: current });
    }),
    http.delete(apiUrl('/api/v1/sla-policies/:id'), async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { calls };
}

describe('Settings → SLAs', () => {
  it('lists the policies in order, the default last, and reorders them', async () => {
    const { calls } = slaApi();
    const user = userEvent.setup();
    renderRoute('/settings/slas', { host: WORKSPACE });
    const list = await screen.findByRole('list', { name: 'SLA policies' });
    const rows = within(list).getAllByRole('listitem');
    expect(
      rows.map(
        (row) =>
          within(row).getByRole('button', { name: /^(VIP customers|Outages|Default policy)$/ })
            .textContent,
      ),
    ).toEqual(['VIP customers', 'Outages', 'Default policy']);
    const [vip, , fallback] = rows;
    if (!vip || !fallback) throw new Error('missing rows');
    expect(within(fallback).getByText('Default')).toBeInTheDocument();
    // Each policy shows its targets as a small table: priority, first reply, resolve, hours.
    const targets = (row: HTMLElement, priority: string) =>
      within(within(row).getByRole('table'))
        .getAllByRole('row')
        .find((line) => line.textContent.startsWith(priority))?.textContent;
    expect(targets(vip, 'Urgent')).toBe('Urgent15 min1 hRound the clock');
    expect(targets(fallback, 'Urgent')).toBe('Urgent1 h4 hBusiness hours');
    expect(targets(fallback, 'High')).toBe('High4 h1 dayBusiness hours');
    expect(
      screen.queryByRole('button', { name: 'Move Default policy up' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move Outages up' }));
    expect(calls).toEqual([
      { method: 'PUT', url: '/api/v1/sla-policies/order', body: { policyIds: ['p2', 'p1'] } },
    ]);
  });

  it('adds a policy with conditions and targets', async () => {
    const { calls } = slaApi();
    const user = userEvent.setup();
    renderRoute('/settings/slas', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New policy' }));
    const drawer = screen.getByRole('dialog', { name: 'New SLA policy' });
    await user.click(within(drawer).getByRole('button', { name: 'Add policy' }));
    expect(within(drawer).getByText('Enter a name.')).toBeInTheDocument();

    await user.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Premium');
    // Event-only fields belong to rules.
    expect(
      within(drawer).queryByRole('option', { name: /Hours in this status/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(within(drawer).getByRole('combobox', { name: 'Field' }), 'tags');
    await user.type(within(drawer).getByRole('textbox', { name: 'Values' }), 'premium, gold');
    const urgent = within(drawer).getByRole('row', { name: 'Urgent' });
    const reply = within(urgent).getByRole('textbox', { name: 'Reply within' });
    await user.clear(reply);
    await user.click(within(drawer).getByRole('button', { name: 'Add policy' }));
    expect(within(urgent).getByText('Enter a whole number from 1 to 999.')).toBeInTheDocument();
    expect(reply).toHaveAccessibleDescription('Enter a whole number from 1 to 999.');
    await user.type(reply, '30');
    await user.selectOptions(
      within(urgent).getByRole('combobox', { name: 'Reply within unit' }),
      'minutes',
    );
    await user.selectOptions(
      within(urgent).getByRole('combobox', { name: 'Counting' }),
      'calendar',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Add policy' }));

    expect(await screen.findByText('Premium added.')).toBeInTheDocument();
    expect(calls[0]?.body).toMatchObject({
      name: 'Premium',
      conditions: {
        match: 'all',
        items: [{ field: 'tags', operator: 'contains_any', value: ['premium', 'gold'] }],
      },
      targets: {
        urgent: {
          reply: { amount: 30, unit: 'minutes' },
          resolve: { amount: 4, unit: 'hours' },
          hours: 'calendar',
        },
        low: STARTING_TARGETS.low,
      },
    });
  });

  it('edits the default policy without conditions, and deletes others', async () => {
    const { calls } = slaApi();
    const user = userEvent.setup();
    renderRoute('/settings/slas', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Default policy' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit Default policy' });
    expect(
      within(drawer).getByText(/covers every ticket no other policy matches/),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole('list', { name: 'Conditions' })).not.toBeInTheDocument();
    const low = within(drawer).getByRole('row', { name: 'Low' });
    await user.clear(within(low).getByRole('textbox', { name: 'Resolve within' }));
    await user.type(within(low).getByRole('textbox', { name: 'Resolve within' }), '7');
    await user.click(within(drawer).getByRole('button', { name: 'Save policy' }));
    expect(await screen.findByText('Default policy saved.')).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/api/v1/sla-policies/p0' });
    expect(calls[0]?.body).not.toHaveProperty('conditions');

    await user.click(screen.getByRole('button', { name: 'Actions for Outages' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete policy' }));
    expect(await screen.findByText('Outages deleted.')).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/api/v1/sla-policies/p2' });
  });

  it('sets the warning and what happens at a deadline', async () => {
    const { calls } = slaApi();
    const user = userEvent.setup();
    renderRoute('/settings/slas', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Default policy' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit Default policy' });
    const minutes = within(drawer).getByRole('textbox', { name: 'Minutes before' });
    expect(minutes).toHaveValue('10');
    await user.clear(minutes);
    await user.type(minutes, '2000');
    await user.selectOptions(
      within(drawer).getByRole('combobox', { name: 'At a deadline, reassign to' }),
      'person',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Save policy' }));
    expect(within(drawer).getByText('Enter whole minutes from 1 to 1,440.')).toBeInTheDocument();
    expect(within(drawer).getByText('Choose an active member.')).toBeInTheDocument();
    await user.clear(minutes);
    await user.type(minutes, '15');
    await user.selectOptions(within(drawer).getByRole('combobox', { name: 'Person' }), 'u7');
    await user.click(within(drawer).getByRole('button', { name: 'Save policy' }));
    expect(await screen.findByText('Default policy saved.')).toBeInTheDocument();
    expect(calls[0]?.body).toMatchObject({
      escalation: { warnMinutes: 15, reassign: 'person', reassignUserId: 'u7' },
    });

    await user.click(screen.getByRole('button', { name: 'Default policy' }));
    const again = screen.getByRole('dialog', { name: 'Edit Default policy' });
    await user.click(within(again).getByRole('checkbox', { name: 'Warn before a deadline' }));
    expect(
      within(again).queryByRole('textbox', { name: 'Minutes before' }),
    ).not.toBeInTheDocument();
    await user.click(within(again).getByRole('button', { name: 'Save policy' }));
    expect(calls.at(-1)?.body).toMatchObject({
      escalation: { warnMinutes: null, reassign: 'nobody', reassignUserId: null },
    });
  });

  it('shows the API’s problems at the condition', async () => {
    slaApi();
    const user = userEvent.setup();
    renderRoute('/settings/slas', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New policy' }));
    const drawer = screen.getByRole('dialog', { name: 'New SLA policy' });
    await user.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Taken');
    await user.click(within(drawer).getByRole('button', { name: 'Add policy' }));
    expect(await within(drawer).findByText('Add at least one value.')).toBeInTheDocument();
  });

  it('is for admins only, with a retry when it cannot load', async () => {
    slaApi({ session: { ...me, role: 'agent', permissions: ['tickets.work'] } });
    renderRoute('/settings/slas', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change the SLA policies/)).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    slaApi();
    server.use(
      http.get(apiUrl('/api/v1/sla-policies'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/settings/slas', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
