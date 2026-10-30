import { expect, test, type Page } from '@playwright/test';
import {
  authenticatorCode,
  expectAccessible,
  expectFitsPhone,
  findEmailLink,
  openSettings,
  signUpAndConfirm,
} from './fixtures';

/**
 * Agents and roles against the real API, database and email: invite through Mailpit, accept as a
 * new person in their own browser, change their role, reset their two-step verification and
 * deactivate them. Locally the API and Mailpit must be running.
 */

function memberRow(page: Page, name: string) {
  return page
    .getByRole('list', { name: 'Members' })
    .getByRole('listitem')
    .filter({ hasText: name });
}

async function memberAction(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('agents and roles', () => {
  test('an admin invites someone new, changes their role, resets their two-step verification and deactivates them', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const newcomer = `invited-${Date.now().toString(36)}@example.test`;

    // Invite from Settings → Members.
    await openSettings(page, 'Members');
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expectFitsPhone(page);
    await page.getByRole('button', { name: 'Invite people' }).click();
    const drawer = page.getByRole('dialog', { name: 'Invite people' });
    await drawer.getByLabel('Email addresses').fill(newcomer);
    await drawer.getByRole('button', { name: 'Send invitations' }).click();
    await expect(page.getByText(`Invitation sent to ${newcomer}.`).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Invitations' }).getByText(newcomer)).toBeVisible();

    // The invited person accepts in their own browser.
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    const link = await findEmailLink(request, newcomer, '/invite');
    expect(new URL(link).origin).toBe(owner.origin);
    await them.goto(link);
    await expect(them.getByRole('heading', { name: 'Join E2E Support' })).toBeVisible();
    await expectAccessible(them);
    await expectFitsPhone(them);
    await them.getByLabel('Full name').fill('Neha Iyer');
    await them
      .getByRole('textbox', { name: 'Choose a password', exact: true })
      .fill('quiet-harbour-lantern-41');
    await them.getByRole('button', { name: 'Join workspace' }).click();
    await expect(
      them.getByRole('heading', { name: /^Good (morning|afternoon|evening), Neha$/ }),
    ).toBeVisible();
    await expect(them.getByText('Agent · E2E Support')).toBeVisible();

    // They turn on two-step verification.
    await them.goto(`${owner.origin}/account?tab=security`);
    const section = them.getByRole('region', { name: 'Two-step verification' });
    await section.getByRole('button', { name: 'Turn on' }).click();
    await section.getByLabel('Confirm your password').fill('quiet-harbour-lantern-41');
    await section.getByRole('button', { name: 'Continue' }).click();
    const key = (await section.locator('code').textContent()) ?? '';
    await section.getByLabel('6-digit code').fill(authenticatorCode(key));
    await section.getByRole('button', { name: 'Turn on' }).click();
    await section.getByLabel("I've saved these codes somewhere safe").check();
    await section.getByRole('button', { name: 'Done' }).click();
    await expect(section.getByText('On', { exact: true })).toBeVisible();

    // The admin makes them a supervisor; their next page load shows Settings → Members.
    await page.reload();
    await expect(memberRow(page, 'Neha Iyer').getByText('Agent', { exact: true })).toBeVisible();
    await memberAction(page, 'Neha Iyer', 'Make Supervisor');
    await expect(
      memberRow(page, 'Neha Iyer').getByText('Supervisor', { exact: true }),
    ).toBeVisible();
    await them.goto(`${owner.origin}/settings/members`);
    await expect(them.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(them.getByRole('button', { name: 'Invite people' })).toHaveCount(0);
    await expect(them.getByRole('link', { name: 'Audit log' })).toHaveCount(0);

    // The audit log shows the change, and exports it as CSV.
    await page
      .getByRole('navigation', { name: 'Settings' })
      .getByRole('link', { name: 'Audit log' })
      .click();
    const entries = page.getByRole('list', { name: 'Audit log entries' });
    await expect(
      entries.getByText("Asha Rao changed Neha Iyer's role from Agent to Supervisor."),
    ).toBeVisible();
    await expect(entries.getByText('Neha Iyer joined as Agent.')).toBeVisible();
    await expectAccessible(page);
    await expectFitsPhone(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^audit-log-e2e-.+\.csv$/);
    let csv = '';
    for await (const chunk of await download.createReadStream()) csv += String(chunk);
    expect(csv).toContain("Asha Rao changed Neha Iyer's role from Agent to Supervisor.");
    await page
      .getByRole('navigation', { name: 'Settings' })
      .getByRole('link', { name: 'Members' })
      .click();

    // The admin resets their two-step verification: they are signed out.
    await memberAction(page, 'Neha Iyer', 'Reset two-step verification');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Reset two-step verification' })
      .click();
    await expect(
      page.getByText('Two-step verification was reset. They were signed out.').first(),
    ).toBeVisible();
    await them.reload();
    await expect(them.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // Signing in again needs only the password; then the admin deactivates them.
    await them.getByLabel('Email').fill(newcomer);
    await them
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill('quiet-harbour-lantern-41');
    await them.getByRole('button', { name: 'Sign in' }).click();
    await expect(them.getByRole('heading', { name: 'Members' })).toBeVisible();

    await memberAction(page, 'Neha Iyer', 'Deactivate');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(memberRow(page, 'Neha Iyer').getByText('Deactivated')).toBeVisible();
    await them.reload();
    await expect(them.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectAccessible(page);
    await theirs.close();
  });
});
