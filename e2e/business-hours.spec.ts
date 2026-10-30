import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, openSettings, signUpAndConfirm } from './fixtures';

/**
 * Business hours against the real API: an admin adds a short Saturday, saves, and adds a holiday,
 * which SLA clocks in business hours then skip (F23).
 */
test.describe('business hours', () => {
  test('an admin sets the working days and adds a holiday', async ({ page, request }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    await openSettings(page, 'Business hours');
    const days = page.getByRole('list', { name: 'Working days' });
    await expect(days.getByText('Closed')).toHaveCount(2);
    await expectAccessible(page);

    await page.getByRole('checkbox', { name: 'Saturday' }).check();
    await page.getByLabel('Saturday from').fill('10:00');
    await page.getByLabel('Saturday to').fill('14:00');
    await page.getByRole('button', { name: 'Save business hours' }).click();
    await expect(page.getByText('Business hours saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Saturday to')).toHaveValue('14:00');
    await expect(days.getByText('Closed')).toHaveCount(1);

    const form = page.getByRole('form', { name: 'Add a holiday' });
    await form.getByLabel(/^Date/).fill('2099-11-08');
    await form.getByRole('textbox', { name: /^Name/ }).fill('Diwali');
    await form.getByRole('button', { name: 'Add holiday' }).click();
    const upcoming = page.getByRole('list', { name: 'Upcoming holidays' });
    await expect(upcoming).toContainText('Diwali');
    await expect(upcoming).toContainText('Sun, 8 Nov 2099');
    await expectAccessible(page);
    await expectFitsPhone(page);

    await page.goto(`${owner.origin}/settings/audit-log`);
    await expect(page.getByText(/added the holiday "Diwali" on 2099-11-08/)).toBeVisible();
  });
});
