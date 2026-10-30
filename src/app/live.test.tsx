import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../api/generated/model';
import { rebaseDraft } from '../features/tickets/ticket-draft';
import type * as LiveModule from '../lib/live';
import { me, WORKSPACE } from '../test/fixtures';
import { live } from '../test/live';
import { renderRoute } from '../test/render';
import { apiUrl, server } from '../test/server';

const NOW = new Date().toISOString();
const ticketOf = (number: number, subject: string): Ticket => ({
  id: `t${String(number)}`,
  number,
  subject,
  description: '',
  status: 'open',
  priority: 'medium',
  type: null,
  source: 'agent',
  contact: { id: 'c1', name: 'Neha Iyer', email: 'neha@acme.test' },
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
});

function api() {
  const calls = { unread: 0, list: 0, ticket: 0, messages: 0 };
  let unread = 0;
  let ticket = ticketOf(42, 'Payslip missing');
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    http.get(apiUrl('/api/v1/notifications/unread'), () => {
      calls.unread += 1;
      return HttpResponse.json({ unread });
    }),
    http.get(apiUrl('/api/v1/custom-fields'), () =>
      HttpResponse.json({ standardFields: [], fields: [] }),
    ),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: [] })),
    http.get(apiUrl('/api/v1/people'), () => HttpResponse.json({ people: [] })),
    http.get(apiUrl('/api/v1/tickets/tags'), () => HttpResponse.json({ tags: [] })),
    http.get(apiUrl('/api/v1/ticket-views'), () => HttpResponse.json({ views: [] })),
    http.get(apiUrl('/api/v1/tickets'), () => {
      calls.list += 1;
      return HttpResponse.json({ tickets: [ticket], nextCursor: null, total: 1 });
    }),
    http.get(apiUrl('/api/v1/tickets/:number'), () => {
      calls.ticket += 1;
      return HttpResponse.json(ticket);
    }),
    http.get(apiUrl('/api/v1/tickets/:number/messages'), () => {
      calls.messages += 1;
      return HttpResponse.json({ messages: [], descriptionFiles: [] });
    }),
    http.get(apiUrl('/api/v1/tickets/:number/activity'), () => HttpResponse.json({ activity: [] })),
    http.get(apiUrl('/api/v1/canned-responses'), () =>
      HttpResponse.json({ cannedResponses: [], placeholders: [] }),
    ),
  );
  return {
    calls,
    setUnread: (count: number) => {
      unread = count;
    },
    setTicket: (next: Ticket) => {
      ticket = next;
    },
  };
}

describe('live updates', () => {
  it('updates the bell at once when a notification arrives', async () => {
    const { setUnread } = api();
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    setUnread(3);
    live.socket.receive('notifications');
    expect(
      await screen.findByRole('button', { name: 'Notifications, 3 unread' }),
    ).toBeInTheDocument();
  });

  it('watches the open ticket and reloads it when it changes', async () => {
    const { calls, setTicket } = api();
    renderRoute('/tickets/42', { host: WORKSPACE });
    expect(await screen.findByText('Payslip missing')).toBeInTheDocument();
    await waitFor(() => {
      expect(live.socket.sent).toContainEqual(['watch', 't42']);
    });
    const before = { ticket: calls.ticket, messages: calls.messages };
    setTicket({
      ...ticketOf(42, 'Payslip missing for October'),
      updatedAt: new Date().toISOString(),
    });
    // Another ticket's signal changes nothing.
    live.socket.receive('ticket', { ticketId: 't7' });
    live.socket.receive('ticket', { ticketId: 't42' });
    expect(await screen.findByText('Payslip missing for October')).toBeInTheDocument();
    expect(calls.ticket).toBe(before.ticket + 1);
    expect(calls.messages).toBeGreaterThan(before.messages);
  });

  it('counts new tickets on the list and shows them on request', async () => {
    const { calls, setTicket } = api();
    const user = userEvent.setup();
    renderRoute('/tickets', { host: WORKSPACE });
    expect(await screen.findByText('Payslip missing')).toBeInTheDocument();
    const loads = calls.list;
    live.socket.receive('tickets', { ticketId: 't50', created: true });
    live.socket.receive('tickets', { ticketId: 't51', created: true });
    live.socket.receive('tickets', { ticketId: 't51', created: false });
    expect(await screen.findByText('2 new tickets')).toBeInTheDocument();
    expect(calls.list).toBe(loads);

    setTicket(ticketOf(51, 'Attendance not marked'));
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Attendance not marked')).toBeInTheDocument();
    expect(screen.queryByText('2 new tickets')).not.toBeInTheDocument();

    // A change to a ticket on the list offers to show it too.
    live.socket.receive('tickets', { ticketId: 't51', created: false });
    expect(await screen.findByText('Some tickets changed')).toBeInTheDocument();
  });

  it('checks every minute while live updates are down', async () => {
    const { calls } = api();
    renderRoute('/', { host: WORKSPACE });
    await screen.findByRole('button', { name: 'Notifications' });
    live.socket.receive('disconnect', 'transport close');
    // Reconnecting reloads what is on screen, since signals may have been missed.
    const loads = calls.unread;
    live.socket.receive('connect');
    await waitFor(() => {
      expect(calls.unread).toBeGreaterThan(loads);
    });
  });
});

describe('unsaved property edits', () => {
  it('keep what this person changed and take the rest from the new values', () => {
    const before = {
      status: 'open' as const,
      priority: 'medium' as const,
      type: '',
      teamId: '',
      assigneeUserId: '',
      tags: ['payroll'],
      customFields: { plan: 'basic', region: 'south' },
    };
    const mine = {
      ...before,
      priority: 'high' as const,
      customFields: { ...before.customFields, plan: 'premium' },
    };
    const theirs = {
      ...before,
      status: 'pending' as const,
      assigneeUserId: 'u2',
      customFields: { plan: 'basic', region: 'north' },
    };
    expect(rebaseDraft(mine, before, theirs)).toEqual({
      ...theirs,
      priority: 'high',
      customFields: { plan: 'premium', region: 'north' },
    });
  });
});

describe('the live connection', () => {
  it('is created unconnected, on the app’s own address', async () => {
    const { createLiveSocket } = await vi.importActual<typeof LiveModule>('../lib/live');
    const socket = createLiveSocket();
    expect(socket.connected).toBe(false);
    expect(socket.io.opts.path).toBe('/socket.io');
    socket.disconnect();
  });
});
