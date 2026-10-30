import { expect, test } from '@playwright/test';
import { appDomain, expectAccessible, expectNoSideScroll, findEmailLink } from './fixtures';

/**
 * The full sign-up journey against the real API, database and email: sign up, read the
 * confirmation email from Mailpit, open its link on the new workspace address, land signed in.
 * Locally the API and Mailpit must be running (helpdesk-api: docker compose up, npm run dev).
 */
test.describe('sign-up', () => {
  test('a new customer signs up, confirms their email and lands in their workspace', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');

    const stamp = Date.now().toString(36);
    const email = `e2e-${stamp}@example.test`;
    const address = `e2e-${stamp}`;

    await page.goto('/signup');
    await expectAccessible(page);
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Work email').fill(email);
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill('quiet-harbour-lantern-41');
    await page.getByLabel('Company name').fill('E2E Support');
    await page.getByLabel('Workspace address').fill(address);
    await expect(page.getByText(`${address}.${appDomain} is available`)).toBeVisible();
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole('button', { name: 'Create workspace' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expectAccessible(page);

    const link = await findEmailLink(request, email, '/verify-email');
    expect(new URL(link).hostname).toBe(`${address}.${appDomain}`);
    await page.goto(link);

    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
    ).toBeVisible();
    await expect(page.getByText('Admin · E2E Support')).toBeVisible();
    await expectAccessible(page);

    // Signed in survives a reload (the session cookie), and the link works only once.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
    ).toBeVisible();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'This link was already used' })).toBeVisible();
  });

  test('the sign-up page fits the screen and explains what is missing', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: 'Create workspace' }).click();

    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeFocused();
    await expectNoSideScroll(page);
    await expectAccessible(page);
  });

  test('an unknown workspace address says so', async ({ page }) => {
    const main = new URL(test.info().project.use.baseURL ?? '');
    await page.goto(`${main.protocol}//no-such-workspace-e2e.${main.host}/`);
    await expect(page.getByRole('heading', { name: 'Workspace not found' })).toBeVisible();
    await expectAccessible(page);
  });
});
