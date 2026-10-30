import { expect, test, type Page } from '@playwright/test';
import {
  authenticatorCode,
  expectAccessible,
  expectFitsPhone,
  openSettings,
  signUpAndConfirm,
} from './fixtures';

/**
 * Two-step verification against the real API and database: turn it on with a code an
 * authenticator app would show, sign in with a code and with a recovery code, require it for the
 * workspace, and turn it off. Locally the API and Mailpit must be running.
 */

async function signOut(page: Page) {
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByText("You've signed out.")).toBeVisible();
}

async function enterPassword(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
}

test.describe('two-step verification', () => {
  test('a member turns it on, signs in with a code and a recovery code, requires it, and turns it off', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    // Turn it on from Your account.
    await page.getByRole('button', { name: /account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Your account' }).click();
    await page.getByRole('tab', { name: 'Security' }).click();
    const section = page.getByRole('region', { name: 'Two-step verification' });
    await section.getByRole('button', { name: 'Turn on' }).click();
    await section.getByLabel('Confirm your password').fill(owner.password);
    await section.getByRole('button', { name: 'Continue' }).click();
    await expect(
      section.getByAltText('QR code for setting up two-step verification'),
    ).toBeVisible();
    await expectFitsPhone(page);
    const setupKey = (await section.locator('code').textContent()) ?? '';
    await section.getByLabel('6-digit code').fill(authenticatorCode(setupKey));
    await section.getByRole('button', { name: 'Turn on' }).click();

    const codes = section.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
    await expect(codes).toHaveCount(10);
    const firstRecovery = (await codes.nth(0).textContent()) ?? '';
    const secondRecovery = (await codes.nth(1).textContent()) ?? '';
    await section.getByLabel("I've saved these codes somewhere safe").check();
    await section.getByRole('button', { name: 'Done' }).click();
    await expect(section.getByText('On', { exact: true })).toBeVisible();

    // Sign in with a code from the app (the next one: each code works once).
    await signOut(page);
    await enterPassword(page, owner.email, owner.password);
    await expectFitsPhone(page);
    await page.getByLabel('6-digit code').fill(authenticatorCode(setupKey, 1));
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
    ).toBeVisible();

    // Sign in with a recovery code.
    await signOut(page);
    await enterPassword(page, owner.email, owner.password);
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
    await page.getByLabel('Recovery code').fill(firstRecovery);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(
      page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
    ).toBeVisible();

    // Require it for the workspace, then lift the rule again.
    await openSettings(page, 'Security');
    const rule = page.getByRole('switch', { name: 'Require two-step verification for everyone' });
    await expect(page.getByText(/1 of 1 member has it on/)).toBeVisible();
    await expectAccessible(page);
    await rule.click();
    await expect(
      page.getByText('Two-step verification is now required for everyone.').first(),
    ).toBeVisible();
    await expect(rule).toBeChecked();
    await rule.click();
    await expect(rule).not.toBeChecked();

    // Turn it off with the password and another recovery code.
    await page.getByRole('button', { name: /account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Your account' }).click();
    await page.getByRole('tab', { name: 'Security' }).click();
    await section.getByRole('button', { name: 'Turn off' }).click();
    await section.getByLabel('Your password').fill(owner.password);
    await section.getByLabel('Code from your app, or a recovery code').fill(secondRecovery);
    await section.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByText('Two-step verification is off.').first()).toBeVisible();
    await expect(section.getByText('Off', { exact: true })).toBeVisible();
  });
});
