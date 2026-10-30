import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Notification } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, defaultEmailChoices, server } from '../../test/server';

const NOW = new Date().toISOString();
const ITEMS: Notification[] = [
  {
    id: 'n1',
    kind: 'sla_breach',
    title: 'Ticket #42 is overdue',
    body: 'Ticket #42 is overdue: the first reply was due at 17:30.',
    ticket: { number: 42, subject: 'Payslip missing' },
    read: false,
    createdAt: NOW,
  },
  {
    id: 'n2',
    kind: 'mention',
    title: 'Ravi Shankar mentioned you on ticket #41',
    body: 'Can you check payroll?',
    ticket: { number: 41, subject: 'Attendance' },
    read: true,
    createdAt: NOW,
  },
];

function notificationsApi({ items = ITEMS }: { items?: Notification[] } = {}) {
  let current = items;
  const unread = () => current.filter((item) => !item.read).length;
  const marked: unknown[] = [];
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    http.get(apiUrl('/api/v1/notifications/unread'), () => HttpResponse.json({ unread: unread() })),
    http.get(apiUrl('/api/v1/notifications'), () =>
      HttpResponse.json({ notifications: current, unread: unread(), nextCursor: null }),
    ),
    http.post(apiUrl('/api/v1/notifications/read'), async ({ request }) => {
      const body = (await request.json()) as { ids?: string[] };
      marked.push(body);
      current = current.map((item) =>
        !body.ids || body.ids.includes(item.id) ? { ...item, read: true } : item,
      );
      return HttpResponse.json({ unread: unread() });
    }),
    http.get(apiUrl('/api/v1/tickets/:number'), () => apiError(404, 'NOT_FOUND', 'Not found.')),
  );
  return { marked };
}

describe('the notification bell', () => {
  it('shows the unread count and opens the latest, marking one read on open', async () => {
    const { marked } = notificationsApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/', { host: WORKSPACE });
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    const list = within(panel).getByRole('list', { name: 'Notification list' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Ticket #42 is overdue')).toBeInTheDocument();
    expect(within(list).getAllByText('Unread')).toHaveLength(1);

    await user.click(within(list).getByRole('button', { name: /Ticket #42 is overdue/ }));
    expect(marked).toEqual([{ ids: ['n1'] }]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets/42');
    });
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('marks everything read, and says when there is nothing', async () => {
    const { marked } = notificationsApi({
      items: ITEMS.map((item) => ({ ...item, read: false })),
    });
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(marked).toEqual([{}]);
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('shows 99+ and an empty list', async () => {
    notificationsApi({ items: [] });
    server.use(
      http.get(apiUrl('/api/v1/notifications/unread'), () => HttpResponse.json({ unread: 100 })),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Notifications, 99+ unread' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(panel).findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it('offers a retry when the list cannot load', async () => {
    notificationsApi();
    server.use(
      http.get(apiUrl('/api/v1/notifications'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Your account → Notifications', () => {
  it('chooses which kinds also come by email', async () => {
    const saved: unknown[] = [];
    server.use(
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
      http.get(apiUrl('/api/v1/auth/sessions'), () => HttpResponse.json({ sessions: [] })),
      http.patch(apiUrl('/api/v1/notifications/email'), async ({ request }) => {
        const body = (await request.json()) as Record<string, boolean>;
        saved.push(body);
        return HttpResponse.json({ ...defaultEmailChoices, ...body });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=notifications', { host: WORKSPACE });
    const replies = await screen.findByRole('switch', { name: /Customer replies/ });
    expect(replies).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Assigned to me/ })).toBeChecked();
    await user.click(replies);
    expect(await screen.findByText('Notification emails saved.')).toBeInTheDocument();
    expect(saved).toEqual([{ customer_reply: true }]);
    expect(screen.getByRole('switch', { name: /Customer replies/ })).toBeChecked();
  });
});
