import { expect, test } from '@playwright/test';
import {
  chooseView,
  expectAccessible,
  expectFitsPhone,
  openSettings,
  signUpAndConfirm,
} from './fixtures';

/**
 * Tickets against the real API: log a ticket for a new requester, change its properties, see the
 * history and the contact's tickets, delete it to the trash and restore it. Locally the API and
 * Mailpit must be running.
 */
test.describe('tickets', () => {
  test('an agent logs a ticket for a new requester, works it, and an admin trashes and restores it', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await signUpAndConfirm(page, request);

    await page.getByRole('link', { name: 'Tickets', exact: true }).click();
    await expect(page.getByText('Nothing waiting')).toBeVisible();
    await expectAccessible(page);
    await expectFitsPhone(page);

    await page.getByRole('link', { name: 'New ticket' }).first().click();
    await expect(page.getByRole('heading', { name: 'New ticket' })).toBeVisible();
    await page.getByRole('button', { name: /Requester/ }).click();
    await page.getByLabel('Search contacts').fill('neha@acme-e2e.com');
    await page.getByRole('button', { name: /New contact/ }).click();
    const contact = page.getByRole('group', { name: 'New contact' });
    await contact.getByLabel('Name').fill('Neha Iyer');
    await page.getByLabel('Subject').fill("Employees can't mark attendance");
    await page.getByLabel('Description').fill('Since this morning, all branches.');
    await page.getByLabel('Priority').selectOption('Urgent');
    await page.getByRole('combobox', { name: 'Tags' }).fill('attendance');
    await page.keyboard.press('Enter');
    await expectAccessible(page);
    await expectFitsPhone(page);
    await page.getByRole('button', { name: 'Create ticket' }).click();

    await expect(page.getByText('Ticket #1 created.').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Employees can't mark attendance/ }),
    ).toBeVisible();
    await expect(page.getByText(/raised by Neha Iyer/)).toBeVisible();
    await expectAccessible(page);
    await expectFitsPhone(page);

    const properties = page.getByRole('form', { name: 'Properties' });
    await properties.getByLabel('Status').selectOption('Waiting on customer');
    await properties.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByText('Ticket updated.').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Conversation' })).toContainText(
      'changed the status from Open to Waiting on customer',
    );

    // The requester's page lists the ticket.
    await page
      .getByRole('region', { name: 'Requester' })
      .getByRole('link', { name: 'Neha Iyer' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Tickets' }).getByRole('link', { name: /Employees/ }),
    ).toBeVisible();

    // Settings → Fields lists the ticket's built-in fields.
    await openSettings(page, 'Fields');
    // They fold away under your own fields (Step 5b).
    await page.getByText('Standard fields').click();
    await expect(page.getByText('Requester', { exact: true })).toBeVisible();

    // Delete to the trash, then restore.
    await page.goto(`${new URL(page.url()).origin}/tickets/1`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete ticket' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete ticket' }).click();
    await expect(page.getByText('Nothing waiting')).toBeVisible();
    await chooseView(page, 'Trash');
    await page.getByRole('link', { name: "Employees can't mark attendance" }).click();
    await page.getByRole('button', { name: 'Restore ticket' }).click();
    await expect(page.getByText('Ticket #1 restored.').first()).toBeVisible();
    await expect(page.getByRole('form', { name: 'Properties' }).getByLabel('Status')).toBeEnabled();
  });
});
