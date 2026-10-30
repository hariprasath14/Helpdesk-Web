import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { goTo } from '../../lib/go-to';
import { apiError, me, signedOut, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { PRODUCT_NAME } from '../../product';

vi.mock('../../lib/go-to', () => ({ goTo: vi.fn() }));

const TOKEN = 'a'.repeat(43);

/** A workspace where nobody is signed in until POST /auth/login succeeds. */
function loginFlow(answer: () => Response | Promise<Response> = () => HttpResponse.json(me)) {
  let signedIn = false;
  let sent: unknown;
  server.use(
    http.get(apiUrl('/api/v1/me'), () => (signedIn ? HttpResponse.json(me) : signedOut())),
    http.post(apiUrl('/api/v1/auth/login'), async ({ request }) => {
      sent = await request.json();
      const response = await answer();
      if (response.ok) signedIn = true;
      return response;
    }),
  );
  return { sent: () => sent };
}

async function fillLogin(user: ReturnType<typeof userEvent.setup>, password = 'my-secret-pass') {
  await user.type(await screen.findByLabelText(/^Email/), 'ravi@acme.test');
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login page', () => {
  it('signs in and opens the workspace', async () => {
    const flow = loginFlow();
    const user = userEvent.setup();
    renderRoute('/login', { host: WORKSPACE });
    await fillLogin(user);

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(flow.sent()).toEqual({ email: 'ravi@acme.test', password: 'my-secret-pass' });
  });

  it('goes back to the page the person wanted', async () => {
    loginFlow();
    const user = userEvent.setup();
    renderRoute('/login?next=%2Faccount', { host: WORKSPACE });
    await fillLogin(user);
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
  });

  it('never follows a "next" address to another site', async () => {
    loginFlow();
    const user = userEvent.setup();
    const { router } = renderRoute('/login?next=%2F%2Fevil.example', { host: WORKSPACE });
    await fillLogin(user);
    await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ });
    expect(router.state.location.pathname).toBe('/');
  });

  it('says the email or password is wrong, clears the password and puts the cursor back in it', async () => {
    loginFlow(() => apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    const user = userEvent.setup();
    renderRoute('/login', { host: WORKSPACE });
    await fillLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
    expect(screen.getByLabelText(/^Password/)).toHaveFocus();
    expect(screen.getByLabelText(/^Email/)).toHaveValue('ravi@acme.test');
  });

  it('explains a locked login with the way out', async () => {
    loginFlow(() =>
      apiError(
        429,
        'LOGIN_LOCKED',
        'Too many attempts. Try again in 15 minutes, or reset your password.',
        { retryAfterSeconds: 900 },
      ),
    );
    const user = userEvent.setup();
    renderRoute('/login', { host: WORKSPACE });
    await fillLogin(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 15 minutes, or reset your password.',
    );
  });

  it('explains missing fields without sending anything', async () => {
    const flow = loginFlow();
    const user = userEvent.setup();
    renderRoute('/login', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
    expect(flow.sent()).toBeUndefined();
  });

  it('goes straight in when already signed in', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)));
    renderRoute('/login', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
  });

  it('says so on an address that is not a workspace', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => apiError(404, 'NOT_FOUND', 'Not found.')));
    renderRoute('/login', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Workspace not found' })).toBeInTheDocument();
  });

  it('links to "forgot password" and to finding another workspace', async () => {
    loginFlow();
    renderRoute('/login', { host: WORKSPACE });
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Find your workspace' })).toHaveAttribute(
      'href',
      `http://helpdesk.test${window.location.port ? `:${window.location.port}` : ''}/login`,
    );
  });

  it.each([
    ['signed-out', "You've signed out."],
    ['password-reset', 'Your password was changed. Sign in with your new password.'],
    ['expired', 'Your session ended. Sign in again to continue.'],
  ])('explains why the person is here (%s)', async (reason, text) => {
    loginFlow();
    renderRoute(`/login?reason=${reason}`, { host: WORKSPACE });
    expect(await screen.findByText(text)).toHaveAttribute('role', 'status');
  });

  it('warns when Caps Lock is on', async () => {
    loginFlow();
    const user = userEvent.setup();
    renderRoute('/login', { host: WORKSPACE });
    await user.click(await screen.findByLabelText(/^Password/));
    await user.keyboard('{CapsLock}a');
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
    await user.keyboard('{CapsLock}b');
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();
  });
});

