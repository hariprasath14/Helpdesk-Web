import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectAccessible, expectFitsPhone, signUpAndConfirm } from './fixtures';

/**
 * Contacts and companies against the real API and database: add a company with a domain, add a
 * contact whose email matches it (linked automatically), edit and search, delete with the audit
 * entry. Locally the API and Mailpit must be running.
 */

/** Every built-in field the API lists for a record type must be on its drawer. */
async function expectStandardFields(
  page: Page,
  origin: string,
  recordType: string,
  drawer: Locator,
) {
  const response = await page.request.get(
    `${origin}/api/v1/custom-fields?recordType=${recordType}`,
  );
  const { standardFields } = (await response.json()) as { standardFields: { label: string }[] };
  expect(standardFields.length).toBeGreaterThan(0);
  // The drawer's field labels, without the required marker (once it has opened).
  await expect(drawer.locator('label').first()).toBeVisible();
  const shown = (await drawer.locator('label, legend').allTextContents()).map((text) =>
    text.replace('*', '').trim(),
  );
  for (const { label } of standardFields) {
    expect(shown, `the drawer shows "${label}"`).toContain(label);
  }
}

test.describe('contacts and companies', () => {
  test('a member adds a company and a matching contact, edits, searches and deletes', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    // A company with an email domain.
    await page.getByRole('link', { name: 'Companies' }).click();
    await expect(page.getByText('No companies yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add company' }).first().click();
    const companyDrawer = page.getByRole('dialog', { name: 'Add a company' });
    await expectStandardFields(page, owner.origin, 'company', companyDrawer);
    await companyDrawer.getByRole('textbox', { name: 'Name', exact: true }).fill('Acme Industries');
    await companyDrawer.getByRole('textbox', { name: 'Domain 1' }).fill('@Acme-Industries.com');
    await companyDrawer.getByRole('textbox', { name: 'Website' }).fill('acme-industries.com');
    await expectAccessible(page);
    await companyDrawer.getByRole('button', { name: 'Add company' }).click();
    await expect(page.getByRole('heading', { name: 'Acme Industries' })).toBeVisible();
    await expect(page.getByText('acme-industries.com', { exact: true }).first()).toBeVisible();

    // A contact whose email matches the domain joins the company.
    await page.getByRole('link', { name: 'Contacts', exact: true }).click();
    await expect(page.getByText('No contacts yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add contact' }).first().click();
    const drawer = page.getByRole('dialog', { name: 'Add a contact' });
    await expectStandardFields(page, owner.origin, 'contact', drawer);
    await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('Neha Iyer');
    await drawer
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill('Neha@acme-industries.com');
    await drawer.getByRole('textbox', { name: 'Phone' }).fill('+91 98765 43210');
    await expectAccessible(page);
    await expectFitsPhone(page);
    await drawer.getByRole('button', { name: 'Add contact' }).click();
    await expect(page.getByRole('heading', { name: 'Neha Iyer' })).toBeVisible();
    const details = page.getByRole('region', { name: 'Details' });
    await expect(details.getByText('neha@acme-industries.com')).toBeVisible();
    await expect(details.getByRole('link', { name: 'Acme Industries' })).toBeVisible();
    await expectAccessible(page);

    // The same email can't be used twice.
    await page.getByRole('link', { name: 'Contacts', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add contact' }).first().click();
    await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('Copy');
    await drawer
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill('neha@acme-industries.com');
    await drawer.getByRole('button', { name: 'Add contact' }).click();
    await expect(drawer.getByText('This email belongs to Neha Iyer.')).toBeVisible();
    await drawer.getByRole('button', { name: 'Cancel' }).click();

    // Search, then edit.
    await page.getByRole('searchbox', { name: 'Search contacts' }).fill('98765');
    const list = page.getByRole('list', { name: 'Contacts' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await list.getByRole('link', { name: 'Neha Iyer' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Neha Iyer' });
    await edit.getByRole('textbox', { name: 'Job title' }).fill('IT manager');
    await edit.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Contact saved.').first()).toBeVisible();
    await expect(details.getByText('IT manager')).toBeVisible();

    // The company page lists her.
    await details.getByRole('link', { name: 'Acme Industries' }).click();
    await expect(
      page.getByRole('region', { name: 'Contacts' }).getByRole('link', { name: 'Neha Iyer' }),
    ).toBeVisible();
    await expect(page.getByText(/1 contact · updated/)).toBeVisible();

    // Delete (the owner is an admin), recorded in the audit log.
    await page
      .getByRole('region', { name: 'Contacts' })
      .getByRole('link', { name: 'Neha Iyer' })
      .click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete contact' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete contact' }).click();
    await expect(page.getByText('Contact deleted.').first()).toBeVisible();
    await expect(page.getByText('No contacts yet')).toBeVisible();

    await page.goto(`${owner.origin}/settings/audit-log`);
    await expect(
      page
        .getByRole('list', { name: 'Audit log entries' })
        .getByText(/deleted the contact Neha Iyer \(neha@acme-industries.com\)/),
    ).toBeVisible();
  });
});
