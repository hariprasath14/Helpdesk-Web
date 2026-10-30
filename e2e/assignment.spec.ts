import { expect, test } from '@playwright/test';
import { chooseView, expectAccessible, signUpAndConfirm } from './fixtures';

/**
 * Assignment against the real API: take a ticket, find it in My unresolved, give it back and find
 * it in Unassigned, with each change in the conversation. Locally the API and Mailpit must be
 * running.
 */
test.describe('assignment', () => {
  test('an agent takes a ticket and gives it back', async ({ page, request }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { subject: 'Attendance app crashes', contact: { name: 'Neha Iyer', phone: '1' } },
    });
    expect(created.status(), await created.text()).toBe(200);

    await page.goto(`${owner.origin}/tickets/1`);
    await page.getByRole('button', { name: 'Take it' }).click();
    await expect(page.getByText('You have ticket #1.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take it' })).toHaveCount(0);
    const properties = page.getByRole('form', { name: 'Properties' });
    await expect(properties.getByLabel('Assignee')).toHaveValue(/.+/);
    await expect(page.getByRole('region', { name: 'Conversation' })).toContainText(
      'Asha Rao changed the assignee from nobody to Asha Rao.',
    );
    await expectAccessible(page);

    const list = page.getByRole('list', { name: 'Tickets' });
    await page.goto(`${owner.origin}/tickets`);
    await chooseView(page, 'My unresolved');
    await expect(list.getByRole('link', { name: 'Attendance app crashes' })).toBeVisible();
    await expect(list).toContainText('Asha Rao');

    await list.getByRole('link', { name: 'Attendance app crashes' }).click();
    await properties.getByLabel('Assignee').selectOption('Unassigned');
    await properties.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('button', { name: 'Take it' })).toBeVisible();

    await page.goto(`${owner.origin}/tickets`);
    await chooseView(page, 'Unassigned');
    await expect(list.getByRole('link', { name: 'Attendance app crashes' })).toBeVisible();
  });
});
