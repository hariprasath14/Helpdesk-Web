import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, signUpAndConfirm } from './fixtures';

/**
 * SLAs against the real API: an admin adds a VIP policy (urgent: reply within 15 minutes, round
 * the clock); a VIP ticket shows its countdown, the list shows the next deadline, and sorting by
 * "Due soonest" puts it first.
 */
test.describe('SLA policies', () => {
  test('an admin adds a policy and tickets count down against it', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    await page.goto(`${owner.origin}/settings/slas`);
    const policies = page.getByRole('list', { name: 'SLA policies' });
    await expect(policies).toContainText('Default policy');
    // Each policy shows its targets as a table (Step 5b): priority, first reply, resolve, hours.
    await expect(policies).toContainText('Urgent1 h4 hBusiness hours');
    await expectAccessible(page);

    await page.getByRole('button', { name: 'New policy' }).click();
    const drawer = page.getByRole('dialog', { name: 'New SLA policy' });
    await drawer.getByRole('textbox', { name: /^Name/ }).fill('VIP customers');
    await drawer.getByRole('combobox', { name: 'Field' }).selectOption('tags');
    await drawer.getByRole('textbox', { name: 'Values' }).fill('vip');
    const urgent = drawer.getByRole('row', { name: 'Urgent' });
    await urgent.getByRole('textbox', { name: 'Reply within' }).fill('15');
    await urgent.getByRole('combobox', { name: 'Reply within unit' }).selectOption('minutes');
    await urgent.getByRole('combobox', { name: 'Counting' }).selectOption('calendar');
    await drawer.getByRole('textbox', { name: 'Minutes before' }).fill('5');
    await drawer
      .getByRole('combobox', { name: 'At a deadline, reassign to' })
      .selectOption({ label: "A lead of the ticket's team" });
    await expectAccessible(page);
    await drawer.getByRole('button', { name: 'Add policy' }).click();
    await expect(page.getByText('VIP customers added.', { exact: true })).toBeVisible();
    await expect(policies.getByRole('listitem').first()).toContainText('VIP customers');
    await page.getByRole('button', { name: 'VIP customers', exact: true }).click();
    const saved = page.getByRole('dialog', { name: 'Edit VIP customers' });
    await expect(saved.getByRole('textbox', { name: 'Minutes before' })).toHaveValue('5');
    await expect(saved.getByRole('combobox', { name: 'At a deadline, reassign to' })).toHaveValue(
      'team_lead',
    );
    await saved.getByRole('button', { name: 'Cancel' }).click();
    await expectFitsPhone(page);

    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const raise = async (subject: string, data: Record<string, unknown>) => {
      const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          subject,
          contact: { name: 'Neha Iyer', email: `neha.${owner.address}@acme-e2e.com` },
          ...data,
        },
      });
      expect(created.status(), await created.text()).toBe(200);
      return ((await created.json()) as { number: number }).number;
    };
    await raise('Printer jammed', { priority: 'low' });
    const vip = await raise('Payroll is down', { priority: 'urgent', tags: ['vip'] });

    await page.goto(`${owner.origin}/tickets/${String(vip)}`);
    const sla = page.getByRole('list', { name: 'SLA' });
    await expect(sla).toContainText(/Reply due in 1[45]m/);
    await expect(sla).toContainText('Resolve due in');
    await expectAccessible(page);

    await page.goto(`${owner.origin}/tickets?view=all&sort=due`);
    const rows = page.getByRole('list', { name: 'Tickets' });
    await expect(rows.getByRole('listitem').first()).toContainText('Payroll is down');
    await expect(rows.getByRole('listitem').first()).toContainText(/Reply in 1[45]m/);
    await page.getByRole('button', { name: 'Overdue' }).click();
    await expect(page.getByText(/No tickets/)).toBeVisible();
  });
});
