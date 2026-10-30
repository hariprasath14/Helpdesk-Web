import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { PRODUCT_NAME } from '../../product';

function availabilityHandler(taken: string[] = []) {
  return http.get(apiUrl('/api/v1/signup/address-availability'), ({ request }) => {
    const address = new URL(request.url).searchParams.get('address') ?? '';
    return taken.includes(address)
      ? HttpResponse.json({
          address,
          available: false,
          reason: 'taken',
          alternatives: [`${address}-support`, `${address}-team`],
        })
      : HttpResponse.json({ address, available: true, alternatives: [] });
  });
}

async function fillSignUp(user: ReturnType<typeof userEvent.setup>) {
  // Pasting fills each field in one change; key-by-key typing is covered by the tests above.
  const fill = async (label: RegExp, text: string) => {
    await user.click(screen.getByLabelText(label));
    await user.paste(text);
  };
  await fill(/Full name/, 'Ravi Shankar');
  await fill(/Work email/, 'ravi@acme.test');
  await fill(/^Password/, 'correct-horse-battery-staple');
  await fill(/Company name/, 'Acme Support');
  await user.click(screen.getByLabelText(/I agree to the/));
}

describe('sign-up page', () => {
  it('suggests a workspace address from the company name and checks it live', async () => {
    server.use(availabilityHandler());
    const user = userEvent.setup();
    renderRoute('/signup');

    await user.type(await screen.findByLabelText(/Company name/), 'Acme Support');
    expect(screen.getByLabelText(/Workspace address/)).toHaveValue('acme-support');
    expect(await screen.findByText('acme-support.helpdesk.test is available')).toBeInTheDocument();
  });

  it('keeps an address the person typed, cleaning out characters an address cannot have', async () => {
    server.use(availabilityHandler());
    const user = userEvent.setup();
    renderRoute('/signup');

    const address = await screen.findByLabelText(/Workspace address/);
    await user.type(address, 'My Desk!');
    await user.type(screen.getByLabelText(/Company name/), 'Acme Support');
    expect(address).toHaveValue('my-desk');
  });

  it('offers free alternatives when the address is taken, and uses one when clicked', async () => {
    server.use(availabilityHandler(['acme-support']));
    const user = userEvent.setup();
    renderRoute('/signup');

    await user.type(await screen.findByLabelText(/Company name/), 'Acme Support');
    expect(await screen.findByText('This address is already taken.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'acme-support-team' }));
    expect(screen.getByLabelText(/Workspace address/)).toHaveValue('acme-support-team');
  });

  it('explains every missing or invalid field before sending anything', async () => {
    const user = userEvent.setup();
    renderRoute('/signup');

    await user.type(await screen.findByLabelText(/^Password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    for (const message of [
      'Enter your full name.',
      'Enter a valid email address.',
      'Use at least 12 characters.',
      'Enter your company name.',
      'Accept the Terms and Privacy Policy to continue.',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Full name/)).toHaveFocus();
  });

  it('signs up and moves to "check your email"', async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      availabilityHandler(),
      http.post(apiUrl('/api/v1/signup'), async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ email: 'ravi@acme.test' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/signup');
    await screen.findByLabelText(/Full name/);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ravi@acme.test')).toBeInTheDocument();
    expect(sent).toMatchObject({
      name: 'Ravi Shankar',
      email: 'ravi@acme.test',
      companyName: 'Acme Support',
      workspaceAddress: 'acme-support',
      acceptTerms: true,
      timezone: expect.any(String) as unknown,
    });
  });

  it('explains a refused throwaway email under the email field', async () => {
    const message =
      "Please use an email address you'll keep using. Temporary email services aren't accepted.";
    server.use(
      availabilityHandler(),
      http.post(apiUrl('/api/v1/signup'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Use an email address you will keep.', {
          fields: [{ field: 'email', message }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/signup');
    await screen.findByLabelText(/Full name/);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(/Work email/)).toHaveFocus();
    expect(screen.getByLabelText(/Work email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the server’s field messages, such as a breached password', async () => {
    server.use(
      availabilityHandler(),
      http.post(apiUrl('/api/v1/signup'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Choose a different password.', {
          fields: [{ field: 'password', message: 'This password has appeared in a data breach.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/signup');
    await screen.findByLabelText(/Full name/);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(
      await screen.findByText('This password has appeared in a data breach.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveFocus();
  });

  it('offers alternatives when the address was taken at the last moment', async () => {
    server.use(
      availabilityHandler(),
      http.post(apiUrl('/api/v1/signup'), () =>
        apiError(409, 'CONFLICT', 'That workspace address is taken.', {
          fields: [{ field: 'workspaceAddress', message: 'This address is already taken.' }],
          alternatives: ['acme-support-hq'],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/signup');
    await screen.findByLabelText(/Full name/);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('button', { name: 'acme-support-hq' })).toBeInTheDocument();
  });

  it('explains rate limiting in plain words', async () => {
    server.use(
      availabilityHandler(),
      http.post(apiUrl('/api/v1/signup'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/signup');
    await screen.findByLabelText(/Full name/);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts from your network',
    );
  });

  it('shows and hides the password, with a strength bar', async () => {
    const user = userEvent.setup();
    renderRoute('/signup');
    const password = await screen.findByLabelText(/^Password/);
    await user.type(password, 'correct-horse-battery-staple');

    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getByText(/Password strength:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});

describe('check your email page', () => {
  it('sends to sign-up when it has no email to show', async () => {
    renderRoute('/signup/check-email');
    expect(
      await screen.findByRole('heading', { name: `Create your ${PRODUCT_NAME} workspace` }),
    ).toBeInTheDocument();
  });

  it('sends a fresh link straight away when coming from an expired link', async () => {
    let resent: unknown;
    server.use(
      http.post(apiUrl('/api/v1/signup/resend'), async ({ request }) => {
        resent = await request.json();
        return HttpResponse.json({ email: 'ravi@acme.test' }, { status: 202 });
      }),
    );
    renderRoute('/signup/check-email?email=ravi%40acme.test&resend=1');

    expect(
      await screen.findByText('We’ve sent another email.'.replace('’', "'")),
    ).toBeInTheDocument();
    expect(resent).toEqual({ email: 'ravi@acme.test' });
    expect(screen.getByRole('button', { name: /Resend email in \d+s/ })).toBeDisabled();
  });
});

describe('email confirmation page', () => {
  const verifyAt = (token = 'a'.repeat(43)) => `/verify-email?token=${token}`;

  it('confirms once, then opens the workspace signed in', async () => {
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/verify-email'), () => {
        calls += 1;
        return HttpResponse.json(me);
      }),
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    );
    renderRoute(verifyAt(), { host: WORKSPACE });

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('offers a new link when the link has expired', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/verify-email'), () =>
        apiError(400, 'VALIDATION_ERROR', 'This link has expired.', {
          reason: 'expired',
          email: 'ravi@acme.test',
        }),
      ),
    );
    renderRoute(verifyAt(), { host: WORKSPACE });

    const link = await screen.findByRole('link', { name: 'Send a new link' });
    expect(link.getAttribute('href')).toContain(
      '/signup/check-email?email=ravi%40acme.test&resend=1',
    );
  });

  it('explains a link that was already used', async () => {
    server.use(
      http.post(apiUrl('/api/v1/auth/verify-email'), () =>
        apiError(400, 'VALIDATION_ERROR', 'This link has already been used.', { reason: 'used' }),
      ),
    );
    renderRoute(verifyAt(), { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: 'This link was already used' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute('href', '/');
  });

  it('treats a missing or unknown token as an invalid link', async () => {
    renderRoute('/verify-email', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: 'This link is not valid' }),
    ).toBeInTheDocument();
  });

  it('lets the person retry after a network problem', async () => {
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/auth/verify-email'), () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(me);
      }),
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
    );
    const user = userEvent.setup();
    renderRoute(verifyAt(), { host: WORKSPACE });

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
      ).toBeInTheDocument();
    });
  });
});

describe('legal pages', () => {
  it.each([
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
  ])('%s shows a placeholder until the text is ready', async (path, title) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });
});
