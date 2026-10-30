import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, openSettings, signUpAndConfirm } from './fixtures';

/**
 * Teams against the real API: an admin creates a team with themselves as lead, renames it, sees it
 * on the members page and deletes it. Locally the API and Mailpit must be running.
 */
test.describe('teams', () => {
  test('an admin creates, renames and deletes a team, and sees it on the members page', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await signUpAndConfirm(page, request);

    await openSettings(page, 'Teams');
    await expect(page.getByText('No teams yet')).toBeVisible();
    await expectAccessible(page);
    await expectFitsPhone(page);

    await page.getByRole('button', { name: 'New team' }).click();
    const drawer = page.getByRole('dialog', { name: 'New team' });
    await drawer.getByLabel('Name').fill('Billing');
    await drawer.getByLabel('Description').fill('Invoices and refunds');
    await drawer.getByRole('button', { name: 'Add people' }).click();
    await page.getByRole('list', { name: 'People' }).getByText('Asha Rao').click();
    await page.keyboard.press('Escape');
    await drawer.getByLabel('Lead (Asha Rao)').check();
    await expectAccessible(page);
    await drawer.getByRole('button', { name: 'Add team' }).click();
    await expect(page.getByText('Team added.').first()).toBeVisible();

    const list = page.getByRole('list', { name: 'Teams' });
    await expect(list.getByText('Invoices and refunds')).toBeVisible();
    await expect(list.getByText('1 person')).toBeVisible();
    await expectFitsPhone(page);

    await list.getByRole('button', { name: 'Billing', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Billing' });
    await edit.getByLabel('Name').fill('Accounts');
    await edit.getByRole('button', { name: 'Save team' }).click();
    await expect(list.getByRole('button', { name: 'Accounts', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Members' }).click();
    const me = page.getByRole('list', { name: 'Members' }).getByRole('listitem').first();
    await expect(me.getByText('Accounts · Lead')).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(
      page.getByText('Asha Rao changed the team "Accounts": renamed it from "Billing".'),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Teams' }).click();
    await page.getByRole('button', { name: 'Actions for Accounts' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete team' }).click();
    await expect(page.getByText('No teams yet')).toBeVisible();
  });
});
