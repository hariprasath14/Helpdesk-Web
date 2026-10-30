import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { EmailSettings, Me } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const ADDRESS = 'acme@mail.helpdesk.local';
const SETTINGS: EmailSettings = {
  senderName: null,
  workspaceName: 'Acme Support',
  address: ADDRESS,
  from: `"Acme Support" <${ADDRESS}>`,
  customerNotifications: { received: true, resolved: true, agentCreated: false },
};

function emailApi({ session = me, testFails = false }: { session?: Me; testFails?: boolean } = {}) {
  const saved: unknown[] = [];
  let tests = 0;
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/workspace/email'), () => HttpResponse.json(SETTINGS)),
    http.patch(apiUrl('/api/v1/workspace/email'), async ({ request }) => {
      const body = (await request.json()) as {
        senderName?: string | null;
        customerNotifications?: Partial<EmailSettings['customerNotifications']>;
      };
      saved.push(body);
      const senderName = body.senderName ?? null;
      return HttpResponse.json({
        ...SETTINGS,
        senderName,
        from: `"${senderName ?? 'Acme Support'}" <${ADDRESS}>`,
        customerNotifications: { ...SETTINGS.customerNotifications, ...body.customerNotifications },
      });
    }),
    http.post(apiUrl('/api/v1/workspace/email/test'), () => {
      tests += 1;
      return testFails
        ? apiError(
            503,
            'EMAIL_NOT_SENT',
            'The test email could not be sent. Try again in a few minutes.',
          )
        : HttpResponse.json({ to: 'ravi@acme.test' });
    }),
  );
  return { saved, tests: () => tests };
}

describe('Settings → Email', () => {
  it('changes the sender name customers see, and back to the workspace name', async () => {
    const { saved } = emailApi();
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    const field = await screen.findByRole('textbox', { name: 'Sender name' });
    expect(field).toHaveAttribute('placeholder', 'Acme Support');
    expect(screen.getByText(`"Acme Support" <${ADDRESS}>`)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save sender name' });
    expect(save).toBeDisabled();

    await user.type(field, 'x'.repeat(81));
    await user.click(save);
    expect(screen.getByText('Use at most 80 characters.')).toBeInTheDocument();
    expect(saved).toEqual([]);

    await user.clear(field);
    await user.type(field, '  Acme Helpdesk ');
    await user.click(save);
    expect(await screen.findByText('Sender name saved.')).toBeInTheDocument();
    expect(screen.getByText(`"Acme Helpdesk" <${ADDRESS}>`)).toBeInTheDocument();
    expect(field).toHaveValue('Acme Helpdesk');

    await user.clear(field);
    await user.click(save);
    expect(saved).toEqual([{ senderName: 'Acme Helpdesk' }, { senderName: null }]);
  });

  it('copies the support address and explains how to forward your own', async () => {
    emailApi();
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(ADDRESS);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByText('Forward all its email to the address above.')).toBeInTheDocument();
  });

  it('shows the workspace address and sends a test email', async () => {
    const api = emailApi();
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Workspace email address' });
    expect(within(section).getByText(ADDRESS)).toBeInTheDocument();
    expect(section).toHaveTextContent('Sent to ravi@acme.test');
    await user.click(within(section).getByRole('button', { name: 'Send me a test email' }));
    expect(await screen.findByText('Test email sent to ravi@acme.test.')).toBeInTheDocument();
    expect(api.tests()).toBe(1);
  });

  it('says when the test email could not be sent', async () => {
    emailApi({ testFails: true });
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Send me a test email' }));
    expect(
      await screen.findByText('The test email could not be sent. Try again in a few minutes.'),
    ).toBeInTheDocument();
  });

  it('turns customer emails on and off', async () => {
    const { saved } = emailApi();
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Customer emails' });
    const received = within(section).getByRole('switch', { name: /Request received/ });
    const opened = within(section).getByRole('switch', { name: /Ticket opened for them/ });
    expect(received).toBeChecked();
    expect(opened).not.toBeChecked();
    await user.click(opened);
    expect(await screen.findByText('Customer emails saved.')).toBeInTheDocument();
    expect(saved).toEqual([{ customerNotifications: { agentCreated: true } }]);
    expect(within(section).getByRole('switch', { name: /Ticket opened for them/ })).toBeChecked();
  });

  it('says why a change could not be saved', async () => {
    emailApi();
    server.use(
      http.patch(apiUrl('/api/v1/workspace/email'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'senderName', message: 'Use at most 80 characters.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/settings/email', { host: WORKSPACE });
    await user.type(await screen.findByRole('textbox', { name: 'Sender name' }), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Save sender name' }));
    expect(await screen.findByText('Use at most 80 characters.')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Ticket resolved/ }));
    expect(await screen.findByText('Check the highlighted fields.')).toBeInTheDocument();
  });

  it('is for admins only', async () => {
    // A supervisor sees other settings pages, not this one.
    emailApi({
      session: {
        ...me,
        role: 'supervisor',
        isOwner: false,
        permissions: ['tickets.work', 'members.view'],
      },
    });
    renderRoute('/settings/email', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change email settings/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Sender name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email' })).not.toBeInTheDocument();
  });

  it('offers to try again when the settings do not load', async () => {
    emailApi();
    server.use(
      http.get(apiUrl('/api/v1/workspace/email'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/settings/email', { host: WORKSPACE });
    await userEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('Settings overview and menu', () => {
  it('opens on every page this person can use, in groups', async () => {
    emailApi();
    renderRoute('/settings', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    for (const group of ['Team', 'Tickets', 'Automation', 'Channels', 'Workspace']) {
      expect(screen.getByRole('region', { name: group })).toBeInTheDocument();
    }
    const automation = screen.getByRole('region', { name: 'Automation' });
    expect(within(automation).getByRole('link', { name: /^SLAs/ })).toHaveAttribute(
      'href',
      '/settings/slas',
    );
    const menu = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(menu).getByRole('link', { name: 'All settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menu).getByRole('list', { name: 'Channels' })).toHaveTextContent('EmailWeb form');
  });

  it('shows agents only what they can use', async () => {
    emailApi({ session: { ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] } });
    renderRoute('/settings', { host: WORKSPACE });
    const tickets = await screen.findByRole('region', { name: 'Tickets' });
    expect(within(tickets).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Team' })).not.toBeInTheDocument();
  });

  it('asks before leaving a page with an unsaved change', async () => {
    emailApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/settings/email', { host: WORKSPACE });
    await user.type(await screen.findByRole('textbox', { name: 'Sender name' }), 'Acme Help');
    const menu = screen.getByRole('navigation', { name: 'Settings' });
    await user.click(within(menu).getByRole('link', { name: 'Rules' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/settings/email');
    expect(screen.getByRole('textbox', { name: 'Sender name' })).toHaveValue('Acme Help');
  });
});
