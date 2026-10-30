import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AuditEntry, Me, MembersList } from '../../api/generated/model';
import { me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const entry = (id: string, summary: string, overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  occurredAt: '2026-10-25T12:00:00.000Z',
  actor: {
    type: 'member',
    userId: 'u1',
    name: 'Ravi Shankar',
    email: 'ravi@acme.test',
    role: 'admin',
  },
  category: 'members',
  action: 'member.role_changed',
  summary,
  target: { type: 'member', id: 'u2', label: 'Neha Iyer' },
  details: {},
  ip: '203.0.113.9',
  device: 'Chrome on Windows',
  ...overrides,
});

const MEMBERS = {
  members: [
    { userId: 'u1', name: 'Ravi Shankar' },
    { userId: 'u2', name: 'Neha Iyer' },
  ],
  invitations: [],
} as unknown as MembersList;

function auditApi(session: Me = me) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/members'), () => HttpResponse.json(MEMBERS)),
    http.get(apiUrl('/api/v1/audit-log'), ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      if (params.get('cursor') === 'page-2') {
        return HttpResponse.json({
          entries: [entry('e3', 'Ravi Shankar invited new@acme.test as Agent.')],
          nextCursor: null,
        });
      }
      if (params.get('category') === 'sign_in')
        return HttpResponse.json({ entries: [], nextCursor: null });
      return HttpResponse.json({
        entries: [
          entry('e1', "Ravi Shankar changed Neha Iyer's role from Agent to Supervisor."),
          entry('e2', 'Ravi Shankar signed in.', {
            category: 'sign_in',
            action: 'sign_in.succeeded',
            target: null,
          }),
        ],
        nextCursor: 'page-2',
      });
    }),
  );
  return requests;
}

describe('audit log page', () => {
  it('lists entries in the workspace time zone with who, where and category, and loads more', async () => {
    const requests = auditApi();
    const user = userEvent.setup();
    renderRoute('/settings/audit-log', { host: WORKSPACE });

    const list = await screen.findByRole('list', { name: 'Audit log entries' });
    expect(screen.getByText('Times in Asia/Kolkata')).toBeInTheDocument();
    const first = within(list).getAllByRole('listitem')[0];
    if (!first) throw new Error('no entries');
    expect(
      within(first).getByText("Ravi Shankar changed Neha Iyer's role from Agent to Supervisor."),
    ).toBeInTheDocument();
    expect(within(first).getByText('25 Oct 2026, 17:30')).toHaveAttribute(
      'dateTime',
      '2026-10-25T12:00:00.000Z',
    );
    expect(
      within(first).getByText('ravi@acme.test · Admin · 203.0.113.9 · Chrome on Windows'),
    ).toBeInTheDocument();
    expect(within(first).getByText('Members')).toBeInTheDocument();
    expect(requests[0]?.get('from')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(
      await within(list).findByText('Ravi Shankar invited new@acme.test as Agent.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(requests.at(-1)?.get('cursor')).toBe('page-2');
  });

  it('filters by person, category, search and custom dates, and exports the same filters', async () => {
    const requests = auditApi();
    const user = userEvent.setup();
    renderRoute('/settings/audit-log', { host: WORKSPACE });
    await screen.findByRole('list', { name: 'Audit log entries' });

    await user.selectOptions(screen.getByLabelText('Who'), 'u2');
    await waitFor(() => {
      expect(requests.at(-1)?.get('actorId')).toBe('u2');
    });
    await user.type(screen.getByLabelText('Search'), 'neha');
    await waitFor(() => {
      expect(requests.at(-1)?.get('q')).toBe('neha');
    });
    await user.selectOptions(screen.getByLabelText('Period'), 'custom');
    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('To'), '2026-10-25');
    await waitFor(() => {
      expect(requests.at(-1)?.get('from')).toBe('2026-09-30T18:30:00.000Z');
      expect(requests.at(-1)?.get('to')).toBe('2026-10-25T18:30:00.000Z');
    });

    const exportLink = screen.getByRole('link', { name: 'Export CSV' });
    const href = new URL(exportLink.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/api/v1/audit-log/export');
    expect(href.searchParams.get('actorId')).toBe('u2');
    expect(href.searchParams.get('q')).toBe('neha');

    await user.selectOptions(screen.getByLabelText('Category'), 'sign_in');
    expect(await screen.findByText('Nothing recorded for these filters')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Period'), 'all');
    await waitFor(() => {
      expect(requests.at(-1)?.get('from')).toBeNull();
    });
  });

  it('offers a retry when the log does not load', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)));
    server.use(http.get(apiUrl('/api/v1/members'), () => HttpResponse.json(MEMBERS)));
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/audit-log'), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.error()
          : HttpResponse.json({ entries: [], nextCursor: null });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/settings/audit-log', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing recorded for these filters')).toBeInTheDocument();
  });

  it('is in the Settings menu for admins only', async () => {
    auditApi();
    renderRoute('/settings/members', { host: WORKSPACE });
    expect(await screen.findByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'href',
      '/settings/audit-log',
    );
  });

  it('is closed to supervisors', async () => {
    auditApi({ ...me, role: 'supervisor', isOwner: false, permissions: ['members.view'] });
    renderRoute('/settings/audit-log', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: "You don't have access to the audit log" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });
});
