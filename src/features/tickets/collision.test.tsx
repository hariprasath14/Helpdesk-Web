import { act, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Ticket, TicketMessage } from '../../api/generated/model';
import { me, WORKSPACE } from '../../test/fixtures';
import { live } from '../../test/live';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const NOW = new Date().toISOString();
const TICKET: Ticket = {
  id: 't42',
  number: 42,
  subject: 'Payslip missing',
  description: '',
  status: 'open',
  priority: 'medium',
  type: null,
  source: 'agent',
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
};

const replyBy = (name: string, userId: string, createdAt: string): TicketMessage => ({
  id: `m-${userId}`,
  kind: 'reply',
  body: 'We have fixed it.',
  bodyHtml: null,
  author: { type: 'member', userId, name },
  to: ['arjun@acme.test'],
  cc: [],
  mentions: [],
  attachments: [],
  emailStatus: 'sent',
  emailSentAt: createdAt,
  emailError: null,
  fromTicketNumber: null,
  createdAt,
});

function api() {
  let messages: TicketMessage[] = [];
  const posted: unknown[] = [];
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    http.get(apiUrl('/api/v1/custom-fields'), () =>
      HttpResponse.json({ standardFields: [], fields: [] }),
    ),
    http.get(apiUrl('/api/v1/teams'), () => HttpResponse.json({ teams: [] })),
    http.get(apiUrl('/api/v1/people'), () => HttpResponse.json({ people: [] })),
    http.get(apiUrl('/api/v1/tickets/:number'), () => HttpResponse.json(TICKET)),
    http.get(apiUrl('/api/v1/tickets/:number/messages'), () =>
      HttpResponse.json({ messages, descriptionFiles: [] }),
    ),
    http.get(apiUrl('/api/v1/tickets/:number/activity'), () => HttpResponse.json({ activity: [] })),
    http.get(apiUrl('/api/v1/canned-responses'), () =>
      HttpResponse.json({ cannedResponses: [], placeholders: [] }),
    ),
    http.post(apiUrl('/api/v1/tickets/:number/messages'), async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json({ messages, descriptionFiles: [] });
    }),
  );
  return {
    posted,
    setMessages: (next: TicketMessage[]) => {
      messages = next;
    },
  };
}

/** Opens the composer from the reply bar (Step 5b), the way people start a reply. */
async function openComposer() {
  const bar = await screen.findByRole('group', { name: 'Write on this ticket' });
  const [start] = within(bar).getAllByRole('button');
  if (start) fireEvent.click(start);
  return screen.findByRole('textbox', { name: /Message/ });
}

describe('collision detection', () => {
  it('shows who else is viewing and who is replying, and says when we write', async () => {
    api();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    await openComposer();
    await waitFor(() => {
      expect(live.socket.sent).toContainEqual(['presence', { ticketId: 't42', typing: null }]);
    });

    act(() => {
      live.socket.receive('presence', {
        ticketId: 't42',
        userId: 'u2',
        name: 'Neha Iyer',
        typing: 'reply',
      });
      live.socket.receive('presence', {
        ticketId: 't42',
        userId: 'u3',
        name: 'Arun Kumar',
        typing: null,
      });
      // Our own other tab, and another ticket, are left out.
      live.socket.receive('presence', {
        ticketId: 't42',
        userId: me.user.id,
        name: me.user.name,
        typing: null,
      });
      live.socket.receive('presence', {
        ticketId: 't7',
        userId: 'u4',
        name: 'Someone Else',
        typing: null,
      });
    });
    expect(await screen.findByText('Also viewing: Arun Kumar and Neha Iyer')).toBeInTheDocument();
    expect(screen.getByText('Neha Iyer is replying…')).toBeInTheDocument();

    act(() => {
      live.socket.receive('presence', {
        ticketId: 't42',
        userId: 'u2',
        name: 'Neha Iyer',
        left: true,
      });
    });
    expect(await screen.findByText('Also viewing: Arun Kumar')).toBeInTheDocument();
    expect(screen.queryByText('Neha Iyer is replying…')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Message/ }), 'Looking into it');
    await waitFor(() => {
      expect(live.socket.sent).toContainEqual(['presence', { ticketId: 't42', typing: 'reply' }]);
    });
  });

  it('drops someone who has gone quiet for 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api();
      renderRoute('/tickets/42', { host: WORKSPACE });
      await openComposer();
      act(() => {
        live.socket.receive('presence', {
          ticketId: 't42',
          userId: 'u2',
          name: 'Neha Iyer',
          typing: null,
        });
      });
      expect(await screen.findByText('Also viewing: Neha Iyer')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(36_000);
      });
      await waitFor(() => {
        expect(screen.queryByText('Also viewing: Neha Iyer')).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns before sending when someone else replied meanwhile', async () => {
    const { posted, setMessages } = api();
    const user = userEvent.setup();
    renderRoute('/tickets/42', { host: WORKSPACE });
    const box = await openComposer();
    await user.type(box, 'Please try again.');
    setMessages([replyBy('Neha Iyer', 'u2', new Date().toISOString())]);
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(/^Neha Iyer replied .*\. Check it before you send yours\./);
    expect(posted).toEqual([]);
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();

    // Review: nothing is sent; a later send only warns about newer replies.
    await user.click(within(warning).getByRole('button', { name: 'Review' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });

    await user.type(screen.getByRole('textbox', { name: /Message/ }), 'One more thing.');
    setMessages([replyBy('Arun Kumar', 'u3', new Date().toISOString())]);
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', { name: 'Send anyway' }),
    );
    await waitFor(() => {
      expect(posted).toHaveLength(2);
    });
    expect(posted[1]).toMatchObject({ kind: 'reply', body: 'One more thing.' });
  });
});
