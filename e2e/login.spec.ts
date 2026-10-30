import { expect, test, type Page } from '@playwright/test';
import {
  appDomain,
  E2E_PASSWORD,
  expectAccessible,
  expectNoSideScroll,
  findEmailLink,
  signUpAndConfirm,
} from './fixtures';

/**
 * Login and password against the real API, database and email (Mailpit). Locally the API and
 * Mailpit must be running (helpdesk-api: docker compose up, npm run dev).
 */
const NEW_PASSWORD = 'amber-orchard-compass-58';

async function signOut(page: Page) {
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByText("You've signed out.")).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('login and password', () => {
  test('a member signs out, signs back in where they were going, and resets a forgotten password', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    // Sign out from the user menu.
    await signOut(page);
    await expectAccessible(page);

    // A signed-out visit to a page goes to login, then back to that page.
    await page.goto(`${owner.origin}/account`);
    await expect(page).toHaveURL(`${owner.origin}/login?next=%2Faccount`);
    await signIn(page, owner.email, 'not-my-password-at-all');
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await signIn(page, owner.email, owner.password);
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expectAccessible(page);

    // Forgot password: the email link opens on this workspace's address.
    await signOut(page);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Email').fill(owner.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expectAccessible(page);

    const link = await findEmailLink(request, owner.email, '/reset-password');
    expect(new URL(link).origin).toBe(owner.origin);
    await page.goto(link);
    await expect(page.getByText(`For ${owner.email}`)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('textbox', { name: 'New password' }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(
      page.getByText('Your password was changed. Sign in with your new password.'),
    ).toBeVisible();

    // The old password no longer works; the new one does. The link worked once.
    await signIn(page, owner.email, E2E_PASSWORD);
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await signIn(page, owner.email, NEW_PASSWORD);
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
    ).toBeVisible();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'This link was already used' })).toBeVisible();
  });

  test('the login page fits the screen and explains what is missing', async ({ page }) => {
    // Layout only: a stand-in "signed out" answer, so this needs no real workspace.
    await page.route('**/api/v1/me', (route) =>
      route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED', message: 'You need to sign in.' } },
      }),
    );
    const main = new URL(test.info().project.use.baseURL ?? '');
    await page.goto(`${main.protocol}//layout-check.${main.host}/login`);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await expectNoSideScroll(page);
    await expectAccessible(page);
  });

  test('"find your workspace" on the main address fits the screen and takes people to their address', async ({
    page,
  }) => {
    await page.goto('/login');
    await expectNoSideScroll(page);
    await expectAccessible(page);

    await page.getByLabel('Workspace address').fill('no-such-workspace-e2e');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(
      (url) => url.hostname === `no-such-workspace-e2e.${appDomain}` && url.pathname === '/login',
    );
    await expect(page.getByRole('heading', { name: 'Workspace not found' })).toBeVisible();
  });
});
