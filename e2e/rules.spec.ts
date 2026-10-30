import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, signUpAndConfirm } from './fixtures';

/**
 * Rules against the real API: an admin builds "Billing to Accounts" in Settings → Rules, and a new
 * ticket that mentions an invoice lands in the Accounts team with a tag and the rule's note.
 */
test.describe('rules', () => {
  test('an admin adds a rule and a new ticket is routed by it', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const headers = { 'x-csrf-token': csrfToken };
    const team = await page.request.post(`${owner.origin}/api/v1/teams`, {
      headers,
      data: { name: 'Accounts' },
    });
    expect(team.status(), await team.text()).toBe(200);

    await page.goto(`${owner.origin}/settings/rules`);
    await expect(page.getByText('No rules yet')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'New rule' }).click();
    const drawer = page.getByRole('dialog', { name: 'New rule' });
    await drawer.getByLabel(/^Name/).fill('Billing to Accounts');
    await drawer
      .getByRole('listitem', { name: 'Condition 1' })
      .getByLabel('Values')
      .fill('billing, invoice');
    const action = drawer.getByRole('listitem', { name: 'Action 1' });
    await action.getByLabel('Do').selectOption({ label: 'Set team' });
    await action.getByLabel('To').selectOption({ label: 'Accounts' });
    await drawer.getByRole('button', { name: 'Add action' }).click();
    await drawer.getByRole('listitem', { name: 'Action 2' }).getByLabel('Tags').fill('billing');
    await drawer.getByRole('button', { name: 'Add action' }).click();
    const note = drawer.getByRole('listitem', { name: 'Action 3' });
    await note.getByLabel('Do').selectOption({ label: 'Add a private note' });
    await note.getByLabel('Note').fill('Routed to Accounts by the billing rule.');
    await expectAccessible(page);
    await drawer.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('Rule Billing to Accounts added.', { exact: true })).toBeVisible();
    const rules = page.getByRole('list', { name: 'Rules' });
    await expect(rules).toContainText('Billing to Accounts');
    await expect(rules).toContainText(
      'When a ticket is created · 1 condition · Set team, Add tags, Add a private note',
    );
    await expectFitsPhone(page);

    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers,
      data: {
        subject: 'Invoice amount is wrong',
        contact: { name: 'Neha Iyer', email: `neha.${owner.address}@acme-e2e.com` },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const ticket = (await created.json()) as {
      number: number;
      team: { name: string } | null;
      tags: string[];
    };
    expect(ticket.team?.name).toBe('Accounts');
    expect(ticket.tags).toEqual(['billing']);

    await page.goto(`${owner.origin}/tickets/${String(ticket.number)}`);
    const conversation = page.getByRole('region', { name: 'Conversation' });
    await expect(
      conversation.getByRole('article', { name: 'Rule: Billing to Accounts added a private note' }),
    ).toContainText('Routed to Accounts by the billing rule.');
    await expect(conversation).toContainText('Rule: Billing to Accounts changed the team');

    // Turning the rule off stops it.
    await page.goto(`${owner.origin}/settings/rules`);
    await page.getByRole('switch', { name: /Billing to Accounts on/ }).click();
    await expect(page.getByText('Rule Billing to Accounts is off.', { exact: true })).toBeVisible();
    const after = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers,
      data: {
        subject: 'Another invoice question',
        contact: { name: 'Neha Iyer', email: `neha.${owner.address}@acme-e2e.com` },
      },
    });
    expect(((await after.json()) as { team: unknown }).team).toBeNull();

    // Assigning in turn (F18): a catch-all rule gives every new ticket to the Support team in turn.
    const { user } = (await me.json()) as { user: { id: string } };
    const support = await page.request.post(`${owner.origin}/api/v1/teams`, {
      headers,
      data: { name: 'Support', members: [{ userId: user.id }] },
    });
    expect(support.status(), await support.text()).toBe(200);
    await page.reload();
    await page.getByRole('button', { name: 'New rule' }).click();
    const catchAll = page.getByRole('dialog', { name: 'New rule' });
    await catchAll.getByLabel(/^Name/).fill('Everything else to Support');
    await catchAll.getByRole('button', { name: 'Remove condition' }).click();
    const turn = catchAll.getByRole('listitem', { name: 'Action 1' });
    await turn.getByLabel('Do').selectOption({ label: 'Assign in turn within team' });
    await turn.getByLabel('To').selectOption({ label: 'Support' });
    await catchAll.getByRole('button', { name: 'Add rule' }).click();
    await expect(
      page.getByText('Rule Everything else to Support added.', { exact: true }),
    ).toBeVisible();
    const assigned = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers,
      data: {
        subject: 'Printer question',
        contact: { name: 'Neha Iyer', email: `neha.${owner.address}@acme-e2e.com` },
      },
    });
    expect(await assigned.json()).toMatchObject({
      team: { name: 'Support' },
      assignee: { userId: user.id },
    });

    // When a ticket is changed (F19): raising the priority tags the ticket.
    await page.getByRole('button', { name: 'New rule' }).click();
    const changed = page.getByRole('dialog', { name: 'New rule' });
    await changed.getByLabel(/^Name/).fill('Tag escalations');
    await changed
      .getByLabel('This happens')
      .selectOption({ label: 'Someone on the team changes a ticket' });
    const condition = changed.getByRole('listitem', { name: 'Condition 1' });
    await condition.getByLabel('Field').selectOption({ label: 'The change: What changed' });
    await condition.getByRole('checkbox', { name: 'Priority' }).check();
    const tag = changed.getByRole('listitem', { name: 'Action 1' });
    await tag.getByLabel('Do').selectOption({ label: 'Add tags' });
    await tag.getByLabel('Tags').fill('escalated');
    await changed.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('Rule Tag escalations added.', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Rules' })).toContainText(
      'When a ticket is changed · 1 condition · Add tags',
    );
    const { number } = (await assigned.json()) as { number: number };
    const raised = await page.request.patch(`${owner.origin}/api/v1/tickets/${String(number)}`, {
      headers,
      data: { priority: 'urgent' },
    });
    expect(((await raised.json()) as { tags: string[] }).tags).toEqual(['escalated']);
  });
});
