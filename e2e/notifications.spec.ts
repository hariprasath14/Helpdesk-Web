import { expect, test } from '@playwright/test';
import { csrfOf, expectAccessible, expectFitsPhone, joinAs, signUpAndConfirm } from './fixtures';

/**
 * The notification center against the real API: an agent is assigned a ticket and @mentioned in a
 * note; their bell shows 2 unread, opening one goes to the ticket, and they choose which kinds
 * also come by email.
 */
test.describe('notifications', () => {
  test('an agent sees assignments and mentions under the bell', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const agent = await joinAs(owner, page, request, browser, { name: 'Neha Iyer' });

    const csrf = await csrfOf(page, owner.origin);
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': csrf },
      data: {
        subject: 'Payslip missing',
        contact: { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
        assigneeUserId: agent.userId,
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const { number } = (await created.json()) as { number: number };
    const noted = await page.request.post(
      `${owner.origin}/api/v1/tickets/${String(number)}/messages`,
      {
        headers: { 'x-csrf-token': csrf },
        data: { kind: 'note', body: 'Neha, can you check payroll?', mentions: [agent.userId] },
      },
    );
    expect(noted.status(), await noted.text()).toBe(200);

    await agent.page.goto(`${owner.origin}/`);
    const bell = agent.page.getByRole('button', { name: 'Notifications, 2 unread' });
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = agent.page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toContainText(`Ticket #${String(number)} assigned to you`);
    await expect(panel).toContainText(`Asha Rao mentioned you on ticket #${String(number)}`);
    await expectAccessible(agent.page);
    await panel.getByRole('button', { name: /assigned to you/ }).click();
    await expect(agent.page).toHaveURL(`${owner.origin}/tickets/${String(number)}`);
    await expect(agent.page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();

    await agent.page.goto(`${owner.origin}/account?tab=notifications`);
    const replies = agent.page.getByRole('switch', { name: /Customer replies/ });
    await expect(replies).not.toBeChecked();
    await replies.click();
    await expect(agent.page.getByText('Notification emails saved.', { exact: true })).toBeVisible();
    await agent.page.reload();
    await expect(agent.page.getByRole('switch', { name: /Customer replies/ })).toBeChecked();
    await expectFitsPhone(agent.page);
    await agent.context.close();
  });
});
