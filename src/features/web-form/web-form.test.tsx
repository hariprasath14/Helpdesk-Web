import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { PublicWebForm, WebFormSettings } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

const FORM: PublicWebForm = {
  enabled: true,
  workspaceName: 'Acme Support',
  title: 'Contact support',
  intro: 'We answer within a day.',
};

function publicApi(form: PublicWebForm = FORM) {
  const sent: unknown[] = [];
  server.use(
    http.get(apiUrl('/api/v1/web-form'), () => HttpResponse.json(form)),
    http.post(apiUrl('/api/v1/web-form/requests'), async ({ request }) => {
      const body = (await request.json()) as { email: string };
      sent.push(body);
      if (body.email === 'taken@acme.test') {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'email', message: 'Enter a valid email address.' }],
        });
      }
      return HttpResponse.json({ received: true });
    }),
  );
  return sent;
}

describe('the public web form', () => {
  it('sends a request and says what happens next', async () => {
    const sent = publicApi();
    const user = userEvent.setup();
    renderRoute('/support', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Contact support' })).toBeInTheDocument();
    expect(screen.getByText('We answer within a day.')).toBeInTheDocument();
    expect(screen.getByText('Acme Support')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter a subject.')).toBeInTheDocument();
    expect(screen.getByText('Tell us how we can help.')).toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.type(screen.getByLabelText(/^Your name/), 'Neha Iyer');
    await user.type(screen.getByLabelText(/^Email/), 'neha@acme.test');
    await user.type(screen.getByLabelText(/^Subject/), 'Payslip missing');
    await user.type(screen.getByLabelText(/^How can we help/), 'October is not there.');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(screen.getByText(/We'll reply to neha@acme.test/)).toBeInTheDocument();
    expect(sent).toEqual([
      {
        name: 'Neha Iyer',
        email: 'neha@acme.test',
        subject: 'Payslip missing',
        description: 'October is not there.',
      },
    ]);

    // Another request starts with the name and email kept, the rest empty.
    await user.click(screen.getByRole('button', { name: 'Send another request' }));
    expect(screen.getByLabelText(/^Email/)).toHaveValue('neha@acme.test');
    expect(screen.getByLabelText(/^Subject/)).toHaveValue('');
  });

  it('sends what a bot puts in the hidden field, so the API can drop it', async () => {
    const sent = publicApi();
    const user = userEvent.setup();
    const { container } = renderRoute('/support', { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/^Your name/), 'Bot');
    await user.type(screen.getByLabelText(/^Email/), 'bot@spam.test');
    await user.type(screen.getByLabelText(/^Subject/), 'Buy');
    await user.type(screen.getByLabelText(/^How can we help/), 'Cheap');
    const hidden = container.querySelector<HTMLInputElement>('input[name="website"]');
    if (!hidden) throw new Error('no hidden field');
    await user.type(hidden, 'http://spam.test');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(sent).toMatchObject([{ website: 'http://spam.test' }]);
  });

  it("shows the API's reasons next to the fields", async () => {
    publicApi();
    const user = userEvent.setup();
    renderRoute('/support', { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/^Your name/), 'Neha');
    await user.type(screen.getByLabelText(/^Email/), 'taken@acme.test');
    await user.type(screen.getByLabelText(/^Subject/), 'Hi');
    await user.type(screen.getByLabelText(/^How can we help/), 'Help');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
  });

  it('says when the form is off, or does not load', async () => {
    publicApi({ ...FORM, enabled: false, title: '', intro: '' });
    renderRoute('/support', { host: WORKSPACE });
    expect(await screen.findByText('This form is not available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('offers to try again when it does not load', async () => {
    server.use(
      http.get(apiUrl('/api/v1/web-form'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/support', { host: WORKSPACE });
    await userEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

const SETTINGS: WebFormSettings = {
  enabled: false,
  title: 'Contact support',
  intro: '',
  url: 'http://acme.helpdesk.test/support',
};

function settingsApi() {
  const saved: unknown[] = [];
  let current = SETTINGS;
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    http.get(apiUrl('/api/v1/workspace/web-form'), () => HttpResponse.json(current)),
    http.patch(apiUrl('/api/v1/workspace/web-form'), async ({ request }) => {
      const body = (await request.json()) as Partial<WebFormSettings>;
      saved.push(body);
      current = { ...current, ...body };
      return HttpResponse.json(current);
    }),
  );
  return saved;
}

describe('Settings → Web form', () => {
  it('turns the form on, changes its text and shares its link and embed code', async () => {
    const saved = settingsApi();
    const user = userEvent.setup();
    renderRoute('/settings/web-form', { host: WORKSPACE });

    const toggle = await screen.findByRole('switch', { name: /Show the web form/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(await screen.findByText('Web form saved.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Show the web form/ })).toBeChecked();

    const text = screen.getByRole('region', { name: 'Text' });
    await user.clear(within(text).getByLabelText(/^Title/));
    await user.click(within(text).getByRole('button', { name: 'Save text' }));
    expect(within(text).getByText('Enter a title.')).toBeInTheDocument();
    await user.type(within(text).getByLabelText(/^Title/), 'Payroll help');
    await user.type(within(text).getByLabelText(/^Introduction/), 'Within a day.');
    await user.click(within(text).getByRole('button', { name: 'Save text' }));
    expect(await screen.findByText('Web form text saved.')).toBeInTheDocument();
    expect(saved).toEqual([{ enabled: true }, { title: 'Payroll help', intro: 'Within a day.' }]);

    const share = screen.getByRole('region', { name: 'Share it' });
    expect(
      within(share).getByRole('link', { name: /acme.helpdesk.test\/support/ }),
    ).toHaveAttribute('href', SETTINGS.url);
    expect(within(share).getByLabelText('Embed code')).toHaveValue(
      `<iframe src="${SETTINGS.url}" title="Contact support" style="width:100%;min-height:720px;border:0"></iframe>`,
    );
    await user.click(within(share).getByRole('button', { name: 'Copy embed code' }));
    expect(await screen.findByText('Embed code copied.')).toBeInTheDocument();
    // userEvent provides the clipboard in tests.
    expect(await navigator.clipboard.readText()).toContain(`<iframe src="${SETTINGS.url}"`);
  });

  it('says why a change could not be saved or copied', async () => {
    settingsApi();
    server.use(
      http.patch(apiUrl('/api/v1/workspace/web-form'), async ({ request }) => {
        const body = (await request.json()) as Partial<WebFormSettings>;
        return body.title
          ? apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
              fields: [{ field: 'title', message: 'Use at most 80 characters.' }],
            })
          : apiError(500, 'INTERNAL', 'Something went wrong on our side.');
      }),
    );
    const user = userEvent.setup();
    renderRoute('/settings/web-form', { host: WORKSPACE });
    await user.click(await screen.findByRole('switch', { name: /Show the web form/ }));
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument();

    const text = screen.getByRole('region', { name: 'Text' });
    await user.type(within(text).getByLabelText(/^Title/), ' for payroll');
    await user.click(within(text).getByRole('button', { name: 'Save text' }));
    expect(await within(text).findByText('Use at most 80 characters.')).toBeInTheDocument();
    await user.type(within(text).getByLabelText(/^Introduction/), 'x');
    await user.click(within(text).getByRole('button', { name: 'Save text' }));
    expect(await within(text).findByText('Use at most 80 characters.')).toBeInTheDocument();

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const share = screen.getByRole('region', { name: 'Share it' });
    await user.click(within(share).getByRole('button', { name: 'Copy embed code' }));
    expect(await screen.findByText('Copy it from the box instead.')).toBeInTheDocument();
  });

  it('is for admins only', async () => {
    settingsApi();
    server.use(
      http.get(apiUrl('/api/v1/me'), () =>
        HttpResponse.json({
          ...me,
          role: 'supervisor',
          isOwner: false,
          permissions: ['tickets.work', 'members.view'],
        }),
      ),
    );
    renderRoute('/settings/web-form', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change the web form/)).toBeInTheDocument();
  });

  it('offers to try again when the settings do not load', async () => {
    settingsApi();
    server.use(
      http.get(apiUrl('/api/v1/workspace/web-form'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/settings/web-form', { host: WORKSPACE });
    await userEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
