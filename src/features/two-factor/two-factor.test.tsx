import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../../api/generated/model';
import { goTo } from '../../lib/go-to';
import { apiError, me, signedOut, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

vi.mock('../../lib/go-to', () => ({ goTo: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const CODES = Array.from({ length: 10 }, (_, i) => `ab${String(i)}d-ef7h`);
const SETUP = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/Helpdesk:ravi%40acme.test?secret=JBSWY3DPEHPK3PXP',
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

const withTwoFactor = (twoFactor: Partial<Me['twoFactor']>): Me => ({
  ...me,
  twoFactor: { ...me.twoFactor, ...twoFactor },
});
const enabledMe = withTwoFactor({ enabled: true, recoveryCodesLeft: 10 });

/** GET /me answers with `first`, and with `after` once `switchOver()` is called. */
function meSequence(first: Me, after: Me = first) {
  let current = first;
  server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(current)));
  return {
    switchOver: () => {
      current = after;
    },
  };
}

describe('login with two-step verification', () => {
  function passwordAccepted() {
    let signedIn = false;
    const sent: unknown[] = [];
    server.use(
      http.get(apiUrl('/api/v1/me'), () => (signedIn ? HttpResponse.json(me) : signedOut())),
      http.post(apiUrl('/api/v1/auth/login'), () =>
        HttpResponse.json({ twoFactorRequired: true }, { status: 202 }),
      ),
      http.post(apiUrl('/api/v1/auth/login/two-factor'), async ({ request }) => {
        sent.push(await request.json());
        signedIn = true;
        return HttpResponse.json(me);
      }),
    );
    return sent;
  }

  async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
    renderRoute('/login', { host: WORKSPACE });
    await user.type(await screen.findByLabelText(/^Email/), 'ravi@acme.test');
    await user.type(screen.getByLabelText(/^Password/), 'my-secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { name: 'Two-step verification' }),
    ).toBeInTheDocument();
  }

  it('asks for the code after the password and sends it as soon as 6 digits are typed', async () => {
    const sent = passwordAccepted();
    const user = userEvent.setup();
    await toCodeStep(user);
    expect(screen.getByLabelText(/6-digit code/)).toHaveFocus();
    await user.type(screen.getByLabelText(/6-digit code/), '12a3456');

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ code: '123456', trustDevice: false }]);
  });

  it('takes a recovery code instead, and can trust this device', async () => {
    const sent = passwordAccepted();
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    await user.click(screen.getByLabelText(/Don't ask again on this device/));
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Enter a recovery code, like abcd-efgh.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Recovery code/), 'abcd-ef7h');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ });
    expect(sent).toEqual([{ code: 'abcd-ef7h', trustDevice: true }]);
  });

  it('says a wrong code is wrong, clears it and keeps the cursor there', async () => {
    passwordAccepted();
    server.use(
      http.post(apiUrl('/api/v1/auth/login/two-factor'), () =>
        apiError(401, 'INVALID_CODE', "That code didn't work. Try the newest code from your app."),
      ),
    );
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.type(screen.getByLabelText(/6-digit code/), '000000');

    expect(
      await screen.findByText("That code didn't work. Try the newest code from your app."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/)).toHaveValue('');
    expect(screen.getByLabelText(/6-digit code/)).toHaveFocus();
  });

  it.each([
    ['TWO_FACTOR_EXPIRED', 401, 'Your sign-in timed out. Enter your password again.'],
    ['LOGIN_LOCKED', 429, 'Too many attempts. Try again in 15 minutes, or reset your password.'],
  ])(
    'goes back to the password with the reason when the server says %s',
    async (code, status, message) => {
      passwordAccepted();
      server.use(
        http.post(apiUrl('/api/v1/auth/login/two-factor'), () => apiError(status, code, message)),
      );
      const user = userEvent.setup();
      await toCodeStep(user);
      await user.type(screen.getByLabelText(/6-digit code/), '123456');

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password/)).toHaveValue('');
    },
  );

  it('lets the person go back to the password step', async () => {
    passwordAccepted();
    const user = userEvent.setup();
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Enter the 6-digit code.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('turning two-step verification on (Your account)', () => {
  async function startSetup(user: ReturnType<typeof userEvent.setup>) {
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Two-step verification' });
    expect(within(section).getByText('Off')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Turn on' }));
    return section;
  }

  it('confirms the password, shows the QR code and key, then the recovery codes to save', async () => {
    const session = meSequence(me, enabledMe);
    let setupBody: unknown;
    let confirmBody: unknown;
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/setup'), async ({ request }) => {
        setupBody = await request.json();
        return HttpResponse.json(SETUP);
      }),
      http.post(apiUrl('/api/v1/me/two-factor/confirm'), async ({ request }) => {
        confirmBody = await request.json();
        session.switchOver();
        return HttpResponse.json({ recoveryCodes: CODES });
      }),
    );
    const user = userEvent.setup();
    const section = await startSetup(user);

    await user.type(within(section).getByLabelText(/Confirm your password/), 'my-secret-pass');
    await user.click(within(section).getByRole('button', { name: 'Continue' }));
    expect(
      await within(section).findByAltText('QR code for setting up two-step verification'),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP'),
    ).toBeInTheDocument();
    await user.type(within(section).getByLabelText(/6-digit code/), '123456');
    await user.click(within(section).getByRole('button', { name: 'Turn on' }));

    const list = await within(section).findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    const done = within(section).getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await user.click(within(section).getByLabelText(/I've saved these codes/));
    await user.click(done);

    expect(await within(section).findByText('On')).toBeInTheDocument();
    expect(within(section).getByText('10 recovery codes left')).toBeInTheDocument();
    expect(setupBody).toEqual({ password: 'my-secret-pass' });
    expect(confirmBody).toEqual({ code: '123456' });
  });

  it('shows a wrong password and a wrong code under their fields', async () => {
    meSequence(me);
    let setupCalls = 0;
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/setup'), () => {
        setupCalls += 1;
        return setupCalls === 1
          ? apiError(400, 'VALIDATION_ERROR', 'Your password is incorrect.', {
              fields: [{ field: 'password', message: 'Your password is incorrect.' }],
            })
          : HttpResponse.json(SETUP);
      }),
      http.post(apiUrl('/api/v1/me/two-factor/confirm'), () =>
        apiError(400, 'VALIDATION_ERROR', "That code didn't work.", {
          fields: [{ field: 'code', message: "That code didn't work. Use the newest code." }],
        }),
      ),
    );
    const user = userEvent.setup();
    const section = await startSetup(user);
    await user.click(within(section).getByRole('button', { name: 'Continue' }));
    expect(within(section).getByText('Enter your password.')).toBeInTheDocument();

    const password = within(section).getByLabelText(/Confirm your password/);
    await user.type(password, 'wrong');
    await user.click(within(section).getByRole('button', { name: 'Continue' }));
    expect(await within(section).findByText('Your password is incorrect.')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Continue' }));
    const code = await within(section).findByLabelText(/6-digit code/);
    await user.click(within(section).getByRole('button', { name: 'Turn on' }));
    expect(within(section).getByText('Enter the 6-digit code from the app.')).toBeInTheDocument();
    await user.type(code, '999999');
    await user.click(within(section).getByRole('button', { name: 'Turn on' }));
    expect(
      await within(section).findByText("That code didn't work. Use the newest code."),
    ).toBeInTheDocument();
    expect(code).toHaveValue('');

    await user.click(within(section).getByRole('button', { name: 'Cancel' }));
    expect(within(section).getByText('Off')).toBeInTheDocument();
  });

  it('copies, downloads and prints the recovery codes', async () => {
    meSequence(me);
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/setup'), () => HttpResponse.json(SETUP)),
      http.post(apiUrl('/api/v1/me/two-factor/confirm'), () =>
        HttpResponse.json({ recoveryCodes: CODES }),
      ),
    );
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const createObjectURL = vi.fn(() => 'blob:codes');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const printable = document.implementation.createHTMLDocument();
    const print = vi.fn();
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce({ document: printable, print } as unknown as Window)
      .mockReturnValueOnce(null);

    const section = await startSetup(user);
    await user.type(within(section).getByLabelText(/Confirm your password/), 'my-secret-pass');
    await user.click(within(section).getByRole('button', { name: 'Continue' }));
    await user.type(await within(section).findByLabelText(/6-digit code/), '123456');
    await user.click(within(section).getByRole('button', { name: 'Turn on' }));
    await within(section).findByRole('list', { name: 'Recovery codes' });

    await user.click(within(section).getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Recovery codes copied.')).toBeInTheDocument();
    expect(writeText.mock.calls[0]?.[0]).toContain(CODES[0]);

    await user.click(within(section).getByRole('button', { name: 'Download' }));
    expect(createObjectURL).toHaveBeenCalled();

    await user.click(within(section).getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(printable.body.textContent).toContain(CODES[9]);
    await user.click(within(section).getByRole('button', { name: 'Print' }));
    expect(await screen.findByText(/Could not open the print window/)).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('managing two-step verification (Your account)', () => {
  it('creates new recovery codes after the password', async () => {
    meSequence(enabledMe);
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/recovery-codes'), () =>
        HttpResponse.json({ recoveryCodes: CODES }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Two-step verification' });
    await user.click(within(section).getByRole('button', { name: 'New recovery codes' }));
    await user.type(within(section).getByLabelText(/Confirm your password/), 'my-secret-pass');
    await user.click(within(section).getByRole('button', { name: 'Create new codes' }));

    expect(
      await within(section).findByRole('list', { name: 'Recovery codes' }),
    ).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Done' }));
    expect(await within(section).findByText('On')).toBeInTheDocument();
  });

  it('turns off with the password and a code', async () => {
    const session = meSequence(enabledMe, me);
    let sent: unknown;
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/disable'), async ({ request }) => {
        sent = await request.json();
        session.switchOver();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Two-step verification' });
    await user.click(within(section).getByRole('button', { name: 'Turn off' }));
    await user.click(within(section).getByRole('button', { name: 'Turn off' }));
    expect(within(section).getByText('Enter your password.')).toBeInTheDocument();
    expect(
      within(section).getByText('Enter a code from your app or a recovery code.'),
    ).toBeInTheDocument();

    await user.type(within(section).getByLabelText(/Your password/), 'my-secret-pass');
    await user.type(within(section).getByLabelText(/Code from your app/), '123456');
    await user.click(within(section).getByRole('button', { name: 'Turn off' }));

    expect(await screen.findByText('Two-step verification is off.')).toBeInTheDocument();
    expect(await within(section).findByText('Off')).toBeInTheDocument();
    expect(sent).toEqual({ password: 'my-secret-pass', code: '123456' });
  });

  it.each([
    [
      apiError(409, 'TWO_FACTOR_REQUIRED', 'Required.', { workspaces: ['Beta Desk'] }),
      "It can't be turned off while Beta Desk requires it.",
    ],
    [
      apiError(400, 'VALIDATION_ERROR', "That code didn't work.", {
        fields: [{ field: 'code', message: "That code didn't work." }],
      }),
      "That code didn't work.",
    ],
    [apiError(429, 'RATE_LIMITED', 'Too many requests.'), 'Too many attempts'],
  ])('explains why turning off failed (%#)', async (answer, text) => {
    meSequence(enabledMe);
    server.use(http.post(apiUrl('/api/v1/me/two-factor/disable'), () => answer));
    const user = userEvent.setup();
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Two-step verification' });
    await user.click(within(section).getByRole('button', { name: 'Turn off' }));
    await user.type(within(section).getByLabelText(/Your password/), 'my-secret-pass');
    await user.type(within(section).getByLabelText(/Code from your app/), '123456');
    await user.click(within(section).getByRole('button', { name: 'Turn off' }));
    expect(await within(section).findByText(text, { exact: false })).toBeInTheDocument();
  });

  it('cannot be turned off while this workspace requires it', async () => {
    meSequence(withTwoFactor({ enabled: true, recoveryCodesLeft: 8, required: true }));
    renderRoute('/account?tab=security', { host: WORKSPACE });
    const section = await screen.findByRole('region', { name: 'Two-step verification' });
    expect(within(section).getByRole('button', { name: 'Turn off' })).toBeDisabled();
    expect(
      within(section).getByText(/Acme Support requires two-step verification/),
    ).toBeInTheDocument();
  });

  it('warns everywhere in the app when recovery codes run low', async () => {
    meSequence(withTwoFactor({ enabled: true, recoveryCodesLeft: 1 }));
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByText(/You have 1 recovery code left\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create new ones' })).toHaveAttribute(
      'href',
      '/account?tab=security',
    );
  });
});

describe('a workspace that requires two-step verification', () => {
  it('shows only the setup until it is done, then opens the app', async () => {
    const required = withTwoFactor({ required: true, setupRequired: true });
    const session = meSequence(
      required,
      withTwoFactor({ enabled: true, required: true, recoveryCodesLeft: 10 }),
    );
    server.use(
      http.post(apiUrl('/api/v1/me/two-factor/setup'), () => HttpResponse.json(SETUP)),
      http.post(apiUrl('/api/v1/me/two-factor/confirm'), () => {
        session.switchOver();
        return HttpResponse.json({ recoveryCodes: CODES });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });

    expect(
      await screen.findByRole('heading', { name: 'Set up two-step verification' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Acme Support requires it for everyone. It takes about a minute.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Confirm your password/), 'my-secret-pass');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    await user.click(await screen.findByLabelText(/I've saved these codes/));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
  });

  it('lets the person sign out instead', async () => {
    meSequence(withTwoFactor({ required: true, setupRequired: true }));
    server.use(
      http.post(apiUrl('/api/v1/auth/logout'), () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(goTo).toHaveBeenCalledWith('/login?reason=signed-out');
    });
  });
});

describe('Settings → Security', () => {
  const security = (requireTwoFactor: boolean) => ({
    requireTwoFactor,
    members: 3,
    membersWithTwoFactor: 2,
  });

  it('lets an admin with two-step verification require it for everyone', async () => {
    meSequence(enabledMe);
    let sent: unknown;
    server.use(
      http.get(apiUrl('/api/v1/workspace/security'), () => HttpResponse.json(security(false))),
      http.patch(apiUrl('/api/v1/workspace/security'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(security(true));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/settings/security', { host: WORKSPACE });

    const toggle = await screen.findByRole('switch', {
      name: 'Require two-step verification for everyone',
    });
    expect(screen.getByText(/2 of 3 members have it on\./)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(
      await screen.findByText('Two-step verification is now required for everyone.'),
    ).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(sent).toEqual({ requireTwoFactor: true });
  });

  it('asks the admin to turn it on for themselves first', async () => {
    meSequence(me);
    server.use(
      http.get(apiUrl('/api/v1/workspace/security'), () => HttpResponse.json(security(false))),
    );
    renderRoute('/settings/security', { host: WORKSPACE });
    expect(
      await screen.findByRole('switch', { name: 'Require two-step verification for everyone' }),
    ).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/account?tab=security',
    );
  });

  it('says so when a change fails, and offers a retry when the settings do not load', async () => {
    meSequence(enabledMe);
    let calls = 0;
    server.use(
      http.get(apiUrl('/api/v1/workspace/security'), () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(security(false));
      }),
      http.patch(apiUrl('/api/v1/workspace/security'), () =>
        apiError(409, 'CONFLICT', 'Turn on two-step verification for yourself first.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/settings/security', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await user.click(
      await screen.findByRole('switch', { name: 'Require two-step verification for everyone' }),
    );
    expect(
      await screen.findByText('Turn on two-step verification for yourself first.'),
    ).toBeInTheDocument();
  });

  it('is in the sidebar for admins, and closed to other roles', async () => {
    meSequence({ ...me, role: 'agent', isOwner: false, permissions: ['tickets.work'] });
    renderRoute('/settings/security', { host: WORKSPACE });
    expect(
      await screen.findByRole('heading', { name: "You don't have access to security settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Security' })).not.toBeInTheDocument();
  });
});
