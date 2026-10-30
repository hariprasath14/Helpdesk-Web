import { expect, test } from '@playwright/test';
import { csrfOf, expectAccessible, expectFitsPhone, signUpAndConfirm } from './fixtures';

/**
 * Home against the real API: a new owner sees the setup checklist and empty counts; saving the
 * business hours ticks a step; a ticket raised elsewhere shows up in the counts live, and its card
 * opens the matching list.
 */
test.describe('home', () => {
  test('a new admin follows the checklist and sees new work arrive', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    const checklist = page.getByRole('region', { name: 'Get started' });
    await expect(checklist.getByText('0 of 3 done')).toBeVisible();
    const unassigned = page.getByRole('link', { name: /^Unassigned/ });
    await expect(unassigned).toContainText('0');
    await expectAccessible(page);
    await expectFitsPhone(page);

    await checklist.getByRole('link', { name: /Set your business hours/ }).click();
    await page.getByRole('button', { name: 'Save business hours' }).click();
    await expect(page.getByText('Business hours saved.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(checklist.getByText('1 of 3 done')).toBeVisible();
    await expect(
      checklist.getByRole('link', { name: /Set your business hours.*Done/ }),
    ).toBeVisible();

    // A ticket raised elsewhere (here through the API) shows up without a reload.
    const csrf = await csrfOf(page, owner.origin);
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': csrf },
      data: {
        subject: 'Attendance not marking',
        description: 'Since this morning.',
        contact: { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    await expect(unassigned).toContainText('1');

    await unassigned.click();
    await expect(page).toHaveURL(/\/tickets\?view=unassigned/);
    await expect(page.getByRole('link', { name: /Attendance not marking/ })).toBeVisible();
  });
});
