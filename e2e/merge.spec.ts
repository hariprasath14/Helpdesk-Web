import { expect, test } from '@playwright/test';
import {
  csrfOf,
  expectAccessible,
  expectFitsPhone,
  joinAs,
  openComposer,
  signUpAndConfirm,
} from './fixtures';

/**
 * Merge and split against the real API, with two people signed in: the owner merges a ticket the
 * agent has open, which turns read-only for the agent at once; the main ticket shows the moved
 * messages "From #N" and copies the other requester; the agent then splits a customer message off
 * into a new ticket.
 */
test.describe('merge and split', () => {
  test('an admin merges two tickets and an agent splits a message off', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const agent = await joinAs(owner, page, request, browser, { name: 'Neha Iyer' });
    const csrf = await csrfOf(page, owner.origin);
    const raise = async (
      subject: string,
      contact: { name: string; email: string },
      description: string,
    ) => {
      const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
        headers: { 'x-csrf-token': csrf },
        data: { subject, description, contact },
      });
      expect(created.status(), await created.text()).toBe(200);
      return ((await created.json()) as { number: number }).number;
    };
    const main = await raise(
      'Payslip missing',
      { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
      'October payslip is not there.',
    );
    const other = await raise(
      'Salary slip not downloading',
      { name: 'Ravi Kumar', email: `ravi.${owner.address}@acme-e2e.com` },
      'The download button does nothing. Also, my leave balance is wrong.',
    );

    // The agent has the other ticket open.
    await agent.page.goto(`${owner.origin}/tickets/${String(other)}`);
    await expect(agent.page.getByRole('group', { name: 'Write on this ticket' })).toBeVisible();

    await page.goto(`${owner.origin}/tickets/${String(main)}`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Merge with other tickets' }).click();
    const drawer = page.getByRole('dialog', { name: `Merge #${String(main)} with other tickets` });
    await drawer.getByRole('searchbox', { name: 'Search tickets' }).fill('Salary slip');
    await drawer.getByRole('button', { name: `Add #${String(other)}` }).click();
    await expectAccessible(page);
    await drawer.getByRole('button', { name: 'Merge tickets' }).click();
    const confirm = page.getByRole('alertdialog', {
      name: `Merge 2 tickets into #${String(main)}?`,
    });
    await expect(confirm).toContainText("This can't be undone.");
    await confirm.getByRole('button', { name: 'Merge tickets' }).click();
    await expect(
      page.getByText(`Merged into ticket #${String(main)}.`, { exact: true }),
    ).toBeVisible();

    // The main ticket has the other's messages and copies its requester.
    await expect(page.getByRole('link', { name: `From #${String(other)}` })).toBeVisible();
    const composer = await openComposer(page);
    await expect(
      composer.getByText(`Always copied: ravi.${owner.address}@acme-e2e.com`),
    ).toBeVisible();
    await expectFitsPhone(page);

    // For the agent, the merged ticket turns read-only at once (live updates).
    await expect(agent.page.getByText(/This ticket was merged into/)).toBeVisible();
    await expect(agent.page.getByRole('group', { name: 'Write on this ticket' })).toBeHidden();

    // The agent splits the moved customer message off into a new ticket.
    await agent.page.getByRole('link', { name: `#${String(main)}` }).click();
    await agent.page.getByRole('button', { name: 'Split into a new ticket' }).click();
    await agent.page
      .getByRole('alertdialog', { name: 'Split this message into a new ticket?' })
      .getByRole('button', { name: 'Split into new ticket' })
      .click();
    await expect(agent.page.getByText(/^Split into ticket #\d+\.$/)).toBeVisible();
    await expect(agent.page).toHaveURL(/\/tickets\/\d+$/);
    await expect(agent.page.getByText(`split this ticket from #${String(main)}`)).toBeVisible();
    await expectAccessible(agent.page);
    await agent.context.close();
  });
});