describe('forgot password page', () => {
  it('sends a reset link and gives the same answer whoever asks', async () => {
    let sent: unknown;
    server.use(
      http.post(apiUrl('/api/v1/auth/forgot-password'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ email: 'ravi@acme.test' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/forgot-password', { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/^Email/), 'ravi@acme.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/We sent it to ravi@acme\.test/)).toBeInTheDocument();
    expect(sent).toEqual({ email: 'ravi@acme.test' });
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('checks the email first, and explains rate limits', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/forgot-password'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/forgot-password', { host: WORKSPACE });
    const email = await screen.findByLabelText(/^Email/);
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(email).toHaveFocus();

    await user.type(email, 'ravi@acme.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
});

describe('reset password page', () => {
  const linkIs = (answer: () => Response) => {
    server.use(http.post(apiUrl('/api/v1/auth/reset-password/check'), answer));
  };

  it('checks the link, saves the new password and sends the person to sign in', async () => {
    let sent: unknown;
    linkIs(() => HttpResponse.json({ email: 'ravi@acme.test' }));
    server.use(
      http.get(apiUrl('/api/v1/me'), signedOut),
      http.post(apiUrl('/api/v1/auth/reset-password'), async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });

    expect(await screen.findByText('For ravi@acme.test')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^New password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(
      await screen.findByText('Your password was changed. Sign in with your new password.'),
    ).toBeInTheDocument();
    expect(sent).toEqual({ token: TOKEN, password: 'quiet-harbour-lantern-41' });
  });

  it.each([
    ['expired', 'This link has expired'],
    ['used', 'This link was already used'],
    ['invalid', 'This link is not valid'],
  ])('explains a link that is %s, with a way to get a new one', async (reason, title) => {
    linkIs(() => apiError(400, 'VALIDATION_ERROR', 'This link cannot be used.', { reason }));
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('treats a mistyped or cut-off link as not valid, not as a connection problem', async () => {
    linkIs(() =>
      apiError(400, 'VALIDATION_ERROR', 'The request body is invalid.', {
        fields: [{ field: 'token', message: 'Too small' }],
      }),
    );
    renderRoute('/reset-password?token=cut-off', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: 'This link is not valid' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Check your connection/)).not.toBeInTheDocument();
  });

  it('says so on an address that is not a workspace', async () => {
    linkIs(() => apiError(404, 'NOT_FOUND', 'This workspace does not exist.'));
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Workspace not found' })).toBeInTheDocument();
  });

  it('treats a missing token as an invalid link', async () => {
    renderRoute('/reset-password', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: 'This link is not valid' }),
    ).toBeInTheDocument();
  });

  it('shows why a new password was refused, under the field', async () => {
    linkIs(() => HttpResponse.json({ email: 'ravi@acme.test' }));
    server.use(
      http.post(apiUrl('/api/v1/auth/reset-password'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Choose a different password.', {
          fields: [
            {
              field: 'password',
              message: 'You used this password recently. Choose a different one.',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });
    const field = await screen.findByLabelText(/^New password/);
    await user.type(field, 'an-old-password-again');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(
      await screen.findByText('You used this password recently. Choose a different one.'),
    ).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('asks for at least 12 characters before sending', async () => {
    linkIs(() => HttpResponse.json({ email: 'ravi@acme.test' }));
    const user = userEvent.setup();
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/^New password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
  });

  it('lets the person retry when the link cannot be checked', async () => {
    let calls = 0;
    linkIs(() => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : HttpResponse.json({ email: 'ravi@acme.test' });
    });
    const user = userEvent.setup();
    renderRoute(`/reset-password?token=${TOKEN}`, { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('For ravi@acme.test')).toBeInTheDocument();
  });
});

describe('find your workspace (main address)', () => {
  it('goes to the workspace address typed', async () => {
    const user = userEvent.setup();
    renderRoute('/login');
    await user.type(await screen.findByLabelText(/Workspace address/), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(goTo).toHaveBeenCalledWith(
      `http://acme.helpdesk.test${window.location.port ? `:${window.location.port}` : ''}/login`,
    );
  });

  it('asks for an address before going anywhere', async () => {
    vi.mocked(goTo).mockClear();
    const user = userEvent.setup();
    renderRoute('/login');
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter your workspace address, for example acme.')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
  });

  it('emails links to every workspace, with the same answer whoever asks', async () => {
    let sent: unknown;
    server.use(
      http.post(apiUrl('/api/v1/auth/find-workspaces'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ email: 'ravi@acme.test' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/login');
    await user.type(await screen.findByLabelText(/Work email/), 'ravi@acme.test');
    await user.click(screen.getByRole('button', { name: 'Email me my workspaces' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      `If ravi@acme.test has a ${PRODUCT_NAME} account, we've emailed links to its workspaces.`,
    );
    expect(sent).toEqual({ email: 'ravi@acme.test' });
  });

  it('checks the email and explains failures', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/find-workspaces'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/login');
    await user.click(await screen.findByRole('button', { name: 'Email me my workspaces' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Work email/), 'ravi@acme.test');
    await user.click(screen.getByRole('button', { name: 'Email me my workspaces' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts');
    });
  });

  it('is linked from sign-up, and links back to it', async () => {
    const user = userEvent.setup();
    renderRoute('/signup');
    await user.click(await screen.findByRole('link', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { name: `Sign in to ${PRODUCT_NAME}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a workspace' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });
});
