import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectFitsPhone, openSettings, signUpAndConfirm } from './fixtures';

/**
 * Custom fields against the real API and database: add a dropdown and a text field, reorder them
 * by dragging and from the menu, archive and restore one, and find each change in the audit log.
 * Locally the API and Mailpit must be running.
 */

const labels = (page: Page) =>
  page
    .getByRole('list', { name: 'Tickets fields' })
    .getByRole('listitem')
    .locator('button[type="button"]:not([aria-hidden]):not([aria-haspopup])')
    .allTextContents();

test.describe('custom fields', () => {
  test('an admin adds, reorders, archives and restores ticket fields, and each change is audited', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await signUpAndConfirm(page, request);

    await openSettings(page, 'Fields');
    await expect(page.getByText('No custom ticket fields yet')).toBeVisible();
    await expectAccessible(page);

    // A dropdown with a default choice, required when resolving.
    await page.getByRole('button', { name: 'Add field' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a ticket field' });
    await drawer.getByRole('textbox', { name: 'Label', exact: true }).fill('Root cause');
    await drawer.getByRole('combobox', { name: 'Type', exact: true }).selectOption('dropdown');
    await drawer.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('Bug');
    await drawer.getByRole('textbox', { name: 'Choice 1', exact: true }).press('Enter');
    await page.keyboard.type('Question');
    await drawer.getByLabel('Default for choice 1').check();
    await drawer.getByRole('radio', { name: /Required when resolving/ }).check();
    await expect(
      drawer.getByRole('region', { name: 'Preview' }).getByLabel(/Root cause/),
    ).toHaveValue(/.+/);
    await expectAccessible(page);
    await expectFitsPhone(page);
    await drawer.getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText('Field added.').first()).toBeVisible();

    // A text field, added second.
    await page.getByRole('button', { name: 'Add field' }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Label', exact: true })
      .fill('Employee ID');
    await page.getByRole('dialog').getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText('2 of 50 fields', { exact: false })).toBeVisible();
    await expect.poll(() => labels(page)).toEqual(['Root cause', 'Employee ID']);

    // Drag Employee ID above Root cause, then move it back from the menu.
    const rows = page.getByRole('list', { name: 'Tickets fields' }).getByRole('listitem');
    await rows
      .nth(1)
      .locator('button[draggable="true"]')
      .dragTo(rows.nth(0), { targetPosition: { x: 20, y: 4 } });
    await expect.poll(() => labels(page)).toEqual(['Employee ID', 'Root cause']);
    await page.reload();
    await expect.poll(() => labels(page)).toEqual(['Employee ID', 'Root cause']);
    await page.getByRole('button', { name: 'Actions for Employee ID' }).click();
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect.poll(() => labels(page)).toEqual(['Root cause', 'Employee ID']);

    // Archive, then restore at the end.
    await page.getByRole('button', { name: 'Actions for Root cause' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive field' }).click();
    const archived = page.getByRole('list', { name: 'Archived fields' });
    await expect(archived.getByText('Root cause')).toBeVisible();
    await archived.getByRole('button', { name: 'Restore Root cause' }).click();
    await expect(page.getByText('Field restored at the end of the list.').first()).toBeVisible();
    await expect.poll(() => labels(page)).toEqual(['Employee ID', 'Root cause']);

    // Rename keeps the internal name.
    await page.getByRole('button', { name: 'Employee ID', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Employee ID' });
    await expect(edit.getByText('employee_id')).toBeVisible();
    await expect(edit.getByRole('combobox', { name: 'Type', exact: true })).toBeDisabled();
    await edit.getByRole('textbox', { name: 'Label', exact: true }).fill('Staff ID');
    await edit.getByRole('button', { name: 'Save field' }).click();
    await expect(page.getByText('Field saved.').first()).toBeVisible();

    // Every change is in the audit log.
    await page.getByRole('link', { name: 'Audit log' }).click();
    const log = page.getByRole('list', { name: 'Audit log entries' });
    for (const sentence of [
      /added the ticket field "Root cause"/,
      /added the ticket field "Employee ID"/,
      /reordered the ticket fields/,
      /archived the ticket field "Root cause"/,
      /restored the ticket field "Root cause"/,
      /renamed the ticket field "Employee ID" to "Staff ID"/,
    ]) {
      await expect(log.getByText(sentence).first()).toBeVisible();
    }
  });
});
