import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { goTo } from '../../lib/go-to';
import { apiError, me, signedOut, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';

vi.mock('../../lib/go-to', () => ({ goTo: vi.fn() }));

describe('signed-in workspace', () => {
  it('welcomes the member inside the app shell, with their name and role in the top bar', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)));
    renderRoute('/', { host: WORKSPACE });

    expect(
      await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening), Ravi$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Admin · Acme Support')).toBeInTheDocument();
  });

  it('sends a visitor without a sign-in to the login page, remembering where they were going', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), signedOut));
    const { router } = renderRoute('/account', { host: WORKSPACE });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Faccount');
    expect(screen.queryByText(/session ended/)).not.toBeInTheDocument();
  });

  it('shows "workspace not found" for an unknown address, with a way to create one', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => apiError(404, 'NOT_FOUND', 'Not found.')));
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByRole('heading', { name: 'Workspace not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a workspace' }).getAttribute('href')).toContain(
      '/signup',
    );
  });

  it('offers a retry when the workspace cannot be loaded', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.error()));
    renderRoute('/', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('user menu', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /account menu/ }));
  };

  it('signs out with the CSRF token, then loads the login page afresh', async () => {
    let csrf: string | null = null;
    server.use(
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
      http.post(apiUrl('/api/v1/auth/logout'), ({ request }) => {
        csrf = request.headers.get('x-csrf-token');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => {
      expect(goTo).toHaveBeenCalledWith('/login?reason=signed-out');
    });
    expect(csrf).toBe(me.csrfToken);
  });

  it('says so when signing out fails', async () => {
    server.use(
      http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)),
      http.post(apiUrl('/api/v1/auth/logout'), () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText(/Could not sign out/)).toBeInTheDocument();
  });

  it('opens your account, and finds your other workspaces on the main address', async () => {
    server.use(http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(me)));
    const user = userEvent.setup();
    renderRoute('/', { host: WORKSPACE });

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Your account' }));
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Find your other workspaces' }));
    expect(goTo).toHaveBeenCalledWith(
      `http://helpdesk.test${window.location.port ? `:${window.location.port}` : ''}/login`,
    );
  });
});

describe('a session that ends while the app is open', () => {
  it('goes to the login page with an explanation, and back to the same page afterwards', async () => {
    let signedIn = true;
    server.use(
      http.get(apiUrl('/api/v1/me'), () => (signedIn ? HttpResponse.json(me) : signedOut())),
      http.patch(apiUrl('/api/v1/me'), () => {
        signedIn = false;
        return signedOut();
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/account', { host: WORKSPACE });

    const name = await screen.findByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Ravi S');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(
      await screen.findByText('Your session ended. Sign in again to continue.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).toContain('next=%2Faccount');
    });
  });
});
