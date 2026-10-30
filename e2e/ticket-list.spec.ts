import { expect, test, type Page } from '@playwright/test';
import { chooseView, expectAccessible, expectFitsPhone, signUpAndConfirm } from './fixtures';

/** Creates tickets through the API as the signed-in owner (the page's session and CSRF token). */
async function createTickets(page: Page, origin: string) {
  const me = await page.request.get(`${origin}/api/v1/me`);
  const { csrfToken } = (await me.json()) as { csrfToken: string };
  const headers = { 'x-csrf-token': csrfToken };
  const tickets = [
    { subject: 'Refund not received', priority: 'urgent', tags: ['refund'] },
    { subject: 'Payroll export blank', priority: 'high' },
    { subject: 'Leave balance wrong', priority: 'low', status: 'resolved' },
  ];
  for (const ticket of tickets) {
    const response = await page.request.post(`${origin}/api/v1/tickets`, {
      headers,
      data: { ...ticket, contact: { name: 'Neha Iyer', email: 'neha@acme-e2e.com' } },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
}

/**
 * The ticket list against the real API: built-in views, filters, search, order and a saved view.
 * Locally the API and Mailpit must be running.
 */
test.describe('ticket list', () => {
  test('an agent narrows the list with views, filters and search, and saves a view', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    await createTickets(page, owner.origin);

    await page.getByRole('link', { name: 'Tickets', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'All unresolved' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Tickets' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expectAccessible(page);
    await expectFitsPhone(page);

    await chooseView(page, 'All tickets');
    await expect(list.getByRole('listitem')).toHaveCount(3);

    await page.getByLabel('Order').selectOption('Highest priority');
    await expect(list.getByRole('link').first()).toHaveText('Refund not received');

    await page.getByRole('button', { name: 'Priority' }).click();
    // Each box follows the address, so it shows checked once the list has moved there.
    for (const name of ['High', 'Urgent']) {
      await page.getByRole('checkbox', { name }).click();
      await expect(page.getByRole('checkbox', { name })).toBeChecked();
    }
    await page.keyboard.press('Escape');
    await expect(list.getByRole('listitem')).toHaveCount(2);

    await page.getByLabel('Search', { exact: true }).fill('payroll');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('link', { name: 'Payroll export blank' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Save as view' }).click();
    const drawer = page.getByRole('dialog', { name: 'Save view' });
    await drawer.getByLabel('Name').fill('Payroll fires');
    await drawer.getByRole('button', { name: 'Save view' }).click();
    await expect(page.getByRole('heading', { name: 'Payroll fires' })).toBeVisible();

    // The saved view comes back after a reload, from the views list.
    await page.reload();
    await chooseView(page, 'All unresolved');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await chooseView(page, 'Payroll fires');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expectFitsPhone(page);

    // The top bar search opens the list with the search.
    await page.getByRole('search').getByRole('searchbox').fill('refund');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'All tickets' })).toBeVisible();
    await expect(list.getByRole('link', { name: 'Refund not received' })).toBeVisible();
  });
});
