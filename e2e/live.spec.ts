import { expect, test } from '@playwright/test';
import { csrfOf, expectAccessible, joinAs, signUpAndConfirm } from './fixtures';

/**
 * Live updates against the real API, with two people signed in at once: the agent's list offers
 * the owner's new ticket, their open ticket shows the owner's note and new priority, and their
 * bell counts the assignment, all without reloading.
 */
test.describe('live updates', () => {
  test('two people see each other’s changes at once', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const agent = await joinAs(owner, page, request, browser, { name: 'Neha Iyer' });
    const csrf = await csrfOf(page, owner.origin);
    const api = (path: string, data: Record<string, unknown>, method: 'post' | 'patch' = 'post') =>
      page.request[method](`${owner.origin}/api/v1${path}`, {
        headers: { 'x-csrf-token': csrf },
        data,
      });

    const first = await api('/tickets', {
      subject: 'Payslip missing',
      contact: { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
    });
    expect(first.status(), await first.text()).toBe(200);
    const { number } = (await first.json()) as { number: number };

    // The agent's list: a new ticket is offered, not moved in.
    await agent.page.goto(`${owner.origin}/tickets?view=all`);
    const rows = agent.page.getByRole('list', { name: 'Tickets' });
    await expect(rows.getByRole('listitem')).toHaveCount(1);
    const second = await api('/tickets', {
      subject: 'Attendance not marked',
      contact: { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
    });
    expect(second.status()).toBe(200);
    const banner = agent.page.getByRole('status').filter({ hasText: '1 new ticket' });
    await expect(banner).toBeVisible();
    await expect(rows.getByRole('listitem')).toHaveCount(1);
    await expectAccessible(agent.page);
    await banner.getByRole('button', { name: 'Show' }).click();
    await expect(rows.getByRole('listitem')).toHaveCount(2);

    // The agent's open ticket: the owner's note and priority show at once.
    await agent.page.goto(`${owner.origin}/tickets/${String(number)}`);
    await expect(agent.page.getByText('Payslip missing')).toBeVisible();
    const noted = await api(`/tickets/${String(number)}/messages`, {
      kind: 'note',
      body: 'Payroll is looking into it.',
    });
    expect(noted.status()).toBe(200);
    await expect(agent.page.getByText('Payroll is looking into it.')).toBeVisible();
    const raised = await api(`/tickets/${String(number)}`, { priority: 'urgent' }, 'patch');
    expect(raised.status()).toBe(200);
    await expect(agent.page.getByText('Urgent', { exact: true }).first()).toBeVisible();

    // Their bell counts the assignment as it happens.
    await expect(agent.page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    const assigned = await api(
      `/tickets/${String(number)}`,
      { assigneeUserId: agent.userId },
      'patch',
    );
    expect(assigned.status()).toBe(200);
    await expect(agent.page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
    await agent.context.close();
  });
});
