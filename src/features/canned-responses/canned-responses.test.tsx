import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { CannedResponse, Me } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const agentMe: Me = { ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] };

const RESET: CannedResponse = {
  id: 'cr1',
  title: 'Password reset steps',
  body: 'Hi {{contact.first_name}}, open Settings → Security.',
  shared: true,
  mine: false,
  authorName: 'Neha Iyer',
  canEdit: true,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};
const SIGN_OFF: CannedResponse = {
  ...RESET,
  id: 'cr2',
  title: 'My sign-off',
  body: 'Cheers, {{agent.first_name}}',
  shared: false,
  mine: true,
};
const PLACEHOLDERS = [
  { key: 'contact.first_name', label: "Requester's first name" },
  { key: 'ticket.number', label: 'Ticket number' },
];

function cannedApi({
  session = me,
  items = [RESET, SIGN_OFF],
}: { session?: Me; items?: CannedResponse[] } = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let current = items;
  const record = async (request: Request) => {
    const body: unknown = request.headers.get('content-type')?.includes('json')
      ? await request.json()
      : null;
    calls.push({ method: request.method, url: new URL(request.url).pathname, body });
    return body as Record<string, unknown>;
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/canned-responses'), () =>
      HttpResponse.json({ cannedResponses: current, placeholders: PLACEHOLDERS }),
    ),
    http.post(apiUrl('/api/v1/canned-responses'), async ({ request }) => {
      const body = await record(request);
      if (String(body.body).includes('{{contact.phone}}')) {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [
            {
              field: 'body',
              message:
                '{{contact.phone}} is not a placeholder you can use. Pick one from the list.',
            },
          ],
        });
      }
      const saved = {
        ...SIGN_OFF,
        ...body,
        id: 'cr3',
        mine: !body.shared,
      };
      current = [...current, saved];
      return HttpResponse.json(saved);
    }),
    http.patch(apiUrl('/api/v1/canned-responses/:id'), async ({ request, params }) => {
      const body = await record(request);
      const saved = { ...current.find((item) => item.id === params.id), ...body } as CannedResponse;
      current = current.map((item) => (item.id === saved.id ? saved : item));
      return HttpResponse.json(saved);
    }),
    http.delete(apiUrl('/api/v1/canned-responses/:id'), async ({ request, params }) => {
      await record(request);
      current = current.filter((item) => item.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe('Settings → Canned responses', () => {
  it('lists personal and shared ones, searches, edits and deletes', async () => {
    const calls = cannedApi();
    const user = userEvent.setup();
    renderRoute('/settings/canned-responses', { host: WORKSPACE });
    const list = await screen.findByRole('list', { name: 'Canned responses' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Shared')).toBeInTheDocument();
    expect(within(list).getByText('Only you')).toBeInTheDocument();
    expect(within(list).getByText('By Neha Iyer')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search canned responses'), 'cheers');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByLabelText('Search canned responses'));

    await user.click(screen.getByRole('button', { name: 'Password reset steps' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Password reset steps' });
    expect(within(drawer).getByRole('checkbox', { name: /Share with everyone/ })).toBeChecked();
    await user.clear(within(drawer).getByLabelText(/^Title/));
    await user.type(within(drawer).getByLabelText(/^Title/), 'Reset password');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Canned response Reset password saved.')).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/canned-responses/cr1',
      body: { title: 'Reset password', shared: true },
    });

    await user.click(screen.getByRole('button', { name: 'Actions for My sign-off' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Canned response My sign-off deleted.')).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/api/v1/canned-responses/cr2' });
  });

  it('adds one with a placeholder, and shows a refused placeholder', async () => {
    const calls = cannedApi({ items: [] });
    const user = userEvent.setup();
    renderRoute('/settings/canned-responses', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'New canned response' }));
    const drawer = await screen.findByRole('dialog', { name: 'New canned response' });
    await user.click(within(drawer).getByRole('button', { name: 'Add canned response' }));
    expect(within(drawer).getByText('Enter a title.')).toBeInTheDocument();
    expect(within(drawer).getByText('Enter the text.')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.type(within(drawer).getByLabelText(/^Title/), 'Ack');
    await user.type(within(drawer).getByLabelText(/^Text/), 'Hi ');
    await user.selectOptions(
      within(drawer).getByLabelText('Insert a placeholder'),
      "Requester's first name",
    );
    expect(within(drawer).getByLabelText(/^Text/)).toHaveValue('Hi {{contact.first_name}}');
    await user.type(within(drawer).getByLabelText(/^Text/), ', call {{{{contact.phone}}');
    await user.click(within(drawer).getByRole('button', { name: 'Add canned response' }));
    expect(
      await within(drawer).findByText(/\{\{contact.phone\}\} is not a placeholder you can use/),
    ).toBeInTheDocument();

    await user.clear(within(drawer).getByLabelText(/^Text/));
    await user.type(within(drawer).getByLabelText(/^Text/), 'We are on it.');
    await user.click(within(drawer).getByRole('checkbox', { name: /Share with everyone/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Add canned response' }));
    expect(await screen.findByText('Canned response Ack added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ title: 'Ack', body: 'We are on it.', shared: true });
  });

  it('lets agents keep their own, without sharing', async () => {
    const calls = cannedApi({
      session: agentMe,
      items: [{ ...RESET, canEdit: false }, SIGN_OFF],
    });
    const user = userEvent.setup();
    renderRoute('/settings/canned-responses', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Canned responses' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Canned responses' });
    expect(screen.getByRole('link', { name: 'Canned responses' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Password reset steps' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for Password reset steps' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New canned response' }));
    const drawer = await screen.findByRole('dialog', { name: 'New canned response' });
    expect(within(drawer).queryByRole('checkbox')).toBeNull();
    expect(within(drawer).getByText(/Only you see this one/)).toBeInTheDocument();
    await user.type(within(drawer).getByLabelText(/^Title/), 'Mine');
    await user.type(within(drawer).getByLabelText(/^Text/), 'Text');
    await user.click(within(drawer).getByRole('button', { name: 'Add canned response' }));
    expect(await screen.findByText('Canned response Mine added.')).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ title: 'Mine', body: 'Text' });
  });

  it('offers to try again when they do not load', async () => {
    cannedApi();
    server.use(
      http.get(apiUrl('/api/v1/canned-responses'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/settings/canned-responses', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
