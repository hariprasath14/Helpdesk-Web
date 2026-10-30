import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { PRODUCT_NAME } from '../../product';

const signedIn = () => http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me));

describe('your account', () => {
  it('keeps each part in its own tab, kept in the address', async () => {
    server.use(signedIn());
    const user = userEvent.setup();
    const { router } = renderRoute('/account', { host: WORKSPACE });
    expect(await screen.findByLabelText(/Full name/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Current password/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Security' }));
    expect(await screen.findByLabelText(/^Current password/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tab=security');
  });

  it('changes the colour theme for this person, at once', async () => {
    let sent: unknown;
    server.use(
      signedIn(),
      http.patch(apiUrl('/api/v1/me'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...me, user: { ...me.user, theme: 'ocean-cyan' } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=appearance', { host: WORKSPACE });
    const teal = await screen.findByRole('radio', { name: /Help Teal/ });
    expect(teal).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Ocean Cyan/ }));
    expect(await screen.findByText('Theme changed to Ocean Cyan.')).toBeInTheDocument();
    expect(sent).toEqual({ theme: 'ocean-cyan' });
    expect(screen.getByRole('radio', { name: /Ocean Cyan/ })).toBeChecked();
    expect(document.documentElement.dataset.brand).toBe('ocean-cyan');
  });

  it('saves a new name, sending the CSRF token, and shows it at once', async () => {
    let sent: { body: unknown; csrf: string | null } | undefined;
    server.use(
      signedIn(),
      http.patch(apiUrl('/api/v1/me'), async ({ request }) => {
        sent = { body: await request.json(), csrf: request.headers.get('x-csrf-token') };
        return HttpResponse.json({ ...me, user: { ...me.user, name: 'Ravi S. Kumar' } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/account', { host: WORKSPACE });

    const name = await screen.findByLabelText(/Full name/);
    expect(screen.getByText('ravi@acme.test', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Ravi S. Kumar');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(sent).toEqual({ body: { name: 'Ravi S. Kumar' }, csrf: me.csrfToken });
    expect(screen.getAllByText('Ravi S. Kumar').length).toBeGreaterThan(0);
  });

  it('asks for a name before saving', async () => {
    server.use(signedIn());
    const user = userEvent.setup();
    renderRoute('/account', { host: WORKSPACE });
    const name = await screen.findByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'R');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
  });

  it('changes the password, then uses the fresh session’s CSRF token for the next change', async () => {
    const tokens: (string | null)[] = [];
    server.use(
      signedIn(),
      http.post(apiUrl('/api/v1/me/password'), ({ request }) => {
        tokens.push(request.headers.get('x-csrf-token'));
        return HttpResponse.json({ ...me, csrfToken: 'csrf-token-2' });
      }),
      http.post(apiUrl('/api/v1/me/sessions/sign-out-others'), ({ request }) => {
        tokens.push(request.headers.get('x-csrf-token'));
        return HttpResponse.json({ signedOut: 0 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });

    await user.type(await screen.findByLabelText(/^Current password/), 'my-current-password');
    await user.type(screen.getByLabelText(/^New password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('Password changed. You were signed out on your other devices.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Sign out of all other devices' }));
    expect(await screen.findByText('You were not signed in anywhere else.')).toBeInTheDocument();
    expect(tokens).toEqual([me.csrfToken, 'csrf-token-2']);
  });

  it('shows why a password change was refused, under the right field', async () => {
    server.use(
      signedIn(),
      http.post(apiUrl('/api/v1/me/password'), () =>
        apiError(400, 'VALIDATION_ERROR', 'Your current password is incorrect.', {
          fields: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const current = await screen.findByLabelText(/^Current password/);
    await user.type(current, 'wrong-password');
    await user.type(screen.getByLabelText(/^New password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();
    expect(current).toHaveFocus();
  });

  it('checks both password fields before sending, and explains other failures', async () => {
    server.use(
      signedIn(),
      http.post(apiUrl('/api/v1/me/password'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter your current password.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Current password/)).toHaveFocus();

    await user.type(screen.getByLabelText(/^Current password/), 'my-current-password');
    await user.type(screen.getByLabelText(/^New password/), 'quiet-harbour-lantern-41');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('signs out other devices and says how many', async () => {
    server.use(
      signedIn(),
      http.post(apiUrl('/api/v1/me/sessions/sign-out-others'), () =>
        HttpResponse.json({ signedOut: 2 }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Sign out of all other devices' }));
    expect(await screen.findByText('Signed out of 2 other sessions.')).toBeInTheDocument();
  });

  it('says so when signing out other devices fails', async () => {
    server.use(
      signedIn(),
      http.post(apiUrl('/api/v1/me/sessions/sign-out-others'), () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Sign out of all other devices' }));
    expect(
      await screen.findByText(`Cannot reach ${PRODUCT_NAME}`, { exact: false }),
    ).toBeInTheDocument();
  });
});
